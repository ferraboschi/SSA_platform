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
//
// The course-start EMAIL VERIFICATION actions (confirm links, live states,
// reset) live in verification-actions.ts; the helpers shared by both action
// families live in attendance-db.ts.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { finalizeSeatCompletion, phoneLooksValid } from "@/lib/corsi/seat-completion";
import {
  TABLE,
  PART_TABLE,
  courseIdFromToken,
  isMissingTable,
  courseDayInfo,
  subjectKey,
  validEmail,
  subjectVerificationState,
  hasOtherPresentDay,
} from "./attendance-db";

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
const RATE_LIMIT_NAME = 40; // setPartecipanteNameAction — correcting a companion's name

// Isolated fixed-window limiter, keyed by `${bucket}:${token}`.
const limiter = createFixedWindowLimiter(RATE_WINDOW_MS);

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

  // BOUND day_no to 1..dayCount (or 1..examDay when the course has an exam —
  // the extra slot is the "Giorno esame" appello).
  const { dayCount, examDay } = await courseDayInfo(corsoId);
  const maxDay = examDay ?? dayCount;
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    return { ok: false, error: "Giornata non valida." };
  }

  // VERIFICA ⇒ PRESENZA (owner's rule, softened per batch 11): only a
  // CONFIRMED student's last marked presence is locked — the confirmation is
  // a hard fact that counts as presence. A merely-SENT link no longer locks:
  // the email usually leaves minutes after the day-1 tap, so a mis-tapped
  // presence became permanently impossible to correct ("impossibile segnare
  // assente"). Other days stay freely correctable.
  const LOCK_ERROR =
    "Lo studente ha confermato i dati: la conferma vale come presenza, quindi almeno una giornata resta segnata.";
  if (!present) {
    const state = await subjectVerificationState(svc, corsoId, kind, id);
    if (state === "confirmed" && !(await hasOtherPresentDay(svc, corsoId, kind, id, day, maxDay))) {
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
    const state = await subjectVerificationState(svc, corsoId, kind, id);
    if (state === "confirmed" && !(await hasOtherPresentDay(svc, corsoId, kind, id, day, maxDay))) {
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

  // (4) seatsBought = # of course seats this person holds. SUM purchases.quantity
  // (a single order line for two people is one row with quantity 2 — counting
  // rows would read it as 1 and block the legit companion). A staff seat-count
  // OVERRIDE (corsi_iscrizioni.seats_override) wins when set. The public link may
  // ONLY fill DOUBLES.
  const { data: corso } = await svc.from("corsi").select("full_title").eq("id", corsoId).maybeSingle();
  const fullTitle = (corso?.full_title as string | undefined) ?? "";
  let seatsBought = 1;
  if (fullTitle) {
    const { data: purRows } = await svc
      .from("purchases")
      .select("quantity")
      .eq("cluster", "corso")
      .eq("product_title", fullTitle)
      .eq("corsista_id", enr.corsista_id);
    const summed = (purRows ?? []).reduce((n, p) => {
      const q = Number((p as { quantity?: number | null }).quantity);
      return n + (Number.isFinite(q) && q > 0 ? Math.trunc(q) : 1);
    }, 0);
    if (summed > 0) seatsBought = summed;
  }
  // Override (separate read, graceful if the column is absent).
  {
    const { data: ovr, error: ovrErr } = await svc
      .from("corsi_iscrizioni")
      .select("seats_override")
      .eq("id", iscrId)
      .maybeSingle();
    const o = !ovrErr ? (ovr as { seats_override?: number | null } | null)?.seats_override : null;
    if (o != null && o >= 1) seatsBought = Math.trunc(o);
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

/** Complete a multi-ticket EXTRA SEAT (F4 placeholder) from the educator link:
 *  the educator fills in the real attendee at check-in. The seat keeps its
 *  enrollment, so once filled it's a normal corsista on EVERY day without
 *  re-entry. Bound to the token's course; only a placeholder seat can be
 *  completed. ALL FOUR data points mandatory: first + last name, email, phone. */
export async function completeSeatFromLinkAction(
  token: string,
  iscrizioneId: number,
  fullName: string,
  email: string,
  phone: string,
  linkTo?: number,
): Promise<{
  ok: boolean;
  person?: { id: number; name: string; email: string };
  linked?: boolean;
  conflict?: { corsistaId: number; name: string; phone: string };
  error?: string;
}> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("add", token, RATE_LIMIT_ADD)) {
    return { ok: false, error: "Troppe richieste, riprova tra poco." };
  }

  const iscrId = Number(iscrizioneId);
  if (!Number.isInteger(iscrId) || iscrId <= 0) return { ok: false, error: "Iscrizione non valida." };
  const name = String(fullName ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Nome obbligatorio." };
  if (name.split(" ").length < 2) return { ok: false, error: "Inserisci nome e cognome." };
  if (name.length > 120) return { ok: false, error: "Nome troppo lungo." };
  const cleanEmail = validEmail(String(email ?? "").trim());
  if (!cleanEmail) return { ok: false, error: "Inserisci un'email valida." };
  const tel = String(phone ?? "").trim();
  if (!tel) return { ok: false, error: "Inserisci il numero di telefono." };
  if (tel.length > 40) return { ok: false, error: "Numero di telefono troppo lungo." };
  if (!phoneLooksValid(tel)) return { ok: false, error: "Inserisci un numero di telefono valido." };

  const svc = getSupabaseServiceClient();
  // Enrollment must belong to the token's course AND be a placeholder seat.
  const { data: enr, error: enrErr } = await svc
    .from("corsi_iscrizioni")
    .select("id, corso_id, corsista_id, corsista:corsisti(id, placeholder)")
    .eq("id", iscrId)
    .maybeSingle();
  if (enrErr) return { ok: false, error: enrErr.message };
  if (!enr || Number(enr.corso_id) !== corsoId) {
    return { ok: false, error: "Iscrizione non valida per questo corso." };
  }
  const cor = Array.isArray(enr.corsista) ? enr.corsista[0] : enr.corsista;
  if (!cor?.placeholder) return { ok: false, error: "Questo posto è già assegnato a una persona." };
  const placeholderId = Number(enr.corsista_id);

  // Shared identity resolution (same rules as the admin roster): same-person →
  // link, different-name → conflict (UI resolves), else promote. `linkTo` =
  // confirmed "same person".
  const r = await finalizeSeatCompletion(svc, corsoId, iscrId, placeholderId, { name, email: cleanEmail, phone: tel }, linkTo);
  if (!r.ok) return { ok: false, error: r.error, conflict: r.conflict };
  return { ok: true, linked: r.linked, person: { id: placeholderId, name, email: cleanEmail } };
}
