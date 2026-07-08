"use server";

import { getSession } from "@/lib/auth/session";
import { getSakeCatalogSafe } from "./catalog";
import type { ScCatalogItem } from "./admin-client";

/** Returns the Sake Company catalog for the product picker (staff-only).
 *  Safe variant: time-boxed with a last-known-good snapshot fallback, so the
 *  picker never hangs minutes on a cold crawl nor comes back empty on a
 *  transient Shopify failure. */
export async function fetchSakeCatalog(): Promise<ScCatalogItem[]> {
  const session = await getSession();
  if (!session?.user) return [];
  return getSakeCatalogSafe();
}
