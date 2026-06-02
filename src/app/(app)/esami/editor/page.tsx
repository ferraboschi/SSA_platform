import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import type { ExamFamily, ExamTemplate } from "@/lib/domain";
import { ExamLibraryEditor } from "@/components/esami/ExamLibraryEditor";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireNavAccess("esami");
  const ds = await getDataSource();
  const [list, courses] = await Promise.all([ds.examTemplates.list(), ds.courses.list()]);
  const templates = Object.fromEntries(list.map((tpl) => [tpl.family, tpl])) as Record<
    ExamFamily,
    ExamTemplate
  >;

  // A representative course per family so the editor can mint preview links
  // (the public runner resolves the family template from the course type).
  const pick = (type: string) =>
    courses
      .filter((c) => c.type === type && !c.cancelled)
      .sort((a, b) => b.year - a.year)[0]?.id ?? undefined;
  const previewCourse: Partial<Record<ExamFamily, string>> = {
    nihonshu: pick("certificato"),
    shochu: pick("shochu"),
  };

  return <ExamLibraryEditor templates={templates} previewCourse={previewCourse} />;
}
