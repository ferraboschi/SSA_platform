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
import { verifyExamToken, signExamToken, EXAM_LINK_TTL_HOURS } from "./token";

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
  if (!row) {
    // Generic message — do NOT reveal whether the email is enrolled-but-unconfirmed
    // vs unknown (avoids turning the gate into an enrollment oracle).
    return {
      ok: false,
      error:
        "Email non riconosciuta o non ancora confermata. Chiedi il link personale al tuo educator.",
    };
  }

  const exp = Math.floor(Date.now() / 1000) + EXAM_LINK_TTL_HOURS[m] * 3600;
  const personal = signExamToken({
    c,
    t,
    m: "exam",
    s: String(row.corsista_id),
    l,
    e: exp,
  });
  return {
    ok: true,
    url: `${appConfig.baseUrl.replace(/\/$/, "")}/esame/${personal}`,
  };
}
