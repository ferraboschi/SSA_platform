"use client";

import { usePathname } from "next/navigation";
import { Crumbs, Icon, type Crumb } from "@/components/ui";
import { NAV_ITEMS, type NavGroup } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Notification } from "@/lib/domain";
import type { SearchIndex } from "@/lib/shell";
import type { ConnectionStatus } from "@/lib/integrations/config";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsBell } from "./NotificationsBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RefreshButton } from "./RefreshButton";

interface TopbarProps {
  nav: NavGroup[];
  searchIndex: SearchIndex;
  notifications: Notification[];
  connections: ConnectionStatus;
  onMenu?: () => void;
}

const CONNECTION_LABELS: { key: keyof ConnectionStatus; label: string }[] = [
  { key: "shopifySsa", label: "Shopify SSA" },
  { key: "shopifySc", label: "Shopify SC" },
  { key: "airtable", label: "Airtable" },
  { key: "dropbox", label: "Dropbox" },
];

export function Topbar({ nav, searchIndex, notifications, connections, onMenu }: TopbarProps) {
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
        {CONNECTION_LABELS.map(({ key, label }) => {
          const on = connections[key];
          return (
            <span
              key={key}
              className={`tb-status ${on ? "" : "tb-status-off"}`}
              title={on ? `${label}: connesso` : `${label}: non configurato`}
            >
              <span
                className="dot"
                style={{ background: on ? "var(--success)" : "var(--text-mute, #c0c4cc)" }}
              ></span>
              {label}
            </span>
          );
        })}
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
