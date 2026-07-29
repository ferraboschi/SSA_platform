import Link from "next/link";
import { redirect } from "next/navigation";
import { getDataSource } from "@/lib/data";
import { getTranslations } from "@/lib/i18n/server";
import { CorsistaProfile } from "@/components/corsisti/CorsistaProfile";

export default async function Page({ params }: { params: Promise<{ email: string }> }) {
  const { email } = await params;
  const requestedEmail = decodeURIComponent(email).toLowerCase();
  const ds = await getDataSource();
  const [{ t }, corsista] = await Promise.all([
    getTranslations(),
    ds.corsisti.getByEmail(requestedEmail),
  ]);

  // The requested record was merged into another: getByEmail followed the chain
  // and returned the SURVIVOR. Send the URL to its canonical email so the address
  // bar, links and refreshes all point at the consolidated profile.
  if (corsista && corsista.email && corsista.email.toLowerCase() !== requestedEmail) {
    redirect(`/corsisti/${encodeURIComponent(corsista.email.toLowerCase())}`);
  }

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
