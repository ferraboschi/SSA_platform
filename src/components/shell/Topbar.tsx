"use client";

import { Icon } from "@/components/ui";
import type { NavGroup } from "@/lib/auth";
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
  return (
    <header className="topbar">
      <button
        className="btn btn-icon btn-ghost topbar-menu-btn"
        aria-label="Menu"
        onClick={onMenu}
      >
        <Icon name="grid" size={16} />
      </button>

      {/* Search sits on the left and fills the space (the page title lives in the
          page header, so it isn't repeated here). */}
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
