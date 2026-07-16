"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { assertRole } from "@/lib/auth/guard";
import { paginateAll } from "@/lib/data/supabase/query-helpers";
import { duplicatePeople, type CorsistaLite } from "@/lib/anomalie/rules";

/** Mark an anomaly as reviewed/OK by clearing the corsista's review_note. */
export async function resolveAnomalyAction(corsistaId: number): Promise<void> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const { error } = await svc
    .from("corsisti")
    .update({ review_note: null })
    .eq("id", corsistaId);
  if (error) throw error;
  revalidatePath("/anomalie");
}

const EMAIL_CLUSTER_KEY = "reviewed_email_clusters";

/** Dismiss a multi-email cluster (computed live) so it no longer shows. */
export async function dismissEmailClusterAction(nameKey: string): Promise<void> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", EMAIL_CLUSTER_KEY)
    .maybeSingle();
  const names = new Set(((data?.value as { names?: string[] })?.names) ?? []);
  names.add(nameKey);
  const { error } = await svc
    .from("settings_kv")
    .upsert({ key: EMAIL_CLUSTER_KEY, value: { names: [...names] } }, { onConflict: "key" });
  if (error) throw error;
  revalidatePath("/anomalie");
}

const MERGE_LOG_KEY = "merge_log";
const MERGE_LOG_MAX = 500;

// Every other table holding a corsista_id FK, reassigned to the survivor on
// merge. Tables WITHOUT a unique constraint on corsista_id get a blind UPDATE;
// tables WITH one list the constraint's remaining columns (keyCols) so rows
// whose key the survivor already holds are left in place on the merged record
// (same policy as corsi_iscrizioni). Each table degrades gracefully: a missing
// table/column (pre-migration env) skips silently.
const BLIND_TABLES = ["purchases", "corsi_crediti"] as const;
const KEYED_TABLES: { table: string; keyCols: string[] }[] = [
  { table: "corsi_presenze", keyCols: ["corso_id", "day_no"] }, // unique(corso_id,corsista_id,day_no)
  { table: "exam_student_links", keyCols: ["corso_id", "test_key", "mode"] }, // unique(corso_id,corsista_id,test_key,mode)
  { table: "exam_sessions", keyCols: ["token"] }, // unique(token,corsista_id)
  { table: "exam_progress", keyCols: ["corso_id", "test_key"] }, // partial unique(corso_id,test_key,corsista_id)
];

/**
 * Merge core, shared by the per-cluster and bulk actions. Non-destructive (mai
 * buttare dati): the duplicates KEEP their rows (with their email/phone
 * preserved) but get `merged_into` set so they're hidden from lists; their
 * enrollments and every other corsista_id reference are moved to the survivor
 * (unique-key conflicts are left in place), diploma numbers are unioned, and
 * the survivor's missing phone/city are filled from the duplicates.
 */
async function mergeCorsistiCore(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  survivorId: number,
  duplicateIds: number[],
): Promise<void> {
  const dups = duplicateIds.filter((d) => d !== survivorId);
  if (dups.length === 0) return;

  // Rows actually moved per table — recorded in the merge_log audit entry.
  const moved: Record<string, number> = {};
  const bump = (table: string, n = 1) => {
    if (n > 0) moved[table] = (moved[table] ?? 0) + n;
  };

  // Reassign enrollments to the survivor, skipping courses it's already in.
  const { data: survEnr } = await svc
    .from("corsi_iscrizioni")
    .select("corso_id")
    .eq("corsista_id", survivorId);
  const survCourses = new Set(((survEnr ?? []) as { corso_id: number }[]).map((r) => r.corso_id));
  for (const dupId of dups) {
    const { data: dupEnr } = await svc
      .from("corsi_iscrizioni")
      .select("id,corso_id")
      .eq("corsista_id", dupId);
    for (const e of (dupEnr ?? []) as { id: number; corso_id: number }[]) {
      if (survCourses.has(e.corso_id)) continue; // duplicate enrollment → leave on the merged row
      const { error } = await svc
        .from("corsi_iscrizioni")
        .update({ corsista_id: survivorId })
        .eq("id", e.id);
      if (!error) {
        survCourses.add(e.corso_id);
        bump("corsi_iscrizioni");
      }
    }
  }

  // Blind reassignments — no unique constraint involves corsista_id here.
  for (const table of BLIND_TABLES) {
    try {
      const { data, error } = await svc
        .from(table)
        .update({ corsista_id: survivorId })
        .in("corsista_id", dups)
        .select("id");
      if (!error) bump(table, (data ?? []).length);
    } catch {
      // missing table (pre-migration env) → skip
    }
  }

  // Keyed reassignments — move only rows whose unique key the survivor
  // doesn't already hold (mirrors the corsi_iscrizioni loop above).
  for (const { table, keyCols } of KEYED_TABLES) {
    try {
      const cols = ["id", ...keyCols].join(",");
      const rowKey = (r: Record<string, unknown>) =>
        keyCols.map((c) => String(r[c] ?? "")).join("|");
      const { data: survRows, error: survErr } = await svc
        .from(table)
        .select(cols)
        .eq("corsista_id", survivorId);
      if (survErr) continue; // missing table/column → skip
      // Dynamic select string → supabase-js can't infer the row type; go via unknown.
      const taken = new Set(
        ((survRows ?? []) as unknown as Record<string, unknown>[]).map(rowKey),
      );
      for (const dupId of dups) {
        const { data: dupRows } = await svc
          .from(table)
          .select(cols)
          .eq("corsista_id", dupId);
        for (const r of (dupRows ?? []) as unknown as Record<string, unknown>[]) {
          const k = rowKey(r);
          if (taken.has(k)) continue; // survivor already holds this key → leave on the merged row
          const { error } = await svc
            .from(table)
            .update({ corsista_id: survivorId })
            .eq("id", r.id as number);
          if (!error) {
            taken.add(k);
            bump(table);
          }
        }
      }
    } catch {
      // missing table (pre-migration env) → skip
    }
  }

  // Enrich the survivor NON-destructively: fill a NULL/empty phone/city from
  // the first duplicate that has one — never overwrite a survivor value.
  try {
    const { data: people } = await svc
      .from("corsisti")
      .select("id,phone,city")
      .in("id", [survivorId, ...dups]);
    const rows = (people ?? []) as { id: number; phone: string | null; city: string | null }[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const surv = byId.get(survivorId);
    if (surv) {
      const patch: { phone?: string; city?: string } = {};
      for (const dupId of dups) {
        const d = byId.get(dupId);
        if (!d) continue;
        if (patch.phone === undefined && !surv.phone?.trim() && d.phone?.trim())
          patch.phone = d.phone;
        if (patch.city === undefined && !surv.city?.trim() && d.city?.trim())
          patch.city = d.city;
      }
      if (Object.keys(patch).length > 0) {
        await svc.from("corsisti").update(patch).eq("id", survivorId);
      }
    }
  } catch {
    // enrichment is best-effort
  }

  // Union diploma numbers onto the survivor.
  const { data: dipRows } = await svc
    .from("corsisti")
    .select("id,diploma_numbers")
    .in("id", [survivorId, ...dups]);
  const allDip = new Set<string>();
  for (const r of (dipRows ?? []) as { diploma_numbers: string[] | null }[]) {
    for (const d of r.diploma_numbers ?? []) if (d) allDip.add(d);
  }
  await svc.from("corsisti").update({ diploma_numbers: [...allDip] }).eq("id", survivorId);

  // Fold the duplicates into the survivor (kept, hidden).
  const { error } = await svc
    .from("corsisti")
    .update({ merged_into: survivorId })
    .in("id", dups);
  if (error) throw error;

  // Audit trail — read-modify-write settings_kv "merge_log", capped at the
  // most recent entries. Best-effort: an audit failure must never fail the merge.
  try {
    const { data } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", MERGE_LOG_KEY)
      .maybeSingle();
    const raw = data?.value;
    const log: unknown[] = Array.isArray(raw) ? [...raw] : [];
    log.push({ at: new Date().toISOString(), survivorId, duplicateIds: dups, moved });
    await svc
      .from("settings_kv")
      .upsert({ key: MERGE_LOG_KEY, value: log.slice(-MERGE_LOG_MAX) }, { onConflict: "key" });
  } catch {
    // audit is best-effort
  }
}

/** Merge duplicate corsisti into one primary record (see mergeCorsistiCore). */
export async function mergeCorsistiAction(
  survivorId: number,
  duplicateIds: number[],
): Promise<void> {
  await assertRole(["admin", "manager"]);
  await mergeCorsistiCore(getSupabaseServiceClient(), survivorId, duplicateIds);
  revalidatePath("/anomalie");
  revalidatePath("/corsisti", "layout");
}

/**
 * Merge EVERY high-confidence duplicate cluster (confidence "alta" = shared
 * email/phone — near-certain same person) into its suggested survivor.
 * Name-only ("media") clusters are NEVER touched: homonymy needs a human eye.
 */
export async function mergeAllHighConfidenceAction(): Promise<{
  clusters: number;
  peopleMerged: number;
}> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();

  // Same inputs the anomalie page feeds duplicatePeople(): every corsista
  // (paginated), enrollment counts (survivor choice), dismissed clusters.
  const all = await paginateAll<CorsistaLite>(
    async (from, to) => {
      const { data, error } = await svc
        .from("corsisti")
        .select("id,full_name,email,phone,merged_into")
        .range(from, to);
      return { data: data as CorsistaLite[] | null, error };
    },
    { onError: "break" },
  );
  const enr = await paginateAll<{ corsista_id: number }>(
    async (from, to) => {
      const { data, error } = await svc
        .from("corsi_iscrizioni")
        .select("corsista_id")
        .range(from, to);
      return { data: data as { corsista_id: number }[] | null, error };
    },
    { onError: "break" },
  );
  const enrPerCorsista = new Map<number, number>();
  for (const e of enr) {
    enrPerCorsista.set(e.corsista_id, (enrPerCorsista.get(e.corsista_id) ?? 0) + 1);
  }
  const reviewed = new Set(await getReviewedEmailClusters());

  const alta = duplicatePeople(all, enrPerCorsista, reviewed).filter(
    (c) => c.confidence === "alta",
  );
  let peopleMerged = 0;
  for (const c of alta) {
    const dupIds = c.members.map((m) => m.id).filter((id) => id !== c.survivorId);
    await mergeCorsistiCore(svc, c.survivorId, dupIds);
    peopleMerged += c.members.length;
  }

  revalidatePath("/anomalie");
  revalidatePath("/corsisti", "layout");
  return { clusters: alta.length, peopleMerged };
}

/** Names of email-clusters the operator already reviewed (settings_kv). */
export async function getReviewedEmailClusters(): Promise<string[]> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", EMAIL_CLUSTER_KEY)
    .maybeSingle();
  return ((data?.value as { names?: string[] })?.names) ?? [];
}
