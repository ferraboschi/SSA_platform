import { getDataSource } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import { getTranslations } from "@/lib/i18n/server";
import { monthIndexIt } from "@/lib/dashboard";
import { loadCourseEconomics } from "@/lib/economics";
import { EMPTY_ECON, isLegacyInvoiced, INVOICING_GO_LIVE, type EconCourseRow } from "@/lib/economics/types";
import { ContoEconomicoClient } from "@/components/economics/ContoEconomicoClient";
import { isSandboxCourse } from "@/lib/corsi/sandbox";

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
    .filter((c) => !c.cancelled && !isSandboxCourse(c))
    .map((c) => {
      const ended = c.lifecycle === "passato";
      const base = econ.get(c.id) ?? EMPTY_ECON;
      // Courses ended before invoicing go-live (Giugno 2026) were invoiced by
      // hand → show them as already settled instead of "da fatturare". No write:
      // we only fold the legacy flag into the view model.
      const legacy = isLegacyInvoiced(c.year, monthIndexIt(c.month), ended);
      const rowEcon =
        legacy && !base.invoiced
          ? {
              ...base,
              invoiced: true,
              invoicedBy: base.invoicedBy ?? "Storico (saldato a mano)",
              invoicedAt: base.invoicedAt ?? `${INVOICING_GO_LIVE.year}-01-01T00:00:00.000Z`,
            }
          : base;
      return {
        id: c.id,
        title: c.shortTitle || c.title,
        type: c.type,
        typeLabel: c.typeLabel,
        city: c.city,
        month: c.month,
        year: c.year,
        revenue: c.revenue,
        ended,
        econ: rowEcon,
      };
    })
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
