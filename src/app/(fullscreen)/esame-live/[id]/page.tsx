import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import { EsameLive } from "@/components/esami/EsameLive";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ds = await getDataSource();
  const [{ t }, course] = await Promise.all([getTranslations(), ds.courses.getById(id)]);
  const tl = t.esami.live;

  if (!course || !course.exam) {
    return (
      <div style={{ padding: 80, textAlign: "center", color: "var(--text-3)" }}>
        {tl.notFound}{" "}
        <Link className="link" href="/corsi">
          {t.esami.detail.backLink}
        </Link>
      </div>
    );
  }

  return (
    <EsameLive
      courseId={course.id}
      shortTitle={course.shortTitle}
      month={course.month}
      year={course.year}
      city={course.city}
      duration={course.exam.duration}
      sessions={course.examLive ?? []}
    />
  );
}
