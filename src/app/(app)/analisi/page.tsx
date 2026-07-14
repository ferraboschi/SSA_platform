import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { getTranslations } from "@/lib/i18n/server";
import { computeAnalisi } from "@/lib/analisi";
import { AnalisiClient } from "@/components/analisi/AnalisiClient";
import { isSandboxCourse } from "@/lib/corsi/sandbox";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireNavAccess("analisi");
  const [ds, { locale }] = await Promise.all([getDataSource(), getTranslations()]);
  const courses = await ds.courses.list();
  const data = computeAnalisi(courses.filter((c) => !isSandboxCourse(c)));

  return <AnalisiClient data={data} locale={locale} />;
}
