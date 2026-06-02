"use server";

import { revalidatePath } from "next/cache";
import { getDataSource } from "./provider";
import { assertRole } from "@/lib/auth/guard";
import type { MaterialTemplate } from "@/lib/domain";

export async function saveTemplateAction(template: MaterialTemplate): Promise<void> {
  await assertRole(["admin", "manager"]);
  // MUST await the DB write before revalidating — otherwise the action returns
  // (and the cache is recomputed) before the row exists, so the template seems
  // to vanish on refresh and never appears in the course template picker.
  await (await getDataSource()).materialTemplates.save(template);
  revalidatePath("/template-materiali");
  // Templates are also picked from the course economics screen — refresh it.
  revalidatePath("/corsi", "layout");
}

export async function deleteTemplateAction(id: string): Promise<void> {
  await assertRole(["admin", "manager"]);
  await (await getDataSource()).materialTemplates.remove(id);
  revalidatePath("/template-materiali");
  revalidatePath("/corsi", "layout");
}
