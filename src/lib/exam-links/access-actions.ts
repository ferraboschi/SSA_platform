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

// Token-keyed, per-instance limiter — the gate is an email-enumeration surface.
const limiter = createFixedWindowLimiter(60_000);
const RATE_LIMIT_RESOLVE = 20;

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
  if (res.payload.s) return { ok: false, error: "Questo link è già personale." };
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
    .limit(1);
  const row = !error && data && data.length ? (data[0] as { corsista_id: number }) : null;

  // SECONDARY: companions ("doppio", corsi_partecipanti.email) — same
  // confirmed-only rule, same course binding. Checked only when no corsista
  // matched, so existing behaviour keeps priority.
  let partRow: { id: number } | null = null;
  if (!row) {
    const { data: pData, error: pErr } = await svc
      .from("corsi_partecipanti")
      .select("id")
      .eq("corso_id", corsoId)
      .eq("email", clean)
      .not("email_confirmed_at", "is", null)
      .limit(1);
    partRow = !pErr && pData && pData.length ? (pData[0] as { id: number }) : null;
  }

  if (!row && !partRow) {
    // Generic message — do NOT reveal whether the email is enrolled-but-unconfirmed
    // vs unknown (avoids turning the gate into an enrollment oracle).
    return {
      ok: false,
      error:
        "Email non riconosciuta o non ancora confermata. Chiedi il link personale al tuo educator.",
    };
  }

  // Lifecycle default (end of day), but never beyond the shared link's own
  // expiry — passing the gate must not extend what the educator shared.
  const exp = Math.min(expiryForChoice("eod"), res.payload.e);
  const personal = signExamToken({
    c,
    t,
    m: "exam",
    ...(row ? { s: String(row.corsista_id) } : { p: String(partRow!.id) }),
    ia: Math.floor(Date.now() / 1000),
    l,
    e: exp,
  });
  return {
    ok: true,
    url: `${appConfig.baseUrl.replace(/\/$/, "")}/esame/${personal}`,
  };
}
