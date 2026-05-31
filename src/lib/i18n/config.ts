// Locale configuration. UI ships IT + EN; FR and JA are wired end-to-end (the
// exam report already renders JA) and fall back to the default locale until
// their dictionaries are completed — adding a locale is adding a dictionary file.

export const LOCALES = ["it", "en", "fr", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "it";

// Locales offered in the UI switcher today. FR/JA are kept out until translated,
// but the runtime accepts them (e.g. the report PDF language toggle).
export const ACTIVE_LOCALES: Locale[] = ["it", "en"];

export const LOCALE_COOKIE = "ssa_locale";

export interface LocaleMeta {
  code: Locale;
  label: string;
  native: string;
  htmlLang: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  it: { code: "it", label: "IT", native: "Italiano", htmlLang: "it" },
  en: { code: "en", label: "EN", native: "English", htmlLang: "en" },
  fr: { code: "fr", label: "FR", native: "Français", htmlLang: "fr" },
  ja: { code: "ja", label: "日本語", native: "日本語", htmlLang: "ja" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
