import Link from "next/link";
import { getDataSource } from "@/lib/data";
import { getTranslations } from "@/lib/i18n/server";
import { CorsistaProfile } from "@/components/corsisti/CorsistaProfile";

export default async function Page({ params }: { params: Promise<{ email: string }> }) {
  const { email } = await params;
  const ds = await getDataSource();
  const [{ t }, corsista] = await Promise.all([
    getTranslations(),
    ds.corsisti.getByEmail(decodeURIComponent(email).toLowerCase()),
  ]);

  if (!corsista) {
    return (
      <div className="page">
        <div className="card card-pad">
          {t.corsisti.profile.notFound}{" "}
          <Link className="link" href="/corsisti">
            {t.corsisti.profile.back}
          </Link>
        </div>
      </div>
    );
  }

  return <CorsistaProfile corsista={corsista} />;
}
