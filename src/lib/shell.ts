// Server-safe builders that turn domain data into the compact, serializable
// shapes the (client) shell needs: the sidebar course sub-menu and the global
// search index. Pure functions — safe to call from the server layout.

import type { BadgeTone } from "@/components/ui/Badge";
import { COURSE_TYPE_SHORT_LABEL } from "@/lib/domain";
import type { Corsista, Course, Educator } from "@/lib/domain";
import { monthIndexIt } from "@/lib/dates/italian-months";

// The mock dataset is anchored to this instant (see the seed's NOW_MS); the
// sidebar "days to start" is measured from here so the numbers stay coherent
// with the seeded courses regardless of the wall clock.
export const MOCK_NOW_MS = Date.parse("2026-05-30T00:00:00Z");

const DAY_MS = 86_400_000;

const courseStart = (c: Course) =>
  new Date(c.year, Math.max(0, monthIndexIt(c.month)), c.day || 1).getTime();

export interface SidebarCourse {
  id: string;
  label: string;
  href: string;
  meta: string;
  /** Sake program/template assigned to the course (green vs grey dot). */
  hasProgram: boolean;
  /** Missing essentials → red status dot (tooltip lists what's missing). */
  missEducator: boolean;
  missLocation: boolean;
  missDate: boolean;
}

export function buildSidebarCourses(
  courses: Course[],
  now = MOCK_NOW_MS,
  hasProgram: (id: string) => boolean = () => false,
): SidebarCourse[] {
  return courses
    .filter((c) => c.lifecycle === "pubblicato")
    .map((c) => ({ c, start: courseStart(c) }))
    .sort((a, b) => a.start - b.start)
    .map(({ c, start }) => {
      const days = Math.max(0, Math.round((start - now) / DAY_MS));
      return {
        id: c.id,
        label: `${COURSE_TYPE_SHORT_LABEL[c.type]} · ${c.city}`,
        href: `/corsi/${c.id}`,
        meta: `i:${String(c.enrolled).padStart(2, "0")} / d:${String(days).padStart(2, "0")}`,
        hasProgram: hasProgram(c.id),
        missEducator: !c.educator?.id || !c.educator.name.trim(),
        missLocation: !c.city.trim(),
        missDate: !c.year || !c.month.trim() || !c.day,
      };
    });
}

export interface SearchEntry {
  id: string;
  title: string;
  sub: string;
  icon: string;
  href: string;
  badge?: string;
  badgeTone?: BadgeTone;
  haystack: string;
}

export interface SearchIndex {
  corsi: SearchEntry[];
  corsisti: SearchEntry[];
  educator: SearchEntry[];
}

export function buildSearchIndex(
  courses: Course[],
  corsisti: Corsista[],
  educators: Educator[],
): SearchIndex {
  return {
    corsi: courses.map((c) => ({
      id: c.id,
      title: c.shortTitle,
      sub: `${c.day} ${c.month} ${c.year} · ${c.city} · ${c.educator.name}`,
      icon: "book",
      href: `/corsi/${c.id}`,
      badge: c.typeShort,
      badgeTone: c.typeColor === "oro" ? "oro" : "azzurro",
      haystack: [c.shortTitle, c.title, c.city, c.educator.name, c.id, `${c.month} ${c.year}`]
        .join(" ")
        .toLowerCase(),
    })),
    corsisti: corsisti.map((s) => ({
      id: s.email,
      title: s.name,
      sub: `${s.email} · ${s.city}`,
      icon: "user",
      href: `/corsisti/${encodeURIComponent(s.email)}`,
      haystack: [s.name, s.email, s.city].join(" ").toLowerCase(),
    })),
    educator: educators.map((e) => ({
      id: e.id,
      title: e.name,
      sub: `${e.role} · ${e.city}`,
      icon: "graduation",
      href: `/educator/${e.id}`,
      haystack: [e.name, e.role, e.city, e.bio].join(" ").toLowerCase(),
    })),
  };
}
