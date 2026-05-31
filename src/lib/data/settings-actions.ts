"use server";

import { revalidatePath } from "next/cache";
import { getDataSource } from "./provider";
import type { DashThresholds } from "@/lib/domain";

export async function setThresholdsAction(
  patch: Partial<DashThresholds>,
): Promise<void> {
  (await getDataSource()).settings.setThresholds(patch);
  revalidatePath("/", "layout");
}
