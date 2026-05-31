import { getDataSource } from "@/lib/data";
import type { ExamFamily, ExamTemplate } from "@/lib/domain";
import { ExamLibraryEditor } from "@/components/esami/ExamLibraryEditor";

export default async function Page() {
  const ds = await getDataSource();
  const list = await ds.examTemplates.list();
  const templates = Object.fromEntries(list.map((tpl) => [tpl.family, tpl])) as Record<
    ExamFamily,
    ExamTemplate
  >;
  return <ExamLibraryEditor templates={templates} />;
}
