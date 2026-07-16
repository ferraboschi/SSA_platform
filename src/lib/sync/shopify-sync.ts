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
//
// Completeness invariants (nothing on Shopify may silently miss the platform):
//  • dead orders (cancelled/refunded/voided) PROPAGATE — purchases removed,
//    enrollment rows kept but marked non-paid (order-rules.ts);
//  • order-level discounts are PRORATED across lines (no double-subtraction);
//  • email-less orders (manual/phone/POS) get a deterministic placeholder buyer
//    (order-<id>@ssa.placeholder) instead of being dropped;
//  • contact matching is case-insensitive and follows merge chains to the
//    terminal survivor; missing phone/city are filled non-destructively;
//  • every skipped ticket product is reported in the run summary.
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
import { generateTransferCredits, matchTransferCreditsByCode } from "@/lib/crediti/generate";
import { logReconciliation } from "@/lib/anomalie/reconcile";
import { MONTH_TO_NUM, MONTH_NAMES_IT, parseItDate } from "@/lib/dates/italian-months";
import { planSeats, placeholderEmail, placeholderName, orderPlaceholderEmail } from "./seats";
import { DEAD_FINANCIAL, deadOrderStatus, prorateDiscount } from "./order-rules";
import { isPaidRevenue } from "@/lib/economics/revenue";
import { loadIgnoredProductIds } from "./ignored-products";

type Svc = ReturnType<typeof getSupabaseServiceClient>;

/** Insert a corsista flagged `placeholder: true`, degrading gracefully on a
 *  pre-migration DB: if the column doesn't exist yet the insert errors, so we
 *  retry once without the flag rather than losing the contact. */
async function insertPlaceholderCorsista(
  sb: Svc,
  row: { email: string; full_name: string; phone?: string | null; city?: string | null },
): Promise<number | null> {
  const base = { ...row, historical: false };
  const first = await sb
    .from("corsisti")
    .insert({ ...base, placeholder: true })
    .select("id")
    .single();
  if (!first.error && first.data) return first.data.id as number;
  const retry = await sb.from("corsisti").insert(base).select("id").single();
  return !retry.error && retry.data ? (retry.data.id as number) : null;
}

/** Whether the multi-ticket seats migration has run (seat_index column present).
 *  Until it has, the sync keeps its one-row-per-line behaviour. */
async function probeSeatIndex(sb: Svc): Promise<boolean> {
  const { error } = await sb.from("corsi_iscrizioni").select("seat_index").limit(1);
  return !error;
}

/** Get-or-create a PLACEHOLDER corsista for an unfilled seat, keyed by a
 *  deterministic synthetic email so a re-sync resolves the same one. */
async function ensurePlaceholderCorsista(
  sb: Svc,
  email: string,
  name: string,
  cache: Map<string, number>,
): Promise<number | null> {
  const hit = cache.get(email);
  if (hit) return hit;
  const { data: existing } = await sb.from("corsisti").select("id").eq("email", email).maybeSingle();
  if (existing) {
    cache.set(email, existing.id as number);
    return existing.id as number;
  }
  const id = await insertPlaceholderCorsista(sb, { email, full_name: name });
  if (id == null) return null;
  cache.set(email, id);
  return id;
}

/** Get-or-create the deterministic placeholder BUYER for an email-less order
 *  (manual / phone / POS — Shopify carries no customer email). Without this the
 *  whole order used to be dropped silently: no purchases, no enrollment. */
async function ensureOrderPlaceholderContact(
  sb: Svc,
  o: AdminOrder,
  cache: Map<string, number>,
): Promise<{ id: number; created: boolean } | null> {
  const email = orderPlaceholderEmail(o.id);
  const hit = cache.get(email);
  if (hit) return { id: hit, created: false };
  const { data: existing } = await sb.from("corsisti").select("id").eq("email", email).maybeSingle();
  if (existing) {
    cache.set(email, existing.id as number);
    return { id: existing.id as number, created: false };
  }
  const cust = o.customer;
  const bill = o.billing_address;
  const name =
    `${cust?.first_name || ""} ${cust?.last_name || ""}`.trim() ||
    (bill?.name || "").trim() ||
    `${bill?.first_name || ""} ${bill?.last_name || ""}`.trim() ||
    o.name ||
    email;
  const id = await insertPlaceholderCorsista(sb, {
    email,
    full_name: name,
    phone: cust?.phone || cust?.default_address?.phone || bill?.phone || null,
    city: cust?.default_address?.city || bill?.city || null,
  });
  if (id == null) return null;
  cache.set(email, id);
  return { id, created: true };
}

/** A ticket product the course sync could NOT ingest, with the reason — so a
 *  course silently missing from the platform is visible in the run summary
 *  instead of vanishing without a trace. */
export interface SkippedProduct {
  productId: string;
  title: string;
  reason: string;
}

export interface SyncSummary {
  ranAt: string;
  since: string | null;
  ordersScanned: number;
  coursesUpserted: number;
  enrollmentsUpserted: number;
  /** Enrollments healed by the purchases→iscrizioni reconciliation (orders that
   *  predated their corso row and were skipped by the incremental watermark). */
  enrollmentsBackfilled: number;
  purchasesUpserted: number;
  contactsCreated: number;
  /** Cancelled/refunded/voided orders processed this run: purchases removed,
   *  enrollment rows kept but marked non-paid. */
  deadOrdersProcessed: number;
  /** Contacts auto-created for email-less (manual/phone/POS) orders. */
  placeholderContactsCreated: number;
  /** Ticket products skipped by the course sync, with reasons. */
  skippedProducts: SkippedProduct[];
}

/** Create/refresh the enrollment row(s) for ONE course order line — shared by
 *  the live order loop and the backfill pass so the multi-ticket seat
 *  expansion semantics can never drift apart. Returns rows written. */
async function upsertEnrollmentSeats(
  sb: Svc,
  args: {
    corsoId: number;
    coursePriceCents: number;
    corsistaId: number;
    /** Shopify order id — keys the deterministic placeholder emails. */
    orderId: string | number;
    lineItemId: number | null;
    qty: number;
    amountCents: number;
    orderName: string | null;
    orderDate: string | null;
    discountCode: string | null;
    discountCents: number;
    financialStatus: string | null;
    buyerName: string | null;
  },
  hasSeats: boolean,
  placeholderCache: Map<string, number>,
): Promise<number> {
  let written = 0;
  const baseRow = {
    corso_id: args.corsoId,
    historical: false,
    order_name: args.orderName,
    order_date: args.orderDate,
    discount_code: args.discountCode,
    discount_cents: args.discountCents,
    financial_status: args.financialStatus,
    line_item_id: args.lineItemId,
    buyer_name: args.buyerName,
  };
  // The buyer identity of an order can CHANGE between syncs (an email-less
  // order first enrolls its deterministic placeholder; the owner later attaches
  // the real customer on Shopify and the order re-syncs). The upsert keys on
  // (corso, corsista), so without this cleanup the old identity's row would
  // survive next to the new one — a phantom duplicate seat. Reassign the stale
  // seat-1 row to the new identity (preserves confirm/delivery fields); if the
  // new identity already holds a row in this course, drop the stale one.
  if (args.lineItemId != null) {
    const stale = sb
      .from("corsi_iscrizioni")
      .update({ corsista_id: args.corsistaId })
      .eq("line_item_id", args.lineItemId)
      .or("seat_index.eq.1,seat_index.is.null")
      .neq("corsista_id", args.corsistaId);
    const { error: staleErr } = await stale;
    if (staleErr) {
      await sb
        .from("corsi_iscrizioni")
        .delete()
        .eq("line_item_id", args.lineItemId)
        .or("seat_index.eq.1,seat_index.is.null")
        .neq("corsista_id", args.corsistaId);
    }
  }
  if (hasSeats && args.lineItemId != null) {
    // One FULL enrollment row per ticket: seat 1 = the buyer (whole amount),
    // seats 2..N = a placeholder attendee (€0) to complete later.
    const lineId = args.lineItemId;
    for (const seat of planSeats(args.qty, args.amountCents || args.coursePriceCents)) {
      if (seat.seatIndex === 1) {
        const { error: eErr } = await sb.from("corsi_iscrizioni").upsert(
          { ...baseRow, corsista_id: args.corsistaId, seat_index: 1, amount_cents: seat.amountCents },
          { onConflict: "corso_id,corsista_id" },
        );
        if (!eErr) written++;
        continue;
      }
      // Extra seat: create ONCE and then leave alone, so re-syncing never
      // overwrites a seat the operator has already completed.
      const { data: already } = await sb
        .from("corsi_iscrizioni")
        .select("id")
        .eq("corso_id", args.corsoId)
        .eq("line_item_id", lineId)
        .eq("seat_index", seat.seatIndex)
        .maybeSingle();
      if (already) continue;
      const pid = await ensurePlaceholderCorsista(
        sb,
        placeholderEmail(args.orderId, lineId, seat.seatIndex),
        placeholderName(seat.seatIndex),
        placeholderCache,
      );
      if (!pid) continue;
      const { error: eErr } = await sb
        .from("corsi_iscrizioni")
        .insert({ ...baseRow, corsista_id: pid, seat_index: seat.seatIndex, amount_cents: 0 });
      if (!eErr) written++;
    }
  } else {
    // Pre-migration: one row per line (unchanged behaviour).
    const { error: eErr } = await sb.from("corsi_iscrizioni").upsert(
      { ...baseRow, corsista_id: args.corsistaId, amount_cents: args.amountCents || args.coursePriceCents },
      { onConflict: "corso_id,corsista_id" },
    );
    if (!eErr) written++;
  }
  return written;
}

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
  ignored: Set<string>,
): Promise<{
  map: Map<number, { id: number; price: number }>;
  upserted: number;
  skipped: SkippedProduct[];
}> {
  const sb = getSupabaseServiceClient();
  const now = new Date();
  const curKey = now.getFullYear() * 12 + now.getMonth(); // (year*12 + month0)
  let upserted = 0;
  // Every ticket product we do NOT ingest gets a trace here (run summary):
  // a course missing from the platform must be visible, never silent.
  const skipped: SkippedProduct[] = [];

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
    // Owner-flagged products (bundles/packages, "Ignora prodotto") are sale
    // vehicles, not courses — skip them entirely so no ghost corso is (re)born.
    if (ignored.has(String(p.id))) {
      skipped.push({
        productId: String(p.id),
        title: p.title,
        reason: "ignorato dall'operatore (bundle/pacchetto)",
      });
      continue;
    }
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
    if (!parsed) {
      skipped.push({
        productId: String(p.id),
        title: p.title,
        reason: "titolo e metafield non interpretabili (tipo o mese non trovati)",
      });
      continue;
    }

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
      // New course: seed staff-owned columns once. Shopify's inventory_quantity
      // is only the REMAINING stock — a course created after sales began would
      // be born with a shrunken capacity (Bug 3: "25 posti ne mostra 18"). Seed
      // capacity = remaining + already sold (our purchases ledger, matched by
      // product_id — masterclass lines classify as 'evento', so no cluster
      // filter). Staff-owned after this seed; the sync never touches it again.
      const remaining = Math.max(variant?.inventory_quantity ?? 0, 0);
      let sold = 0;
      {
        const { data: soldRows } = await sb
          .from("purchases")
          .select("quantity")
          .eq("product_id", p.id);
        sold = (soldRows ?? []).reduce((s, r) => {
          const q = Number((r as { quantity?: number | null }).quantity ?? 1);
          return s + (Number.isFinite(q) && q > 0 ? Math.trunc(q) : 1);
        }, 0);
      }
      const capacity = remaining + sold;
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
  return { map, upserted, skipped };
}

/** Chunk size for the chained-ilike existence query (each email becomes one
 *  `.or()` condition; keep the querystring small). */
const ILIKE_CHUNK = 25;
/** Emails containing PostgREST or-syntax delimiters (or quotes/whitespace, which
 *  could break the whole chunk's query) can't ride an .or() filter; they fall
 *  back to exact matching so one odd address never voids 24 others' lookups. */
const orSafe = (e: string) => !/[,()"\s\\]/.test(e);

/** Resolve buyer emails to corsista ids, creating contacts for new buyers.
 *
 *  Matching is CASE-INSENSITIVE: the email column may carry "Mario@X.it" from a
 *  manual/historical insert, and an exact `.in()` on the lowercased incoming
 *  email would miss it and mint a duplicate. Matched contacts also get their
 *  MISSING phone/city filled from the order (never overwriting a value), and a
 *  merged duplicate is followed to its TERMINAL survivor (chains A→B→C land on
 *  C) so new purchases/seats always land on the visible record. */
async function resolveContacts(
  orders: AdminOrder[],
): Promise<{ map: Map<string, number>; created: number }> {
  const sb = getSupabaseServiceClient();
  // Collect the order emails (lowercased) + the freshest identity per email.
  const emails = new Set<string>();
  const infoByEmail = new Map<
    string,
    { name: string | null; phone: string | null; city: string | null }
  >();
  for (const o of orders) {
    const email = (o.email || o.customer?.email || "").toLowerCase().trim();
    if (!email) continue;
    emails.add(email);
    const cust = o.customer;
    const bill = o.billing_address;
    const name =
      `${cust?.first_name || ""} ${cust?.last_name || ""}`.trim() ||
      (bill?.name || "").trim() ||
      null;
    const phone = cust?.phone || cust?.default_address?.phone || bill?.phone || null;
    const city = cust?.default_address?.city || bill?.city || null;
    const prev = infoByEmail.get(email);
    infoByEmail.set(email, {
      name: prev?.name || name,
      phone: prev?.phone || phone,
      city: prev?.city || city,
    });
  }

  type Row = {
    id: number;
    email: string | null;
    merged_into: number | null;
    phone: string | null;
    city: string | null;
  };
  const map = new Map<string, number>();
  const mergedInto = new Map<number, number | null>(); // id → merged_into (chain cache)
  const matched: { key: string; row: Row }[] = [];
  const collect = (rows: Row[] | null) => {
    for (const r of rows ?? []) {
      const key = (r.email || "").toLowerCase().trim();
      // ilike `_`/`%` wildcards can over-match — keep only true case-insensitive
      // equals; first match per email wins.
      if (!emails.has(key) || map.has(key)) continue;
      map.set(key, r.id); // provisional — merge chain resolved below
      mergedInto.set(r.id, r.merged_into);
      matched.push({ key, row: r });
    }
  };
  const list = [...emails];
  const safe = list.filter(orSafe);
  for (let i = 0; i < safe.length; i += ILIKE_CHUNK) {
    const chunk = safe.slice(i, i + ILIKE_CHUNK);
    const { data } = await sb
      .from("corsisti")
      .select("id, email, merged_into, phone, city")
      .or(chunk.map((e) => `email.ilike.${e}`).join(","));
    collect(data as Row[] | null);
  }
  const unsafe = list.filter((e) => !orSafe(e));
  for (let i = 0; i < unsafe.length; i += 100) {
    const { data } = await sb
      .from("corsisti")
      .select("id, email, merged_into, phone, city")
      .in("email", unsafe.slice(i, i + 100));
    collect(data as Row[] | null);
  }

  // Follow merged_into to the TERMINAL survivor, looping through chained merges
  // (A→B→C must land on C) with a visited-set guard against cycles. Hops not in
  // the cache are fetched on demand.
  for (const { key, row } of matched) {
    let cur = row.id;
    const visited = new Set<number>([cur]);
    for (;;) {
      let next = mergedInto.get(cur);
      if (next === undefined) {
        const { data } = await sb
          .from("corsisti")
          .select("merged_into")
          .eq("id", cur)
          .maybeSingle();
        next = (data?.merged_into as number | null) ?? null;
        mergedInto.set(cur, next);
      }
      if (next == null || visited.has(next)) break;
      visited.add(next);
      cur = next;
    }
    map.set(key, cur);
  }

  // Non-destructive refresh: fill a matched contact's MISSING phone/city from
  // the Shopify order. Never overwrites a non-empty value; merged rows are
  // skipped (their survivor's current fields aren't loaded here).
  for (const { key, row } of matched) {
    if (map.get(key) !== row.id) continue;
    const info = infoByEmail.get(key);
    if (!info) continue;
    const patch: { phone?: string; city?: string } = {};
    if (!(row.phone || "").trim() && info.phone) patch.phone = info.phone;
    if (!(row.city || "").trim() && info.city) patch.city = info.city;
    if (Object.keys(patch).length > 0) {
      await sb.from("corsisti").update(patch).eq("id", row.id);
    }
  }

  let created = 0;
  for (const email of list) {
    if (map.has(email)) continue;
    const info = infoByEmail.get(email);
    const { data, error } = await sb
      .from("corsisti")
      .insert({
        email,
        full_name: info?.name || email,
        phone: info?.phone ?? null,
        city: info?.city ?? null,
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

/** Purchases→iscrizioni reconciliation (Bug 3): orders processed BEFORE a corso
 *  row existed never got their enrollments — the incremental watermark doesn't
 *  revisit old orders, so a course published after its sales started stays
 *  undercounted forever ("10 iscritti ne mostra 7"). Heal from our own
 *  purchases ledger, matched by product_id ONLY (masterclass lines classify as
 *  cluster 'evento', so a cluster filter would go blind).
 *
 *  SCOPE: lifecycle 'pubblicato' always; ONLY on a FULL run also
 *  'passato'/'bozza' courses whose start_date is already past — a course that
 *  just ended (or a draft that was actually held) must not keep a short
 *  roster forever. The widened scope is gated on `healEnded` (= fullBackfill)
 *  because only the full run has ALREADY swept dead orders out of the
 *  purchases ledger this same run: an incremental run would happily
 *  materialize a stale 'paid' purchase of an order refunded under the old
 *  sync (its updated_at bump is behind the watermark, unreachable forever)
 *  as fresh paid revenue on a held course. STRICTLY ADD-ONLY:
 *  only buyers with NO enrollment row are inserted (existing rows and their
 *  amounts are never rewritten), and never for owner-ignored products.
 *  Idempotent via the same seat-expansion helper as the live order loop. */
async function backfillMissedEnrollments(
  sb: Svc,
  ignored: Set<string>,
  hasSeats: boolean,
  placeholderCache: Map<string, number>,
  healEnded: boolean,
): Promise<number> {
  let written = 0;
  const { data: corsi, error } = await sb
    .from("corsi")
    .select("id, external_id, price_cents, lifecycle, start_date")
    .in("lifecycle", healEnded ? ["pubblicato", "passato", "bozza"] : ["pubblicato"])
    .not("external_id", "is", null);
  if (error) return 0;
  type PurRow = {
    corsista_id: number | null;
    external_id: string | null;
    line_item_id: number | null;
    quantity: number | null;
    amount_cents: number | null;
    order_name: string | null;
    ordered_at: string | null;
    discount_code: string | null;
    discount_cents: number | null;
    financial_status: string | null;
    buyer_name: string | null;
  };
  const today = new Date().toISOString().slice(0, 10);
  for (const c of (corsi ?? []) as {
    id: number;
    external_id: string;
    price_cents: number | null;
    lifecycle: string | null;
    start_date: string | null;
  }[]) {
    if (ignored.has(String(c.external_id))) continue;
    // passato/bozza heal only once the course date is past (a future draft is
    // not a held course; published courses heal regardless).
    if (c.lifecycle !== "pubblicato" && (!c.start_date || c.start_date >= today)) continue;
    const productId = Number(c.external_id);
    if (!Number.isFinite(productId)) continue;
    const { data: pur, error: pErr } = await sb
      .from("purchases")
      .select(
        "corsista_id, external_id, line_item_id, quantity, amount_cents, order_name, ordered_at, discount_code, discount_cents, financial_status, buyer_name",
      )
      .eq("product_id", productId);
    if (pErr || !pur || pur.length === 0) continue;
    const { data: iscr } = await sb
      .from("corsi_iscrizioni")
      .select("corsista_id")
      .eq("corso_id", c.id);
    const have = new Set((iscr ?? []).map((i) => i.corsista_id as number));
    for (const p of pur as PurRow[]) {
      if (p.corsista_id == null || have.has(p.corsista_id)) continue;
      if (DEAD_FINANCIAL.has(p.financial_status || "")) continue;
      written += await upsertEnrollmentSeats(
        sb,
        {
          corsoId: c.id,
          coursePriceCents: c.price_cents ?? 0,
          corsistaId: p.corsista_id,
          orderId: p.external_id ?? "backfill",
          lineItemId: p.line_item_id,
          qty: p.quantity ?? 1,
          amountCents: p.amount_cents ?? 0,
          orderName: p.order_name,
          orderDate: p.ordered_at,
          discountCode: p.discount_code,
          discountCents: p.discount_cents ?? 0,
          financialStatus: p.financial_status,
          buyerName: p.buyer_name,
        },
        hasSeats,
        placeholderCache,
      );
      have.add(p.corsista_id);
    }
  }
  return written;
}

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
  const ignored = await loadIgnoredProductIds(sb);
  const {
    map: corsoByProduct,
    upserted: coursesUpserted,
    skipped: skippedProducts,
  } = await syncCourses(products, ignored);
  const productType = new Map<number, string | null>();
  for (const p of products) productType.set(p.id, p.product_type);

  const orders = await listOrdersUpdatedSince(since ?? undefined);
  const { map: contactByEmail, created: contactsCreated } =
    await resolveContacts(orders);

  let purchasesUpserted = 0;
  let enrollmentsUpserted = 0;
  let deadOrdersProcessed = 0;
  let placeholderContactsCreated = 0;
  // Multi-ticket seats: only expand into per-seat rows once the migration ran.
  const hasSeats = await probeSeatIndex(sb);
  const placeholderCache = new Map<string, number>();
  const orderContactCache = new Map<string, number>();
  for (const o of orders) {
    // Dead order (cancelled / refunded / voided) — it may have synced as PAID on
    // a previous run, so it must PROPAGATE, not be skipped: drop its purchase
    // rows and mark its enrollment rows non-paid (rows are KEPT — roster
    // history, mai buttare dati). Nothing new is ever inserted for a dead order.
    const dead = deadOrderStatus(o);
    if (dead) {
      await sb
        .from("purchases")
        .delete()
        .eq("source", "shopify")
        .eq("external_id", String(o.id));
      const lineIds = o.line_items
        .map((li) => li.id)
        .filter((x): x is number => x != null);
      if (lineIds.length > 0) {
        // The enrollment row is unique per (corso, corsista): if the buyer holds
        // ANOTHER alive paid order for the same product (double-purchase, one
        // refunded — the standard remediation), the row currently carries THIS
        // order's line_item_id but the seat is still paid for. Stamping it dead
        // would erase a genuinely-paid seat, so such rows are skipped. This
        // order's own purchases are already deleted above, so any surviving
        // ledger row is by definition another order.
        const { data: hitRows } = await sb
          .from("corsi_iscrizioni")
          .select("id, corsista_id, line_item_id")
          .in("line_item_id", lineIds);
        const hits = (hitRows ?? []) as { id: number; corsista_id: number; line_item_id: number }[];
        if (hits.length > 0) {
          const productByLine = new Map(
            o.line_items.filter((li) => li.id != null).map((li) => [li.id as number, li.product_id]),
          );
          const stillPaid = new Set<number>();
          for (const h of hits) {
            const productId = productByLine.get(h.line_item_id);
            if (productId == null) continue;
            const { data: alive } = await sb
              .from("purchases")
              .select("financial_status")
              .eq("corsista_id", h.corsista_id)
              .eq("product_id", productId)
              .limit(10);
            if ((alive ?? []).some((p) => isPaidRevenue((p as { financial_status: string | null }).financial_status))) {
              stillPaid.add(h.id);
            }
          }
          const toStamp = hits.filter((h) => !stillPaid.has(h.id)).map((h) => h.id);
          if (toStamp.length > 0) {
            await sb
              .from("corsi_iscrizioni")
              .update({ financial_status: dead })
              .in("id", toStamp);
          }
        }
      }
      // Legacy rows synced before line_item_id existed: match by order name.
      if (o.name) {
        await sb
          .from("corsi_iscrizioni")
          .update({ financial_status: dead })
          .is("line_item_id", null)
          .eq("order_name", o.name);
      }
      deadOrdersProcessed++;
      continue;
    }

    const email = (o.email || o.customer?.email || "").toLowerCase().trim();
    let corsistaId = email ? contactByEmail.get(email) : undefined;
    if (!email) {
      // Email-less order (manual / phone / POS): resolve a deterministic
      // placeholder buyer instead of dropping the whole order silently.
      const ph = await ensureOrderPlaceholderContact(sb, o, orderContactCache);
      if (ph) {
        corsistaId = ph.id;
        if (ph.created) placeholderContactsCreated++;
      }
    }
    if (!corsistaId) continue;
    const cust = o.customer;
    const buyerName =
      `${cust?.first_name || ""} ${cust?.last_name || ""}`.trim() ||
      (o.billing_address?.name || "").trim() ||
      null;
    // Order-level discount (first code), PRORATED across the lines by gross
    // value so multi-line orders don't double-subtract it (the total of the
    // per-line shares equals the order discount exactly).
    const disc = o.discount_codes?.[0];
    const discountCode = disc?.code ?? null;
    const discountCents = disc ? Math.round(parseFloat(disc.amount || "0") * 100) : 0;
    const lineGross = o.line_items.map(
      (li) => Math.round(parseFloat(li.price || "0") * (li.quantity ?? 1) * 100) || 0,
    );
    const lineDiscounts = prorateDiscount(lineGross, discountCents);

    // Per-order idempotency: clear this order's prior purchase rows, re-insert.
    await sb
      .from("purchases")
      .delete()
      .eq("source", "shopify")
      .eq("external_id", String(o.id));

    for (let idx = 0; idx < o.line_items.length; idx++) {
      const li = o.line_items[idx];
      const qty = li.quantity ?? 1;
      const amount = lineGross[idx];
      const lineDiscountCents = lineDiscounts[idx] ?? 0;
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
        discount_cents: lineDiscountCents,
        financial_status: o.financial_status,
        buyer_name: buyerName,
        ordered_at: o.created_at,
      });
      if (!pErr) purchasesUpserted++;

      // Course ticket → enrollment (mirror order/discount/payment fields).
      // Owner-ignored products never enroll (bundle sale vehicles, Bug 3).
      const corso =
        li.product_id && !ignored.has(String(li.product_id))
          ? corsoByProduct.get(li.product_id)
          : undefined;
      if (corso) {
        enrollmentsUpserted += await upsertEnrollmentSeats(
          sb,
          {
            corsoId: corso.id,
            coursePriceCents: corso.price,
            corsistaId,
            orderId: o.id,
            lineItemId: li.id,
            qty,
            amountCents: amount,
            orderName: o.name,
            orderDate: o.created_at,
            discountCode,
            discountCents: lineDiscountCents,
            financialStatus: o.financial_status,
            buyerName,
          },
          hasSeats,
          placeholderCache,
        );
      }
    }
  }

  // Heal enrollments missed because their order predated the corso row (the
  // incremental watermark never revisits old orders). Published courses always;
  // ended (passato/bozza-past) courses ONLY on a full run, after this same
  // run's dead-order sweep has cleaned the purchases ledger — add-only,
  // amounts never rewritten.
  const enrollmentsBackfilled = await backfillMissedEnrollments(
    sb,
    ignored,
    hasSeats,
    placeholderCache,
    Boolean(opts?.fullBackfill),
  ).catch(() => 0);

  // One-line visibility for what did NOT flow (counts only, no PII/secrets):
  // skipped ticket products, dead orders processed, placeholder buyers created.
  if (skippedProducts.length > 0 || deadOrdersProcessed > 0 || placeholderContactsCreated > 0) {
    console.log(
      `[shopify-sync] skippedProducts=${skippedProducts.length} deadOrders=${deadOrdersProcessed} placeholderContacts=${placeholderContactsCreated}`,
    );
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
          enrollmentsBackfilled,
          purchasesUpserted,
          contactsCreated,
          deadOrdersProcessed,
          placeholderContactsCreated,
          skippedProducts,
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

  // Then auto-close any credit whose one-time redemption code was used as the
  // Shopify discount on a new purchase (→ moved to "Utilizzati"). Self-guarding.
  await matchTransferCreditsByCode().catch(() => {});

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
    enrollmentsBackfilled,
    purchasesUpserted,
    contactsCreated,
    deadOrdersProcessed,
    placeholderContactsCreated,
    skippedProducts,
  };
}
