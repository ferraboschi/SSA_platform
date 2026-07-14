import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import {
  buildWindow,
  keyOf,
  monthIdx,
  normalizeReal,
  type PlannerEducator,
  type PlannerItem,
} from "@/lib/pianificatore";
import { isActiveCourse } from "@/lib/corsi";
import type { CourseTypeKey } from "@/lib/domain";
import { loadPlannerState } from "@/lib/pianificatore-server";
import { Pianificatore } from "@/components/pianificatore/Pianificatore";
import { isSandboxCourse } from "@/lib/corsi/sandbox";

export interface PrevYearItem {
  type: CourseTypeKey;
  year: number;
  mIdx: number;
}

export default async function Page() {
  await requireNavAccess("pianificatore");
  const ds = await getDataSource();
  const [courses, educators, corsisti, users, session, plannerSaved] = await Promise.all([
    ds.courses.list(),
    ds.educators.list(),
    ds.corsisti.list(),
    ds.users.list(),
    getSession(),
    loadPlannerState(),
  ]);

  const win = buildWindow();
  const winKeys = new Set(win.map((w) => w.key));

  // Only CONFIRMED courses appear as "real": those published on Shopify
  // (lifecycle "pubblicato" = a Shopify ACTIVE product). Drafts ("bozza" =
  // Shopify draft), archived and past are NOT confirmed and must not show — the
  // only confirmation comes from Shopify. Manual planner "ipotesi" are layered on
  // top separately and are dropped once Shopify confirms the same course.
  const realItems: PlannerItem[] = courses
    .filter((c) => !isSandboxCourse(c))
    .filter((c) => winKeys.has(keyOf(c.year, monthIdx(c.month))))
    .filter((c) => isActiveCourse(c.lifecycle))
    .map((c) =>
      normalizeReal({
        id: c.id,
        type: c.type,
        typeLabel: c.typeLabel,
        typeShort: c.typeShort,
        city: c.city,
        mode: c.mode,
        month: c.month,
        year: c.year,
        day: c.day,
        days: c.days,
        enrolled: c.enrolled,
        capacity: c.capacity,
        status: c.status,
        lifecycle: c.lifecycle,
        shortTitle: c.shortTitle,
        educator: {
          id: c.educator.id,
          name: c.educator.name,
          initials: c.educator.initials,
        },
      }),
    );

  // Year-over-year baseline: the same rolling window shifted back one year.
  const prevKeys = new Set(win.map((w) => keyOf(w.year - 1, w.mIdx)));
  const prevYearItems: PrevYearItem[] = courses
    .filter((c) => !isSandboxCourse(c) && prevKeys.has(keyOf(c.year, monthIdx(c.month))))
    .map((c) => ({ type: c.type, year: c.year, mIdx: monthIdx(c.month) }));

  const quals = await Promise.all(
    educators.map((e) => ds.educators.getQualifications(e.id)),
  );
  const plannerEducators: PlannerEducator[] = educators.map((e, i) => ({
    id: e.id,
    name: e.name,
    initials: e.initials,
    role: e.role,
    city: e.city,
    qualifications: quals[i],
  }));

  // Exam pass rate over all confirmed results — course.examResults is the live
  // per-course aggregate the Supabase adapter fills from graded enrollments
  // (fallback to a reasonable default until any course has results).
  let passed = 0;
  let total = 0;
  for (const c of courses) {
    const r = c.examResults;
    if (!r) continue;
    passed += r.passed;
    total += r.passed + r.retrial + r.failed;
  }
  const examPassRate = total ? passed / total : 0.78;

  const me = session.user;
  const adminName = users.find((u) => u.roleKey === "admin")?.name ?? null;

  return (
    <Pianificatore
      realItems={realItems}
      prevYearItems={prevYearItems}
      educators={plannerEducators}
      examPassRate={examPassRate}
      studentsTotal={corsisti.length}
      returningCount={corsisti.filter((s) => s.isReturning).length}
      me={{
        first: me.first,
        name: me.name,
        initials: me.initials,
        tone: me.tone,
        roleKey: me.roleKey,
      }}
      adminName={adminName}
      initialSaved={plannerSaved}
    />
  );
}
