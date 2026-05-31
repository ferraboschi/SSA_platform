"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { NavGroup, NavGroupKey } from "@/lib/auth";
import type { User } from "@/lib/domain";
import type { SidebarCourse } from "@/lib/shell";
import { UserSwitcher } from "./UserSwitcher";

interface SidebarProps {
  nav: NavGroup[];
  counts: Record<string, number>;
  courses: SidebarCourse[];
  users: User[];
}

export function Sidebar({ nav, counts, courses, users }: SidebarProps) {
  const t = useT();
  const pathname = usePathname();
  const [corsiOpen, setCorsiOpen] = useState(true);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">
      <Link className="sb-brand" href="/dashboard">
        <div className="sb-mark">
          <span>S</span>
        </div>
        <div>
          <div className="sb-brand-name">{t.brand.name}</div>
          <div className="sb-brand-sub">{t.brand.sub}</div>
        </div>
      </Link>

      {nav.map((g) => (
        <div key={g.key} className="sb-group">
          {g.key !== "main" && (
            <div className="sb-group-label">{groupLabel(t, g.key)}</div>
          )}
          {g.items.map((it) => {
            const active = isActive(it.href);
            const hasChildren = it.id === "corsi" && courses.length > 0;
            const childCurrent = courses.some((c) => c.href === pathname);
            const showChildren = hasChildren && (active || childCurrent) && corsiOpen;
            const staticChildren = it.children ?? [];
            const staticChildActive = staticChildren.some((ch) => isActive(ch.href));
            const showStaticChildren =
              staticChildren.length > 0 && (active || staticChildActive);
            const count = counts[it.id];
            return (
              <Fragment key={it.id}>
                <Link
                  href={it.href}
                  className={`sb-link ${active ? "active" : ""}`}
                  onClick={
                    hasChildren
                      ? () => setCorsiOpen((o) => (active ? !o : true))
                      : undefined
                  }
                >
                  <Icon name={it.icon} size={15} />
                  <span>{itemLabel(t, it.id)}</span>
                  {count !== undefined && (
                    <span className="sb-link-count">{count}</span>
                  )}
                  {hasChildren && (active || childCurrent) && (
                    <Icon
                      name="chevron"
                      size={12}
                      className="text-4"
                      style={{
                        marginLeft: 4,
                        flexShrink: 0,
                        transition: "transform var(--dur-fast)",
                        transform: corsiOpen ? "rotate(90deg)" : "none",
                      }}
                    />
                  )}
                </Link>
                {showStaticChildren &&
                  staticChildren.map((ch) => (
                    <Link
                      key={ch.id}
                      href={ch.href}
                      className={`sb-sublink ${isActive(ch.href) ? "active" : ""}`}
                    >
                      <span className="sb-sublink-tick"></span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {itemLabel(t, ch.id)}
                      </span>
                    </Link>
                  ))}
                {showChildren &&
                  courses.map((ch) => (
                    <Link
                      key={ch.id}
                      href={ch.href}
                      className={`sb-sublink ${ch.href === pathname ? "active" : ""}`}
                      title={`${ch.label} · ${ch.meta}`}
                    >
                      <span className="sb-sublink-tick"></span>
                      <span
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          minWidth: 0,
                          gap: 1,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ch.label}
                        </span>
                        <span
                          className="num"
                          style={{
                            fontSize: 9.5,
                            color: "var(--text-4)",
                            letterSpacing: "0.01em",
                          }}
                        >
                          {ch.meta}
                        </span>
                      </span>
                    </Link>
                  ))}
              </Fragment>
            );
          })}
        </div>
      ))}

      <UserSwitcher users={users} />
    </aside>
  );
}

type T = ReturnType<typeof useT>;

function groupLabel(t: T, key: NavGroupKey): string {
  const groups = t.nav.groups as Record<string, string>;
  return groups[key] ?? key;
}

function itemLabel(t: T, id: string): string {
  const items = t.nav.items as Record<string, string>;
  return items[id] ?? id;
}
