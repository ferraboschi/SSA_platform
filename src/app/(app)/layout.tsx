import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SessionProvider, navForRole } from "@/lib/auth";
import { getSession, listUsers } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import { appConfig, supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { buildSearchIndex, buildSidebarCourses } from "@/lib/shell";
import { Shell } from "@/components/shell/Shell";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Live mode (Supabase + USE_SEED=false) requires a real signed-in user.
  // In dev (USE_SEED=true) we keep the in-memory stub auth — no login wall.
  if (supabaseConfig.isConfigured && !appConfig.useSeed) {
    const sb = await getSupabaseServerClient();
    const { data } = await sb.auth.getUser();
    if (!data.user) redirect("/login");
  }

  const ds = await getDataSource();
  const [
    { locale, t },
    session,
    users,
    courses,
    corsisti,
    educators,
    templates,
    notifications,
  ] = await Promise.all([
    getTranslations(),
    getSession(),
    listUsers(),
    ds.courses.list(),
    ds.corsisti.list(),
    ds.educators.list(),
    ds.materialTemplates.list(),
    ds.notifications.list(),
  ]);

  const nav = navForRole(session.role.key);
  const sidebarCourses = buildSidebarCourses(courses);
  const searchIndex = buildSearchIndex(courses, corsisti, educators);
  const counts: Record<string, number> = {
    corsi: courses.filter((c) => c.lifecycle === "pubblicato").length,
    esami: courses.filter((c) => c.exam).length,
    "template-materiali": templates.length,
    corsisti: corsisti.length,
    educator: educators.length,
  };

  return (
    <I18nProvider locale={locale} dictionary={t}>
      <SessionProvider session={session}>
        <Shell
          nav={nav}
          counts={counts}
          users={users}
          sidebarCourses={sidebarCourses}
          searchIndex={searchIndex}
          notifications={notifications}
        >
          {children}
        </Shell>
      </SessionProvider>
    </I18nProvider>
  );
}
