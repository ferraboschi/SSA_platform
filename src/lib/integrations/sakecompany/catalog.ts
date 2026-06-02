// Cached Sake Company catalog — the source for the product picker. Server-only.
// The supplier catalog changes slowly, so we cache it; stock numbers refresh on
// the revalidate interval (or when the "sake-catalog" tag is revalidated).
import "server-only";
import { unstable_cache } from "next/cache";
import { sakeCompanyConfig } from "@/lib/integrations/config";
import { listCatalog, type ScCatalogItem } from "./admin-client";

export const SAKE_CATALOG_TAG = "sake-catalog";

export const getSakeCatalog = unstable_cache(
  async (): Promise<ScCatalogItem[]> => {
    if (!sakeCompanyConfig.isConfigured) return [];
    try {
      return await listCatalog();
    } catch {
      return [];
    }
  },
  ["sake-catalog-v1"],
  { revalidate: 600, tags: [SAKE_CATALOG_TAG] },
);
