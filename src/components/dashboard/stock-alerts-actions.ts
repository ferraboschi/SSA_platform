"use server";

import { getDataSource } from "@/lib/data";
import type { StockAlert } from "@/lib/domain";

/** Replace the full set of low-stock SKU watches (dashboard "Memoria operativa"). */
export async function saveStockAlertsAction(
  alerts: StockAlert[],
): Promise<void> {
  const ds = await getDataSource();
  await ds.settings.setStockAlerts(alerts);
}
