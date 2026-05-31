import { getDataSource } from "@/lib/data";
import { COURSE_TYPES } from "@/lib/domain/constants";
import type { CourseTypeKey } from "@/lib/domain";
import {
  toCourseListItem,
  type CatalogFilterOptions,
} from "@/lib/corsi";
import { CorsiCatalog } from "@/components/corsi/CorsiCatalog";

export default async function Page() {
  const ds = await getDataSource();
  const [courses, educators] = await Promise.all([
    ds.courses.list(),
    ds.educators.list(),
  ]);

  const items = courses.map(toCourseListItem);

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

  return <CorsiCatalog items={items} filterOptions={filterOptions} />;
}
