import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { TemplateMateriali } from "@/components/template-materiali/TemplateMateriali";

export default async function Page() {
  await requireNavAccess("template-materiali");
  const ds = await getDataSource();
  const [templates, session] = await Promise.all([ds.materialTemplates.list(), getSession()]);

  return <TemplateMateriali initialTemplates={templates} authorName={session.user.name} />;
}
