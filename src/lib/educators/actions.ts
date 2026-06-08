"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { syncEducatorActivation, type EducatorActivationResult } from "./sync-active";

/** Admin/manager: re-align educator activation with the public Chi-siamo page. */
export async function syncEducatorsAction(): Promise<EducatorActivationResult> {
  await assertRole(["admin", "manager"]);
  const res = await syncEducatorActivation();
  revalidatePath("/educator");
  revalidatePath("/", "layout");
  return res;
}
