// Dictionary loader. IT is the source-of-truth shape; other locales may be
// partial and are deep-merged over IT so any missing key falls back gracefully.

import { resolveLocale, type Locale } from "./config";
import { it } from "./dictionaries/it";
import { en } from "./dictionaries/en";
import { ja } from "./dictionaries/ja";

export type Dictionary = typeof it;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override) as (keyof T)[]) {
    const o = override[key];
    if (o === undefined) continue;
    const b = (base as Record<string, unknown>)[key as string];
    out[key as string] =
      isPlainObject(b) && isPlainObject(o)
        ? deepMerge(b, o as DeepPartial<typeof b>)
        : o;
  }
  return out as T;
}

const OVERRIDES: Partial<Record<Locale, DeepPartial<Dictionary>>> = {
  en,
  ja,
};

export function getDictionary(locale: Locale): Dictionary {
  const override = OVERRIDES[resolveLocale(locale)];
  return override ? deepMerge(it, override) : it;
}

// Interpolates `{name}` placeholders, e.g. format(t.notifications.emailVia, { email }).
export function format(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
