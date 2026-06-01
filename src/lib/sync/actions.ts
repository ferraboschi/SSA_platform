"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { runShopifySync, type SyncSummary } from "./shopify-sync";
import { SHELL_DATA_TAG } from "@/lib/shell-data";

export interface SyncActionResult {
  ok: boolean;
  summary?: SyncSummary;
  error?: string;
}

/**
 * On-demand Shopify sync, triggered by the top-bar refresh button. Staff-only.
 * Revalidates the layout + cached shell data so fresh counts/courses render
 * immediately after the call resolves.
 */
export async function syncShopifyAction(): Promise<SyncActionResult> {
  const session = await getSession();
  const roleKey = session?.user?.roleKey;
  if (roleKey !== "admin" && roleKey !== "manager") {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const summary = await runShopifySync();
    revalidateTag(SHELL_DATA_TAG, "max");
    revalidatePath("/", "layout");
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
