import "server-only";

// Next published courses (date + city), formatted for the exam-result email CTA.
import { getDataSource } from "@/lib/data";
import { monthIndexIt } from "@/lib/dashboard";
import { isSandboxCourse } from "@/lib/corsi/sandbox";
import type { UpcomingCourseLine } from "./exam-email";

export async function getUpcomingCourseLines(
  limit = 4,
  /** Pass an already-loaded course list to skip the second heavy read
   *  (courses.list() is the most expensive query in the app). */
  preloaded?: Awaited<ReturnType<Awaited<ReturnType<typeof getDataSource>>["courses"]["list"]>>,
): Promise<UpcomingCourseLine[]> {
  try {
    const courses = preloaded ?? (await (await getDataSource()).courses.list());
    const now = new Date();
    const curKey = now.getFullYear() * 12 + now.getMonth();
    return courses
      .filter((c) => c.lifecycle === "pubblicato" && !c.cancelled && !isSandboxCourse(c))
      .map((c) => ({ c, key: c.year * 12 + monthIndexIt(c.month) }))
      .filter((x) => x.key >= curKey)
      .sort((a, b) => a.key - b.key || (a.c.day || 0) - (b.c.day || 0))
      .slice(0, limit)
      .map(({ c }) => ({ label: `${c.typeLabel} · ${c.city} · ${c.month} ${c.year}` }));
  } catch {
    return [];
  }
}
