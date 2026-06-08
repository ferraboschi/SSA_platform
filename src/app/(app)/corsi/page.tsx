import { getDataSource } from "@/lib/data";
import { COURSE_TYPES } from "@/lib/domain/constants";
import type { CourseTypeKey } from "@/lib/domain";
import {
  toCourseListItem,
  type CatalogFilterOptions,
} from "@/lib/corsi";
import { loadCourseProgram } from "@/lib/corsi/program-load";
import { CorsiCatalog } from "@/components/corsi/CorsiCatalog";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string }>;
}) {
  const { type, from } = await searchParams;
  const ds = await getDataSource();
  const [courses, educators, programMap] = await Promise.all([
    ds.courses.list(),
    ds.educators.list(),
    loadCourseProgram(),
  ]);
  // A course has its sake program "assigned" when its saved overlay holds at
  // least one sake — that's the green-dot signal in the catalog.
  const hasSakeProgram = (id: string): boolean =>
    !!programMap.get(id)?.days?.some((d) => (d.sakes?.length ?? 0) > 0);

  // Deep-link from the Pianificatore "Per tipo" chart: pre-select the type filter
  // and offer a back link to the planner.
  const validTypes = Object.keys(COURSE_TYPES);
  const initialType = type && validTypes.includes(type) ? type : undefined;
  const backHref = from === "pianificatore" ? "/pianificatore" : undefined;

  // Cancelled courses (incl. phantom drafts from unpublished Shopify products)
  // belong in the Archivio, not the live catalog.
  const items = courses
    .filter((c) => !c.cancelled)
    .map((c) => ({ ...toCourseListItem(c), hasProgram: hasSakeProgram(c.id) }));

  const cities = [...new Set(items.map((c) => c.city))].sort((a, b) =>
    a.localeCompare(b),
  );

  const filterOptions: CatalogFilterOptions = {
    types: (Object.keys(COURSE_TYPES) as CourseTypeKey[]).map((key) => ({
      key,
      label: COURSE_TYPES[key].label,
    })),
    cities,
    educators: educators.map((e) => ({ id: e.id, name: e.name })),
  };

  return (
    <CorsiCatalog
      items={items}
      filterOptions={filterOptions}
      initialType={initialType}
      backHref={backHref}
    />
  );
}
