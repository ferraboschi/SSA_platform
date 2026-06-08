"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, Badge, Icon, StatusBadge } from "@/components/ui";
import { useT, useLocale, format } from "@/lib/i18n";
import type { CourseListItem, CourseSortKey, SortDir } from "@/lib/corsi";
import { monthIndexIt } from "@/lib/corsi";

const monthShort = (month: string, locale: string) => {
  const idx = monthIndexIt(month);
  if (idx < 0) return month.slice(0, 3);
  return new Intl.DateTimeFormat(locale, { month: "short" })
    .format(new Date(2000, idx, 1))
    .replace(".", "");
};

const barClass = (c: CourseListItem) =>
  c.enrolled < c.minStudents
    ? c.capacity && c.enrolled / c.capacity < 0.2
      ? "danger"
      : "warning"
    : "azzurro";

// Per-course sake-program indicator next to the title:
//  • green  = the sake program/template has been assigned
//  • blue   = not yet assigned, but the course is live (pubblicato) → to do
//  • grey   = not assigned and the course isn't live (draft/past/archived)
function ProgramDot({ c }: { c: CourseListItem }) {
  const t = useT().corsi.catalog;
  const d = c.hasProgram
    ? { color: "var(--success)", title: t.programDone }
    : c.lifecycle === "pubblicato"
      ? { color: "var(--indigo)", title: t.programTodo }
      : { color: "var(--text-mute)", title: t.programNone };
  return (
    <span
      title={d.title}
      aria-label={d.title}
      style={{
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: d.color,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

// ===== Timeline =====

export function TimelineView({ courses }: { courses: CourseListItem[] }) {
  const locale = useLocale();
  const t = useT().corsi.catalog;

  const groups: { year: number; month: string; courses: CourseListItem[] }[] = [];
  const index = new Map<string, number>();
  for (const c of courses) {
    const k = `${c.year}-${c.month}`;
    let gi = index.get(k);
    if (gi === undefined) {
      gi = groups.length;
      index.set(k, gi);
      groups.push({ year: c.year, month: c.month, courses: [] });
    }
    groups[gi].courses.push(c);
  }
  groups.sort((a, b) => a.year - b.year || monthIndexIt(a.month) - monthIndexIt(b.month));

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {groups.map((g, gi) => (
        <div key={`${g.year}-${g.month}`}>
          <div
            style={{
              padding: "14px 20px",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>
              {new Intl.DateTimeFormat(locale, { month: "long" }).format(
                new Date(2000, Math.max(0, monthIndexIt(g.month)), 1),
              )}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{g.year}</span>
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-4)",
                letterSpacing: "var(--ls-caps)",
                textTransform: "uppercase",
              }}
            >
              {format(t.groupSummary, {
                n: g.courses.length,
                e: g.courses.reduce((s, c) => s + c.enrolled, 0),
                r: (g.courses.reduce((s, c) => s + c.revenue, 0) / 1000).toFixed(1),
              })}
            </span>
          </div>
          {g.courses.map((c, ci) => (
            <CourseRow
              key={c.id}
              course={c}
              last={ci === g.courses.length - 1 && gi === groups.length - 1}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CourseRow({ course: c, last }: { course: CourseListItem; last: boolean }) {
  const router = useRouter();
  const locale = useLocale();
  const tr = useT();
  const t = tr.corsi.catalog;
  const pct = c.capacity ? c.enrolled / c.capacity : 0;
  const missing = c.minStudents - c.enrolled;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "52px 1fr 180px 110px 110px",
        gap: 16,
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: last ? "none" : "1px solid var(--border-2)",
        transition: "background var(--dur-fast)",
        cursor: "pointer",
      }}
      onClick={() => router.push(`/corsi/${c.handle}`)}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}
          className="num"
        >
          {c.day}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-4)",
            fontWeight: 600,
            letterSpacing: "var(--ls-caps)",
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          {monthShort(c.month, locale)}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</Badge>
          <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 500 }}>
            {c.mode === "online" ? t.online : t.inPerson}
            {c.days > 1 ? ` · ${format(t.daysSuffix, { n: c.days })}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <ProgramDot c={c} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {c.shortTitle}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            marginTop: 2,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="pin" size={11} />
            {c.city}
          </span>
          <span style={{ color: "var(--text-mute)" }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Avatar name={c.educatorName} initials={c.educatorInitials} size="sm" />
            {c.educatorName}
          </span>
        </div>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="num" style={{ fontWeight: 600 }}>
            {c.enrolled}
            <span style={{ color: "var(--text-4)", fontWeight: 400 }}>/{c.capacity}</span>
          </span>
          <div className={`bar ${barClass(c)}`} style={{ flex: 1 }}>
            <i style={{ width: `${pct * 100}%` }} />
          </div>
        </div>
        <div
          style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 4, fontFamily: "var(--font-mono)" }}
        >
          {format(t.min, { n: c.minStudents })}
          {missing > 0 ? ` · ${format(t.missing, { n: missing })}` : ""}
        </div>
      </div>
      <div>
        {c.lifecycle === "pubblicato" && <StatusBadge status={c.status} label={tr.status[c.status]} />}
        {c.lifecycle === "passato" && c.examPassed !== null && (
          <Badge tone="success">{format(t.promossi, { p: c.examPassed, e: c.enrolled })}</Badge>
        )}
        {c.lifecycle === "bozza" && <Badge tone="neutral">{t.draft}</Badge>}
        {c.lifecycle === "archiviato" && <Badge tone="danger">{t.archived}</Badge>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>
          {(c.revenue / 1000).toFixed(1)}k €
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: c.margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)",
            marginTop: 2,
            fontWeight: 500,
          }}
        >
          {c.margin >= 0 ? "+" : ""}
          {format(t.marginShort, { x: (c.margin / 1000).toFixed(1) })}
        </div>
      </div>
    </div>
  );
}

// ===== Grid =====

export function GridView({ courses }: { courses: CourseListItem[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {courses.map((c) => (
        <CourseCard key={c.id} course={c} />
      ))}
    </div>
  );
}

function CourseCard({ course: c }: { course: CourseListItem }) {
  const locale = useLocale();
  const tr = useT();
  const t = tr.corsi.catalog;
  const pct = c.capacity ? c.enrolled / c.capacity : 0;
  const fullMonth = new Intl.DateTimeFormat(locale, { month: "long" }).format(
    new Date(2000, Math.max(0, monthIndexIt(c.month)), 1),
  );

  return (
    <Link
      href={`/corsi/${c.handle}`}
      className="card"
      style={{ overflow: "hidden", display: "block" }}
    >
      <div style={{ padding: "18px 18px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</Badge>
          {c.lifecycle === "pubblicato" && <StatusBadge status={c.status} label={tr.status[c.status]} />}
          {c.lifecycle === "passato" && <Badge tone="success">{t.concluso}</Badge>}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-4)",
            fontWeight: 600,
            letterSpacing: "var(--ls-caps)",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {c.day} {fullMonth} · {c.city}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <ProgramDot c={c} />
          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
            {c.shortTitle}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{c.educatorName}</div>
      </div>
      <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {c.enrolled}
            <span style={{ color: "var(--text-4)", fontWeight: 400 }}>/{c.capacity}</span>
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t.iscrittiLabel}</span>
        </div>
        <div className={`bar ${barClass(c)}`}>
          <i style={{ width: `${pct * 100}%` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>
          <span>{format(t.min, { n: c.minStudents })}</span>
          <span className="num">
            {(c.revenue / 1000).toFixed(1)}k € · {c.margin >= 0 ? "+" : ""}
            {(c.margin / 1000).toFixed(1)}k
          </span>
        </div>
      </div>
    </Link>
  );
}

// ===== Table =====

interface TableCol {
  key: string;
  label: string;
  w: number;
  sort?: CourseSortKey;
  align?: "right";
}

export function TableView({
  courses,
  sortKey,
  sortDir,
  onSort,
}: {
  courses: CourseListItem[];
  sortKey: CourseSortKey;
  sortDir: SortDir;
  onSort: (key: CourseSortKey) => void;
}) {
  const t = useT().corsi.catalog;
  const COLS: TableCol[] = [
    { key: "date", label: t.thDate, w: 96, sort: "date" },
    { key: "type", label: t.thType, w: 84, sort: "type" },
    { key: "title", label: t.thCourse, w: 220, sort: "title" },
    { key: "city", label: t.thCity, w: 120, sort: "city" },
    { key: "educator", label: t.thEducator, w: 160, sort: "educator" },
    { key: "enrolled", label: t.thEnrolled, w: 160, sort: "enrolled" },
    { key: "status", label: t.thStatus, w: 130, sort: "status" },
    { key: "revenue", label: t.thRevenue, w: 116, sort: "revenue", align: "right" },
    { key: "margin", label: t.thMargin, w: 124, sort: "margin", align: "right" },
    { key: "actions", label: "", w: 44 },
  ];

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    let saved: Record<string, number> = {};
    try {
      saved = JSON.parse(localStorage.getItem("ssa_corsi_colw") || "{}") || {};
    } catch {
      /* ignore */
    }
    const o: Record<string, number> = {};
    COLS.forEach((c) => (o[c.key] = saved[c.key] || c.w));
    return o;
  });
  useEffect(() => {
    try {
      localStorage.setItem("ssa_corsi_colw", JSON.stringify(widths));
    } catch {
      /* ignore */
    }
  }, [widths]);
  const total = COLS.reduce((s, c) => s + (widths[c.key] || c.w), 0);

  const startResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    const onMove = (ev: MouseEvent) =>
      setWidths((prev) => ({ ...prev, [key]: Math.max(56, startW + (ev.clientX - startX)) }));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.setProperty("cursor", "");
      document.body.style.setProperty("user-select", "");
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");
  };

  return (
    <div className="table-wrap" style={{ overflowX: "auto" }}>
      <table className="table" style={{ tableLayout: "fixed", width: total }}>
        <colgroup>
          {COLS.map((c) => (
            <col key={c.key} style={{ width: widths[c.key] }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLS.map((c) => {
              const active = c.sort && sortKey === c.sort;
              return (
                <th
                  key={c.key}
                  onClick={c.sort ? () => onSort(c.sort!) : undefined}
                  style={{
                    position: "relative",
                    textAlign: c.align || "left",
                    cursor: c.sort ? "pointer" : "default",
                    userSelect: "none",
                    color: active ? "var(--text)" : undefined,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      verticalAlign: "middle",
                    }}
                  >
                    {c.label}
                    {c.sort && (
                      <span style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>
                        {active && sortDir === "asc" ? "▲" : active && sortDir === "desc" ? "▼" : "⇅"}
                      </span>
                    )}
                  </span>
                  {c.key !== "actions" && (
                    <span
                      onMouseDown={(e) => startResize(c.key, e)}
                      onClick={(e) => e.stopPropagation()}
                      title={t.colResizeTip}
                      className="col-resize-handle"
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        height: "100%",
                        width: 9,
                        cursor: "col-resize",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{ width: 2, height: 13, borderRadius: 2, background: "var(--border)" }} />
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <CourseTableRow key={c.id} course={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CourseTableRow({ course: c }: { course: CourseListItem }) {
  const router = useRouter();
  const locale = useLocale();
  const tr = useT();
  const t = tr.corsi.catalog;
  return (
    <tr className="clickable" onClick={() => router.push(`/corsi/${c.handle}`)}>
      <td className="num" style={{ whiteSpace: "nowrap" }}>
        <strong>{c.day}</strong>{" "}
        <span className="text-3">
          {monthShort(c.month, locale)} {c.year}
        </span>
      </td>
      <td>
        <Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</Badge>
      </td>
      <td style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, maxWidth: "100%" }}>
          <ProgramDot c={c} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.shortTitle}
          </span>
        </span>
      </td>
      <td className="text-3" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {c.city}
      </td>
      <td className="text-3" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {c.educatorName}
      </td>
      <td style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="num" style={{ minWidth: 36 }}>
            {c.enrolled}/{c.capacity}
          </span>
          <div className={`bar ${c.enrolled < c.minStudents ? "warning" : "azzurro"}`} style={{ flex: 1 }}>
            <i style={{ width: `${c.capacity ? (c.enrolled / c.capacity) * 100 : 0}%` }} />
          </div>
        </div>
      </td>
      <td>
        {c.lifecycle === "pubblicato" ? (
          <StatusBadge status={c.status} label={tr.status[c.status]} />
        ) : c.lifecycle === "passato" ? (
          <Badge tone="success">{t.concluso}</Badge>
        ) : c.lifecycle === "bozza" ? (
          <Badge tone="neutral">{t.draft}</Badge>
        ) : (
          <Badge tone="danger">{t.archived}</Badge>
        )}
      </td>
      <td className="num" style={{ textAlign: "right" }}>
        {c.revenue.toLocaleString(locale)} €
      </td>
      <td
        className="num"
        style={{ textAlign: "right", color: c.margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}
      >
        {c.margin >= 0 ? "+" : ""}
        {c.margin.toLocaleString(locale)} €
      </td>
      <td onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <Link className="btn btn-icon btn-sm btn-ghost" href={`/corsi/${c.handle}`} title={t.openDetail}>
          <Icon name="arrow" size={13} />
        </Link>
      </td>
    </tr>
  );
}
