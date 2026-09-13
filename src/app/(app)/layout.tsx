import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ROLE_VIEWS, SessionProvider, navForRole } from "@/lib/auth";
import { getSession, listUsers } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import { appConfig, supabaseConfig, getConnectionStatus } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { SearchIndex } from "@/lib/shell";
import { getShellData } from "@/lib/shell-data";
import { Shell } from "@/components/shell/Shell";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Live mode (Supabase + USE_SEED=false) requires a real signed-in user.
  // In dev (USE_SEED=true) we keep the in-memory stub auth — no login wall.
  let user = null;
  if (supabaseConfig.isConfigured && !appConfig.useSeed) {
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

  // Signed in but resolved to the zero-capability "guest" (profile not enabled
  // or not yet provisioned): no shell at all — the login page explains.
  if (user && session.role.key === "guest") redirect("/login?denied=1");

  const nav = navForRole(session.role.key);
  // The cached index is shared by every session: hand each role a filtered
  // COPY without the sections its ACL hides (guest hides them all → empty), so
  // ⌘K cannot surface profiles the role may not open.
  const hidden = new Set(ROLE_VIEWS[session.role.key].hidden);
  const searchIndex: SearchIndex = {
    corsi: hidden.has("corsi") ? [] : shell.searchIndex.corsi,
    corsisti: hidden.has("corsisti") ? [] : shell.searchIndex.corsisti,
    educator: hidden.has("educator") ? [] : shell.searchIndex.educator,
  };

  return (
    <I18nProvider locale={locale} dictionary={t}>
      <SessionProvider session={session}>
        <Shell
          nav={nav}
          counts={shell.counts}
          users={users}
          sidebarCourses={shell.sidebarCourses}
          searchIndex={searchIndex}
          notifications={notifications}
          connections={getConnectionStatus()}
        >
          {children}
        </Shell>
      </SessionProvider>
    </I18nProvider>
  );
}
