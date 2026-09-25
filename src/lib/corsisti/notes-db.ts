import "server-only";

// Notes on a student — server-side reader shared by the admin readers (course
// roster, corsista profile) and the educator share page. Degrades to "no
// notes" until migration 20260925150000 is applied (rule 4: the dashboard's
// "Migration DB" chip names it; writers report it explicitly).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorsistaNote } from "@/lib/domain";

export const NOTES_TABLE = "corsisti_note";
export const MAX_NOTE_CHARS = 1000;

/** Normalize a note: trim, collapse runs of spaces per line, cap the length.
 *  Pure and synchronous — kept OUT of the "use server" modules (Turbopack
 *  allows only async-function exports there; pre-deploy review blocker). */
export function cleanNoteText(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return { ok: false, error: "Scrivi il testo della nota." };
  if (text.length > MAX_NOTE_CHARS) return { ok: false, error: `Nota troppo lunga (max ${MAX_NOTE_CHARS} caratteri).` };
  return { ok: true, text };
}

export function isMissingNotesTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const m = (err.message ?? "").toLowerCase();
  return /relation .*corsisti_note.* does not exist/.test(m) || /could not find the table .*corsisti_note/.test(m);
}

interface NoteRow {
  id: number;
  corsista_id: number;
  corso_id: number | null;
  text: string;
  author: string;
  author_role: "staff" | "educator";
  created_at: string;
  corso?: { short_title: string | null } | { short_title: string | null }[] | null;
}

export function noteRowToDomain(r: NoteRow): CorsistaNote {
  const corso = Array.isArray(r.corso) ? r.corso[0] : r.corso;
  return {
    id: r.id,
    corsistaId: r.corsista_id,
    corsoId: r.corso_id,
    courseTitle: corso?.short_title ?? null,
    text: r.text,
    author: r.author,
    authorRole: r.author_role === "educator" ? "educator" : "staff",
    createdAt: r.created_at,
  };
}

/** Live (not soft-deleted) notes for the given corsisti, oldest first. */
export async function loadNotesByCorsista(
  svc: SupabaseClient,
  corsistaIds: number[],
): Promise<Map<number, CorsistaNote[]>> {
  const out = new Map<number, CorsistaNote[]>();
  const ids = [...new Set(corsistaIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return out;
  const { data, error } = await svc
    .from(NOTES_TABLE)
    .select("id, corsista_id, corso_id, text, author, author_role, created_at, corso:corsi(short_title)")
    .in("corsista_id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error || !data) return out; // missing table / transient → no notes, never a crash
  for (const r of data as unknown as NoteRow[]) {
    (out.get(r.corsista_id) ?? out.set(r.corsista_id, []).get(r.corsista_id)!).push(noteRowToDomain(r));
  }
  return out;
}
