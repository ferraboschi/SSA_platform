"use client";

// Client i18n context. Hydrated from the server with the active locale and its
// merged dictionary; exposes the dictionary and a locale switcher to components.

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "./config";
import type { Dictionary } from "./dictionary";
import { setLocaleAction } from "./actions";

interface I18nContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  switching: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  const router = useRouter();
  const [switching, startTransition] = useTransition();

  const value: I18nContextValue = {
    locale,
    t: dictionary,
    setLocale: (next) =>
      startTransition(async () => {
        await setLocaleAction(next);
        router.refresh();
      }),
    switching,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

export function useT(): Dictionary {
  return useI18n().t;
}

export function useLocale(): Locale {
  return useI18n().locale;
}
