import { PageHeader } from "@/components/ui";
import { getTranslations } from "@/lib/i18n/server";

// Temporary stand-in so every nav destination resolves while the real modules
// are built out (tasks #9–#13). Replaced page-by-page as each module lands.
export async function ModulePlaceholder({ id }: { id: string }) {
  const { t } = await getTranslations();
  const items = t.nav.items as Record<string, string>;
  return (
    <div className="page">
      <PageHeader title={items[id] ?? id} sub={t.common.underConstruction} />
    </div>
  );
}
