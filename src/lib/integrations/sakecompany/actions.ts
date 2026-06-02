"use server";

import { getSession } from "@/lib/auth/session";
import { getSakeCatalog } from "./catalog";
import type { ScCatalogItem } from "./admin-client";

/** Returns the Sake Company catalog for the product picker (staff-only). */
export async function fetchSakeCatalog(): Promise<ScCatalogItem[]> {
  const session = await getSession();
  if (!session?.user) return [];
  return getSakeCatalog();
}
