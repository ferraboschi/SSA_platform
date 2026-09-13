import "server-only";

// Cached shell data — the global-search index, sidebar courses and nav counts.
//
// These are shared across all users and change rarely, so we compute them with
// the service-role client (no request cookies → cacheable) and memoize with
// unstable_cache. This removes the heavy per-navigation queries that made the
// app slow (building a search index over thousands of contacts on every load).

import { unstable_cache } from "next/cache";
import { COURSE_TYPE_SHORT_LABEL, expectedDays } from "@/lib/domain";
import type { CourseLifecycle, CourseTypeKey } from "@/lib/domain";
import { isSupabaseConfigured } from "@/lib/integrations/supabase";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { deriveLifecycle } from "@/lib/data/supabase/mappers";
import { paginateAll } from "@/lib/data/supabase/query-helpers";
import { loadCourseProgram } from "@/lib/corsi/program-load";
import { MONTH_TO_NUM } from "@/lib/dates/italian-months";
import { ANOMALIE_COUNTS_KEY } from "@/lib/anomalie/reconcile";
import { foldFields } from "@/lib/search/fold";
import type { SearchIndex, SidebarCourse } from "@/lib/shell";
import { isSandboxCourse, SANDBOX_COURSE_HANDLES } from "@/lib/corsi/sandbox";

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

type CorsistaSearchRow = {
  email: string;
  full_name: string;
  city: string | null;
  merged_into: number | null;
  placeholder: boolean | null;
};

// Alphabetical people order for the search index (accent/case-insensitive).
const byName = new Intl.Collator("it", { sensitivity: "base" });

async function fetchShellData(): Promise<ShellData> {
  if (!isSupabaseConfigured()) return EMPTY;
  const svc = getSupabaseServiceClient();

  // Today's ISO date — a course only counts as genuinely upcoming when its
  // start_date is today or later. This guards against stale past rows still
  // flagged "pubblicato" that the read-time date flip would otherwise miss.
  const today = new Date().toISOString().slice(0, 10);

  const [coursesRes, corsisti, educatorsRes, iscrizioniRes, countsRes, anomalieRes, programMap] =
    await Promise.all([
      svc
        .from("corsi")
        .select(
          "id,handle,short_title,full_title,type,city,month,year,day:start_date,lifecycle,educator_id,delivery_mode",
        )
        .order("start_date", { ascending: true, nullsFirst: false })
        .limit(2000),
      // EVERY corsista, paged: PostgREST caps a request at 1000 rows, so a flat
      // .limit(5000) on a 6700-row table silently dropped ~1600 people — the
      // newest, the ones staff look up most. Light rows only (no enrollment
      // join). A failed page logs and stops rather than failing every render.
      paginateAll<CorsistaSearchRow>(
        async (from, to) => {
          const { data, error } = await svc
            .from("corsisti")
            .select("email,full_name,city,merged_into,placeholder")
            .order("id")
            .range(from, to);
          if (error) console.warn(`[shell-data] corsisti page ${from}-${to} failed: ${error.message}`);
          return { data: (data ?? []) as CorsistaSearchRow[], error };
        },
        { pageSize: 1000, onError: "break" },
      ),
      svc.from("educators").select("id,external_id,full_name,city,bio").eq("active", true),
      // Enrollment counts per course (light: just the FK column) — active seats
      // only, so the sidebar count matches the course-detail roster.
      svc.from("corsi_iscrizioni").select("corso_id").is("annullata_at", null).limit(20000),
      Promise.all([
        svc.from("corsisti").select("*", { count: "exact", head: true }),
        svc.from("educators").select("*", { count: "exact", head: true }).eq("active", true),
        svc.from("material_templates").select("*", { count: "exact", head: true }),
        svc
          .from("corsi")
          .select("*", { count: "exact", head: true })
          .eq("lifecycle", "pubblicato")
          .not("handle", "in", `(${[...SANDBOX_COURSE_HANDLES].join(",")})`)
          .gte("start_date", today),
      ]),
      // Last computed anomaly counts (written by the post-sync reconciliation
      // pass) — a single cheap row powering the /anomalie nav badge.
      svc.from("settings_kv").select("value").eq("key", ANOMALIE_COUNTS_KEY).maybeSingle(),
      // Per-course sake-program overlays → the green "programma assegnato" dot.
      loadCourseProgram(),
    ]);
  const hasSakeProgram = (id: string): boolean =>
    !!programMap.get(id)?.days?.some((d) => (d.sakes?.length ?? 0) > 0);

  type CourseRow = {
    id: number;
    handle: string;
    short_title: string;
    full_title: string;
    type: CourseTypeKey;
    city: string;
    month: string;
    year: number;
    day: string | null;
    lifecycle: CourseLifecycle;
    educator_id: number | null;
    delivery_mode: string | null;
  };

  // corso_id → enrolled count
  const enrolledByCourse = new Map<number, number>();
  for (const r of (iscrizioniRes.data ?? []) as { corso_id: number }[]) {
    enrolledByCourse.set(r.corso_id, (enrolledByCourse.get(r.corso_id) ?? 0) + 1);
  }
  type EduRow = {
    id: number;
    external_id: string | null;
    full_name: string;
    city: string | null;
    bio: string | null;
  };

  // The "Test esame" sandbox stays out of search, sidebar and counts.
  const courses = ((coursesRes.data ?? []) as CourseRow[]).filter((c) => !isSandboxCourse(c));
  const educators = (educatorsRes.data ?? []) as EduRow[];
  const eduName = new Map(educators.map((e) => [e.id, e.full_name]));
  const eduId = (e: EduRow) => e.external_id ?? `db-${e.id}`;

  // Search rank for courses: the ones still live/upcoming first — by the same
  // date-derived lifecycle every course reader uses, so a stale "pubblicato"
  // past its last day ranks as held — then most recent start first, undated
  // last. GlobalSearch keeps index order when it slices the first matches, so
  // this order IS the ranking (no extra field in the serialized payload).
  const courseDays = (c: CourseRow) =>
    programMap.get(String(c.id))?.days?.length ||
    expectedDays(c.type, c.delivery_mode === "online" ? "online" : "presenza");
  const liveCourses = new Set(
    courses
      .filter(
        (c) =>
          deriveLifecycle(c.lifecycle, c.day, courseDays(c), enrolledByCourse.get(c.id) ?? 0) ===
          "pubblicato",
      )
      .map((c) => c.id),
  );
  const rankedCourses = [...courses].sort((a, b) => {
    const live = Number(liveCourses.has(b.id)) - Number(liveCourses.has(a.id));
    if (live) return live;
    if (a.day && b.day) return a.day < b.day ? 1 : a.day > b.day ? -1 : 0;
    return Number(!a.day) - Number(!b.day);
  });

  // Synthetic rows never belong in search: the placeholder buyer of an
  // email-less Shopify order (@ssa.placeholder), an unfilled multi-ticket seat
  // (placeholder flag, @placeholder.ssa) and a duplicate folded into a survivor
  // (merged_into — its data lives on the survivor's profile).
  const isSearchablePerson = (s: CorsistaSearchRow) =>
    !s.placeholder &&
    !s.email.endsWith("@ssa.placeholder") &&
    !s.email.endsWith("@placeholder.ssa") &&
    s.merged_into == null;

  // Haystacks are accent-folded (see search/fold) — the query side folds too.
  const searchIndex: SearchIndex = {
    corsi: rankedCourses.map((c) => ({
      id: String(c.id),
      title: c.short_title,
      sub: `${c.month} ${c.year} · ${c.city}${c.educator_id ? ` · ${eduName.get(c.educator_id) ?? ""}` : ""}`,
      icon: "book",
      href: `/corsi/${c.handle}`,
      badge: COURSE_TYPE_SHORT_LABEL[c.type] ?? "",
      badgeTone: (c.type === "introduttivo" ? "oro" : "azzurro") as "oro" | "azzurro",
      haystack: foldFields([c.short_title, c.full_title, c.city, `${c.month} ${c.year}`]),
    })),
    corsisti: corsisti
      .filter(isSearchablePerson)
      .map((s) => ({
        id: s.email,
        title: s.full_name,
        sub: `${s.email} · ${s.city ?? ""}`,
        icon: "user",
        href: `/corsisti/${encodeURIComponent(s.email)}`,
        haystack: foldFields([s.full_name, s.email, s.city]),
      }))
      .sort((a, b) => byName.compare(a.title, b.title)),
    educator: educators.map((e) => ({
      id: eduId(e),
      title: e.full_name,
      sub: `Educator · ${e.city ?? ""}`,
      icon: "graduation",
      href: `/educator/${eduId(e)}`,
      haystack: foldFields([e.full_name, e.city, e.bio]),
    })),
  };

  // Italian month → number for chronological sorting (unknown months sort last).
  const monthNum = (m: string) => MONTH_TO_NUM[m.toLowerCase()] ?? 99;

  const sidebarCourses: SidebarCourse[] = courses
    // Only genuinely upcoming courses: published AND starting today or later
    // (c.day is the aliased start_date). Excludes stale past rows still marked
    // "pubblicato" that the read-time date flip hasn't caught.
    .filter((c) => c.lifecycle === "pubblicato" && !!c.day && c.day >= today)
    .sort((a, b) => {
      // Primary: by start_date (already sorted by Supabase, but ensures
      // correct order even when the DB result is unsorted or cached stale).
      if (a.day && b.day) return a.day < b.day ? -1 : a.day > b.day ? 1 : 0;
      if (a.day && !b.day) return -1;
      if (!a.day && b.day) return 1;
      // Fallback: year then month name
      if (a.year !== b.year) return a.year - b.year;
      return monthNum(a.month) - monthNum(b.month);
    })
    .map((c) => {
      const n = enrolledByCourse.get(c.id) ?? 0;
      return {
        id: String(c.id),
        label: `${COURSE_TYPE_SHORT_LABEL[c.type]} · ${c.city} (${n})`,
        href: `/corsi/${c.handle}`,
        meta: `${c.month} ${c.year}`,
        hasProgram: hasSakeProgram(String(c.id)),
        missEducator: !c.educator_id,
        missLocation: !c.city || !c.city.trim(),
        missDate: !c.year || !c.month || !c.month.trim() || !c.day,
        // Only certificato/shochu bear an exam; sidebar courses are already
        // filtered to `pubblicato`, so no extra lifecycle guard is needed here.
        examFamily:
          c.type === "certificato"
            ? "nihonshu"
            : c.type === "shochu"
              ? "shochu"
              : null,
      };
    });

  const [cCount, eCount, tCount, pubCount] = countsRes;
  const counts: Record<string, number> = {
    corsi: pubCount.count ?? 0,
    corsisti: cCount.count ?? 0,
    educator: eCount.count ?? 0,
    "template-materiali": tCount.count ?? 0,
  };
  // 0 / missing / unsynced env → no badge (the sidebar only renders set keys).
  const anomalieTotal =
    ((anomalieRes.data?.value as { total?: number } | null | undefined)?.total) ?? 0;
  if (anomalieTotal > 0) counts["anomalie"] = anomalieTotal;

  return { searchIndex, sidebarCourses, counts };
}

/** Cache tag — revalidate this to force-refresh shell data (e.g. after a sync). */
export const SHELL_DATA_TAG = "shell-data";

/** Cached for 60s — shared across users; refreshes in the background.
 *  Key bumped whenever the cached shape changes (v2: sidebar program/status-dot
 *  fields; v3: full paged corsisti index, folded haystacks, ranked order), so
 *  the new shape is recomputed instead of serving the stale cached objects. */
export const getShellData = unstable_cache(fetchShellData, ["shell-data-v3"], {
  revalidate: 60,
  tags: [SHELL_DATA_TAG],
});
