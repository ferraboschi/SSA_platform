"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { NavGroup, NavGroupKey } from "@/lib/auth";
import type { User } from "@/lib/domain";
import type { SidebarCourse } from "@/lib/shell";
import { UserSwitcher } from "./UserSwitcher";

interface SidebarProps {
  nav: NavGroup[];
  counts: Record<string, number>;
  courses: SidebarCourse[];
  users: User[];
  open?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ nav, counts, courses, users, open, onNavigate }: SidebarProps) {
  const t = useT();
  const pathname = usePathname();
  const [corsiOpen, setCorsiOpen] = useState(true);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <Link className="sb-brand" href="/dashboard" onClick={onNavigate}>
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
                  onClick={() => {
                    if (hasChildren) setCorsiOpen((o) => (active ? !o : true));
                    onNavigate?.();
                  }}
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
                      <SidebarCourseDots c={ch} />
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

function SbDot({ color, title }: { color: string; title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }}
    />
  );
}

// Two status dots before each sidebar course (same rules as the catalog):
//  • Programma — 🟢 assigned · ⚪ not assigned
//  • Stato     — 🔴 missing educator/venue/date · 🔵 everything assigned · none
function SidebarCourseDots({ c }: { c: SidebarCourse }) {
  const t = useT().corsi.catalog;
  const program = c.hasProgram
    ? { color: "var(--success)", title: t.programDone }
    : { color: "var(--text-mute)", title: t.programNone };

  const missing: string[] = [];
  if (c.missEducator) missing.push(t.missEducator);
  if (c.missLocation) missing.push(t.missLocation);
  if (c.missDate) missing.push(t.missDate);

  let status: { color: string; title: string } | null = null;
  if (missing.length > 0) {
    status = { color: "var(--danger)", title: format(t.statusMissing, { what: missing.join(", ") }) };
  } else if (c.hasProgram) {
    status = { color: "var(--indigo)", title: t.statusReady };
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <SbDot {...program} />
      {status && <SbDot {...status} />}
    </span>
  );
}
