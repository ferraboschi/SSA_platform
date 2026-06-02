"use server";

import { revalidatePath } from "next/cache";
import { getDataSource } from "./provider";
import { assertRole } from "@/lib/auth/guard";
import type { DashThresholds } from "@/lib/domain";

export async function setThresholdsAction(
  patch: Partial<DashThresholds>,
): Promise<void> {
  await assertRole(["admin", "manager"]);
  // MUST await the write before revalidating, else the recompute races the row.
  await (await getDataSource()).settings.setThresholds(patch);
  revalidatePath("/", "layout");
}
