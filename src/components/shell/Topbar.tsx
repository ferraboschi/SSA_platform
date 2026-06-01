"use client";

import { usePathname } from "next/navigation";
import { Crumbs, Icon, type Crumb } from "@/components/ui";
import { NAV_ITEMS, type NavGroup } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Notification } from "@/lib/domain";
import type { SearchIndex } from "@/lib/shell";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsBell } from "./NotificationsBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RefreshButton } from "./RefreshButton";

interface TopbarProps {
  nav: NavGroup[];
  searchIndex: SearchIndex;
  notifications: Notification[];
  onMenu?: () => void;
}

export function Topbar({ nav, searchIndex, notifications, onMenu }: TopbarProps) {
  const t = useT();
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname, t);

  return (
    <header className="topbar">
      <button
        className="btn btn-icon btn-ghost topbar-menu-btn"
        aria-label="Menu"
        onClick={onMenu}
      >
        <Icon name="grid" size={16} />
      </button>
      {crumbs.length > 0 && <Crumbs items={crumbs} />}
      <div style={{ flex: 1 }}></div>

      <GlobalSearch index={searchIndex} nav={nav} />

      <div className="topbar-right">
        <span className="tb-status">
          <span className="dot"></span>Shopify
        </span>
        <span className="tb-status">
          <span className="dot"></span>Airtable
        </span>
        <LanguageSwitcher />
        <NotificationsBell notifications={notifications} />
        <RefreshButton />
      </div>
    </header>
  );
}

type T = ReturnType<typeof useT>;

function buildCrumbs(pathname: string, t: T): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const items = t.nav.items as Record<string, string>;
  const rootHref = "/" + segments[0];
  const rootItem = NAV_ITEMS.find((it) => it.href === rootHref);
  const rootLabel = rootItem ? items[rootItem.id] : segments[0];

  if (segments.length === 1) {
    return [{ label: rootLabel }];
  }

  return [
    { label: rootLabel, href: rootHref },
    { label: decodeURIComponent(segments[segments.length - 1]) },
  ];
}
