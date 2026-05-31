import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import { EsameStudente } from "@/components/esami/EsameStudente";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ds = await getDataSource();
  const [{ t }, course] = await Promise.all([getTranslations(), ds.courses.getById(id)]);

  if (!course || !course.exam) {
    return <div className="page">{t.esami.studente.notFound}</div>;
  }

  return (
    <EsameStudente
      courseId={course.id}
      month={course.month}
      year={course.year}
      questions={course.exam.questions.slice(0, 8)}
    />
  );
}
