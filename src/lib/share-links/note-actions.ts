"use server";

// Notes on a student from the PUBLIC educator share link — same token-auth
// posture as attendance-actions.ts: re-verify the token, derive the course
// from it, bind the corsista to THIS course, rate-limit per token. Written
// as "educator" (with the course educator's name); visible only to staff and
// educators. No delete from the share page (staff removes from the platform).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import type { CorsistaNote } from "@/lib/domain";
import { NOTES_TABLE, cleanNoteText, isMissingNotesTable, noteRowToDomain } from "@/lib/corsisti/notes-db";
import { ISCR_TABLE, courseIdFromToken } from "./attendance-db";

const limiter = createFixedWindowLimiter(60_000);
const RATE_LIMIT_NOTE = 30;

export async function addStudentNoteFromLinkAction(
  token: string,
  corsistaId: number,
  text: string,
): Promise<{ ok: true; note: CorsistaNote } | { ok: false; error: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("note", token, RATE_LIMIT_NOTE)) return { ok: false, error: "Troppe richieste, riprova tra poco." };
  const id = Number(corsistaId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Corsista non valido." };
  const cleaned = cleanNoteText(text);
  if (!cleaned.ok) return cleaned;

  const svc = getSupabaseServiceClient();
  // OWNERSHIP GUARD: the person must hold an ACTIVE seat on the token's course.
  const { data: seat } = await svc
    .from(ISCR_TABLE)
    .select("id")
    .eq("corso_id", corsoId)
    .eq("corsista_id", id)
    .is("annullata_at", null)
    .limit(1)
    .maybeSingle();
  if (!seat) return { ok: false, error: "Corsista non iscritto a questo corso." };

  // Author: "educator · <name>" when the course has one, else just "educator".
  let author = "educator";
  try {
    const { data: corso } = await svc
      .from("corsi")
      .select("educator:educators(full_name)")
      .eq("id", corsoId)
      .maybeSingle();
    const edu = (corso as { educator?: { full_name?: string | null } | { full_name?: string | null }[] | null } | null)?.educator;
    const name = (Array.isArray(edu) ? edu[0]?.full_name : edu?.full_name) ?? "";
    if (name) author = `educator · ${name}`;
  } catch {
    /* name is decoration */
  }

  const { data, error } = await svc
    .from(NOTES_TABLE)
    .insert({ corsista_id: id, corso_id: corsoId, text: cleaned.text, author, author_role: "educator" })
    .select("id, corsista_id, corso_id, text, author, author_role, created_at, corso:corsi(short_title)")
    .single();
  if (error || !data) {
    if (isMissingNotesTable(error)) {
      return { ok: false, schema: true, error: "Note non ancora attive: la segreteria deve applicare una migration." };
    }
    return { ok: false, error: "Salvataggio della nota non riuscito, riprova." };
  }
  return { ok: true, note: noteRowToDomain(data as Parameters<typeof noteRowToDomain>[0]) };
}
