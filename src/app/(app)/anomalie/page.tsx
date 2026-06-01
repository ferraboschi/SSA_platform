import { getTranslations } from "@/lib/i18n/server";
import { supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { AnomaliesClient } from "@/components/anomalie/AnomaliesClient";

export const dynamic = "force-dynamic";

interface AnomalyRow {
  id: number;
  email: string;
  full_name: string;
  review_note: string;
}

export default async function Page() {
  const { t } = await getTranslations();

  if (!supabaseConfig.isConfigured) {
    return (
      <div className="page">
        <div className="card card-pad">{t.anomalie.notConfigured}</div>
      </div>
    );
  }

  const sb = await getSupabaseServerClient();
  const { data } = await sb
    .from("corsisti")
    .select("id,email,full_name,review_note")
    .not("review_note", "is", null)
    .order("full_name");

  const items = ((data ?? []) as AnomalyRow[]).map((c) => ({
    id: c.id,
    email: c.email,
    name: c.full_name,
    note: c.review_note,
  }));

  return <AnomaliesClient items={items} />;
}
