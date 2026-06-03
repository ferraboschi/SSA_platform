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
import {
  sendInvoiceNoticeEmail,
  sendStockAlertEmail,
  sendCourseReminderEmail,
  sendEducatorMismatchEmail,
  type StockAlertRow,
} from "./emails";
import type { StockAlert } from "@/lib/domain";

interface CourseRow {
  id: number;
  short_title: string | null;
  full_title: string | null;
  city: string | null;
  month: string | null;
  year: number | null;
  type: string | null;
  start_date: string | null;
  end_date: string | null;
  lifecycle: string | null;
  notebook: Record<string, unknown> | null;
}

const DAY_MS = 86_400_000;

// Time-based logistics reminders fired N days before a course starts.
const REMINDER_RULES: { key: string; offsetDays: number; examOnly: boolean }[] = [
  { key: "books", offsetDays: 14, examOnly: false },
  { key: "exam-sakes", offsetDays: 7, examOnly: true },
];

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
  reminderSent: number;
  educatorMismatchSent: number;
}

export async function runAlertChecks(nowMs: number): Promise<AlertCheckResult> {
  const svc = getSupabaseServiceClient();
  const now = new Date(nowMs);
  const out: AlertCheckResult = {
    invoiceSent: 0,
    invoiceSeeded: 0,
    stockSent: 0,
    reminderSent: 0,
    educatorMismatchSent: 0,
  };

  // ── Invoice notices → Luigi ──────────────────────────────────────────────
  try {
    const { data } = await svc
      .from("corsi")
      .select("id, short_title, full_title, city, month, year, type, start_date, end_date, lifecycle, notebook")
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

  // ── Time-based logistics reminders → operations (Camilla) ────────────────
  // Fire once per (course, rule) when the course is within the rule's window
  // before its start (e.g. ship books 14 days out, exam sakes 7 days out).
  try {
    const { data } = await svc
      .from("corsi")
      .select("id, short_title, full_title, city, month, year, type, start_date, lifecycle, notebook")
      .not("start_date", "is", null);
    const courses = (data ?? []) as CourseRow[];
    const sent = (await kvGet<Record<string, string>>(svc, "course_reminders_sent")) ?? {};
    const day = now.toISOString().slice(0, 10);
    for (const c of courses) {
      if (!c.start_date) continue;
      if (c.notebook && (c.notebook as { cancelled?: boolean }).cancelled) continue;
      if (c.lifecycle === "bozza") continue;
      const daysToStart = Math.ceil((new Date(c.start_date).getTime() - now.getTime()) / DAY_MS);
      if (daysToStart < 0) continue; // already started/past
      const isExam = c.type === "certificato" || c.type === "shochu";
      for (const rule of REMINDER_RULES) {
        if (rule.examOnly && !isExam) continue;
        // Due when inside the window [0, offset]; fire once, then dedupe forever.
        if (daysToStart > rule.offsetDays) continue;
        const key = `${c.id}:${rule.key}`;
        if (sent[key]) continue;
        try {
          await sendCourseReminderEmail(rule.key as "books" | "exam-sakes", {
            id: String(c.id),
            title: c.short_title ?? c.full_title ?? `Corso ${c.id}`,
            city: c.city ?? "—",
            month: c.month ?? "",
            year: c.year ?? 0,
            daysToStart,
          });
          sent[key] = day;
          out.reminderSent++;
        } catch {
          /* email failure: retry next tick (key not marked) */
        }
      }
    }
    await kvSet(svc, "course_reminders_sent", sent);
  } catch {
    /* corsi/settings unavailable — skip reminders */
  }

  // ── Educator not qualified for the course type → Camilla ─────────────────
  // First run seeds existing mismatches silently (the bell already shows them);
  // only NEW assignments (e.g. a Shopify change) trigger an email afterwards.
  try {
    const { data: cr } = await svc
      .from("corsi")
      .select("id, short_title, full_title, city, month, year, type, educator_id, lifecycle, notebook")
      .not("educator_id", "is", null)
      .in("lifecycle", ["pubblicato", "bozza"]);
    const courses = (cr ?? []) as Array<CourseRow & { educator_id: number }>;
    const { data: qr } = await svc.from("educator_qualifications").select("educator_id, course_type");
    const quals = new Map<number, Set<string>>();
    for (const q of (qr ?? []) as Array<{ educator_id: number; course_type: string }>) {
      const s = quals.get(q.educator_id) ?? new Set<string>();
      s.add(q.course_type);
      quals.set(q.educator_id, s);
    }
    const { data: er } = await svc.from("educators").select("id, full_name");
    const eduName = new Map<number, string>(
      ((er ?? []) as Array<{ id: number; full_name: string }>).map((e) => [e.id, e.full_name]),
    );
    const notifiedObj = await kvGet<{ ids: number[]; seeded?: boolean }>(svc, "educator_mismatch_notified");
    const notified = new Set(notifiedObj?.ids ?? []);
    const firstRun = !notifiedObj?.seeded;
    for (const c of courses) {
      if (c.notebook && (c.notebook as { cancelled?: boolean }).cancelled) continue;
      if (!c.type || !c.educator_id) continue;
      if (quals.get(c.educator_id)?.has(c.type)) continue; // qualified → fine
      if (notified.has(c.id)) continue;
      if (firstRun) {
        notified.add(c.id); // seed existing mismatch silently
        continue;
      }
      try {
        await sendEducatorMismatchEmail({
          id: String(c.id),
          title: c.short_title ?? c.full_title ?? `Corso ${c.id}`,
          city: c.city ?? "—",
          month: c.month ?? "",
          year: c.year ?? 0,
          educator: eduName.get(c.educator_id) ?? "—",
          typeLabel: c.type,
        });
        out.educatorMismatchSent++;
        notified.add(c.id);
      } catch {
        /* keep going */
      }
    }
    await kvSet(svc, "educator_mismatch_notified", { ids: [...notified], seeded: true });
  } catch {
    /* corsi/educators/settings unavailable — skip */
  }

  return out;
}
