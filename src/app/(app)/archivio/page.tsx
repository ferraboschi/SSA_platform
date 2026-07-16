import { getDataSource } from "@/lib/data";
import { CITIES } from "@/lib/domain";
import { isArchivedCourse } from "@/lib/corsi";
import { monthIndexIt } from "@/lib/dates/italian-months";
import { loadCourseEconomics } from "@/lib/economics";
import { isLegacyInvoiced } from "@/lib/economics/types";
import { ArchivioClient, type ArchivioCourse } from "@/components/archivio/ArchivioClient";
import { isSandboxCourse } from "@/lib/corsi/sandbox";

export default async function Page() {
  const ds = await getDataSource();
  const [courses, econ] = await Promise.all([ds.courses.list(), loadCourseEconomics()]);

  // Archivio holds ONLY archived-reason courses: passato (held) + cancelled
  // (annulled before their date). Active (pubblicato) and drafts (bozza) live in
  // the active views / the separate Bozze area.
  const items: ArchivioCourse[] = courses
    .filter((c) => isArchivedCourse(c.lifecycle) && !isSandboxCourse(c))
    .map((c) => {
      const held = c.lifecycle === "passato" && !c.cancelled;
      const invoiced = held
        ? Boolean(econ.get(c.id)?.invoiced) ||
          isLegacyInvoiced(c.year, monthIndexIt(c.month), true)
        : null;
      return {
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
        margin: c.margin,
        examResults: c.examResults ?? null,
        invoiced,
        lifecycle: c.lifecycle,
        educatorName: c.educator.name,
        cancelled: c.cancelled ?? false,
      };
    });

  return <ArchivioClient items={items} citiesPossible={CITIES.length} />;
}
