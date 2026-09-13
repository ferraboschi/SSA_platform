"use server";

// Email gate for the SHARED exam link. A student who opens the class link (no
// bound `s`) proves identity by entering the email they CONFIRMED at course
// start; we match it against the sanitized per-course list (corsi_iscrizioni
// .enrolled_email WHERE email_confirmed_at IS NOT NULL) and, on a hit, mint a
// PERSONAL exam token (s = corsista_id) so entry proceeds bound to that student.
// This replaces the old public name-pick roster (no roster is ever exposed).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { appConfig } from "@/lib/integrations/config";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { verifyExamToken, signExamToken } from "./token";
import { getClosure, isBlockedByClosure, expiryForChoice } from "./lifecycle";
import { loadPresentForTest, isBlockedByAbsence, absentAccessError, type AccessLang } from "./live-progress";
import { subjectKeyOf } from "./access";

// Token-keyed, per-instance limiter — the gate is an email-enumeration surface.
const limiter = createFixedWindowLimiter(60_000);
const RATE_LIMIT_RESOLVE = 20;

/** A buyer and their "doppio" companion legitimately share one email (see
 *  results.ts): the class link cannot tell them apart, so it must not guess —
 *  the educator's panel mints a personal link per subject, which is the way in. */
const SHARED_EMAIL: Record<AccessLang, string> = {
  it: "Questa email è usata da più iscritti: chiedi all'educator il tuo link personale.",
  en: "This email is used by more than one enrolled student: ask your educator for your personal link.",
  ja: "このメールアドレスは複数の受講者に使われています。講師に個人用リンクを依頼してください。",
};

export interface ResolveExamAccessResult {
  ok: boolean;
  /** On success: the personal /esame/<token> URL to redirect the student to. */
  url?: string;
  error?: string;
}

export async function resolveExamAccessByEmailAction(
  token: string,
  email: string,
): Promise<ResolveExamAccessResult> {
  const res = verifyExamToken(token);
  if (!res.ok) return { ok: false, error: "Link non valido o scaduto." };
  const { c, t, m, l } = res.payload;
  // Only the real exam mode is gated; previews (test/validate) don't identify.
  if (m !== "exam") return { ok: false, error: "Questo link non richiede verifica." };
  // A token that is ALREADY personal shouldn't reach the gate; nothing to do.
  if (res.payload.s || res.payload.p) return { ok: false, error: "Questo link è già personale." };
  if (limiter.isLimited("resolve", token, RATE_LIMIT_RESOLVE)) {
    return { ok: false, error: "Troppi tentativi, riprova tra poco." };
  }

  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { ok: false, error: "Inserisci un indirizzo email valido." };
  }
  const corsoId = /^\d+$/.test(c) ? Number(c) : null;
  if (corsoId == null) return { ok: false, error: "Corso non valido." };

  // Lifecycle: if the educator closed this test, the shared link stops resolving.
  const closedAt = await getClosure(corsoId, t);
  if (isBlockedByClosure(closedAt, res.payload.ia)) {
    return { ok: false, error: "Questo test è stato chiuso dall'educator." };
  }

  const svc = getSupabaseServiceClient();
  // Match ONLY the confirmed-during-course snapshot. enrolled_email is stored
  // already-normalized (lowercased) on write, so an equality match is exact.
  // If the migration/columns are absent the query errors → treated as no match
  // (the gate stays closed) — never throws to the student.
  const { data, error } = await svc
    .from("corsi_iscrizioni")
    .select("corsista_id")
    .eq("corso_id", corsoId)
    .eq("enrolled_email", clean)
    .not("email_confirmed_at", "is", null)
    .is("annullata_at", null); // a student removed from the course can't access
  // Distinct SUBJECTS, not rows: a re-purchase can leave two active seats for
  // the same corsista, which is still one identity.
  const corsistaIds = new Set(
    (error ? [] : ((data ?? []) as { corsista_id: number }[])).map((r) => r.corsista_id),
  );

  // Companions ("doppio", corsi_partecipanti.email) — same confirmed-only rule,
  // same course binding. Read ALWAYS, not only when no corsista matched: the
  // gate must know whether the email belongs to MORE than one subject.
  const { data: pData, error: pErr } = await svc
    .from("corsi_partecipanti")
    .select("id")
    .eq("corso_id", corsoId)
    .eq("email", clean)
    .not("email_confirmed_at", "is", null);
  const partIds = new Set((pErr ? [] : ((pData ?? []) as { id: number }[])).map((r) => r.id));

  // Student-facing refusals follow the link language, like the /esame page.
  const lang: AccessLang = l === "en" || l === "ja" ? l : "it";
  const matches = corsistaIds.size + partIds.size;
  if (matches === 0) {
    // Generic message — do NOT reveal whether the email is enrolled-but-unconfirmed
    // vs unknown (avoids turning the gate into an enrollment oracle).
    return {
      ok: false,
      error:
        "Email non riconosciuta o non ancora confermata. Chiedi il link personale al tuo educator.",
    };
  }
  if (matches > 1) {
    // Shared email (buyer + companion): binding it to the first hit identified
    // the companion as the buyer, who was then refused as "già consegnato".
    return { ok: false, error: SHARED_EMAIL[lang] };
  }
  const subject =
    corsistaIds.size > 0
      ? { corsistaId: [...corsistaIds][0], partecipanteId: null }
      : { corsistaId: null, partecipanteId: [...partIds][0] };

  // PRESENCE gate (owner's rule): an absent student must not sit the test.
  // Same canonical rule as the educator's send gate (day test ↔ that appello
  // day; FEEDBACK ↔ the LAST program day's roll-call; final ↔ the exam day).
  // Fails open only when attendance is UNKNOWN (DB error / pre-migration) — the
  // /esame page re-checks anyway.
  // BYPASSED for an emergency link (emg): the educator can't run the roll-call,
  // so presence can't be known — the confirmed-email match above is the gate.
  if (!res.payload.emg) {
    const present = await loadPresentForTest(svc, corsoId, t);
    if (isBlockedByAbsence(present, subjectKeyOf(subject)!)) {
      return { ok: false, error: absentAccessError(t, lang) };
    }
  }

  // Lifecycle default (end of day), but never beyond the shared link's own
  // expiry — passing the gate must not extend what the educator shared.
  const exp = Math.min(expiryForChoice("eod"), res.payload.e);
  const personal = signExamToken({
    c,
    t,
    m: "exam",
    ...(subject.corsistaId != null
      ? { s: String(subject.corsistaId) }
      : { p: String(subject.partecipanteId) }),
    ia: Math.floor(Date.now() / 1000),
    l,
    e: exp,
    // Carry the emergency flag onto the personal link so the /esame page and
    // submit also skip presence (otherwise they'd re-block the student).
    ...(res.payload.emg ? { emg: res.payload.emg } : {}),
  });
  return {
    ok: true,
    url: `${appConfig.baseUrl.replace(/\/$/, "")}/esame/${personal}`,
  };
}
