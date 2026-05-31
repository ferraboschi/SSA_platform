import { getDataSource } from "@/lib/data";
import { CorsistiList } from "@/components/corsisti/CorsistiList";

export default async function Page() {
  const ds = await getDataSource();
  const corsisti = await ds.corsisti.list();

  const stats = {
    total: corsisti.length,
    returning: corsisti.filter((s) => s.isReturning).length,
    historical: corsisti.filter((s) => s.historical).length,
    passed: corsisti.filter((s) => s.courses.some((c) => c.examResult === "passed")).length,
  };

  return <CorsistiList items={corsisti} stats={stats} />;
}
