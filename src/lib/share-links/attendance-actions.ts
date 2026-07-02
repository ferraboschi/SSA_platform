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
import { loadConfirmSubject } from "@/lib/attendee/confirm";
import { deliverConfirmLink } from "@/lib/attendee/confirm-email";

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

/** Roll-call days for a course: Certificato = 3, everything else = 1.
 *  (Kept in sync with SharedCourse.dayCount in src/lib/share-links/load.ts.) */
async function courseDayCount(corsoId: number): Promise<number> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
  return (data?.type as string | undefined) === "certificato" ? 3 : 1;
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
  const onConflict = kind === "corsista" ? "corso_id,corsista_id,day_no" : "corso_id,partecipante_id,day_no";

  const { error } = await svc.from(TABLE).upsert(row, { onConflict });
  if (error) {
    if (isMissingTable(error)) return { ok: false, schema: true, error: "Appello non disponibile (migrazione mancante)." };
    return { ok: false, error: error.message };
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
    .insert({ corso_id: corsoId, iscrizione_id: iscrId, full_name: name, phone: tel || null })
    .select("id, full_name, phone")
    .maybeSingle();
  if (insErr) {
    if (isMissingTable(insErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
    return { ok: false, error: insErr.message };
  }
  if (!inserted) return { ok: false, error: "Inserimento non riuscito." };

  return {
    ok: true,
    companion: { id: Number(inserted.id), full_name: inserted.full_name as string, phone: (inserted.phone as string) ?? "" },
  };
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

/**
 * PUBLIC (share token): the educator sets/corrects an attendee's TARGET email
 * (the sanitized address that will receive the tests + exam). Writes the snapshot
 * (corsi_iscrizioni.enrolled_email / corsi_partecipanti.email) and CLEARS the
 * confirmed flag — changing the target requires a fresh student confirmation.
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

  const clean = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) || clean.length > 254) {
    return { ok: false, error: "Email non valida." };
  }

  const svc = getSupabaseServiceClient();
  const guard = await confirmRefInCourse(svc, corsoId, ref);
  if (!guard.ok) return guard;

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
 * PUBLIC (share token): mint + (go-live-gated) send the confirmation magic-link
 * for one attendee. No staff session here, so in TEST mode nothing is emailed —
 * the link is returned for the educator to copy (WhatsApp/SMS). When
 * EXAM_RESULT_EMAILS_LIVE is on, it emails the attendee's confirmed/target email.
 */
export async function sendAttendeeConfirmLinkAction(
  token: string,
  ref: ConfirmRef,
): Promise<{ ok: boolean; url?: string; sentTo?: string; live?: boolean; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("email", token, RATE_LIMIT_EMAIL)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const svc = getSupabaseServiceClient();
  const guard = await confirmRefInCourse(svc, corsoId, ref);
  if (!guard.ok) return guard;

  const subject = await loadConfirmSubject(String(corsoId), ref.kind, String(ref.id));
  if (!subject) return { ok: false, error: "Destinatario non trovato." };

  const res = await deliverConfirmLink({
    courseId: String(corsoId),
    kind: ref.kind,
    subjectId: String(ref.id),
    toEmail: subject.email,
    name: subject.fullName,
    courseName: subject.courseName,
  });
  return { ok: true, ...res };
}
