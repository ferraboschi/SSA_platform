import Link from "next/link";
import { getDataSource } from "@/lib/data";
import { getTranslations } from "@/lib/i18n/server";
import { COURSE_TYPES, type CourseTypeKey } from "@/lib/domain";
import {
  EducatorDetail,
  type EducatorDetailData,
} from "@/components/educator/EducatorDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ds = await getDataSource();
  const [{ t }, educator, courses] = await Promise.all([
    getTranslations(),
    ds.educators.getById(id),
    ds.courses.list(),
  ]);

  if (!educator) {
    return (
      <div className="page">
        <Link className="link" href="/educator">
          {t.educator.detail.back}
        </Link>
      </div>
    );
  }

  const quals = await ds.educators.getQualifications(id);
  const cs = courses.filter((c) => c.educator?.id === id);
  const active = cs.filter((c) => c.lifecycle === "pubblicato");
  const past = cs.filter((c) => c.lifecycle === "passato");
  const totalStudents = cs.reduce((s, c) => s + c.enrolled, 0);
  const totalRevenue = cs.reduce((s, c) => s + c.revenue, 0);
  const passed = past.reduce((s, c) => s + (c.examResults?.passed || 0), 0);
  const totalExam = past.reduce(
    (s, c) =>
      s +
      ((c.examResults?.passed || 0) +
        (c.examResults?.retrial || 0) +
        (c.examResults?.failed || 0)),
    0,
  );
  const cities = Array.from(new Set(cs.map((c) => c.city)));

  const data: EducatorDetailData = {
    educator: {
      id: educator.id,
      name: educator.name,
      initials: educator.initials,
      role: educator.role,
      city: educator.city,
      bio: educator.bio,
      years: educator.years,
      lang: educator.lang,
    },
    quals,
    allTypes: Object.keys(COURSE_TYPES) as CourseTypeKey[],
    stats: {
      coursesCount: cs.length,
      activeCount: active.length,
      pastCount: past.length,
      totalStudents,
      totalRevenue,
      passed,
      totalExam,
      cities,
    },
    active: active.map((c) => ({
      id: c.id,
      typeColor: c.typeColor,
      typeShort: c.typeShort,
      status: c.status,
      shortTitle: c.shortTitle,
      day: c.day,
      month: c.month,
      year: c.year,
      city: c.city,
      enrolled: c.enrolled,
      capacity: c.capacity,
      minStudents: c.minStudents,
      revenue: c.revenue,
    })),
    past: past.map((c) => ({
      id: c.id,
      typeColor: c.typeColor,
      typeShort: c.typeShort,
      shortTitle: c.shortTitle,
      city: c.city,
      month: c.month,
      year: c.year,
      enrolled: c.enrolled,
      capacity: c.capacity,
      examResults: c.examResults ?? null,
      revenue: c.revenue,
    })),
  };

  return <EducatorDetail data={data} />;
}
