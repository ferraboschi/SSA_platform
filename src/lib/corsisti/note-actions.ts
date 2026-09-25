"use server";

// Staff notes on a student — written from the platform (course roster or
// corsista profile). Owner 25/9/2026: organizers and the educator write them,
// only they see them. Soft delete only (never throw data). The educator's
// counterpart (share token) lives in share-links/note-actions.ts.
import { assertRole } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { CorsistaNote } from "@/lib/domain";
import { NOTES_TABLE, cleanNoteText, isMissingNotesTable, noteRowToDomain } from "./notes-db";

const MISSING = "Note non ancora disponibili: va applicata la migration 20260925150000_corsisti_note (chip «Migration DB»).";

export type NoteResult = { ok: true; note: CorsistaNote } | { ok: false; error: string; schema?: boolean };

export async function addCorsistaNoteAction(input: {
  corsistaId: number;
  /** The course the note is written from (roster) — null from the profile. */
  corsoId?: number | null;
  text: string;
}): Promise<NoteResult> {
  await assertRole(["admin", "manager"]);
  const corsistaId = Number(input.corsistaId);
  if (!Number.isInteger(corsistaId) || corsistaId <= 0) return { ok: false, error: "Corsista non valido." };
  const corsoId = input.corsoId != null && Number.isInteger(Number(input.corsoId)) ? Number(input.corsoId) : null;
  const cleaned = cleanNoteText(input.text);
  if (!cleaned.ok) return cleaned;
  const session = await getSession();
  const author = (session.user.name || session.user.email || "staff").trim();
  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from(NOTES_TABLE)
    .insert({ corsista_id: corsistaId, corso_id: corsoId, text: cleaned.text, author, author_role: "staff" })
    .select("id, corsista_id, corso_id, text, author, author_role, created_at, corso:corsi(short_title)")
    .single();
  if (error || !data) {
    if (isMissingNotesTable(error)) return { ok: false, schema: true, error: MISSING };
    return { ok: false, error: "Salvataggio della nota non riuscito, riprova." };
  }
  return { ok: true, note: noteRowToDomain(data as Parameters<typeof noteRowToDomain>[0]) };
}

/** Soft delete (deleted_at) — the note stays in the DB for audit. */
export async function deleteCorsistaNoteAction(noteId: number): Promise<{ ok: boolean; error?: string }> {
  await assertRole(["admin", "manager"]);
  const id = Number(noteId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Nota non valida." };
  const svc = getSupabaseServiceClient();
  const { error } = await svc
    .from(NOTES_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    if (isMissingNotesTable(error)) return { ok: false, error: MISSING };
    return { ok: false, error: "Eliminazione non riuscita, riprova." };
  }
  return { ok: true };
}
