import { getDataSource } from "@/lib/data";
import { CITIES } from "@/lib/domain";
import { ArchivioClient, type ArchivioCourse } from "@/components/archivio/ArchivioClient";

export default async function Page() {
  const ds = await getDataSource();
  const courses = await ds.courses.list();

  const items: ArchivioCourse[] = courses
    .filter((c) => c.lifecycle !== "bozza" && c.lifecycle !== "archiviato")
    .map((c) => ({
      id: c.id,
      handle: c.handle,
      type: c.type,
      typeColor: c.typeColor,
      typeShort: c.typeShort,
      shortTitle: c.shortTitle,
      city: c.city,
      day: c.day,
      month: c.month,
      year: c.year,
      enrolled: c.enrolled,
      revenue: c.revenue,
      lifecycle: c.lifecycle,
      educatorName: c.educator.name,
    }));

  return <ArchivioClient items={items} citiesPossible={CITIES.length} />;
}
