"use server";

// Course-start EMAIL VERIFICATION for the PUBLIC educator SHARE LINK.
//
// The educator (no login — authorized by the share token) confirms/corrects
// each attendee's email/phone, sends the confirmation magic-link, polls the
// live verification states, and can reset the whole flow. Split out of
// attendance-actions.ts (which keeps the roll-call/appello actions); the
// helpers shared by both files live in attendance-db.ts.
//
// Security posture follows the proven public-write pattern, identical to
// attendance-actions.ts:
//   • RE-VERIFY the signed token server-side on every call (never trust the
//     client) — a tampered/expired token is rejected.
//   • Derive courseId FROM THE TOKEN payload (`c`). The client NEVER passes a
//     courseId; it cannot write to a course it wasn't granted.
//   • OWNERSHIP GUARD: every client-passed subject id is bound to THIS course
//     (confirmRefInCourse) before any read of state or write.
//   • RATE-LIMIT keyed by the token (per-instance fixed-window limiter).
//   • The corsi_iscrizioni / corsi_partecipanti / corsi_presenze tables are
//     RLS-locked with NO public policy — everything here goes through the
//     service-role key. Degrades gracefully (schema flag) until the
//     migrations are applied.
//
// SUBJECT REF: for a corsista the id is the ENROLLMENT id (corsi_iscrizioni.id —
// where the enrolled_email snapshot lives), NOT the corsista_id used by the
// appello. For a companion it is the corsi_partecipanti id.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { loadConfirmSubject, stampConfirmSent } from "@/lib/attendee/confirm";
import { deliverConfirmLink, buildConfirmUrl } from "@/lib/attendee/confirm-email";
import {
  TABLE,
  PART_TABLE,
  ISCR_TABLE,
  courseIdFromToken,
  isMissingTable,
  validEmail,
} from "./attendance-db";

// ── Rate limiting (PER-INSTANCE, in-memory) ──────────────────────────────────
// Same buckets/limits these actions had inside attendance-actions.ts. The
// limiter has ALWAYS been per-instance (each factory call closes over its own
// Map, one per Node process), so this file carrying its own instance after the
// split changes nothing about the guarantees — it was best-effort before and
// is best-effort now. (Shared implementation: src/lib/rate-limit.ts.)
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_READ = 30; // getVerificationStatesAction — polled by the Appello tab
const RATE_LIMIT_EMAIL = 40; // set/send attendee confirmation email (course-start)

// Isolated fixed-window limiter, keyed by `${bucket}:${token}`.
const limiter = createFixedWindowLimiter(RATE_WINDOW_MS);

// ── Course-start EMAIL SANITIZATION on the share link ───────────────────────
// The educator (no login — authorized by the share token) confirms/corrects each
// attendee's email and sends the confirmation magic-link. Same token-auth posture
// as the appello: re-verify the token, derive the course from it, and bind the
// client-passed subject id to THIS course before any write.

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
