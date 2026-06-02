import { getTranslations } from "@/lib/i18n/server";
import { supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getReviewedEmailClusters } from "@/lib/data/anomalie-actions";
import {
  AnomaliesClient,
  type EmailCluster,
} from "@/components/anomalie/AnomaliesClient";

export const dynamic = "force-dynamic";

interface AnomalyRow {
  id: number;
  email: string;
  full_name: string;
  review_note: string;
}
interface CorsistaLite {
  id: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  merged_into: number | null;
}

/** Normalize a name for grouping (lowercase, strip accents/punctuation). */
function normName(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

  // ── Multi-email clusters: same person registered under several emails. ──
  const all: CorsistaLite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb
      .from("corsisti")
      .select("id,full_name,email,phone,merged_into")
      .range(from, from + 999);
    if (error || !page) break;
    all.push(...(page as CorsistaLite[]));
    if (page.length < 1000) break;
  }

  const byName = new Map<string, CorsistaLite[]>();
  for (const c of all) {
    if (c.merged_into) continue; // already merged → skip
    const n = normName(c.full_name);
    if (!n || n.split(" ").length < 2) continue; // need a full name
    (byName.get(n) ?? byName.set(n, []).get(n)!).push(c);
  }

  const reviewed = new Set(await getReviewedEmailClusters());
  const emailClusters: EmailCluster[] = [];
  for (const [nameKey, members] of byName) {
    if (reviewed.has(nameKey)) continue;
    const emails = new Set(
      members.map((m) => (m.email ?? "").toLowerCase()).filter(Boolean),
    );
    if (emails.size < 2) continue;
    emailClusters.push({
      nameKey,
      name: members.find((m) => m.full_name)?.full_name ?? nameKey,
      members: members
        .map((m) => ({ id: m.id, email: m.email ?? "", phone: m.phone ?? "" }))
        .sort((a, b) => a.email.localeCompare(b.email)),
    });
  }
  emailClusters.sort((a, b) => b.members.length - a.members.length);

  return <AnomaliesClient items={items} emailClusters={emailClusters} />;
}
