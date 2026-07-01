import "server-only";

import type { CourseTypeKey, Educator } from "@/lib/domain";
import type { EducatorRepository } from "../repository";
import { educatorRowToDomain } from "./mappers";
import type { EducatorQualRow, EducatorRow } from "./rows";
import type { RepoContext } from "./context";

// Per-request caches. The original factory kept `qualsByEducator` and
// `eduByNumId` as closure state created ONCE per createSupabaseDataSource call
// and shared by every repo that needed them (educators, courses,
// notifications). We preserve that exactly by keying the caches on the `ctx`
// object — there is one `ctx` per createSupabaseDataSource call — so:
//   • loadQuals / loadEducatorsMap memoize per request, and
//   • setQualifications can invalidate the quals cache for the same request.
type EducatorCaches = {
  // Cache quals once per request to avoid N+1 on educator lists.
  qualsByEducator: Map<number, CourseTypeKey[]> | null;
  // Numeric educator id → domain Educator (for joining onto courses).
  eduByNumId: Map<number, Educator> | null;
};

const cachesByCtx = new WeakMap<RepoContext, EducatorCaches>();

function cachesFor(ctx: RepoContext): EducatorCaches {
  let c = cachesByCtx.get(ctx);
  if (!c) {
    c = { qualsByEducator: null, eduByNumId: null };
    cachesByCtx.set(ctx, c);
  }
  return c;
}

export async function loadQuals(
  ctx: RepoContext,
): Promise<Map<number, CourseTypeKey[]>> {
  const { sb } = ctx;
  const caches = cachesFor(ctx);
  if (caches.qualsByEducator) return caches.qualsByEducator;
  const { data, error } = await sb
    .from("educator_qualifications")
    .select("*");
  if (error) throw error;
  const map = new Map<number, CourseTypeKey[]>();
  for (const r of data as EducatorQualRow[]) {
    const list = map.get(r.educator_id) ?? [];
    list.push(r.course_type);
    map.set(r.educator_id, list);
  }
  caches.qualsByEducator = map;
  return map;
}

export async function loadEducatorsMap(
  ctx: RepoContext,
): Promise<Map<number, Educator>> {
  const { sb } = ctx;
  const caches = cachesFor(ctx);
  if (caches.eduByNumId) return caches.eduByNumId;
  const { data } = await sb.from("educators").select("*");
  const map = new Map<number, Educator>();
  for (const e of (data ?? []) as EducatorRow[])
    map.set(e.id, educatorRowToDomain(e));
  caches.eduByNumId = map;
  return map;
}

export function makeEducatorsRepo(ctx: RepoContext): EducatorRepository {
  const { sb, svc } = ctx;
  const caches = cachesFor(ctx);

  async function resolveEducatorRow(externalOrDbId: string) {
    const isDb = externalOrDbId.startsWith("db-");
    const numericId = isDb ? Number(externalOrDbId.slice(3)) : NaN;
    const query = sb.from("educators").select("*");
    const { data, error } = isDb
      ? await query.eq("id", numericId).maybeSingle()
      : await query.eq("external_id", externalOrDbId).maybeSingle();
    if (error) throw error;
    return data as EducatorRow | null;
  }

  const educatorsRepo: EducatorRepository = {
    async list() {
      const { data, error } = await sb
        .from("educators")
        .select("*")
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return (data as EducatorRow[]).map(educatorRowToDomain);
    },

    async getById(id) {
      const row = await resolveEducatorRow(id);
      return row ? educatorRowToDomain(row) : null;
    },

    async getQualifications(id) {
      const row = await resolveEducatorRow(id);
      if (!row) return [];
      const map = await loadQuals(ctx);
      return map.get(row.id) ?? [];
    },

    async setQualifications(id, types) {
      const row = await resolveEducatorRow(id);
      if (!row) throw new Error(`Educator not found: ${id}`);
      await svc
        .from("educator_qualifications")
        .delete()
        .eq("educator_id", row.id);
      if (types.length > 0) {
        const rows = types.map((t) => ({
          educator_id: row.id,
          course_type: t,
        }));
        const { error } = await svc
          .from("educator_qualifications")
          .insert(rows);
        if (error) throw error;
      }
      caches.qualsByEducator = null;
    },

    async qualifiedFor(type) {
      const { data, error } = await sb
        .from("educators")
        .select("*, educator_qualifications!inner(course_type)")
        .eq("active", true)
        .eq("educator_qualifications.course_type", type);
      if (error) throw error;
      return (data as EducatorRow[]).map(educatorRowToDomain);
    },
  };

  return educatorsRepo;
}
