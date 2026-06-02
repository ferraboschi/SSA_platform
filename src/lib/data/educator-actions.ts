"use server";

import { revalidatePath } from "next/cache";
import { getDataSource } from "./provider";
import { assertRole } from "@/lib/auth/guard";
import type { CourseTypeKey } from "@/lib/domain";

export async function setQualificationsAction(
  id: string,
  types: CourseTypeKey[],
): Promise<void> {
  await assertRole(["admin", "manager"]);
  await (await getDataSource()).educators.setQualifications(id, types);
  revalidatePath("/", "layout");
}
