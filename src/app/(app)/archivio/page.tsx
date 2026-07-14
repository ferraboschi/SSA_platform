import { getDataSource } from "@/lib/data";
import { CITIES } from "@/lib/domain";
import { isArchivedCourse } from "@/lib/corsi";
import { ArchivioClient, type ArchivioCourse } from "@/components/archivio/ArchivioClient";
import { isSandboxCourse } from "@/lib/corsi/sandbox";

export default async function Page() {
  const ds = await getDataSource();
  const courses = await ds.courses.list();

  // Archivio holds ONLY archived-reason courses: passato (held) + cancelled
  // (annulled before their date). Active (pubblicato) and drafts (bozza) live in
  // the active views / the separate Bozze area.
  const items: ArchivioCourse[] = courses
    .filter((c) => isArchivedCourse(c.lifecycle) && !isSandboxCourse(c))
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
      cancelled: c.cancelled ?? false,
    }));

  return <ArchivioClient items={items} citiesPossible={CITIES.length} />;
}
