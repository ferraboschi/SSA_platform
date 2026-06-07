import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SessionProvider, navForRole } from "@/lib/auth";
import { getSession, listUsers } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import { appConfig, supabaseConfig, getConnectionStatus } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getShellData } from "@/lib/shell-data";
import { Shell } from "@/components/shell/Shell";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Live mode (Supabase + USE_SEED=false) requires a real signed-in user.
  // In dev (USE_SEED=true) we keep the in-memory stub auth — no login wall.
  if (supabaseConfig.isConfigured && !appConfig.useSeed) {
    let user = null;
    try {
      const sb = await getSupabaseServerClient();
      const { data } = await sb.auth.getUser();
      user = data.user;
    } catch {
      user = null; // treat an auth error as "not signed in"
    }
    if (!user) redirect("/login"); // outside try: redirect() throws internally
  }

  const ds = await getDataSource();
  // Shared catalog/search/counts are cached (see getShellData); only the
  // per-user bits (session, users, notifications) are fetched each request.
  const [{ locale, t }, session, users, shell, notifications] = await Promise.all([
    getTranslations(),
    getSession(),
    listUsers(),
    getShellData(),
    ds.notifications.list(),
  ]);

  const nav = navForRole(session.role.key);

  return (
    <I18nProvider locale={locale} dictionary={t}>
      <SessionProvider session={session}>
        <ServiceWorkerRegister />
        <Shell
          nav={nav}
          counts={shell.counts}
          users={users}
          sidebarCourses={shell.sidebarCourses}
          searchIndex={shell.searchIndex}
          notifications={notifications}
          connections={getConnectionStatus()}
        >
          {children}
        </Shell>
      </SessionProvider>
    </I18nProvider>
  );
}
