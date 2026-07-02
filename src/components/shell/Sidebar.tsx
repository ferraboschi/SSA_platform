"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { courseSignal } from "@/lib/corsi/course-signal";
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
                  courses.map((ch) => {
                    const courseActive = ch.href === pathname;
                    return (
                      <Fragment key={ch.id}>
                        <Link
                          href={ch.href}
                          className={`sb-sublink ${courseActive ? "active" : ""}`}
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
                        {/* Active course expands to its own People / Programme /
                            Exam structure — the same tabs as the detail page,
                            deep-linked via ?tab=. "Esame" only when the course
                            type bears an exam (certificato/shochu). */}
                        {courseActive &&
                          courseSections(t, ch).map((s) => (
                            <Link
                              key={s.id}
                              href={s.href}
                              className="sb-subsublink"
                              onClick={onNavigate}
                            >
                              <span className="sb-subsublink-tick" />
                              <span>{s.label}</span>
                            </Link>
                          ))}
                      </Fragment>
                    );
                  })}
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

// Per-course sub-sections mirrored from the detail-page tabs. "Esame" is only
// offered for exam-bearing course types (examFamily set); introduttivo has none.
function courseSections(
  t: T,
  ch: SidebarCourse,
): { id: string; label: string; href: string }[] {
  const d = t.corsi.detail;
  const secs = [
    { id: "iscritti", label: d.tabIscritti, href: `${ch.href}?tab=iscritti` },
    { id: "programma", label: d.tabProgramma, href: `${ch.href}?tab=programma` },
  ];
  if (ch.examFamily) {
    secs.push({ id: "esame", label: d.tabEsame, href: `${ch.href}?tab=esame` });
  }
  return secs;
}

// Two status icons before each sidebar course — same two orthogonal axes as the
// catalog (see course-signal.ts): completeness (✓ green / ⚠ red) + materials
// (📖 blue assigned / 📖 grey not). Both always shown so state reads at a glance.
function SidebarCourseDots({ c }: { c: SidebarCourse }) {
  const t = useT().corsi.catalog;
  const s = courseSignal(c);

  const completenessTip = s.completeness.complete
    ? t.signalReadyTip
    : format(t.signalMissingTip, {
        what: s.completeness.missing.map((k) => t[k]).join(", "),
      });
  const materialsTip = c.hasProgram ? t.signalMaterialsOn : t.signalMaterialsOff;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <span title={completenessTip} aria-label={completenessTip} style={{ display: "inline-flex", color: s.completeness.color }}>
        <Icon name={s.completeness.icon} size={13} />
      </span>
      <span title={materialsTip} aria-label={materialsTip} style={{ display: "inline-flex", color: s.materials.color }}>
        <Icon name={s.materials.icon} size={13} />
      </span>
    </span>
  );
}
