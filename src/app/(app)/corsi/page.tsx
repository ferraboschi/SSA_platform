import { getDataSource } from "@/lib/data";
import { COURSE_TYPES } from "@/lib/domain/constants";
import type { CourseTypeKey } from "@/lib/domain";
import {
  toCourseListItem,
  type CatalogFilterOptions,
} from "@/lib/corsi";
import { CorsiCatalog } from "@/components/corsi/CorsiCatalog";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string }>;
}) {
  const { type, from } = await searchParams;
  const ds = await getDataSource();
  const [courses, educators] = await Promise.all([
    ds.courses.list(),
    ds.educators.list(),
  ]);

  // Deep-link from the Pianificatore "Per tipo" chart: pre-select the type filter
  // and offer a back link to the planner.
  const validTypes = Object.keys(COURSE_TYPES);
  const initialType = type && validTypes.includes(type) ? type : undefined;
  const backHref = from === "pianificatore" ? "/pianificatore" : undefined;

  // Cancelled courses (incl. phantom drafts from unpublished Shopify products)
  // belong in the Archivio, not the live catalog.
  const items = courses.filter((c) => !c.cancelled).map(toCourseListItem);

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
