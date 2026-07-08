import "server-only";

// Products the platform must SKIP entirely (owner's flag, Bug 3): bundle /
// package products ("Pacchetto da 5", cycle bundles…) are Shopify sale vehicles,
// not real courses — synced blindly they became ghost corsi with nonsense
// capacity. Flagging a product here makes the sync ignore it (no corso row, no
// enrollments, no backfill); its buyers are handled manually on the REAL
// courses via the roster's "Aggiungi posto extra". Stored in settings_kv.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvReadVersioned, kvCasPatch } from "@/lib/data/kv-cas";

type Svc = ReturnType<typeof getSupabaseServiceClient>;

export const IGNORED_PRODUCTS_KEY = "sync_ignored_products";

interface IgnoredStore {
  /** Shopify product ids (as strings) + a note of when/what was flagged. */
  items?: { id: string; title: string; at: string }[];
}

/** Product ids the sync must skip. Graceful: empty set on any error. */
export async function loadIgnoredProductIds(svc: Svc): Promise<Set<string>> {
  try {
    const { value } = await kvReadVersioned<IgnoredStore>(svc, IGNORED_PRODUCTS_KEY);
    return new Set((value?.items ?? []).map((i) => i.id));
  } catch {
    return new Set();
  }
}

/** Flag a product as ignored (idempotent; CAS-safe against parallel flags). */
export async function addIgnoredProduct(
  svc: Svc,
  productId: string,
  title: string,
): Promise<"ok" | "conflict"> {
  const res = await kvCasPatch<IgnoredStore>(svc, IGNORED_PRODUCTS_KEY, (cur) => {
    const items = cur?.items ?? [];
    if (items.some((i) => i.id === productId)) return "abort"; // already flagged
    return { items: [...items, { id: productId, title, at: new Date().toISOString() }] };
  });
  return res === "conflict" ? "conflict" : "ok";
}
