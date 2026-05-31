"use client";

import { ACTIVE_LOCALES, LOCALE_META, useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, switching } = useI18n();

  return (
    <div className="segmented" role="group">
      {ACTIVE_LOCALES.map((code) => (
        <button
          key={code}
          className={code === locale ? "on" : ""}
          onClick={() => code !== locale && setLocale(code)}
          disabled={switching}
          title={LOCALE_META[code].native}
        >
          {LOCALE_META[code].label}
        </button>
      ))}
    </div>
  );
}
