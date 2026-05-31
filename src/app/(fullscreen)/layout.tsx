import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n/server";

export default async function FullscreenLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { locale, t } = await getTranslations();
  return (
    <I18nProvider locale={locale} dictionary={t}>
      {children}
    </I18nProvider>
  );
}
