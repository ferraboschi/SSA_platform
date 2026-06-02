// Role model: capabilities (what a role may do) and view priority (what a role
// sees first / at all). Both are pure config so the rules live in one place and
// future roles (e.g. "educator") plug in without touching call sites.

import type { RoleKey } from "@/lib/domain";
import {
  NAV_GROUP_ORDER,
  NAV_ITEMS,
  type NavGroupKey,
  type NavItemDef,
} from "./navigation";

// ============ Capabilities ============

export const CAPABILITIES = [
  "courses:view",
  "courses:manage",
  "exams:grade",
  "educators:manage",
  "settings:manage",
  "finance:view",
  "communications:manage",
  "designSystem:view",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// Capability matrix per role:
//   admin (Lorenzo)      → full surface.
//   manager (Camilla)    → runs operations: courses, exams, educators, settings,
//                          finance + communications; not the dev design-system.
//   social (Dario)       → campaigns/communications + read-only course/audience.
//   accountant (Luigi)   → finance/economics + read-only courses; no management.
export const ROLE_CAPABILITIES: Record<RoleKey, Capability[]> = {
  admin: [...CAPABILITIES],
  manager: [
    "courses:view",
    "courses:manage",
    "exams:grade",
    "educators:manage",
    "settings:manage",
    "finance:view",
    "communications:manage",
  ],
  social: ["courses:view", "communications:manage"],
  accountant: ["courses:view", "finance:view"],
};

export function roleCan(role: RoleKey, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}

// ============ Per-role view priority ============

export interface RoleView {
  // Nav item ids this role never sees.
  hidden: string[];
  // Preferred ordering by nav item id (applied within each group). Items omitted
  // keep their canonical declaration order, after any listed ones.
  priority: string[];
}

export const ROLE_VIEWS: Record<RoleKey, RoleView> = {
  admin: {
    hidden: [],
    priority: [],
  },
  manager: {
    hidden: ["design-system"],
    priority: [
      "dashboard",
      "corsi",
      "esami",
      "pianificatore",
      "corsisti",
      "educator",
      "template-materiali",
      "archivio",
    ],
  },
  // Dario — social/campaigns: audience + catalog, no ops/exams/finance tooling.
  social: {
    hidden: [
      "esami",
      "pianificatore",
      "analisi",
      "template-materiali",
      "anomalie",
      "educator",
      "design-system",
    ],
    priority: ["dashboard", "corsisti", "corsi", "archivio"],
  },
  // Luigi — bookkeeping: economics + history, no course/people management.
  accountant: {
    hidden: [
      "esami",
      "pianificatore",
      "template-materiali",
      "corsisti",
      "anomalie",
      "educator",
      "design-system",
    ],
    priority: ["dashboard", "corsi", "archivio"],
  },
};

export interface NavGroup {
  key: NavGroupKey;
  items: NavItemDef[];
}

export function navForRole(role: RoleKey): NavGroup[] {
  const view = ROLE_VIEWS[role];
  const hidden = new Set(view.hidden);
  const rank = (id: string) => {
    const i = view.priority.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  return NAV_GROUP_ORDER.map((key) => ({
    key,
    items: NAV_ITEMS.filter((it) => it.group === key && !hidden.has(it.id)).sort(
      (a, b) =>
        rank(a.id) - rank(b.id) || NAV_ITEMS.indexOf(a) - NAV_ITEMS.indexOf(b),
    ),
  })).filter((g) => g.items.length > 0);
}
