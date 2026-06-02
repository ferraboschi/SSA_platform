import { getDataSource } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import {
  buildWindow,
  keyOf,
  monthIdx,
  normalizeReal,
  type PlannerEducator,
  type PlannerItem,
} from "@/lib/pianificatore";
import type { CourseTypeKey } from "@/lib/domain";
import { Pianificatore } from "@/components/pianificatore/Pianificatore";

export interface PrevYearItem {
  type: CourseTypeKey;
  year: number;
  mIdx: number;
}

export default async function Page() {
  const ds = await getDataSource();
  const [courses, educators, corsisti, users, session] = await Promise.all([
    ds.courses.list(),
    ds.educators.list(),
    ds.corsisti.list(),
    ds.users.list(),
    getSession(),
  ]);

  const win = buildWindow();
  const winKeys = new Set(win.map((w) => w.key));

  const realItems: PlannerItem[] = courses
    .filter((c) => winKeys.has(keyOf(c.year, monthIdx(c.month))))
    .filter((c) => !c.cancelled) // cancelled / phantom-draft courses don't plan
    .filter((c) => c.lifecycle === "pubblicato" || c.lifecycle === "bozza")
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
    .filter((c) => prevKeys.has(keyOf(c.year, monthIdx(c.month))))
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

  // Exam pass rate over all recorded results (fallback to a reasonable default).
  let passed = 0;
  let total = 0;
  for (const c of courses) {
    for (const r of c.examResults2 ?? []) {
      total++;
      if (r.status === "passed") passed++;
    }
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
    />
  );
}
