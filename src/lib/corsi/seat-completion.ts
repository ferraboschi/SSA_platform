import "server-only";

// Shared core for completing a "posto da completare" seat — used by BOTH entry
// points: the admin roster (seat-actions) and the educator's appello link
// (attendance-actions). Keeps the identity rules identical everywhere:
//  • email is the UNIQUE key (one email = one person);
//  • same email + SAME name (tolerant, order/accent-insensitive) → link the seat
//    to that existing profile (a repeat attendee), never a duplicate;
//  • same email + DIFFERENT name → return a CONFLICT for the UI to resolve
//    (inline "is it the same person?" → link, or fix the email);
//  • `linkTo` = the user confirmed "same person": force-link (the target must own
//    the email, so the client can't point it at an arbitrary profile).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { sortedNameKey } from "@/lib/anomalie/rules";

type Svc = ReturnType<typeof getSupabaseServiceClient>;

/** A phone field must actually be a phone number (owner: "dd" must be rejected).
 *  Allows spaces / dashes / dots / parens / a leading +; needs ≥6 real digits. */
export function phoneLooksValid(phone: string): boolean {
  const cleaned = String(phone ?? "").replace(/[\s\-().+]/g, "");
  return /^\d{6,}$/.test(cleaned);
}

export interface SeatCompletionResult {
  ok: boolean;
  error?: string;
  /** Linked to an existing profile (repeat attendee) instead of a new person. */
  linked?: boolean;
  /** Email belongs to a DIFFERENTLY-named person — the UI resolves it. */
  conflict?: { corsistaId: number; name: string; phone: string };
}

export async function finalizeSeatCompletion(
  svc: Svc,
  corsoId: number,
  iscrId: number,
  placeholderId: number,
  person: { name: string; email: string; phone: string },
  linkTo?: number,
): Promise<SeatCompletionResult> {
  const { name, email, phone } = person;

  const linkToTarget = async (id: number): Promise<SeatCompletionResult> => {
    // A repeat attendee is fine across courses, but not twice in THIS one.
    const { data: dup } = await svc
      .from("corsi_iscrizioni")
      .select("id")
      .eq("corso_id", corsoId)
      .eq("corsista_id", id)
      .neq("id", iscrId)
      .limit(1);
    if (dup && dup.length > 0) return { ok: false, error: "Questa persona è già presente in questo corso." };
    const { error: linkErr } = await svc
      .from("corsi_iscrizioni")
      .update({ corsista_id: id, enrolled_email: email })
      .eq("id", iscrId);
    if (linkErr) return { ok: false, error: linkErr.message };
    await svc.from("corsisti").delete().eq("id", placeholderId).then(
      () => {},
      () => {},
    );
    return { ok: true, linked: true };
  };

  // Explicit "same person" confirmation from the UI: link, but only if the target
  // actually owns this email (never trust a raw id from the client).
  if (linkTo != null) {
    const { data } = await svc
      .from("corsisti")
      .select("id")
      .eq("id", linkTo)
      .eq("email", email)
      .maybeSingle();
    if (!data?.id) return { ok: false, error: "Profilo non trovato per questa email." };
    return linkToTarget(Number(data.id));
  }

  // Does this email already belong to (other) real corsisti?
  const { data: rows } = await svc
    .from("corsisti")
    .select("id, full_name, placeholder")
    .eq("email", email)
    .neq("id", placeholderId)
    .limit(20);
  const existing = ((rows ?? []) as { id: number; full_name: string | null; placeholder?: boolean }[]).filter(
    (r) => !r.placeholder,
  );
  if (existing.length > 0) {
    const nameKey = sortedNameKey(name);
    const same = existing.find((c) => nameKey.length > 0 && sortedNameKey(c.full_name ?? "") === nameKey);
    if (same) return linkToTarget(same.id);
    // Different name → hand the conflict (with WHO it is) back to the UI.
    const first = existing[0];
    const { data: full } = await svc
      .from("corsisti")
      .select("full_name, phone")
      .eq("id", first.id)
      .maybeSingle();
    const f = full as { full_name?: string | null; phone?: string | null } | null;
    return {
      ok: false,
      conflict: {
        corsistaId: first.id,
        name: (f?.full_name ?? "").trim(),
        phone: (f?.phone ?? "").trim(),
      },
    };
  }

  // New person → promote the placeholder in place.
  const { error: updErr } = await svc
    .from("corsisti")
    .update({ full_name: name, email, phone, placeholder: false })
    .eq("id", placeholderId);
  if (updErr) return { ok: false, error: updErr.message };
  await svc.from("corsi_iscrizioni").update({ enrolled_email: email }).eq("id", iscrId);
  return { ok: true };
}
