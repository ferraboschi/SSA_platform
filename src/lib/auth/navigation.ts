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
  { id: "analisi", icon: "trending", href: "/analisi", group: "catalogo" },
  { id: "conto-economico", icon: "note", href: "/conto-economico", group: "catalogo" },
  {
    id: "esami",
    icon: "exam",
    href: "/esami",
    group: "catalogo",
    children: [{ id: "esami-editor", href: "/esami/editor" }],
  },
  { id: "template-materiali", icon: "copy", href: "/template-materiali", group: "catalogo" },
  { id: "archivio", icon: "archive", href: "/archivio", group: "catalogo" },
  { id: "corsisti", icon: "users", href: "/corsisti", group: "persone" },
  { id: "anomalie", icon: "warn", href: "/anomalie", group: "persone" },
  { id: "educator", icon: "graduation", href: "/educator", group: "persone" },
  { id: "account", icon: "user", href: "/account", group: "sistema" },
  { id: "design-system", icon: "tag", href: "/design-system", group: "sistema" },
];
