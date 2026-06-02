import { getDataSource } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import { getTranslations } from "@/lib/i18n/server";
import { monthIndexIt } from "@/lib/dashboard";
import { loadCourseEconomics } from "@/lib/economics";
import { EMPTY_ECON, type EconCourseRow } from "@/lib/economics/types";
import { ContoEconomicoClient } from "@/components/economics/ContoEconomicoClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [ds, session, { locale }] = await Promise.all([
    getDataSource(),
    getSession(),
    getTranslations(),
  ]);
  const [courses, econ] = await Promise.all([ds.courses.list(), loadCourseEconomics()]);
  const role = session.user.roleKey;

  const rows: EconCourseRow[] = courses
    .filter((c) => !c.cancelled)
    .map((c) => ({
      id: c.id,
      title: c.shortTitle || c.title,
      type: c.type,
      typeLabel: c.typeLabel,
      city: c.city,
      month: c.month,
      year: c.year,
      revenue: c.revenue,
      ended: c.lifecycle === "passato",
      econ: econ.get(c.id) ?? EMPTY_ECON,
    }))
    .sort((a, b) => {
      const da = a.year * 12 + monthIndexIt(a.month);
      const db = b.year * 12 + monthIndexIt(b.month);
      return db - da; // most recent first
    });

  return (
    <ContoEconomicoClient
      rows={rows}
      role={role}
      locale={locale}
      canEditAdv={role === "social" || role === "admin"}
      canEditInvoice={role === "accountant" || role === "admin"}
    />
  );
}
