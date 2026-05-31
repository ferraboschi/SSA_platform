import "server-only";

// Server-side locale resolution: reads the locale cookie and returns the merged
// dictionary. Use from server components/layouts via getTranslations().

import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionary";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

export async function getTranslations(): Promise<{
  locale: Locale;
  t: Dictionary;
}> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
