import { getDataSource } from "@/lib/data";
import { buildExamHub } from "@/lib/esami";
import { EsamiHub } from "@/components/esami/EsamiHub";

export default async function Page() {
  const ds = await getDataSource();
  const courses = await ds.courses.list();
  const data = buildExamHub(courses);
  return <EsamiHub data={data} />;
}
