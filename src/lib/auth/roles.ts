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
  "designSystem:view",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// Admin (founder) has the full surface; the manager runs operations but not the
// developer-facing design-system tooling. New capabilities default to admin-only
// until explicitly granted to other roles.
export const ROLE_CAPABILITIES: Record<RoleKey, Capability[]> = {
  admin: [...CAPABILITIES],
  manager: [
    "courses:view",
    "courses:manage",
    "exams:grade",
    "educators:manage",
    "settings:manage",
  ],
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
