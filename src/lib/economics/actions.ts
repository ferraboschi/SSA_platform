"use server";

// Server actions that persist the per-course economics overlay.
//   • setCourseAdvAction      → SOCIAL (Dario) or admin: campaign/ADV spend.
//   • setCourseInvoicedAction → ACCOUNTANT (Luigi) or admin: invoicing status.
// Each is role-gated; manager (Camilla) and others see the values read-only.

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { getSession } from "@/lib/auth/session";
import { ECON_KEY } from "./index";
import type { CourseEconomics } from "./types";

export interface EconActionResult {
  ok: boolean;
  error?: string;
}

async function patchEcon(
  courseId: string,
  patch: Partial<CourseEconomics>,
): Promise<void> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", ECON_KEY)
    .maybeSingle();
  const items =
    ((data?.value as { items?: Record<string, Partial<CourseEconomics>> } | null)
      ?.items) ?? {};
  const next = {
    ...items,
    [courseId]: { ...(items[courseId] ?? {}), ...patch },
  };
  await svc
    .from("settings_kv")
    .upsert({ key: ECON_KEY, value: { items: next } }, { onConflict: "key" });
}

/** Set (or clear, with null) the campaign/ADV cost for a course. */
export async function setCourseAdvAction(
  courseId: string,
  amount: number | null,
): Promise<EconActionResult> {
  const session = await getSession();
  const role = session.user.roleKey;
  if (role !== "social" && role !== "admin") {
    return { ok: false, error: "Non autorizzato." };
  }
  const value = amount == null || Number.isNaN(amount) ? null : Math.max(0, Math.round(amount));
  await patchEcon(courseId, {
    advCost: value,
    advBy: value == null ? null : session.user.name,
    advAt: value == null ? null : new Date().toISOString(),
  });
  revalidatePath("/conto-economico");
  revalidatePath(`/corsi/${courseId}`);
  return { ok: true };
}

/** Mark / unmark a course as invoiced. */
export async function setCourseInvoicedAction(
  courseId: string,
  invoiced: boolean,
): Promise<EconActionResult> {
  const session = await getSession();
  const role = session.user.roleKey;
  if (role !== "accountant" && role !== "admin") {
    return { ok: false, error: "Non autorizzato." };
  }
  await patchEcon(courseId, {
    invoiced,
    invoicedBy: invoiced ? session.user.name : null,
    invoicedAt: invoiced ? new Date().toISOString() : null,
  });
  revalidatePath("/conto-economico");
  revalidatePath(`/corsi/${courseId}`);
  return { ok: true };
}
