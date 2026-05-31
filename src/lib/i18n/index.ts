// Client-safe barrel (config + dictionary loader + React context). Server-only
// helpers live in "./server" and are imported directly by server components.

export {
  LOCALES,
  DEFAULT_LOCALE,
  ACTIVE_LOCALES,
  LOCALE_COOKIE,
  LOCALE_META,
  isLocale,
  resolveLocale,
  type Locale,
  type LocaleMeta,
} from "./config";
export {
  getDictionary,
  format,
  type Dictionary,
  type DeepPartial,
} from "./dictionary";
export {
  I18nProvider,
  useI18n,
  useT,
  useLocale,
} from "./context";
