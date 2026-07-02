"use server";

import { getDataSource } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/guard";
import { sendStockAlertEmail } from "@/lib/alerts/emails";
import { alertRecipients } from "@/lib/integrations/config";
import type { StockAlert } from "@/lib/domain";

/** Replace the full set of low-stock SKU watches (dashboard "Memoria operativa"). */
export async function saveStockAlertsAction(
  alerts: StockAlert[],
): Promise<{ ok: boolean; error?: string }> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const ds = await getDataSource();
    await ds.settings.setStockAlerts(alerts);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}

/** Send a sample low-stock alert to Camilla so staff can verify email works. */
export async function sendTestStockAlertAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  const role = session?.user?.roleKey;
  if (role !== "admin" && role !== "manager") {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    // Send the sample alert to the REAL stock-alert recipient (corsi@…) so the
    // test verifies the actual delivery path, not a personal inbox.
    const testTo = alertRecipients.stock;
    const res = await sendStockAlertEmail(
      "Esempio (test)",
      [{ name: "Sake di prova", code: "TEST-SKU", stock: 3, min: 10 }],
      testTo,
    );
    return res.status === "sent"
      ? { ok: true }
      : { ok: false, error: `Email non inviata (Resend non configurato? → ${testTo})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore invio." };
  }
}
