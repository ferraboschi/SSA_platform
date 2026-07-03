"use server";

// Roll-call ("appello") attendance for the PUBLIC educator SHARE LINK.
//
// The share link is unauthenticated: it is a signed, expiring token that grants
// a read-only view of ONE course (src/lib/share-links/token.ts). These actions
// let the educator toggle a per-subject, per-course-day presence flag, where a
// SUBJECT is EITHER an enrolled corsista OR a "companion" (corsi_partecipanti) —
// a 2nd+ attendee entered for a buyer who bought >=2 seats ("doppio").
//
// Security posture follows the proven public-write pattern:
//   • RE-VERIFY the signed token server-side on every call (never trust the
//     client) — a tampered/expired token is rejected.
//   • Derive courseId FROM THE TOKEN payload (`c`). The client NEVER passes a
//     courseId; it cannot write to a course it wasn't granted.
//   • ENROLLMENT / OWNERSHIP GUARD: a corsista subject must be enrolled in THIS
//     course; a companion subject must be a corsi_partecipanti row whose
//     corso_id equals the token's course. The shared token exposes every id, so
//     we must confirm the target belongs to THIS course.
//   • BOUND day_no to 1..dayCount (dayCount derived from the course type).
//   • RATE-LIMIT keyed by the token (per-instance fixed-window limiter).
//   • The corsi_presenze / corsi_partecipanti tables are RLS-locked with NO
//     public policy — everything here goes through the service-role key.
//     Degrades gracefully (schema flag) until the migrations are applied.
//
// The PUBLIC companion-add (addPartecipanteFromLinkAction) is deliberately
// narrow: it may ONLY fill a known-empty slot on an enrollment already flagged
// as a "doppio" (seatsBought >= 2), for the token's course — it can NEVER create
// an arbitrary person. Every server-side check is enumerated inline.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { verifyShareToken } from "./token";
import { loadConfirmSubject, stampConfirmSent } from "@/lib/attendee/confirm";
import { deliverConfirmLink, buildConfirmUrl } from "@/lib/attendee/confirm-email";

const TABLE = "corsi_presenze";
const PART_TABLE = "corsi_partecipanti";
const ISCR_TABLE = "corsi_iscrizioni";

// ── Rate limiting (PER-INSTANCE, in-memory) ──────────────────────────────────
// These actions are gated only by the shared, signed share token — a scrape/DoS
// surface. Pragmatic fixed-window limiter keyed by the TOKEN (identifies the
// link/course). We do NOT read IP (not reliable in a server action). Best-effort
// only: the Map lives in one Node process, so a multi-instance deploy limits
// independently. (Shared implementation: src/lib/rate-limit.ts.)
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_READ = 30; // getAttendanceAction — hydrate on mount / refresh
const RATE_LIMIT_WRITE = 120; // setAttendanceAction — one per checkbox toggle
const RATE_LIMIT_ADD = 10; // addPartecipanteFromLinkAction — creating a companion
const RATE_LIMIT_EMAIL = 40; // set/send attendee confirmation email (course-start)
const RATE_LIMIT_NAME = 40; // setPartecipanteNameAction — correcting a companion's name

// Isolated fixed-window limiter, keyed by `${bucket}:${token}`.
const limiter = createFixedWindowLimiter(RATE_WINDOW_MS);

/** Verify the signed token and return the numeric course id it grants, or null. */
function courseIdFromToken(token: string): number | null {
  const res = verifyShareToken(token);
  if (!res.ok) return null;
  const c = res.payload.c;
  // Attendance is per-course only; the "planner" sentinel share has no roster.
  return /^\d+$/.test(c) ? Number(c) : null;
}

function isMissingTable(err: { message?: string } | null | undefined): boolean {
  return (
    !!err &&
    /corsi_presenze|corsi_partecipanti|partecipante_id|does not exist|schema cache|find the table|column/i.test(
      err.message || "",
    )
  );
}

/** Roll-call days for a course: Certificato = 3, Shochu = 2, everything else = 1.
 *  (Kept in sync with SharedCourse.dayCount in src/lib/share-links/load.ts.) */
async function courseDayCount(corsoId: number): Promise<number> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
  const type = data?.type as string | undefined;
  return type === "certificato" ? 3 : type === "shochu" ? 2 : 1;
}

/** Postgres unique-violation code (concurrent-insert race, see writePresence). */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Write one presence row WITHOUT relying on ON CONFLICT. A companion's
 * uniqueness is a PARTIAL index (`corsi_presenze_partecipante_uidx`, WHERE
 * partecipante_id IS NOT NULL — 20260701190000_corsi_partecipanti.sql):
 * Postgres can only use a partial index as an ON CONFLICT arbiter when the
 * statement's own WHERE clause matches the predicate, and PostgREST's
 * `on_conflict=col,col,col` column-list form never adds one — so
 * `.upsert(row, {onConflict: "corso_id,partecipante_id,day_no"})` fails
 * outright for EVERY companion with "no unique or exclusion constraint
 * matching the ON CONFLICT specification" (the corsista branch happens to
 * work because ITS uniqueness is a plain, non-partial table constraint).
 * Select-then-write sidesteps the whole problem and works identically for
 * both subject kinds. A concurrent duplicate insert for the exact same
 * subject+day (two requests racing the same read-write window) is caught by
 * its unique-violation code and converged to an update.
 */
async function writePresence(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  row: {
    corso_id: number;
    corsista_id: number | null;
    partecipante_id: number | null;
    day_no: number;
    present: boolean;
    updated_at: string;
  },
): Promise<{ error: { message: string; code?: string } | null }> {
  const col = row.corsista_id != null ? "corsista_id" : "partecipante_id";
  const val = (row.corsista_id ?? row.partecipante_id) as number;
  const find = () => svc.from(TABLE).select("id").eq("corso_id", row.corso_id).eq(col, val).eq("day_no", row.day_no).maybeSingle();

  const { data: existing, error: findErr } = await find();
  if (findErr) return { error: findErr };
  if (existing) {
    const { error } = await svc
      .from(TABLE)
      .update({ present: row.present, updated_at: row.updated_at })
      .eq("id", existing.id);
    return { error };
  }
  const { error } = await svc.from(TABLE).insert(row);
  if (error && (error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
    const { data: race } = await find();
    if (race) {
      const { error: updErr } = await svc
        .from(TABLE)
        .update({ present: row.present, updated_at: row.updated_at })
        .eq("id", race.id);
      return { error: updErr };
    }
  }
  return { error };
}

/** Unified presence subject: a corsista (`c<id>`) or a companion (`p<id>`). */
export type AttendanceSubject = { kind: "corsista" | "partecipante"; id: number };

/** Attendance keyed by a subject string (`c<id>` / `p<id>`) → { [dayNo]: bool }. */
export type AttendanceMap = Record<string, Record<number, boolean>>;

/** Companion row returned to the client after a successful public add. */
export interface SharedCompanion {
  id: number;
  full_name: string;
  phone: string;
  email: string;
}

function subjectKey(kind: "corsista" | "partecipante", id: number): string {
  return `${kind === "corsista" ? "c" : "p"}${id}`;
}

/**
 * PUBLIC: read all attendance for the shared course as
 * `{ [subjectKey]: { [dayNo]: boolean } }` where subjectKey is `c<corsistaId>`
 * or `p<partecipanteId>`. Reads BOTH corsista and companion presence rows.
 * Degrades to `{}` (and schema:true) if the table is missing so the roster can
 * render read-only.
 */
export async function getAttendanceAction(
  token: string,
): Promise<{ ok: boolean; attendance?: AttendanceMap; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("read", token, RATE_LIMIT_READ)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const svc = getSupabaseServiceClient();
  // Select partecipante_id too; on a pre-migration DB this column is missing and
  // the query errors → treated as "schema missing" → read-only roster.
  const { data, error } = await svc
    .from(TABLE)
    .select("corsista_id, partecipante_id, day_no, present")
    .eq("corso_id", corsoId);
  if (error) {
    if (isMissingTable(error)) return { ok: true, schema: true, attendance: {} };
    return { ok: false, error: error.message };
  }

  const attendance: AttendanceMap = {};
  for (const r of (data ?? []) as {
    corsista_id: number | null;
    partecipante_id: number | null;
    day_no: number;
    present: boolean;
  }[]) {
    const key =
      r.partecipante_id != null
        ? subjectKey("partecipante", r.partecipante_id)
        : r.corsista_id != null
          ? subjectKey("corsista", r.corsista_id)
          : null;
    if (!key) continue;
    (attendance[key] ??= {})[r.day_no] = !!r.present;
  }
  return { ok: true, attendance };
}

/**
 * PUBLIC: set one presence flag for a SUBJECT (corsista or companion). courseId
 * comes ONLY from the verified token — never from the client. Enforces the
 * per-kind ownership guard + day_no bounds + rate limit.
 */
export async function setAttendanceAction(
  token: string,
  subject: AttendanceSubject,
  dayNo: number,
  present: boolean,
): Promise<{ ok: boolean; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("write", token, RATE_LIMIT_WRITE)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  // Coerce + sanity-check the client inputs before any DB work.
  const kind = subject?.kind;
  const id = Number(subject?.id);
  const day = Math.trunc(Number(dayNo));
  if (kind !== "corsista" && kind !== "partecipante") return { ok: false, error: "Soggetto non valido." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Soggetto non valido." };

  const svc = getSupabaseServiceClient();

  if (kind === "corsista") {
    // ENROLLMENT GUARD: the target student must be enrolled in THIS course. The
    // shared token exposes every corsista_id, so without this a link holder
    // could stamp presence onto a student from another course.
    const { data: enr, error: enrErr } = await svc
      .from("corsi_iscrizioni")
      .select("corsista_id")
      .eq("corso_id", corsoId)
      .eq("corsista_id", id)
      .maybeSingle();
    if (enrErr) return { ok: false, error: enrErr.message };
    if (!enr) return { ok: false, error: "Studente non iscritto a questo corso." };
  } else {
    // OWNERSHIP GUARD: the companion row must exist AND belong to THIS course.
    const { data: part, error: partErr } = await svc
      .from(PART_TABLE)
      .select("id, corso_id")
      .eq("id", id)
      .maybeSingle();
    if (partErr) {
      if (isMissingTable(partErr)) return { ok: false, schema: true, error: "Appello non disponibile (migrazione mancante)." };
      return { ok: false, error: partErr.message };
    }
    if (!part || Number(part.corso_id) !== corsoId) {
      return { ok: false, error: "Partecipante non valido per questo corso." };
    }
  }

  // BOUND day_no to 1..dayCount for the course's actual type.
  const dayCount = await courseDayCount(corsoId);
  if (!Number.isInteger(day) || day < 1 || day > dayCount) {
    return { ok: false, error: "Giornata non valida." };
  }

  // VERIFICA ⇒ PRESENZA (owner's rule): the confirm email leaves from the
  // appello, so once a link is out or the data is confirmed, removing that
  // student's LAST marked presence would contradict a persistent fact. Other
  // days stay freely correctable (a day-2 mis-tap must be undoable).
  const LOCK_ERROR =
    "La verifica email è partita dall'appello: almeno una giornata di presenza deve restare segnata.";
  if (!present) {
    const locked = await isSubjectVerificationLocked(svc, corsoId, kind, id);
    if (locked && !(await hasOtherPresentDay(svc, corsoId, kind, id, day, dayCount))) {
      return { ok: false, error: LOCK_ERROR };
    }
  }

  const row: {
    corso_id: number;
    corsista_id: number | null;
    partecipante_id: number | null;
    day_no: number;
    present: boolean;
    updated_at: string;
  } =
    kind === "corsista"
      ? { corso_id: corsoId, corsista_id: id, partecipante_id: null, day_no: day, present: !!present, updated_at: new Date().toISOString() }
      : { corso_id: corsoId, corsista_id: null, partecipante_id: id, day_no: day, present: !!present, updated_at: new Date().toISOString() };

  const { error } = await writePresence(svc, row);
  if (error) {
    if (isMissingTable(error)) return { ok: false, schema: true, error: "Appello non disponibile (migrazione mancante)." };
    console.error("[attendance] setAttendanceAction write failed", error);
    return { ok: false, error: "Salvataggio non riuscito, riprova." };
  }

  // POST-WRITE RE-CHECK (races): two devices unchecking different days — or an
  // uncheck racing the student's confirm — can each pass the pre-check yet
  // together void the invariant. Re-verify AFTER the write; on violation,
  // restore this day and refuse. Any interleaving ends with ≥1 presence
  // (worst case both restore — fail closed).
  if (!present) {
    const locked = await isSubjectVerificationLocked(svc, corsoId, kind, id);
    if (locked && !(await hasOtherPresentDay(svc, corsoId, kind, id, day, dayCount))) {
      await writePresence(svc, { ...row, present: true, updated_at: new Date().toISOString() });
      return { ok: false, error: LOCK_ERROR };
    }
  }
  return { ok: true };
}

/**
 * PUBLIC: add a companion ("doppio") attendee to an enrollment, from the share
 * link. Deliberately narrow — it can ONLY fill a known-empty companion slot on
 * an enrollment already flagged as a double, for the TOKEN's course. It can
 * never create an arbitrary person or touch another course.
 *
 * SERVER-SIDE CHECKS (all enforced here, not just in the UI):
 *   1. Token re-verified → courseId derived FROM THE TOKEN only.
 *   2. Rate-limited (token-keyed "add" bucket).
 *   3. Enrollment loaded by iscrizione id; REJECTED unless its corso_id ===
 *      the token's course (never trust the client id blindly).
 *   4. seatsBought computed server-side (purchases matched on the course
 *      full_title, mirroring index.ts); REJECTED unless seatsBought >= 2.
 *   5. Existing companion count loaded; REJECTED if all slots filled
 *      (existingCompanions >= seatsBought - 1).
 *   6. fullName trimmed + length-bounded (1..120); phone optional, <=40.
 */
export async function addPartecipanteFromLinkAction(
  token: string,
  iscrizioneId: number,
  fullName: string,
  phone: string,
  email?: string,
): Promise<{ ok: boolean; companion?: SharedCompanion; error?: string; schema?: boolean }> {
  // (1) courseId FROM THE TOKEN only.
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  // (2) rate-limit the write.
  if (limiter.isLimited("add", token, RATE_LIMIT_ADD)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const iscrId = Number(iscrizioneId);
  if (!Number.isInteger(iscrId) || iscrId <= 0) return { ok: false, error: "Iscrizione non valida." };

  // (6) sanitize inputs up-front.
  const name = String(fullName ?? "").trim();
  if (!name) return { ok: false, error: "Nome obbligatorio." };
  if (name.length > 120) return { ok: false, error: "Nome troppo lungo." };
  const tel = String(phone ?? "").trim();
  if (tel.length > 40) return { ok: false, error: "Telefono troppo lungo." };
  // Email is OPTIONAL here (the educator may add the person before knowing
  // it) but must be well-formed if given, so it's ready to send the moment
  // presence is marked — no detour through "Correggi" for the common case.
  const rawEmail = String(email ?? "").trim();
  let cleanEmail: string | null = null;
  if (rawEmail) {
    cleanEmail = validEmail(rawEmail);
    if (!cleanEmail) return { ok: false, error: "Email non valida." };
  }

  const svc = getSupabaseServiceClient();

  // (3) Load the enrollment BY id and REJECT unless it belongs to the token's
  // course. This is the gate that binds the client-passed iscrizione id to the
  // course the token actually grants — the id alone is never trusted.
  const { data: enr, error: enrErr } = await svc
    .from("corsi_iscrizioni")
    .select("id, corso_id, corsista_id")
    .eq("id", iscrId)
    .maybeSingle();
  if (enrErr) return { ok: false, error: enrErr.message };
  if (!enr || Number(enr.corso_id) !== corsoId) {
    return { ok: false, error: "Iscrizione non valida per questo corso." };
  }

  // (4) seatsBought = # of course tickets this person holds, from purchases
  // matched on the course full_title (mirror of index.ts ~L694-704). The public
  // link may ONLY fill DOUBLES.
  const { data: corso } = await svc.from("corsi").select("full_title").eq("id", corsoId).maybeSingle();
  const fullTitle = (corso?.full_title as string | undefined) ?? "";
  let seatsBought = 1;
  if (fullTitle) {
    const { count } = await svc
      .from("purchases")
      .select("corsista_id", { count: "exact", head: true })
      .eq("cluster", "corso")
      .eq("product_title", fullTitle)
      .eq("corsista_id", enr.corsista_id);
    if (typeof count === "number" && count > 0) seatsBought = count;
  }
  if (seatsBought < 2) {
    return { ok: false, error: "Solo gli ordini con più biglietti possono aggiungere partecipanti." };
  }

  // (5) Count existing companions for this enrollment; REJECT if all extra
  // slots are already filled (buyer occupies 1 seat, so max companions =
  // seatsBought - 1).
  const { count: existing, error: cntErr } = await svc
    .from(PART_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("iscrizione_id", iscrId);
  if (cntErr) {
    if (isMissingTable(cntErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
    return { ok: false, error: cntErr.message };
  }
  if ((existing ?? 0) >= seatsBought - 1) {
    return { ok: false, error: "Nessun posto disponibile per un altro partecipante." };
  }

  const { data: inserted, error: insErr } = await svc
    .from(PART_TABLE)
    .insert({ corso_id: corsoId, iscrizione_id: iscrId, full_name: name, phone: tel || null, email: cleanEmail })
    .select("id, full_name, phone, email")
    .maybeSingle();
  if (insErr) {
    if (isMissingTable(insErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
    return { ok: false, error: insErr.message };
  }
  if (!inserted) return { ok: false, error: "Inserimento non riuscito." };

  return {
    ok: true,
    companion: {
      id: Number(inserted.id),
      full_name: inserted.full_name as string,
      phone: (inserted.phone as string) ?? "",
      email: (inserted.email as string) ?? "",
    },
  };
}

/**
 * PUBLIC (share token): correct a COMPANION's name. Companions have no
 * Shopify-sourced identity (unlike a corsista's name) — the educator typed it
 * once at add time and, until now, had no way to fix a typo or a placeholder.
 * Free until the companion CONFIRMS their data (final from then on, like every
 * other field); renaming while a confirm link is out is safe — the link binds
 * by id/token, not by name, so it never needs a resend.
 */
export async function setPartecipanteNameAction(
  token: string,
  partecipanteId: number,
  fullName: string,
): Promise<{ ok: boolean; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("name", token, RATE_LIMIT_NAME)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const id = Number(partecipanteId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Partecipante non valido." };
  const name = String(fullName ?? "").trim();
  if (!name) return { ok: false, error: "Nome obbligatorio." };
  if (name.length > 120) return { ok: false, error: "Nome troppo lungo." };

  const svc = getSupabaseServiceClient();

  const { data: row, error: findErr } = await svc
    .from(PART_TABLE)
    .select("id, corso_id, email_confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (findErr) {
    if (isMissingTable(findErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
    return { ok: false, error: findErr.message };
  }
  if (!row || Number(row.corso_id) !== corsoId) {
    return { ok: false, error: "Partecipante non valido per questo corso." };
  }
  if ((row as { email_confirmed_at: string | null }).email_confirmed_at) {
    return { ok: false, error: "Dati già confermati — non sono più modificabili." };
  }

  const { error } = await svc.from(PART_TABLE).update({ full_name: name }).eq("id", id);
  if (error) {
    if (isMissingTable(error)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ── Course-start EMAIL SANITIZATION on the share link ───────────────────────
// The educator (no login — authorized by the share token) confirms/corrects each
// attendee's email and sends the confirmation magic-link. Same token-auth posture
// as the appello: re-verify the token, derive the course from it, and bind the
// client-passed subject id to THIS course before any write.
//
// SUBJECT REF: for a corsista the id is the ENROLLMENT id (corsi_iscrizioni.id —
// where the enrolled_email snapshot lives), NOT the corsista_id used by the
// appello. For a companion it is the corsi_partecipanti id.

export type ConfirmRef = { kind: "corsista" | "partecipante"; id: number };

async function confirmRefInCourse(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  corsoId: number,
  ref: ConfirmRef,
): Promise<{ ok: boolean; error?: string; schema?: boolean }> {
  const kind = ref?.kind;
  const id = Number(ref?.id);
  if (kind !== "corsista" && kind !== "partecipante") return { ok: false, error: "Soggetto non valido." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Soggetto non valido." };

  if (kind === "corsista") {
    // The enrollment must belong to THIS course (id alone is never trusted).
    const { data, error } = await svc
      .from(ISCR_TABLE)
      .select("id, corso_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data || Number(data.corso_id) !== corsoId) {
      return { ok: false, error: "Iscrizione non valida per questo corso." };
    }
  } else {
    const { data, error } = await svc
      .from(PART_TABLE)
      .select("id, corso_id")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: error.message };
    }
    if (!data || Number(data.corso_id) !== corsoId) {
      return { ok: false, error: "Partecipante non valido per questo corso." };
    }
  }
  return { ok: true };
}

/** Server-truth confirm state for a subject (two-tier, pre-migration → nulls). */
/** Is the SUBJECT's verification in flight or done (confirm link out OR data
 *  confirmed)? Keyed the attendance way (corsista_id / partecipante id),
 *  unlike readConfirmState (iscrizione id). Two-tier select degrades on a
 *  pre-migration DB; fails open — without the columns nobody is locked. */
async function isSubjectVerificationLocked(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  corsoId: number,
  kind: "corsista" | "partecipante",
  id: number,
): Promise<boolean> {
  const from = () =>
    kind === "corsista"
      ? svc.from(ISCR_TABLE).select("email_confirmed_at, confirm_sent_at").eq("corso_id", corsoId).eq("corsista_id", id)
      : svc.from(PART_TABLE).select("email_confirmed_at, confirm_sent_at").eq("corso_id", corsoId).eq("id", id);
  const rich = await from().maybeSingle();
  if (!rich.error) {
    const r = rich.data as { email_confirmed_at: string | null; confirm_sent_at: string | null } | null;
    return Boolean(r?.email_confirmed_at || r?.confirm_sent_at);
  }
  const base =
    kind === "corsista"
      ? await svc.from(ISCR_TABLE).select("email_confirmed_at").eq("corso_id", corsoId).eq("corsista_id", id).maybeSingle()
      : await svc.from(PART_TABLE).select("email_confirmed_at").eq("corso_id", corsoId).eq("id", id).maybeSingle();
  if (base.error) return false;
  return Boolean((base.data as { email_confirmed_at: string | null } | null)?.email_confirmed_at);
}

/** Does the subject have ANOTHER day marked present (besides `exceptDay`)?
 *  Bounded to the course's REAL days — a stray out-of-range row must never
 *  satisfy the invariant on behalf of the visible roster. */
async function hasOtherPresentDay(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  corsoId: number,
  kind: "corsista" | "partecipante",
  id: number,
  exceptDay: number,
  dayCount: number,
): Promise<boolean> {
  const col = kind === "corsista" ? "corsista_id" : "partecipante_id";
  const { data, error } = await svc
    .from(TABLE)
    .select("day_no")
    .eq("corso_id", corsoId)
    .eq(col, id)
    .eq("present", true)
    .neq("day_no", exceptDay)
    .gte("day_no", 1)
    .lte("day_no", dayCount)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

async function readConfirmState(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  corsoId: number,
  ref: ConfirmRef,
): Promise<{ sentAt: string | null; confirmedAt: string | null }> {
  const table = ref.kind === "corsista" ? ISCR_TABLE : PART_TABLE;
  const rich = await svc
    .from(table)
    .select("email_confirmed_at, confirm_sent_at")
    .eq("id", ref.id)
    .eq("corso_id", corsoId)
    .maybeSingle();
  if (!rich.error) {
    const r = rich.data as { email_confirmed_at: string | null; confirm_sent_at: string | null } | null;
    return { sentAt: r?.confirm_sent_at ?? null, confirmedAt: r?.email_confirmed_at ?? null };
  }
  const base = await svc
    .from(table)
    .select("email_confirmed_at")
    .eq("id", ref.id)
    .eq("corso_id", corsoId)
    .maybeSingle();
  const r = base.data as { email_confirmed_at: string | null } | null;
  return { sentAt: null, confirmedAt: r?.email_confirmed_at ?? null };
}

function validEmail(email: string): string | null {
  const clean = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) || clean.length > 254) return null;
  return clean;
}

/** Write the target-email snapshot (+ clear confirmed). Shared by the free
 *  edit and the atomic correct-and-resend. */
async function writeAttendeeEmail(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  corsoId: number,
  ref: ConfirmRef,
  clean: string,
): Promise<{ ok: boolean; error?: string; schema?: boolean }> {
  const patch =
    ref.kind === "corsista"
      ? { enrolled_email: clean, email_confirmed_at: null }
      : { email: clean, email_confirmed_at: null };
  const { error } = await svc
    .from(ref.kind === "corsista" ? ISCR_TABLE : PART_TABLE)
    .update(patch)
    .eq("id", ref.id)
    .eq("corso_id", corsoId);
  if (error) {
    if (isMissingTable(error)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * PUBLIC (share token): FREE edit of the attendee's target email — allowed
 * ONLY before anything was sent and before confirmation (the airtight
 * invariant: after a send, corrections happen exclusively inside the atomic
 * correct-and-resend, so the stored email always matches the last link sent).
 * The global corsisti.email identity is never touched.
 */
export async function setAttendeeEmailAction(
  token: string,
  ref: ConfirmRef,
  email: string,
): Promise<{ ok: boolean; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("email", token, RATE_LIMIT_EMAIL)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const clean = validEmail(email);
  if (!clean) return { ok: false, error: "Email non valida." };

  const svc = getSupabaseServiceClient();
  const guard = await confirmRefInCourse(svc, corsoId, ref);
  if (!guard.ok) return guard;

  // SERVER-SIDE LOCK, not just UI: no free edits once a link is out or the
  // student has confirmed.
  const state = await readConfirmState(svc, corsoId, ref);
  if (state.confirmedAt) {
    return { ok: false, error: "Dati già confermati — non sono più modificabili." };
  }
  if (state.sentAt) {
    return { ok: false, error: "Conferma già inviata — usa 'Correggi e rinvia'." };
  }

  return writeAttendeeEmail(svc, corsoId, ref, clean);
}

export interface VerificationState {
  email: string;
  phone: string;
  confirmed: boolean;
  sent: boolean;
  /** Server-truth timestamps — the chips render these (survive reloads). */
  sentAtIso: string | null;
  confirmedAtIso: string | null;
}

/**
 * PUBLIC (share token): live verification states keyed by subject
 * (`c<corsistaId>` / `p<partecipanteId>`). Polled by the Appello tab so the
 * educator SEES the green flip the moment a student completes the confirmation
 * — the closing of the circle. Two-tier selects (graceful pre-migration).
 */
export async function getVerificationStatesAction(
  token: string,
): Promise<{ ok: boolean; states?: Record<string, VerificationState>; error?: string }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("read", token, RATE_LIMIT_READ)) return { ok: true, states: undefined };

  const svc = getSupabaseServiceClient();
  const states: Record<string, VerificationState> = {};

  type IscrRow = {
    corsista_id: number;
    enrolled_email: string | null;
    email_confirmed_at: string | null;
    confirm_sent_at?: string | null;
    corsista: { phone: string | null } | null;
  };
  let iscrRows: IscrRow[] | null = null;
  const rich = await svc
    .from(ISCR_TABLE)
    .select("corsista_id, enrolled_email, email_confirmed_at, confirm_sent_at, corsista:corsisti(phone)")
    .eq("corso_id", corsoId);
  iscrRows = rich.data as unknown as IscrRow[] | null;
  if (rich.error) {
    const base = await svc
      .from(ISCR_TABLE)
      .select("corsista_id, enrolled_email, email_confirmed_at, corsista:corsisti(phone)")
      .eq("corso_id", corsoId);
    iscrRows = base.data as unknown as IscrRow[] | null;
    if (base.error) return { ok: true, states: {} };
  }
  for (const r of iscrRows ?? []) {
    states[`c${r.corsista_id}`] = {
      email: (r.enrolled_email ?? "").trim(),
      phone: (r.corsista?.phone ?? "").trim(),
      confirmed: Boolean(r.email_confirmed_at),
      sent: Boolean(r.confirm_sent_at),
      sentAtIso: r.confirm_sent_at ?? null,
      confirmedAtIso: r.email_confirmed_at ?? null,
    };
  }

  type PartRow = {
    id: number;
    email?: string | null;
    phone: string | null;
    email_confirmed_at?: string | null;
    confirm_sent_at?: string | null;
  };
  let partRows: PartRow[] | null = null;
  const richP = await svc
    .from(PART_TABLE)
    .select("id, email, phone, email_confirmed_at, confirm_sent_at")
    .eq("corso_id", corsoId);
  partRows = richP.data as PartRow[] | null;
  if (richP.error) {
    const baseP = await svc
      .from(PART_TABLE)
      .select("id, phone")
      .eq("corso_id", corsoId);
    partRows = baseP.data as PartRow[] | null;
  }
  for (const r of partRows ?? []) {
    states[`p${r.id}`] = {
      email: (r.email ?? "").trim(),
      phone: (r.phone ?? "").trim(),
      confirmed: Boolean(r.email_confirmed_at),
      sent: Boolean(r.confirm_sent_at),
      sentAtIso: r.confirm_sent_at ?? null,
      confirmedAtIso: r.email_confirmed_at ?? null,
    };
  }

  return { ok: true, states };
}

/**
 * PUBLIC (share token): the educator corrects an attendee's PHONE. For a
 * corsista it updates corsisti.phone (the global identity — so the correction
 * propagates everywhere the number appears); for a companion, its own row.
 */
export async function setAttendeePhoneAction(
  token: string,
  ref: ConfirmRef,
  phone: string,
): Promise<{ ok: boolean; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("email", token, RATE_LIMIT_EMAIL)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const clean = String(phone ?? "").trim();
  if (!clean || clean.length > 40) return { ok: false, error: "Numero non valido." };

  const svc = getSupabaseServiceClient();
  const guard = await confirmRefInCourse(svc, corsoId, ref);
  if (!guard.ok) return guard;

  // Same server-side lock as the email: free edits only before a send.
  const state = await readConfirmState(svc, corsoId, ref);
  if (state.confirmedAt) {
    return { ok: false, error: "Dati già confermati — non sono più modificabili." };
  }
  if (state.sentAt) {
    return { ok: false, error: "Conferma già inviata — usa 'Correggi e rinvia'." };
  }

  if (ref.kind === "corsista") {
    // Resolve the enrollment → corsista, then update the global identity row.
    const { data: enr, error: enrErr } = await svc
      .from(ISCR_TABLE)
      .select("corsista_id")
      .eq("id", ref.id)
      .eq("corso_id", corsoId)
      .maybeSingle();
    if (enrErr || !enr) return { ok: false, error: "Iscrizione non trovata." };
    const { error } = await svc
      .from("corsisti")
      .update({ phone: clean })
      .eq("id", (enr as { corsista_id: number }).corsista_id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await svc
    .from(PART_TABLE)
    .update({ phone: clean })
    .eq("id", ref.id)
    .eq("corso_id", corsoId);
  if (error) {
    if (isMissingTable(error)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * PUBLIC (share token): send the confirmation for one attendee — two channels,
 * both counted as "sent" (they flip the state to "in attesa"):
 *   via "email" (default): mint + email the magic link (delivery proves the
 *     inbox → the page opens with the email UNTOUCHABLE);
 *   via "link": mint ONLY — the educator copies the link and hands it over
 *     via WhatsApp/SMS (extra-platform); the page keeps the email editable
 *     and everything locks once the student submits.
 * Refused once the student has confirmed (the data is final).
 * Returns sentAtIso (server truth) so the chip timestamp is immediate.
 */
export async function sendAttendeeConfirmLinkAction(
  token: string,
  ref: ConfirmRef,
  via: "email" | "link" = "email",
): Promise<{ ok: boolean; url?: string; sentTo?: string; sentAtIso?: string; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("email", token, RATE_LIMIT_EMAIL)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const svc = getSupabaseServiceClient();
  const guard = await confirmRefInCourse(svc, corsoId, ref);
  if (!guard.ok) return guard;

  // Confirmed = final. No channel can re-open it.
  const state = await readConfirmState(svc, corsoId, ref);
  if (state.confirmedAt) {
    return { ok: false, error: "Dati già confermati — non serve reinviare." };
  }

  const subject = await loadConfirmSubject(String(corsoId), ref.kind, String(ref.id));
  if (!subject) return { ok: false, error: "Destinatario non trovato." };

  let url: string | undefined;
  let sentTo: string | undefined;
  let error: string | undefined;
  if (via === "link") {
    url = buildConfirmUrl(String(corsoId), ref.kind, String(ref.id), "manual");
  } else {
    const res = await deliverConfirmLink({
      courseId: String(corsoId),
      kind: ref.kind,
      subjectId: String(ref.id),
      toEmail: subject.email,
      name: subject.fullName,
      courseName: subject.courseName,
    });
    url = res.url;
    sentTo = res.sentTo;
    error = res.error;
  }

  const sentAtIso = new Date().toISOString();
  await stampConfirmSent(String(corsoId), ref.kind, String(ref.id)).catch(() => {});
  return { ok: true, sentAtIso, url, sentTo, error };
}

/**
 * PUBLIC (share token): ATOMIC correct-and-resend — the ONLY way to change the
 * email/phone once a confirmation link is out. Updates the snapshot, clears
 * the confirmed flag, sends the fresh link and stamps, in one round-trip: the
 * stored email can never drift from the last link sent. Refused after the
 * student confirmed — confirmed data is final.
 */
export async function correctAndResendAction(
  token: string,
  ref: ConfirmRef,
  input: { email: string; phone?: string },
): Promise<{ ok: boolean; url?: string; sentTo?: string; sentAtIso?: string; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("email", token, RATE_LIMIT_EMAIL)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const clean = validEmail(input.email);
  if (!clean) return { ok: false, error: "Email non valida." };
  const phone = String(input.phone ?? "").trim();
  if (phone.length > 40) return { ok: false, error: "Numero non valido." };

  const svc = getSupabaseServiceClient();
  const guard = await confirmRefInCourse(svc, corsoId, ref);
  if (!guard.ok) return guard;

  const state = await readConfirmState(svc, corsoId, ref);
  if (state.confirmedAt) {
    return { ok: false, error: "Dati già confermati — non sono più modificabili." };
  }

  const wrote = await writeAttendeeEmail(svc, corsoId, ref, clean);
  if (!wrote.ok) return wrote;
  if (phone) {
    if (ref.kind === "corsista") {
      const { data: enr } = await svc
        .from(ISCR_TABLE)
        .select("corsista_id")
        .eq("id", ref.id)
        .eq("corso_id", corsoId)
        .maybeSingle();
      const corsistaId = (enr as { corsista_id: number } | null)?.corsista_id;
      if (corsistaId != null) await svc.from("corsisti").update({ phone }).eq("id", corsistaId);
    } else {
      await svc.from(PART_TABLE).update({ phone }).eq("id", ref.id).eq("corso_id", corsoId);
    }
  }

  const subject = await loadConfirmSubject(String(corsoId), ref.kind, String(ref.id));
  if (!subject) return { ok: false, error: "Destinatario non trovato." };
  const res = await deliverConfirmLink({
    courseId: String(corsoId),
    kind: ref.kind,
    subjectId: String(ref.id),
    toEmail: clean,
    name: subject.fullName,
    courseName: subject.courseName,
  });
  const sentAtIso = new Date().toISOString();
  await stampConfirmSent(String(corsoId), ref.kind, String(ref.id)).catch(() => {});
  return { ok: true, sentAtIso, ...res };
}


/**
 * PUBLIC (share token): RESET the appello + verification state of THIS course
 * so the educator can re-run the whole flow from scratch (test runs, wrong
 * setup). Deletes every presence row and clears the confirm/sent stamps on
 * enrollments and companions — emails, phones and delivery addresses are DATA
 * and are kept. Deliberately destructive: the UI double-confirms, and the
 * rate limit is tight. Course-bound by the verified token, like everything
 * else on this page.
 */
export async function resetAppelloAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("reset", token, 5)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const svc = getSupabaseServiceClient();

  // 1 · Presence rows (a missing table just means nothing to delete).
  const del = await svc.from(TABLE).delete().eq("corso_id", corsoId);
  if (del.error && !isMissingTable(del.error)) return { ok: false, error: del.error.message };

  // 2 · Enrollment stamps — two-tier: retry without confirm_sent_at on a
  // pre-migration DB; if even email_confirmed_at is missing, the whole
  // verification feature doesn't exist yet → nothing to clear.
  const iscr = await svc
    .from(ISCR_TABLE)
    .update({ email_confirmed_at: null, confirm_sent_at: null })
    .eq("corso_id", corsoId);
  if (iscr.error) {
    const base = await svc.from(ISCR_TABLE).update({ email_confirmed_at: null }).eq("corso_id", corsoId);
    if (base.error && !isMissingTable(base.error)) return { ok: false, error: base.error.message };
  }

  // 3 · Companion stamps, same two-tier.
  const part = await svc
    .from(PART_TABLE)
    .update({ email_confirmed_at: null, confirm_sent_at: null })
    .eq("corso_id", corsoId);
  if (part.error) {
    const base = await svc.from(PART_TABLE).update({ email_confirmed_at: null }).eq("corso_id", corsoId);
    if (base.error && !isMissingTable(base.error)) return { ok: false, error: base.error.message };
  }

  return { ok: true };
}
