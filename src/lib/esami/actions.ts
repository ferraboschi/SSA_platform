"use server";

// Persist an edited family exam template (questions / mini-tests / feedback).
// Open to ANY signed-in staff member — owner: no more admin/manager-only lock
// on this page. Still requires an actual session (not the unauthenticated
// "guest" placeholder) — a server action is independently POST-invokable by
// its id regardless of which nav items are hidden, so this is the one real
// gate against an anonymous caller, not a per-role restriction.

import { revalidatePath } from "next/cache";
import { getDataSource } from "@/lib/data";
import { CONFLICT_MSG } from "@/lib/data/kv-cas";
import { getSession } from "@/lib/auth/session";
import type { ExamTemplate } from "@/lib/domain";

export interface SaveExamResult {
  ok: boolean;
  error?: string;
  /** Another editor saved in the meantime — reload before saving again. */
  conflict?: boolean;
  /** New concurrency version after a successful save (keep editing + saving). */
  newVersion?: number;
}

export async function saveExamTemplateAction(
  template: ExamTemplate,
): Promise<SaveExamResult> {
  const session = await getSession();
  if (session.user.roleKey === "guest") return { ok: false, error: "Non autorizzato." };
  try {
    const ds = await getDataSource();
    const nv = await ds.examTemplates.save(template);
    revalidatePath("/esami/editor");
    revalidatePath("/esami");
    return { ok: true, newVersion: typeof nv === "number" ? nv : undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Salvataggio non riuscito.";
    return { ok: false, error: msg, conflict: msg === CONFLICT_MSG };
  }
}
