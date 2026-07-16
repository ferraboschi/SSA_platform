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
  // Catalogo: the course list, planner, materials library, and archive.
  { id: "corsi", icon: "book", href: "/corsi", group: "catalogo" },
  { id: "pianificatore", icon: "calendar", href: "/pianificatore", group: "catalogo" },
  { id: "template-materiali", icon: "copy", href: "/template-materiali", group: "catalogo" },
  { id: "archivio", icon: "archive", href: "/archivio", group: "catalogo" },
  // Persone: students, educators, and their credit ledger.
  { id: "corsisti", icon: "users", href: "/corsisti", group: "persone" },
  { id: "educator", icon: "graduation", href: "/educator", group: "persone" },
  { id: "crediti", icon: "coin", href: "/crediti", group: "persone" },
  // Sistema: operational tools. Exam management (grading/results hub) is
  // hidden for now — exams now live per-course, so the standalone hub is
  // redundant (see ROLE_VIEWS.admin/manager .hidden in roles.ts).
  { id: "esami", icon: "exam", href: "/esami", group: "sistema" },
  { id: "esami-editor", icon: "note", href: "/esami/editor", group: "sistema" },
  { id: "anomalie", icon: "warn", href: "/anomalie", group: "sistema" },
  { id: "analisi", icon: "trending", href: "/analisi", group: "sistema" },
  // Cross-cutting register of every Shopify payment (belongs right after
  // "conto-economico" whenever that item returns to this list).
  { id: "pagamenti", icon: "list", href: "/pagamenti", group: "sistema" },
  { id: "account", icon: "user", href: "/account", group: "sistema" },
  // NOTE: "conto-economico" is intentionally NOT listed here — it's hidden from
  // the menu (the page still exists at /conto-economico if reached directly).
];
