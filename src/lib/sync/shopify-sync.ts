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
  getProductCustomMetafields,
  type AdminOrder,
  type AdminProduct,
} from "@/lib/integrations/shopify/admin-client";
import { syncEducatorActivation } from "@/lib/educators/sync-active";
import { generateTransferCredits } from "@/lib/crediti/generate";
import { logReconciliation } from "@/lib/anomalie/reconcile";
import { MONTH_TO_NUM, MONTH_NAMES_IT, parseItDate } from "@/lib/dates/italian-months";

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
const TYPE_LABEL: Record<string, string> = {
  certificato: "Sake Sommelier Certificato",
  introduttivo: "Corso Introduttivo al Sake",
  shochu: "Shochu Professional",
  masterclass: "Masterclass",
  mixology: "Mixology",
};

/** Detect a course type from free text (title or the tipologia metafield).
 *  Whitespace/punctuation-insensitive so "Master Class" / "Master-Class" match. */
function detectType(text: string): string | null {
  const t = (text || "").toLowerCase();
  const compact = t.replace(/[^a-z0-9]+/g, "");
  if (t.includes("shochu")) return "shochu";
  if (t.includes("certificat") || t.includes("certified")) return "certificato";
  if (t.includes("introdutt") || t.includes("introduct")) return "introduttivo";
  if (compact.includes("masterclass")) return "masterclass";
  if (t.includes("mixolog")) return "mixology";
  return null;
}

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
  day: number | null;
  type: string;
  delivery: "online" | "in-person";
  city: string;
}
/** Parse a course-ticket title like "Corso ... - Giugno 2026, Vercelli". */
function parseCourseTitle(title: string): ParsedCourse | null {
  const t = title.toLowerCase();
  const month = Object.keys(MONTH_TO_NUM).find((m) => t.includes(m));
  const yearMatch = t.match(/20(2[6-9]|3\d)/);
  const type = detectType(t);
  if (!month || !yearMatch || !type) return null;
  // Masterclasses are always run online; otherwise infer from the title.
  const delivery =
    type === "masterclass" || t.includes("online") ? "online" : "in-person";
  let city = title.includes(",") ? title.split(",").pop()!.trim() : "—";
  if (city.toLowerCase() === "online") city = "Online";
  return { month: MONTH_TO_NUM[month], year: Number(yearMatch[0]), day: null, type, delivery, city };
}

/**
 * Fallback parser for products whose TITLE has no month/year (e.g. masterclasses):
 * derive the course from the `custom.*` metafields — `tipologia_di_corso` (type),
 * `luogo_e_orari` (event day/month), `termine_iscrizioni` (deadline → year),
 * `luogo` (venue / Online). Returns null if no type or no month can be found.
 */
function parseCourseFromMetafields(
  title: string,
  tags: string,
  mf: Record<string, string>,
): ParsedCourse | null {
  const type = detectType(mf.tipologia_di_corso || "") || detectType(title);
  if (!type) return null;

  const event = parseItDate(mf.luogo_e_orari || "");
  const deadline = parseItDate(mf.termine_iscrizioni || "");
  const month = event.month ?? deadline.month;
  if (!month) return null; // can't place on the calendar without a month
  const day = event.day;
  // Year: event date → deadline → infer (this/next year from the month).
  let year = event.year ?? deadline.year;
  if (!year) {
    const now = new Date();
    const cur0 = now.getMonth(); // 0-based
    year = month - 1 >= cur0 ? now.getFullYear() : now.getFullYear() + 1;
  }

  const luogo = (mf.luogo || "").trim();
  const tagsL = (tags || "").toLowerCase();
  const online =
    type === "masterclass" ||
    /online/.test(luogo.toLowerCase()) ||
    /online/.test(tagsL) ||
    /online/.test(title.toLowerCase());
  const city = online ? "Online" : luogo || "—";

  return { month, year, day, type, delivery: online ? "online" : "in-person", city };
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

/** year*12 + month0 from a YYYY-MM-DD start_date (for past/future month comparison). */
function dateMonthKey(startDate: string | null): number | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Upsert course tickets into `corsi`, inheriting lifecycle from Shopify status +
 *  the course date (all statuses, incl. past/draft/archived). Returns product_id → corso. */
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
    .select("external_id, educator_id, lifecycle, start_date")
    .not("external_id", "is", null);
  const known = new Set((existingRows ?? []).map((r) => String(r.external_id)));
  const educatorByExt = new Map(
    (existingRows ?? []).map((r) => [String(r.external_id), r.educator_id as number | null]),
  );
  // Prior lifecycle (for the "annulled stays annulled" stickiness) + a month-key of
  // the course date (for the deletion-reconciliation pass below).
  const lifecycleByExt = new Map(
    (existingRows ?? []).map((r) => [String(r.external_id), (r.lifecycle as string) ?? ""]),
  );
  const monthKeyByExt = new Map(
    (existingRows ?? []).map((r) => [String(r.external_id), dateMonthKey(r.start_date as string | null)]),
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
  function resolveEducatorByName(val: string | null): number | null {
    if (!val) return null;
    // Whole-word match: every token of the educator name must appear as a full
    // word in the metafield value (so "Marco" doesn't match "Gianmarco").
    const tokens = new Set(normName(val).split(" ").filter(Boolean));
    return (
      educators.find((e) => {
        const parts = e.n.split(" ").filter(Boolean);
        return parts.length > 0 && parts.every((t) => tokens.has(t));
      })?.id ?? null
    );
  }

  for (const p of products) {
    if ((p.product_type || "").toLowerCase() !== "ticket") continue;
    // We now ingest EVERY status (active/draft/archived) and inherit lifecycle from
    // Shopify + the course date (computed below), so drafts, past and annulled
    // courses are reflected on the platform instead of silently ignored.

    // Custom metafields are fetched at most once per product, lazily — only when
    // the title can't be parsed (date lives in metafields, e.g. masterclasses)
    // or when we need the educator. Avoids an API call for already-complete rows.
    let mf: Record<string, string> | null = null;
    const getMf = async () => (mf ??= await getProductCustomMetafields(p.id));

    // Title first (fast path); fall back to metafields so EVERY published course
    // — masterclass, mixology, dateless titles — is recovered, not just the ones
    // whose title encodes the month/year.
    let parsed = parseCourseTitle(p.title);
    if (!parsed) parsed = parseCourseFromMetafields(p.title, p.tags || "", await getMf());
    if (!parsed) continue;

    // Titles carry month/year but NOT the day — pull the real START day from the
    // event-date metafield ("🗓️ 12, 13, 14 Giugno 2026" → 12). Without this every
    // title-parsed course defaulted to day 01.
    if (parsed.day == null) {
      const d = parseItDate((await getMf()).luogo_e_orari || "").day;
      if (d != null) parsed = { ...parsed, day: d };
    }

    const key = parsed.year * 12 + (parsed.month - 1);
    const isPast = key < curKey; // course month is before the current month

    // Inherit the lifecycle from Shopify status + the date. Precedence:
    //  • already "cancelled" → stays cancelled (an annulled course never resurrects);
    //  • draft            → bozza (separate Bozze area);
    //  • past (any status)→ passato (it was held);
    //  • archived+future  → cancelled (annulled before its date);
    //  • active+future    → pubblicato (the only live state).
    // (Read-time deriveLifecycle refines the current-month day-level pubblicato→passato
    //  flip between hourly syncs.)
    const prior = lifecycleByExt.get(String(p.id));
    const lifecycle: string =
      prior === "cancelled"
        ? "cancelled"
        : p.status === "draft"
          ? "bozza"
          : isPast
            ? "passato"
            : p.status === "archived"
              ? "cancelled"
              : "pubblicato";
    const variant = p.variants?.[0];
    const price = Math.round(parseFloat(variant?.price || "0") * 100) || 0;
    const mm = String(parsed.month).padStart(2, "0");
    const dd = String(parsed.day ?? 1).padStart(2, "0");

    // Sync-owned columns: refreshed from Shopify on every run.
    const syncOwned = {
      external_id: String(p.id),
      handle: slug(p.title).slice(0, 80),
      // Real Shopify storefront handle (for the public enrol URL). Distinct from
      // `handle` above, which is the app's readable /corsi/<slug> routing key.
      product_handle: p.handle,
      short_title: p.title.slice(0, 80),
      full_title: p.title,
      type: parsed.type,
      type_label: TYPE_LABEL[parsed.type] ?? parsed.type,
      delivery_mode: parsed.delivery,
      city: parsed.city || "—",
      month: MONTH_NAMES_IT[parsed.month - 1],
      year: parsed.year,
      start_date: `${parsed.year}-${mm}-${dd}`,
      price_cents: price,
    };

    if (known.has(String(p.id))) {
      // Existing course: refresh sync-owned fields + the inherited lifecycle
      // (Shopify is now the source of truth for state). capacity / min_students stay
      // staff-managed. A 'cancelled' write fails harmlessly (error, no update) if the
      // CHECK-constraint migration hasn't been applied yet.
      const { error } = await sb
        .from("corsi")
        .update({ ...syncOwned, lifecycle })
        .eq("external_id", String(p.id));
      if (!error) upserted++;
      // Backfill the educator only when it's still missing (never overwrite a
      // manual assignment).
      if (educatorByExt.get(String(p.id)) == null) {
        const eid = resolveEducatorByName((await getMf()).sake_educator || null);
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
      const educatorId = resolveEducatorByName((await getMf()).sake_educator || null);
      const { error } = await sb.from("corsi").insert({
        ...syncOwned,
        lifecycle,
        capacity,
        min_students: 6,
        educator_id: educatorId,
      });
      if (!error) upserted++;
    }
  }
  // ── Deletion reconciliation ────────────────────────────────────────────────
  // A previously-synced course whose Shopify product is no longer returned was
  // DELETED on Shopify → annulled ("cancelled") if still upcoming, else it was held
  // ("passato"). We NEVER hard-delete the row (enrollments + exam history stay).
  // GUARDED: never mass-cancel the catalog on a partial/failed/truncated fetch — only
  // reconcile when the fetch is provably plausible (non-empty, and it still contains
  // most of what we previously synced). First-ever run (nothing synced) is exempt.
  const seenIds = new Set(products.map((p) => String(p.id)));
  const ticketCount = products.filter((p) => (p.product_type || "").toLowerCase() === "ticket").length;
  const priorSynced = known.size;
  const seenKnown = [...known].filter((e) => seenIds.has(e)).length;
  const reconcileSafe =
    priorSynced === 0 ||
    (products.length > 0 && ticketCount >= priorSynced - 5 && seenKnown / priorSynced >= 0.5);
  if (reconcileSafe) {
    for (const ext of known) {
      if (seenIds.has(ext)) continue; // still on Shopify → already handled in the loop
      const prior = lifecycleByExt.get(ext);
      if (prior === "cancelled" || prior === "passato") continue; // already terminal
      const mk = monthKeyByExt.get(ext);
      const gone: string = mk != null && mk < curKey ? "passato" : "cancelled";
      await sb.from("corsi").update({ lifecycle: gone }).eq("external_id", ext);
    }
  } else {
    console.warn(
      `[shopify-sync] deletion reconciliation SKIPPED (partial fetch?): fetched=${products.length} tickets=${ticketCount} priorSynced=${priorSynced} seenKnown=${seenKnown}`,
    );
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
      .select("id, email, merged_into")
      .in("email", batch);
    // Follow a merged duplicate to its survivor, so a returning buyer's new orders
    // and enrollments land on the VISIBLE record — not the hidden merged one (which
    // would make their new purchases/seats silently disappear from every screen).
    for (const c of data ?? [])
      map.set((c.email || "").toLowerCase().trim(), (c.merged_into as number | null) ?? c.id);
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

  // Align educator activation with the public "Chi siamo" page (source of truth).
  // Best-effort: a fetch/parse hiccup must never fail the Shopify sync.
  try {
    await syncEducatorActivation();
  } catch {
    /* non-fatal */
  }

  // Generate transfer credits from newly-cancelled courses' paid seats. Runs on
  // EVERY pull path (cron route + top-bar refresh) so the credit ledger stays
  // current. Idempotent + self-guarding: it never throws and no-ops pre-migration.
  await generateTransferCredits().catch(() => {});

  // Reconciliation counts summary (counts only, no PII). Fully self-guarding:
  // logReconciliation swallows its own errors, and the extra .catch keeps even
  // an unexpected rejection from ever breaking the sync.
  await logReconciliation().catch(() => {});

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
