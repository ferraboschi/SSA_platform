// Server-only loader for the public attendee "confirm your details" page.
//
// Reachable WITHOUT login via a signed confirm token (confirm-token.ts). We use
// the service client (anon is blocked by RLS) to read only what the page shows —
// the subject's name/phone and their current best email — all derived from the
// VERIFIED token, never from client input.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { ConfirmSubjectKind } from "./confirm-token";

export interface ConfirmSubject {
  courseId: string;
  courseName: string;
  kind: ConfirmSubjectKind;
  /** Subject id — corsi_iscrizioni.id (corsista) or corsi_partecipanti.id. */
  id: string;
  fullName: string;
  phone: string;
  /** Current best email: the confirmed snapshot if set, else the Shopify email
   *  (corsista) or empty (companion). The student confirms/corrects this. */
  email: string;
  /** Whether this attendee already confirmed (email_confirmed_at is set). */
  confirmed: boolean;
  /** When they confirmed (ISO) — drives the "link closed after confirmation"
   *  rule (tokens issued before this instant are spent). Null if never. */
  confirmedAt: string | null;
  /** Delivery address previously saved on /conferma ("" if none / pre-migration). */
  deliveryAddress: string;
  /** Optional delivery notes (citofono, courier instructions) — "" if none. */
  deliveryNotes: string;
}

/** Stamp confirm_sent_at on the subject row (drives the "mail non ancora
 *  confermata" state). Graceful pre-migration: a missing column is ignored. */
export async function stampConfirmSent(
  courseId: string,
  kind: ConfirmSubjectKind,
  subjectId: string,
): Promise<void> {
  const sb = getSupabaseServiceClient();
  const table = kind === "corsista" ? "corsi_iscrizioni" : "corsi_partecipanti";
  await sb
    .from(table)
    .update({ confirm_sent_at: new Date().toISOString() })
    .eq("id", Number(subjectId))
    .eq("corso_id", Number(courseId));
}

/** Run the same single-row select with progressively fewer optional columns,
 *  returning the FIRST tier that succeeds. Each recently-migrated column gets
 *  its own tier: a DB missing ONLY the newest column (e.g. delivery_notes,
 *  migration 20260704000000 not yet applied) must still read enrolled_email —
 *  jumping straight to the bare fallback silently served the OLD Shopify email
 *  on /conferma (and as the "Invia email" target) while corrections lived in
 *  the snapshot. Found live 2026-07-04.
 */
async function selectFirstTier<T>(
  sb: ReturnType<typeof getSupabaseServiceClient>,
  table: string,
  tiers: string[],
  subjectId: string,
  courseId: string,
): Promise<T | null> {
  for (const columns of tiers) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .eq("id", Number(subjectId))
      .eq("corso_id", Number(courseId))
      .maybeSingle();
    if (!error) return data as T | null;
  }
  return null;
}

export async function loadConfirmSubject(
  courseId: string,
  kind: ConfirmSubjectKind,
  subjectId: string,
): Promise<ConfirmSubject | null> {
  const sb = getSupabaseServiceClient();

  const { data: corso } = await sb
    .from("corsi")
    .select("id, short_title, full_title")
    .eq("id", Number(courseId))
    .maybeSingle();
  if (!corso) return null;
  const courseName = corso.short_title || corso.full_title || "Corso SSA";

  if (kind === "corsista") {
    // Enrollment row → its corsista + the confirmed-email snapshot. Tiered by
    // migration age: no delivery_notes → no delivery columns → no snapshot.
    type Row = {
      id: number;
      enrolled_email?: string | null;
      email_confirmed_at?: string | null;
      delivery_address?: string | null;
      delivery_notes?: string | null;
      corsista: { full_name: string | null; email: string | null; phone: string | null } | null;
    };
    const CORSISTA = "corsista:corsisti(full_name, email, phone)";
    const row = await selectFirstTier<Row>(sb, "corsi_iscrizioni", [
      `id, enrolled_email, email_confirmed_at, delivery_address, delivery_notes, ${CORSISTA}`,
      `id, enrolled_email, email_confirmed_at, delivery_address, ${CORSISTA}`,
      `id, enrolled_email, email_confirmed_at, ${CORSISTA}`,
      `id, ${CORSISTA}`,
    ], subjectId, courseId);
    if (!row?.corsista) return null;
    return {
      courseId: String(corso.id),
      courseName,
      kind,
      id: String(row.id),
      fullName: row.corsista.full_name ?? "",
      phone: row.corsista.phone ?? "",
      email: (row.enrolled_email || row.corsista.email || "").trim(),
      confirmed: Boolean(row.email_confirmed_at),
      confirmedAt: row.email_confirmed_at ?? null,
      deliveryAddress: (row.delivery_address ?? "").trim(),
      deliveryNotes: (row.delivery_notes ?? "").trim(),
    };
  }

  // Companion ("doppio"): name/phone live on the row; email is its own column.
  // Same migration-age tiers as the corsista branch.
  type PRow = {
    id: number;
    full_name: string | null;
    phone: string | null;
    email?: string | null;
    email_confirmed_at?: string | null;
    delivery_address?: string | null;
    delivery_notes?: string | null;
  };
  const prow = await selectFirstTier<PRow>(sb, "corsi_partecipanti", [
    "id, full_name, phone, email, email_confirmed_at, delivery_address, delivery_notes",
    "id, full_name, phone, email, email_confirmed_at, delivery_address",
    "id, full_name, phone, email, email_confirmed_at",
    "id, full_name, phone",
  ], subjectId, courseId);
  if (!prow) return null;
  return {
    courseId: String(corso.id),
    courseName,
    kind,
    id: String(prow.id),
    fullName: prow.full_name ?? "",
    phone: prow.phone ?? "",
    email: (prow.email || "").trim(),
    confirmed: Boolean(prow.email_confirmed_at),
    confirmedAt: prow.email_confirmed_at ?? null,
    deliveryAddress: (prow.delivery_address ?? "").trim(),
    deliveryNotes: (prow.delivery_notes ?? "").trim(),
  };
}
