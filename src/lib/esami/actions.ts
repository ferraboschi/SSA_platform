"use server";

// Persist an edited family exam template (questions / mini-tests / feedback).
// Admin & manager only — same gate as exam-link creation.

import { revalidatePath } from "next/cache";
import { getDataSource } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import type { ExamTemplate } from "@/lib/domain";

export interface SaveExamResult {
  ok: boolean;
  error?: string;
}

export async function saveExamTemplateAction(
  template: ExamTemplate,
): Promise<SaveExamResult> {
  const session = await getSession();
  const role = session.user.roleKey;
  if (role !== "admin" && role !== "manager") {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const ds = await getDataSource();
    await ds.examTemplates.save(template);
    revalidatePath("/esami/editor");
    revalidatePath("/esami");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}
