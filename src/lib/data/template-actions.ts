"use server";

import { revalidatePath } from "next/cache";
import { getDataSource } from "./provider";
import type { MaterialTemplate } from "@/lib/domain";

export async function saveTemplateAction(template: MaterialTemplate): Promise<void> {
  (await getDataSource()).materialTemplates.save(template);
  revalidatePath("/template-materiali");
}

export async function deleteTemplateAction(id: string): Promise<void> {
  (await getDataSource()).materialTemplates.remove(id);
  revalidatePath("/template-materiali");
}
