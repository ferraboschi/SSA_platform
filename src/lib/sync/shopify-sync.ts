// Shopify → Supabase sync. Server-only.
//
// Keeps the platform current with sales on sakesommelierassociation.it:
//  • new/updated course tickets → corsi (future-dated, pubblicato/bozza)
//  • orders → purchases + enrollments (+ creates the buyer as a contact)
//
// Incremental by design: it pulls only orders updated since the last run
// (sync_state.last_synced_at), so the refresh button and the cron job both stay
// fast. Idempotent: re-syncing an order replaces that order's purchase rows and
// upserts its enrollment, so nothing is duplicated. Never deletes people.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import {
  listAllProducts,
  listOrdersUpdatedSince,
  getProductEducatorMetafield,
  type AdminOrder,
  type AdminProduct,
} from "@/lib/integrations/shopify/admin-client";

export interface SyncSummary {
  ranAt: string;
  since: string | null;
  ordersScanned: number;
  coursesUpserted: number;
  enrollmentsUpserted: number;
  purchasesUpserted: number;
  contactsCreated: number;
}

const DEAD_FINANCIAL = new Set(["refunded", "voided"]);
const MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};
const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const TYPE_LABEL: Record<string, string> = {
  certificato: "Sake Sommelier Certificato",
  introduttivo: "Corso Introduttivo al Sake",
  shochu: "Shochu Professional",
  masterclass: "Masterclass",
};

function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ParsedCourse {
  month: number;
  year: number;
  type: string;
  delivery: "online" | "in-person";
  city: string;
}
/** Parse a course-ticket title like "Corso ... - Giugno 2026, Vercelli". */
function parseCourseTitle(title: string): ParsedCourse | null {
  const t = title.toLowerCase();
  const month = Object.keys(MONTHS).find((m) => t.includes(m));
  const yearMatch = t.match(/20(2[6-9]|3\d)/);
  let type: string | null = null;
  if (t.includes("shochu")) type = "shochu";
  else if (t.includes("certificat")) type = "certificato";
  else if (t.includes("introdutt")) type = "introduttivo";
  else if (t.includes("masterclass")) type = "masterclass";
  if (!month || !yearMatch || !type) return null;
  const delivery = t.includes("online") ? "online" : "in-person";
  let city = title.includes(",") ? title.split(",").pop()!.trim() : "—";
  if (city.toLowerCase() === "online") city = "Online";
  return { month: MONTHS[month], year: Number(yearMatch[0]), type, delivery, city };
}

interface Classification {
  cluster: string;
  subtype: string | null;
  delivery: string | null;
}
/** Mirror of the historical import's classify(): cluster a line item. */
function classifyLine(title: string, productType: string | null): Classification {
  const t = (title || "").toLowerCase();
  const pt = (productType || "").toLowerCase();
  if (pt === "libro" || t.includes("guida al sake")) return { cluster: "libro", subtype: null, delivery: null };
  if (pt && pt !== "ticket") return { cluster: "merchandise", subtype: null, delivery: null };
  const delivery = t.includes("online") ? "online" : "presenza";
  if (t.includes("corso") && (t.includes("certificat") || t.includes("certified")))
    return { cluster: "corso", subtype: "certificato", delivery };
  if (t.includes("corso") && (t.includes("introdu") || t.includes("introductory")))
    return { cluster: "corso", subtype: "introduttivo", delivery };
  if (t.includes("shochu") && (t.includes("corso") || t.includes("professional")))
    return { cluster: "corso", subtype: "shochu", delivery };
  if (t.includes("corso")) return { cluster: "corso", subtype: "altro", delivery };
  return { cluster: "evento", subtype: null, delivery };
}

/** Upsert future-dated course tickets into `corsi`. Returns product_id → corso. */
async function syncCourses(
  products: AdminProduct[],
): Promise<{ map: Map<number, { id: number; price: number }>; upserted: number }> {
  const sb = getSupabaseServiceClient();
  const now = new Date();
  const curKey = now.getFullYear() * 12 + now.getMonth(); // (year*12 + month0)
  let upserted = 0;

  // Which course external_ids already exist — so we never UPDATE staff-owned
  // columns (lifecycle / capacity / min_students) back to Shopify-derived values.
  // Also track who already has an educator, so we only resolve it when missing
  // (never overwrite a staff/manual assignment).
  const { data: existingRows } = await sb
    .from("corsi")
    .select("external_id, educator_id")
    .not("external_id", "is", null);
  const known = new Set((existingRows ?? []).map((r) => String(r.external_id)));
  const educatorByExt = new Map(
    (existingRows ?? []).map((r) => [String(r.external_id), r.educator_id as number | null]),
  );

  // Educator resolver: the Shopify `custom.sake_educator` metafield holds the
  // educator name (+ optional bio); match it to an educators row by name.
  const normName = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const { data: eduRows } = await sb.from("educators").select("id, full_name");
  const educators = (eduRows ?? [])
    .map((e) => ({ id: e.id as number, n: normName(e.full_name as string) }))
    .sort((a, b) => b.n.length - a.n.length); // longest name first
  async function resolveEducatorId(productId: number | string): Promise<number | null> {
    const val = await getProductEducatorMetafield(productId);
    if (!val) return null;
    const v = normName(val);
    return educators.find((e) => e.n && v.includes(e.n))?.id ?? null;
  }

  for (const p of products) {
    if ((p.product_type || "").toLowerCase() !== "ticket") continue;
    // Only PUBLISHED (active) products become courses. Draft/archived Shopify
    // products are not on the public site, so they must not appear as courses
    // here (they'd be phantom "bozza" courses with no real presence).
    if (p.status !== "active") continue;
    const parsed = parseCourseTitle(p.title);
    if (!parsed) continue;
    const key = parsed.year * 12 + (parsed.month - 1);
    if (key < curKey) continue; // only future / current-month courses
    const variant = p.variants?.[0];
    const price = Math.round(parseFloat(variant?.price || "0") * 100) || 0;

    // Sync-owned columns: refreshed from Shopify on every run.
    const syncOwned = {
      external_id: String(p.id),
      handle: slug(p.title).slice(0, 80),
      short_title: p.title.slice(0, 80),
      full_title: p.title,
      type: parsed.type,
      type_label: TYPE_LABEL[parsed.type] ?? parsed.type,
      delivery_mode: parsed.delivery,
      city: parsed.city || "—",
      month: MONTHS_IT[parsed.month - 1],
      year: parsed.year,
      start_date: `${parsed.year}-${String(parsed.month).padStart(2, "0")}-01`,
      price_cents: price,
    };

    if (known.has(String(p.id))) {
      // Existing course: update sync-owned fields only — DO NOT touch
      // lifecycle / capacity / min_students (staff-managed).
      const { error } = await sb
        .from("corsi")
        .update(syncOwned)
        .eq("external_id", String(p.id));
      if (!error) upserted++;
      // Backfill the educator only when it's still missing (never overwrite a
      // manual assignment).
      if (educatorByExt.get(String(p.id)) == null) {
        const eid = await resolveEducatorId(p.id);
        if (eid != null) {
          await sb
            .from("corsi")
            .update({ educator_id: eid })
            .eq("external_id", String(p.id))
            .is("educator_id", null);
        }
      }
    } else {
      // New course: seed staff-owned columns once. inventory_quantity is the
      // REMAINING stock, used only as an initial capacity hint.
      const capacity = Math.max(variant?.inventory_quantity ?? 0, 0);
      const educatorId = await resolveEducatorId(p.id);
      const { error } = await sb.from("corsi").insert({
        ...syncOwned,
        lifecycle: "pubblicato",
        capacity,
        min_students: 6,
        educator_id: educatorId,
      });
      if (!error) upserted++;
    }
  }
  // Reload the product_id → corso map (covers both new and pre-existing courses).
  const { data } = await sb
    .from("corsi")
    .select("id, external_id, price_cents")
    .not("external_id", "is", null);
  const map = new Map<number, { id: number; price: number }>();
  for (const c of data ?? []) {
    const pid = Number(c.external_id);
    if (!Number.isNaN(pid)) map.set(pid, { id: c.id, price: c.price_cents });
  }
  return { map, upserted };
}

/** Resolve buyer emails to corsista ids, creating contacts for new buyers. */
async function resolveContacts(
  orders: AdminOrder[],
): Promise<{ map: Map<string, number>; created: number }> {
  const sb = getSupabaseServiceClient();
  const emails = new Set<string>();
  for (const o of orders) {
    const email = (o.email || o.customer?.email || "").toLowerCase().trim();
    if (email) emails.add(email);
  }
  const map = new Map<string, number>();
  const list = [...emails];
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100);
    const { data } = await sb
      .from("corsisti")
      .select("id, email")
      .in("email", batch);
    for (const c of data ?? []) map.set((c.email || "").toLowerCase().trim(), c.id);
  }
  let created = 0;
  for (const o of orders) {
    const email = (o.email || o.customer?.email || "").toLowerCase().trim();
    if (!email || map.has(email)) continue;
    const cust = o.customer;
    const name =
      `${cust?.first_name || ""} ${cust?.last_name || ""}`.trim() || email;
    const { data, error } = await sb
      .from("corsisti")
      .insert({
        email,
        full_name: name,
        phone: cust?.phone || cust?.default_address?.phone || null,
        city: cust?.default_address?.city || null,
        historical: false,
      })
      .select("id")
      .single();
    if (!error && data) {
      map.set(email, data.id);
      created++;
    }
  }
  return { map, created };
}

const SINCE_FALLBACK_DAYS = 30;

/** Run a full incremental Shopify → Supabase sync. */
export async function runShopifySync(opts?: {
  fullBackfill?: boolean;
}): Promise<SyncSummary> {
  const sb = getSupabaseServiceClient();
  const ranAt = new Date().toISOString();

  // Determine the incremental window. Resilient to a missing sync_state table
  // (pre-migration): falls back to a bounded backfill window.
  let since: string | null = null;
  if (!opts?.fullBackfill) {
    let watermark: string | null = null;
    try {
      const { data } = await sb
        .from("sync_state")
        .select("last_synced_at")
        .eq("source", "shopify")
        .maybeSingle();
      watermark = data?.last_synced_at ?? null;
    } catch {
      watermark = null;
    }
    since =
      watermark ??
      new Date(Date.now() - SINCE_FALLBACK_DAYS * 86400_000).toISOString();
  }

  const products = await listAllProducts();
  const { map: corsoByProduct, upserted: coursesUpserted } =
    await syncCourses(products);
  const productType = new Map<number, string | null>();
  for (const p of products) productType.set(p.id, p.product_type);

  const orders = await listOrdersUpdatedSince(since ?? undefined);
  const { map: contactByEmail, created: contactsCreated } =
    await resolveContacts(orders);

  let purchasesUpserted = 0;
  let enrollmentsUpserted = 0;
  for (const o of orders) {
    if (o.cancelled_at) continue;
    if (DEAD_FINANCIAL.has(o.financial_status || "")) continue;
    const email = (o.email || o.customer?.email || "").toLowerCase().trim();
    const corsistaId = email ? contactByEmail.get(email) : undefined;
    if (!corsistaId) continue;
    const cust = o.customer;
    const buyerName =
      `${cust?.first_name || ""} ${cust?.last_name || ""}`.trim() || null;
    // Order-level discount (first code). For multi-line orders the value is
    // attributed to the order; good enough for display.
    const disc = o.discount_codes?.[0];
    const discountCode = disc?.code ?? null;
    const discountCents = disc ? Math.round(parseFloat(disc.amount || "0") * 100) : 0;

    // Per-order idempotency: clear this order's prior purchase rows, re-insert.
    await sb
      .from("purchases")
      .delete()
      .eq("source", "shopify")
      .eq("external_id", String(o.id));

    for (const li of o.line_items) {
      const qty = li.quantity ?? 1;
      const amount = Math.round(parseFloat(li.price || "0") * qty * 100) || 0;
      const cls = classifyLine(
        li.title,
        li.product_id ? productType.get(li.product_id) ?? null : null,
      );
      const { error: pErr } = await sb.from("purchases").insert({
        corsista_id: corsistaId,
        source: "shopify",
        external_id: String(o.id),
        order_name: o.name,
        product_id: li.product_id,
        line_item_id: li.id,
        product_title: li.title,
        cluster: cls.cluster,
        subtype: cls.subtype,
        delivery: cls.delivery,
        quantity: qty,
        amount_cents: amount,
        discount_code: discountCode,
        discount_cents: discountCents,
        financial_status: o.financial_status,
        buyer_name: buyerName,
        ordered_at: o.created_at,
      });
      if (!pErr) purchasesUpserted++;

      // Course ticket → enrollment (mirror order/discount/payment fields).
      const corso = li.product_id ? corsoByProduct.get(li.product_id) : undefined;
      if (corso) {
        const { error: eErr } = await sb.from("corsi_iscrizioni").upsert(
          {
            corso_id: corso.id,
            corsista_id: corsistaId,
            amount_cents: amount || corso.price,
            historical: false,
            order_name: o.name,
            order_date: o.created_at,
            discount_code: discountCode,
            discount_cents: discountCents,
            financial_status: o.financial_status,
            line_item_id: li.id,
            buyer_name: buyerName,
          },
          { onConflict: "corso_id,corsista_id" },
        );
        if (!eErr) enrollmentsUpserted++;
      }
    }
  }

  // Advance the watermark to when this run started (captures concurrent writes
  // on the next run rather than skipping them). Best-effort: if the table is not
  // there yet, the sync still works on a rolling backfill window.
  try {
    await sb.from("sync_state").upsert(
      {
        source: "shopify",
        last_synced_at: ranAt,
        last_summary: {
          ordersScanned: orders.length,
          coursesUpserted,
          enrollmentsUpserted,
          purchasesUpserted,
          contactsCreated,
        },
      },
      { onConflict: "source" },
    );
  } catch {
    /* sync_state migration not applied yet — non-fatal */
  }

  return {
    ranAt,
    since,
    ordersScanned: orders.length,
    coursesUpserted,
    enrollmentsUpserted,
    purchasesUpserted,
    contactsCreated,
  };
}
