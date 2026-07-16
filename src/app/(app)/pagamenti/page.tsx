import { getTranslations } from "@/lib/i18n/server";
import { requireNavAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { ROLE_VIEWS } from "@/lib/auth/roles";
import { supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { netPaidCents } from "@/lib/economics/revenue";
import { PagamentiClient } from "@/components/pagamenti/PagamentiClient";
import type { PaymentRow } from "@/lib/pagamenti/summary";

export const dynamic = "force-dynamic";

// Raw purchases line as selected below (one row per Shopify order LINE).
interface PurchaseRow {
  corsista_id: number | null;
  external_id: string | null;
  order_name: string | null;
  product_id: number | null;
  product_title: string | null;
  cluster: string | null;
  subtype: string | null;
  quantity: number | null;
  amount_cents: number | null;
  discount_cents: number | null;
  financial_status: string | null;
  buyer_name: string | null;
  ordered_at: string | null;
}

interface CorsistaRow {
  id: number;
  full_name: string | null;
  email: string | null;
}

interface CorsoRow {
  id: number;
  handle: string | null;
  external_id: string | null;
  short_title: string | null;
}

export default async function Page() {
  await requireNavAccess("pagamenti");
  const [{ t }, session] = await Promise.all([getTranslations(), getSession()]);
  // A role with "corsisti" hidden (e.g. accountant) would 404 on the buyer
  // deep-links — render plain names for it instead of links into a wall.
  const canLinkCorsisti = !(
    ROLE_VIEWS[session.user.roleKey]?.hidden ?? []
  ).includes("corsisti");

  if (!supabaseConfig.isConfigured) {
    return (
      <div className="page">
        <div className="card card-pad">{t.pagamenti.notConfigured}</div>
      </div>
    );
  }

  const sb = await getSupabaseServerClient();

  // Every purchase line, newest first. The `id` tiebreaker keeps pagination
  // stable across pages when many lines share the same ordered_at.
  const purchases: PurchaseRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb
      .from("purchases")
      .select(
        "corsista_id,external_id,order_name,product_id,product_title,cluster,subtype,quantity,amount_cents,discount_cents,financial_status,buyer_name,ordered_at",
      )
      .order("ordered_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error || !page) break;
    purchases.push(...(page as PurchaseRow[]));
    if (page.length < 1000) break;
  }

  // Buyer resolution (paginated, same pattern as /anomalie).
  const corsistaById = new Map<number, CorsistaRow>();
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb
      .from("corsisti")
      .select("id,full_name,email")
      .range(from, from + 999);
    if (error || !page) break;
    for (const c of page as CorsistaRow[]) corsistaById.set(c.id, c);
    if (page.length < 1000) break;
  }

  // Course resolution: purchases.product_id → corsi.external_id (Shopify
  // product id as string) → readable /corsi/<handle> link.
  const handleByProduct = new Map<string, string>();
  {
    const { data: corsi } = await sb
      .from("corsi")
      .select("id,handle,external_id,short_title");
    for (const c of (corsi ?? []) as CorsoRow[]) {
      if (c.external_id && c.handle) handleByProduct.set(c.external_id, c.handle);
    }
  }

  const rows: PaymentRow[] = purchases.map((p) => {
    const buyer = p.corsista_id != null ? corsistaById.get(p.corsista_id) : undefined;
    return {
      orderName: p.order_name,
      externalId: p.external_id ?? "",
      orderedAt: p.ordered_at,
      buyerName: buyer?.full_name ?? p.buyer_name ?? null,
      buyerEmail: buyer?.email ?? null,
      corsistaId: p.corsista_id,
      productTitle: p.product_title ?? "",
      cluster: p.cluster ?? "altro",
      subtype: p.subtype,
      quantity: p.quantity ?? 1,
      grossCents: p.amount_cents ?? 0,
      discountCents: p.discount_cents ?? 0,
      // Per-line net assumes discount_cents is PRORATED per line; multi-line
      // orders synced before the proration fix carry the order-level discount
      // duplicated on each line (a full re-sync rewrites them).
      netCents: netPaidCents(p),
      financialStatus: p.financial_status,
      courseHandle:
        p.product_id != null
          ? handleByProduct.get(String(p.product_id)) ?? null
          : null,
    };
  });

  return <PagamentiClient rows={rows} canLinkCorsisti={canLinkCorsisti} />;
}
