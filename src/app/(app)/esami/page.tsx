import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { buildExamHub } from "@/lib/esami";
import { EsamiHub } from "@/components/esami/EsamiHub";

export default async function Page() {
  await requireNavAccess("esami");
  const ds = await getDataSource();
  const courses = await ds.courses.list();
  const data = buildExamHub(courses);
  return <EsamiHub data={data} />;
}
