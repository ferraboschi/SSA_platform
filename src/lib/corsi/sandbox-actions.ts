"use server";

import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/auth/guard";
import { resetExamSandbox, type SandboxResetSummary } from "./sandbox-reset";
import { SANDBOX_COURSE_HANDLE } from "./sandbox";

export interface SandboxResetResult {
  ok: boolean;
  summary?: SandboxResetSummary;
  error?: string;
}

/** "Test esame" reset — wipes all trial state and restores the demo roster. */
export async function resetExamSandboxAction(): Promise<SandboxResetResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const summary = await resetExamSandbox();
    revalidatePath("/corsi");
    revalidatePath(`/corsi/${SANDBOX_COURSE_HANDLE}`);
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Reset non riuscito." };
  }
}
