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
  /** When `linked`, the id of the EXISTING corsista the seat now points to (the
   *  placeholder is deleted). Callers that keep a local roster must re-key the
   *  row on THIS id, not the stale placeholder id, or later per-corsista writes
   *  (e.g. attendance) hit a deleted id. */
  linkedId?: number;
  /** Email belongs to a DIFFERENTLY-named person — the UI resolves it. */
  conflict?: { corsistaId: number; name: string; phone: string };
  /** Linking to an existing profile whose name/phone DIFFER from what was just
   *  typed: the UI shows both and the operator picks which to keep (no silent
   *  overwrite). Re-call with `resolve` to apply the choice. */
  mismatch?: {
    corsistaId: number;
    existing: { name: string; phone: string };
    entered: { name: string; phone: string };
    nameDiffers: boolean;
    phoneDiffers: boolean;
  };
}

/** Which fields to overwrite on the existing profile when linking (operator's
 *  choice from the mismatch card). Omitted / false = keep the existing value. */
export interface SeatCompletionResolve {
  applyName?: boolean;
  applyPhone?: boolean;
}

const cleanPhoneDigits = (p: string): string => String(p ?? "").replace(/[\s\-().+]/g, "");

export async function finalizeSeatCompletion(
  svc: Svc,
  corsoId: number,
  iscrId: number,
  placeholderId: number,
  person: { name: string; email: string; phone: string },
  linkTo?: number,
  resolve?: SeatCompletionResolve,
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

    // Data bonifica (owner/educator): linking must NEVER silently discard what was
    // just typed. Compare the entered name/phone with the existing profile's.
    const { data: prof } = await svc
      .from("corsisti")
      .select("full_name, phone")
      .eq("id", id)
      .maybeSingle();
    const exName = ((prof as { full_name?: string | null } | null)?.full_name ?? "").trim();
    const exPhone = ((prof as { phone?: string | null } | null)?.phone ?? "").trim();
    const enName = name.trim();
    const enPhone = phone.trim();
    // A "difference" only matters when BOTH sides have a value: an empty existing
    // field is simply filled from what was typed (nothing is lost, no prompt).
    const nameDiffers = enName !== "" && exName !== "" && sortedNameKey(enName) !== sortedNameKey(exName);
    const phoneDiffers = enPhone !== "" && exPhone !== "" && cleanPhoneDigits(enPhone) !== cleanPhoneDigits(exPhone);
    if ((nameDiffers || phoneDiffers) && !resolve) {
      return {
        ok: false,
        mismatch: {
          corsistaId: id,
          existing: { name: exName, phone: exPhone },
          entered: { name: enName, phone: enPhone },
          nameDiffers,
          phoneDiffers,
        },
      };
    }
    // Resolve to the final values: apply the entered value when the operator chose
    // it (or when the existing field is empty → fill it); otherwise keep existing.
    const finalName = resolve?.applyName ? enName : exName || enName;
    const finalPhone = resolve?.applyPhone ? enPhone : exPhone || enPhone;
    // Propagate a failure here (don't swallow): the mismatch card PROMISED to
    // apply the operator's choice — a silent failure would keep the stale data
    // while the UI shows success, the exact data-loss this flow prevents.
    const { error: profErr } = await svc
      .from("corsisti")
      .update({ full_name: finalName || exName, phone: finalPhone })
      .eq("id", id);
    if (profErr) return { ok: false, error: profErr.message };

    const { error: linkErr } = await svc
      .from("corsi_iscrizioni")
      .update({ corsista_id: id, enrolled_email: email })
      .eq("id", iscrId);
    if (linkErr) return { ok: false, error: linkErr.message };
    await svc.from("corsisti").delete().eq("id", placeholderId).then(
      () => {},
      () => {},
    );
    return { ok: true, linked: true, linkedId: id };
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
