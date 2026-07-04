"use server";

// Reusable exam-question categories — a flat, DB-backed list per family
// (certificato/shochu) so the editor's "categoria" combobox can offer existing
// values while still letting staff type a brand-new one (upserted here on
// commit, so it's reusable everywhere from then on — no more free-text
// duplicates/typos). No role gate: this mirrors the exam-library editor's own
// "open to everyone signed in" policy.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { ExamFamily } from "@/lib/domain";

function dbFamily(family: ExamFamily): "certificato" | "shochu" {
  return family === "shochu" ? "shochu" : "certificato";
}

/** All known category labels for a family, alphabetically. */
export async function listExamCategoriesAction(family: ExamFamily): Promise<string[]> {
  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from("exam_categories")
    .select("label")
    .eq("family", dbFamily(family))
    .order("label");
  if (error) return [];
  return (data ?? []).map((r) => (r as { label: string }).label);
}

export interface AddExamCategoryResult {
  ok: boolean;
  error?: string;
}

/** Upsert a (possibly new) category label for a family — case-insensitive
 *  dedupe so "Storia" and "storia" don't both end up in the list. */
export async function addExamCategoryAction(
  family: ExamFamily,
  label: string,
): Promise<AddExamCategoryResult> {
  const session = await getSession();
  if (session.user.roleKey === "guest") return { ok: false, error: "Non autorizzato." };

  const clean = label.trim();
  if (!clean) return { ok: false, error: "Categoria vuota." };
  if (clean.length > 80) return { ok: false, error: "Nome categoria troppo lungo." };

  const svc = getSupabaseServiceClient();
  const fam = dbFamily(family);
  const { data: existing, error: findErr } = await svc
    .from("exam_categories")
    .select("id, label")
    .eq("family", fam);
  if (findErr) return { ok: false, error: findErr.message };
  const dup = (existing ?? []).some(
    (r) => (r as { label: string }).label.toLowerCase() === clean.toLowerCase(),
  );
  if (dup) return { ok: true }; // already known — nothing to do

  const { error } = await svc.from("exam_categories").insert({ family: fam, label: clean });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
