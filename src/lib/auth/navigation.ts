// Canonical navigation model — the full set of app surfaces, independent of role
// and language. Per-role visibility/ordering lives in roles.ts (`navForRole`);
// the visible labels live in the i18n dictionaries, keyed by `id` / group key.

import type { IconName } from "@/components/ui/Icon";

export type NavGroupKey = "main" | "catalogo" | "persone" | "sistema";

export const NAV_GROUP_ORDER: NavGroupKey[] = [
  "main",
  "catalogo",
  "persone",
  "sistema",
];

export interface NavChildDef {
  id: string;
  href: string;
}

export interface NavItemDef {
  id: string;
  icon: IconName;
  href: string;
  group: NavGroupKey;
  children?: NavChildDef[];
}

export const NAV_ITEMS: NavItemDef[] = [
  { id: "dashboard", icon: "home", href: "/dashboard", group: "main" },
  { id: "corsi", icon: "book", href: "/corsi", group: "catalogo" },
  { id: "pianificatore", icon: "calendar", href: "/pianificatore", group: "catalogo" },
  // Catalogo now holds only the two libraries (materials + exams/tests) alongside
  // the course list, planner and archive — exam *management* moved to Sistema.
  // The exam/test library, formerly a child of the "esami" item, is promoted to a
  // top-level catalog entry so it stays in Catalogo while "esami" moves out.
  { id: "template-materiali", icon: "copy", href: "/template-materiali", group: "catalogo" },
  { id: "esami-editor", icon: "note", href: "/esami/editor", group: "catalogo" },
  { id: "archivio", icon: "archive", href: "/archivio", group: "catalogo" },
  { id: "corsisti", icon: "users", href: "/corsisti", group: "persone" },
  { id: "anomalie", icon: "warn", href: "/anomalie", group: "persone" },
  { id: "educator", icon: "graduation", href: "/educator", group: "persone" },
  // Sistema: exam management (grading/results hub) sits with the operational tools.
  { id: "esami", icon: "exam", href: "/esami", group: "sistema" },
  { id: "crediti", icon: "coin", href: "/crediti", group: "sistema" },
  { id: "analisi", icon: "trending", href: "/analisi", group: "sistema" },
  { id: "account", icon: "user", href: "/account", group: "sistema" },
  // NOTE: "conto-economico" is intentionally NOT listed here — it's hidden from
  // the menu (the page still exists at /conto-economico if reached directly).
];
