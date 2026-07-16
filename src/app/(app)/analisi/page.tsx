import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { getTranslations } from "@/lib/i18n/server";
import {
  computeAnalisi,
  rankActivities,
  rankCorsisti,
  rankEducators,
  type ActivityStat,
  type PurchaseAggRow,
} from "@/lib/analisi";
import { AnalisiClient } from "@/components/analisi/AnalisiClient";
import { isSandboxCourse } from "@/lib/corsi/sandbox";
import { supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";

export const dynamic = "force-dynamic";

/** Non-course purchases (eventi, libri, merchandise), paginated like
 *  anomalie/page.tsx — purchases is RLS-locked, read via the server client.
 *  Any failure (missing table/column) degrades to an empty ranking. */
async function loadActivities(): Promise<ActivityStat[]> {
  if (!supabaseConfig.isConfigured) return [];
  try {
    const sb = await getSupabaseServerClient();
    const rows: PurchaseAggRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await sb
        .from("purchases")
        .select(
          "cluster,subtype,product_title,amount_cents,discount_cents,financial_status,ordered_at",
        )
        .neq("cluster", "corso")
        .range(from, from + 999);
      if (error) throw error;
      const batch = (page ?? []) as PurchaseAggRow[];
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    return rankActivities(rows);
  } catch {
    return [];
  }
}

export default async function Page() {
  await requireNavAccess("analisi");
  const [ds, { locale }] = await Promise.all([getDataSource(), getTranslations()]);
  const [courses, corsisti, activities] = await Promise.all([
    ds.courses.list(),
    ds.corsisti.list(),
    loadActivities(),
  ]);
  const real = courses.filter((c) => !isSandboxCourse(c));
  const data = computeAnalisi(real, new Date());
  const people = rankCorsisti(corsisti);
  const educators = rankEducators(real);

  return (
    <AnalisiClient
      data={data}
      activities={activities}
      people={people}
      educators={educators}
      locale={locale}
    />
  );
}
