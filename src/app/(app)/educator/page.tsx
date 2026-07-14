import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { COURSE_TYPES, type CourseTypeKey } from "@/lib/domain";
import { isActiveCourse, isArchivedCourse } from "@/lib/corsi";
import { EducatorList, type EducatorListItem } from "@/components/educator/EducatorList";
import { isSandboxCourse } from "@/lib/corsi/sandbox";

export default async function Page() {
  await requireNavAccess("educator");
  const ds = await getDataSource();
  const [educators, courses] = await Promise.all([
    ds.educators.list(),
    ds.courses.list(),
  ]);
  const quals = await Promise.all(
    educators.map((e) => ds.educators.getQualifications(e.id)),
  );

  const items: EducatorListItem[] = educators
    .map((e, i) => {
      const cs = courses.filter((c) => c.educator?.id === e.id && !isSandboxCourse(c));
      const active = cs.filter((c) => isActiveCourse(c.lifecycle));
      // "past" = the educator's history: held + cancelled (+ legacy archiviato),
      // so a cancelled course stays in their record instead of vanishing.
      const past = cs.filter((c) => isArchivedCourse(c.lifecycle));
      const totalStudents = cs.reduce((s, c) => s + c.enrolled, 0);
      const passed = past.reduce((s, c) => s + (c.examResults?.passed || 0), 0);
      const totalExam = past.reduce(
        (s, c) =>
          s +
          ((c.examResults?.passed || 0) +
            (c.examResults?.retrial || 0) +
            (c.examResults?.failed || 0)),
        0,
      );
      return {
        id: e.id,
        name: e.name,
        initials: e.initials,
        photo: e.photo,
        role: e.role,
        city: e.city,
        bio: e.bio,
        quals: quals[i],
        coursesCount: cs.length,
        activeCount: active.length,
        totalStudents,
        passRate: totalExam ? passed / totalExam : null,
      };
    })
    .sort((a, b) => b.totalStudents - a.totalStudents);

  const allTypes = Object.keys(COURSE_TYPES) as CourseTypeKey[];

  return <EducatorList items={items} allTypes={allTypes} />;
}
