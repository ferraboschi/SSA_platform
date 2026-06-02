// Server-side alert checks, run on every sync tick (cron + manual refresh).
//
//  • Invoice notices → Luigi: one email the first time a course is found ended.
//    On the very first run we SEED all already-ended courses as notified (no
//    blast of historical mail); only courses that end afterwards trigger.
//  • Stock alerts → Camilla: when a watched SKU is below its threshold, email
//    once per day (deduped) so it doesn't repeat every 10 minutes.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { getSakeCatalog } from "@/lib/integrations/sakecompany/catalog";
import { sendInvoiceNoticeEmail, sendStockAlertEmail, type StockAlertRow } from "./emails";
import type { StockAlert } from "@/lib/domain";

interface CourseRow {
  id: number;
  short_title: string | null;
  full_title: string | null;
  city: string | null;
  month: string | null;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  lifecycle: string | null;
  notebook: Record<string, unknown> | null;
}

async function kvGet<T>(svc: ReturnType<typeof getSupabaseServiceClient>, key: string): Promise<T | null> {
  const { data } = await svc.from("settings_kv").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}
async function kvSet(svc: ReturnType<typeof getSupabaseServiceClient>, key: string, value: unknown) {
  await svc.from("settings_kv").upsert({ key, value }, { onConflict: "key" });
}

export interface AlertCheckResult {
  invoiceSent: number;
  invoiceSeeded: number;
  stockSent: number;
}

export async function runAlertChecks(nowMs: number): Promise<AlertCheckResult> {
  const svc = getSupabaseServiceClient();
  const now = new Date(nowMs);
  const out: AlertCheckResult = { invoiceSent: 0, invoiceSeeded: 0, stockSent: 0 };

  // ── Invoice notices → Luigi ──────────────────────────────────────────────
  try {
    const { data } = await svc
      .from("corsi")
      .select("id, short_title, full_title, city, month, year, start_date, end_date, lifecycle, notebook")
      .not("start_date", "is", null);
    const courses = (data ?? []) as CourseRow[];
    const ended = courses.filter((c) => {
      if (c.notebook && (c.notebook as { cancelled?: boolean }).cancelled) return false;
      if (c.lifecycle === "bozza") return false;
      const endIso = c.end_date ?? c.start_date;
      return endIso ? new Date(endIso).getTime() < now.getTime() : false;
    });

    const notifiedObj = await kvGet<{ ids: number[]; seeded?: boolean }>(svc, "invoice_notified");
    const notified = new Set(notifiedObj?.ids ?? []);
    // "First run" = the marker was never written (distinct from "ran but found
    // zero ended courses"), so a first run with no ended courses still seeds.
    const firstRun = !notifiedObj?.seeded;

    for (const c of ended) {
      if (notified.has(c.id)) continue;
      if (firstRun) {
        notified.add(c.id); // seed historical silently
        out.invoiceSeeded++;
        continue;
      }
      // enrolled + revenue for the email body
      const { data: iscr } = await svc
        .from("corsi_iscrizioni")
        .select("amount_cents, discount_cents")
        .eq("corso_id", c.id);
      const enrolled = (iscr ?? []).length;
      const revenue = Math.round(
        (iscr ?? []).reduce(
          (s, r) => s + Math.max(((r.amount_cents as number) || 0) - ((r.discount_cents as number) || 0), 0),
          0,
        ) / 100,
      );
      try {
        await sendInvoiceNoticeEmail({
          id: String(c.id),
          title: c.short_title ?? c.full_title ?? `Corso ${c.id}`,
          city: c.city ?? "—",
          month: c.month ?? "",
          year: c.year ?? 0,
          enrolled,
          revenue,
        });
        out.invoiceSent++;
      } catch {
        /* email failure shouldn't abort the sync; retry next tick */
      }
      notified.add(c.id);
    }
    await kvSet(svc, "invoice_notified", { ids: [...notified], seeded: true });
  } catch {
    /* corsi/settings unavailable — skip invoice checks */
  }

  // ── Stock alerts → Camilla ───────────────────────────────────────────────
  try {
    const alertsObj = await kvGet<{ alerts: StockAlert[] }>(svc, "stock_alerts");
    const alerts = alertsObj?.alerts ?? [];
    if (alerts.length > 0) {
      const catalog = await getSakeCatalog();
      const stockBySku = new Map(catalog.filter((c) => c.sku).map((c) => [c.sku as string, c]));
      const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
      const sentObj = (await kvGet<Record<string, string>>(svc, "stock_alert_notified")) ?? {};
      for (const a of alerts) {
        const low: StockAlertRow[] = a.skus
          .map((sku) => ({ sku, it: stockBySku.get(sku) }))
          .filter((x) => x.it && x.it.stock != null && (x.it.stock as number) < a.min)
          .map((x) => ({ name: x.it!.name, code: x.sku, stock: x.it!.stock ?? null, min: a.min }));
        if (low.length === 0) continue;
        if (sentObj[a.id] === day) continue; // already emailed today
        try {
          await sendStockAlertEmail(a.label, low);
          sentObj[a.id] = day;
          out.stockSent++;
        } catch {
          /* keep going */
        }
      }
      await kvSet(svc, "stock_alert_notified", sentObj);
    }
  } catch {
    /* catalog/settings unavailable — skip stock checks */
  }

  return out;
}
