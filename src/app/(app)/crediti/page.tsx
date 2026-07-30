import { getTranslations } from "@/lib/i18n/server";
import { requireNavAccess } from "@/lib/auth/guard";
import { supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import {
  CreditiClient,
  type CreditoView,
  type CourseOption,
} from "@/components/crediti/CreditiClient";

export const dynamic = "force-dynamic";

interface CreditoRow {
  id: number;
  corsista_id: number;
  importo_cents: number;
  corso_origine_id: number | null;
  iscrizione_origine_id: number | null;
  corso_destinazione_id: number | null;
  iscrizione_destinazione_id: number | null;
  stato: string;
  nota: string | null;
  codice?: string | null;
  shopify_discount_id?: string | null;
}

export default async function Page() {
  await requireNavAccess("crediti");
  const { t } = await getTranslations();

  if (!supabaseConfig.isConfigured) {
    return (
      <div className="page">
        <div className="card card-pad">{t.crediti.notConfigured}</div>
      </div>
    );
  }

  const svc = getSupabaseServiceClient();

  // Load the ledger. If the corsi_crediti table is missing (pre-migration), the
  // query errors → render the friendly "migration missing" note (no crash).
  // `codice` and `shopify_discount_id` were each added by a later migration, so
  // degrade the select in steps: try WITH both, then WITH codice only, then the
  // base columns — so a DB at any migration level still renders.
  const BASE_COLS =
    "id,corsista_id,importo_cents,corso_origine_id,iscrizione_origine_id,corso_destinazione_id,iscrizione_destinazione_id,stato,nota";
  const primary = await svc
    .from("corsi_crediti")
    .select(`${BASE_COLS},codice,shopify_discount_id`)
    .order("created_at", { ascending: false });
  let credData = primary.data as CreditoRow[] | null;
  let credErr = primary.error;
  if (credErr) {
    const withCode = await svc
      .from("corsi_crediti")
      .select(`${BASE_COLS},codice`)
      .order("created_at", { ascending: false });
    credData = withCode.data as CreditoRow[] | null;
    credErr = withCode.error;
  }
  if (credErr) {
    const fallback = await svc
      .from("corsi_crediti")
      .select(BASE_COLS)
      .order("created_at", { ascending: false });
    credData = fallback.data as CreditoRow[] | null;
    credErr = fallback.error;
  }

  if (credErr) {
    return (
      <div className="page">
        <div style={{ marginBottom: 6 }}>
          <h1 className="display" style={{ fontSize: 28 }}>
            {t.crediti.title}
          </h1>
        </div>
        <div
          className="card card-pad"
          style={{ textAlign: "center", color: "var(--text-3)" }}
        >
          {t.crediti.migrationMissing}
        </div>
      </div>
    );
  }

  const credits = (credData ?? []) as CreditoRow[];

  // ── Resolve display names for the referenced corsisti + courses. ──
  const corsistaIds = new Set<number>();
  const courseIds = new Set<number>();
  for (const c of credits) {
    corsistaIds.add(c.corsista_id);
    if (c.corso_origine_id != null) courseIds.add(c.corso_origine_id);
    if (c.corso_destinazione_id != null) courseIds.add(c.corso_destinazione_id);
  }

  const corsistaName = new Map<number, string>();
  if (corsistaIds.size > 0) {
    const { data } = await svc
      .from("corsisti")
      .select("id,full_name")
      .in("id", [...corsistaIds]);
    for (const r of (data ?? []) as { id: number; full_name: string | null }[]) {
      corsistaName.set(r.id, r.full_name ?? `#${r.id}`);
    }
  }

  const courseTitle = new Map<number, string>();
  const courseType = new Map<number, string | null>();
  if (courseIds.size > 0) {
    const { data } = await svc
      .from("corsi")
      .select("id,short_title,full_title,type")
      .in("id", [...courseIds]);
    for (const r of (data ?? []) as {
      id: number;
      short_title: string | null;
      full_title: string | null;
      type: string | null;
    }[]) {
      courseTitle.set(r.id, r.short_title || r.full_title || `Corso ${r.id}`);
      courseType.set(r.id, r.type);
    }
  }

  const views: CreditoView[] = credits.map((c) => ({
    id: c.id,
    corsistaId: c.corsista_id,
    corsistaName: corsistaName.get(c.corsista_id) ?? `#${c.corsista_id}`,
    amount: Math.max(c.importo_cents, 0) / 100,
    corsoOrigineId: c.corso_origine_id,
    corsoOrigineTitle:
      c.corso_origine_id != null
        ? courseTitle.get(c.corso_origine_id) ?? `Corso ${c.corso_origine_id}`
        : null,
    // Level of the origin course — the destination picker offers only same-level.
    origineType: c.corso_origine_id != null ? courseType.get(c.corso_origine_id) ?? null : null,
    corsoDestinazioneId: c.corso_destinazione_id,
    corsoDestinazioneTitle:
      c.corso_destinazione_id != null
        ? courseTitle.get(c.corso_destinazione_id) ?? `Corso ${c.corso_destinazione_id}`
        : null,
    stato: (["aperto", "applicato", "rimborsato", "annullato"].includes(c.stato)
      ? c.stato
      : "aperto") as CreditoView["stato"],
    nota: c.nota,
    codice: c.codice ?? null,
    shopifyDiscountId: c.shopify_discount_id ?? null,
  }));

  // ── Destination picker: candidate courses (not cancelled) with their live
  // occupancy (enrolled / capacity) so the credit-spend can show a counter and
  // block when full. Only needed when there is at least one open credit to link.
  let courseOptions: CourseOption[] = [];
  const hasOpen = views.some((v) => v.stato === "aperto");
  if (hasOpen) {
    const { data: corsi } = await svc
      .from("corsi")
      .select("id,short_title,full_title,month,year,lifecycle,type,capacity")
      .neq("lifecycle", "cancelled")
      .order("year", { ascending: false });
    const rows = ((corsi ?? []) as {
      id: number;
      short_title: string | null;
      full_title: string | null;
      month: string | null;
      year: number | null;
      type: string | null;
      capacity: number | null;
    }[]);

    // Active-seat counts per candidate course (removed/annullata excluded).
    const enrolledByCourse = new Map<number, number>();
    const optIds = rows.map((c) => c.id);
    if (optIds.length > 0) {
      const rich = await svc
        .from("corsi_iscrizioni")
        .select("corso_id,annullata_at")
        .in("corso_id", optIds);
      const iscr = rich.error
        ? ((
            await svc.from("corsi_iscrizioni").select("corso_id").in("corso_id", optIds)
          ).data ?? [])
        : (rich.data ?? []).filter((r) => !(r as { annullata_at?: string | null }).annullata_at);
      for (const r of iscr as { corso_id: number }[]) {
        enrolledByCourse.set(r.corso_id, (enrolledByCourse.get(r.corso_id) ?? 0) + 1);
      }
    }

    courseOptions = rows.map((c) => ({
      id: c.id,
      title: c.short_title || c.full_title || `Corso ${c.id}`,
      when: [c.month, c.year].filter(Boolean).join(" "),
      type: c.type,
      enrolled: enrolledByCourse.get(c.id) ?? 0,
      capacity: c.capacity ?? 0,
    }));
  }

  return <CreditiClient credits={views} courseOptions={courseOptions} />;
}
