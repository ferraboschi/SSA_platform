import { getTranslations } from "@/lib/i18n/server";
import { requireNavAccess } from "@/lib/auth/guard";
import { supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getReviewedEmailClusters } from "@/lib/data/anomalie-actions";
import {
  AnomaliesClient,
  type EmailCluster,
  type RepaidCluster,
  type DupCourseGroup,
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
  await requireNavAccess("anomalie");
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

  // ── Enrollments + courses (for the next two clusters) ──
  const corsistaName = new Map<number, string>(
    all.map((c) => [c.id, c.full_name ?? ""]),
  );
  interface EnrRow {
    corsista_id: number;
    corso_id: number;
    amount_cents: number;
    discount_cents: number | null;
  }
  const enr: EnrRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb
      .from("corsi_iscrizioni")
      .select("corsista_id,corso_id,amount_cents,discount_cents")
      .range(from, from + 999);
    if (error || !page) break;
    enr.push(...(page as EnrRow[]));
    if (page.length < 1000) break;
  }
  const { data: corsiData } = await sb
    .from("corsi")
    .select("id,short_title,type,delivery_mode,month,year,city");
  type CorsoLite = {
    id: number;
    short_title: string | null;
    type: string;
    delivery_mode: string | null;
    month: string | null;
    year: number | null;
    city: string | null;
  };
  const corsoById = new Map<number, CorsoLite>(
    ((corsiData ?? []) as CorsoLite[]).map((c) => [c.id, c]),
  );
  const net = (r: EnrRow) => Math.max((r.amount_cents || 0) - (r.discount_cents || 0), 0);

  // Cluster: re-participation that was PAID (>1 net-paid enrollment of the same
  // course type). Per SSA rules a repeat of a course you already did is free.
  const byPerson = new Map<number, EnrRow[]>();
  for (const e of enr) (byPerson.get(e.corsista_id) ?? byPerson.set(e.corsista_id, []).get(e.corsista_id)!).push(e);
  const repaidClusters: RepaidCluster[] = [];
  for (const [cid, rows] of byPerson) {
    const byType = new Map<string, EnrRow[]>();
    for (const r of rows) {
      const t = corsoById.get(r.corso_id)?.type;
      if (!t) continue;
      (byType.get(t) ?? byType.set(t, []).get(t)!).push(r);
    }
    for (const [type, arr] of byType) {
      const paid = arr.filter((r) => net(r) > 0);
      if (paid.length < 2) continue; // first paid is legit; only extras are errors
      repaidClusters.push({
        corsistaId: cid,
        name: corsistaName.get(cid) || `#${cid}`,
        type,
        courses: paid
          .map((r) => ({
            title: corsoById.get(r.corso_id)?.short_title ?? `Corso ${r.corso_id}`,
            paid: Math.round(net(r) / 100),
          }))
          .sort((a, b) => b.paid - a.paid),
      });
    }
  }
  repaidClusters.sort((a, b) => b.courses.length - a.courses.length);

  // Cluster: duplicate courses — same real course recorded twice. Online courses
  // key on type+month+year (no city); in-person also on city (same month in two
  // cities is legitimate, not a duplicate).
  const dupKey = (c: CorsoLite) =>
    c.delivery_mode === "online"
      ? `${c.type}|online|${c.month}|${c.year}`
      : `${c.type}|${c.city}|${c.month}|${c.year}`;
  const groups = new Map<string, CorsoLite[]>();
  for (const c of corsoById.values()) {
    if (!c.month || !c.year) continue;
    (groups.get(dupKey(c)) ?? groups.set(dupKey(c), []).get(dupKey(c))!).push(c);
  }
  const enrollCount = new Map<number, number>();
  for (const e of enr) enrollCount.set(e.corso_id, (enrollCount.get(e.corso_id) ?? 0) + 1);
  const dupCourses: DupCourseGroup[] = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    dupCourses.push({
      label: `${list[0].type} · ${list[0].delivery_mode === "online" ? "Online" : list[0].city} · ${list[0].month} ${list[0].year}`,
      courses: list.map((c) => ({
        id: String(c.id),
        title: c.short_title ?? `Corso ${c.id}`,
        enrolled: enrollCount.get(c.id) ?? 0,
      })),
    });
  }
  dupCourses.sort((a, b) => b.courses.length - a.courses.length);

  return (
    <AnomaliesClient
      items={items}
      emailClusters={emailClusters}
      repaidClusters={repaidClusters}
      dupCourses={dupCourses}
    />
  );
}
