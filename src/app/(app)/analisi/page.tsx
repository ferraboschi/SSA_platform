import { getDataSource } from "@/lib/data";
import { getTranslations } from "@/lib/i18n/server";
import { computeAnalisi } from "@/lib/analisi";
import { AnalisiClient } from "@/components/analisi/AnalisiClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [ds, { locale }] = await Promise.all([getDataSource(), getTranslations()]);
  const courses = await ds.courses.list();
  const data = computeAnalisi(courses);

  return <AnalisiClient data={data} locale={locale} />;
}
