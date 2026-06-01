import "server-only";

// Cached shell data — the global-search index, sidebar courses and nav counts.
//
// These are shared across all users and change rarely, so we compute them with
// the service-role client (no request cookies → cacheable) and memoize with
// unstable_cache. This removes the heavy per-navigation queries that made the
// app slow (building a search index over thousands of contacts on every load).

import { unstable_cache } from "next/cache";
import { COURSE_TYPE_SHORT_LABEL } from "@/lib/domain";
import type { CourseTypeKey } from "@/lib/domain";
import { isSupabaseConfigured } from "@/lib/integrations/supabase";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { SearchIndex, SidebarCourse } from "@/lib/shell";

export interface ShellData {
  searchIndex: SearchIndex;
  sidebarCourses: SidebarCourse[];
  counts: Record<string, number>;
}

const EMPTY: ShellData = {
  searchIndex: { corsi: [], corsisti: [], educator: [] },
  counts: {},
  sidebarCourses: [],
};

async function fetchShellData(): Promise<ShellData> {
  if (!isSupabaseConfigured()) return EMPTY;
  const svc = getSupabaseServiceClient();

  const [coursesRes, corsistiRes, educatorsRes, countsRes] = await Promise.all([
    svc
      .from("corsi")
      .select("id,short_title,full_title,type,city,month,year,day:start_date,lifecycle,educator_id")
      .limit(2000),
    // Light search rows only (no enrollment join) — fast + smaller payload.
    svc.from("corsisti").select("email,full_name,city").limit(5000),
    svc.from("educators").select("id,external_id,full_name,city,bio").eq("active", true),
    Promise.all([
      svc.from("corsisti").select("*", { count: "exact", head: true }),
      svc.from("educators").select("*", { count: "exact", head: true }).eq("active", true),
      svc.from("material_templates").select("*", { count: "exact", head: true }),
      svc.from("corsi").select("*", { count: "exact", head: true }).eq("lifecycle", "pubblicato"),
    ]),
  ]);

  type CourseRow = {
    id: number;
    short_title: string;
    full_title: string;
    type: CourseTypeKey;
    city: string;
    month: string;
    year: number;
    day: string | null;
    lifecycle: string;
    educator_id: number | null;
  };
  type EduRow = {
    id: number;
    external_id: string | null;
    full_name: string;
    city: string | null;
    bio: string | null;
  };

  const courses = (coursesRes.data ?? []) as CourseRow[];
  const corsisti = (corsistiRes.data ?? []) as {
    email: string;
    full_name: string;
    city: string | null;
  }[];
  const educators = (educatorsRes.data ?? []) as EduRow[];
  const eduName = new Map(educators.map((e) => [e.id, e.full_name]));
  const eduId = (e: EduRow) => e.external_id ?? `db-${e.id}`;

  const searchIndex: SearchIndex = {
    corsi: courses.map((c) => ({
      id: String(c.id),
      title: c.short_title,
      sub: `${c.month} ${c.year} · ${c.city}${c.educator_id ? ` · ${eduName.get(c.educator_id) ?? ""}` : ""}`,
      icon: "book",
      href: `/corsi/${c.id}`,
      badge: COURSE_TYPE_SHORT_LABEL[c.type] ?? "",
      badgeTone: (c.type === "introduttivo" ? "oro" : "azzurro") as "oro" | "azzurro",
      haystack: [c.short_title, c.full_title, c.city, `${c.month} ${c.year}`]
        .join(" ")
        .toLowerCase(),
    })),
    corsisti: corsisti.map((s) => ({
      id: s.email,
      title: s.full_name,
      sub: `${s.email} · ${s.city ?? ""}`,
      icon: "user",
      href: `/corsisti/${encodeURIComponent(s.email)}`,
      haystack: [s.full_name, s.email, s.city ?? ""].join(" ").toLowerCase(),
    })),
    educator: educators.map((e) => ({
      id: eduId(e),
      title: e.full_name,
      sub: `Educator · ${e.city ?? ""}`,
      icon: "graduation",
      href: `/educator/${eduId(e)}`,
      haystack: [e.full_name, e.city ?? "", e.bio ?? ""].join(" ").toLowerCase(),
    })),
  };

  const sidebarCourses: SidebarCourse[] = courses
    .filter((c) => c.lifecycle === "pubblicato")
    .map((c) => ({
      id: String(c.id),
      label: `${COURSE_TYPE_SHORT_LABEL[c.type]} · ${c.city}`,
      href: `/corsi/${c.id}`,
      meta: `${c.month} ${c.year}`,
    }));

  const [cCount, eCount, tCount, pubCount] = countsRes;
  const counts: Record<string, number> = {
    corsi: pubCount.count ?? 0,
    corsisti: cCount.count ?? 0,
    educator: eCount.count ?? 0,
    "template-materiali": tCount.count ?? 0,
  };

  return { searchIndex, sidebarCourses, counts };
}

/** Cache tag — revalidate this to force-refresh shell data (e.g. after a sync). */
export const SHELL_DATA_TAG = "shell-data";

/** Cached for 60s — shared across users; refreshes in the background. */
export const getShellData = unstable_cache(fetchShellData, ["shell-data-v1"], {
  revalidate: 60,
  tags: [SHELL_DATA_TAG],
});
