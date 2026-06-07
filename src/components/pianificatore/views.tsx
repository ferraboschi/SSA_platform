"use client";

import { Fragment, useState, type CSSProperties, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { CITIES, type CourseTypeKey } from "@/lib/domain";
import {
  TYPE_COLORS,
  dateSummary,
  monthCourses,
  HUB_CITIES,
  type PlannerItem,
} from "@/lib/pianificatore";
import type { AddExtra, ViewProps } from "./types";

// ---------- Drop helper ----------
function plDrop(
  onDropMonth: ViewProps["onDropMonth"],
  year: number | null,
  mIdx: number,
  extra?: AddExtra,
) {
  return {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) onDropMonth(id, year, mIdx, extra || {});
    },
  };
}

// ---------- Agenda card (monthly view) ----------
function PL_AgendaCard({
  c,
  onChipClick,
}: {
  c: PlannerItem;
  onChipClick: ViewProps["onChipClick"];
}) {
  const t = useT().pianificatore;
  const tc = TYPE_COLORS[c.type];
  const planned = c.kind === "planned";
  const summary = dateSummary(c, t.common.appointments);
  return (
    <div
      draggable={planned}
      onDragStart={
        planned
          ? (e) => {
              e.dataTransfer.setData("text/plain", c.id);
              e.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      onClick={() => onChipClick(c)}
      title={`${c.typeLabel}${c.city ? " · " + c.city : ""} · ${summary}${c.educator ? " · " + c.educator.name : ""}`}
      style={{
        width: "100%",
        background: planned ? "transparent" : tc.soft,
        backgroundImage: planned
          ? "repeating-linear-gradient(45deg, rgba(20,40,80,0.045) 0 5px, transparent 5px 11px)"
          : "none",
        border: planned ? `1.5px dashed ${tc.solid}` : "1px solid transparent",
        borderLeft: `3px solid ${tc.solid}`,
        borderRadius: 7,
        padding: "8px 10px",
        cursor: planned ? "grab" : "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        opacity: planned ? 0.9 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            color: tc.ink,
            background: planned ? tc.soft : "var(--surface)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {c.typeShort}
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text)",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {c.city || t.views.cityTbd}
        </span>
        {planned && (
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 8.5,
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: tc.ink,
                border: `1px dashed ${tc.solid}`,
                borderRadius: 4,
                padding: "1px 4px",
              }}
            >
              {t.views.plannedBadge}
            </span>
            <Icon name="grip" size={11} className="text-4" />
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-2)",
        }}
      >
        <Icon name="calendar" size={11} className="text-4" />
        <span
          className="num"
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {summary}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 9.5,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            color: c.mode === "online" ? "var(--indigo-600)" : "var(--text-4)",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          <Icon name={c.mode === "online" ? "globe" : "pin"} size={10} />
          {c.mode === "online" ? t.common.online : t.common.presenceShort}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {c.educator ? (
          <>
            <Avatar name={c.educator.name} initials={c.educator.initials} size="sm" />
            <span
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {c.educator.name}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 10.5, color: "var(--text-mute)", fontStyle: "italic" }}>
            {t.common.educatorTbd}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 1) HEATMAP
// ============================================================
function PL_HeatmapView({ win, courses, onDropMonth, onRequestAdd, onChipClick }: ViewProps) {
  const t = useT().pianificatore;
  const [over, setOver] = useState<string | null>(null);
  const counts = win.map((w) => monthCourses(courses, w.year, w.mIdx).length);
  const max = Math.max(3, ...counts);
  const shade = (n: number) => {
    if (n === 0) return { bg: "var(--surface)", border: "1px dashed var(--border)" };
    const frac = 0.12 + 0.7 * (n / max);
    return {
      bg: `color-mix(in oklab, var(--indigo) ${Math.round(frac * 100)}%, var(--surface))`,
      border: "1px solid transparent",
    };
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
      {win.map((w) => {
        const cs = monthCourses(courses, w.year, w.mIdx);
        const seats = cs.reduce((s, c) => s + c.enrolled, 0);
        const sh = shade(cs.length);
        const isOver = over === w.key;
        const dark = cs.length > max * 0.55;
        return (
          <div
            key={w.key}
            {...plDrop(onDropMonth, w.year, w.mIdx)}
            onDragEnter={() => setOver(w.key)}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOver(null);
            }}
            onDrop={(e) => {
              setOver(null);
              plDrop(onDropMonth, w.year, w.mIdx).onDrop(e);
            }}
            style={{
              borderRadius: 10,
              padding: 12,
              minHeight: 104,
              background: isOver ? "var(--indigo-50)" : sh.bg,
              border: isOver ? "2px solid var(--indigo)" : sh.border,
              transition: "background var(--dur-fast), border-color var(--dur-fast)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: dark ? "white" : "var(--text)" }}>
                  {w.name}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: dark ? "rgba(255,255,255,0.7)" : "var(--text-4)",
                    marginLeft: 5,
                  }}
                >
                  {w.year}
                </span>
                {w.isCurrent && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      color: "var(--indigo-600)",
                      background: "var(--surface)",
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}
                  >
                    {t.common.today}
                  </span>
                )}
              </div>
              <span
                className="num"
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: cs.length === 0 ? "var(--text-mute)" : dark ? "white" : "var(--text)",
                }}
              >
                {cs.length}
              </span>
            </div>
            {cs.length === 0 ? (
              <button
                onClick={() => onRequestAdd(w.year, w.mIdx)}
                title={format(t.views.addTip, { month: w.name, year: w.year })}
                style={{
                  width: "100%",
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  padding: "8px",
                  borderRadius: 6,
                  border: "1px dashed var(--border)",
                  background: "transparent",
                  color: "var(--text-mute)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.setProperty("border-color", "var(--indigo)");
                  e.currentTarget.style.setProperty("color", "var(--indigo-600)");
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.setProperty("border-color", "var(--border)");
                  e.currentTarget.style.setProperty("color", "var(--text-mute)");
                }}
              >
                <Icon name="plus" size={12} />
                {t.views.gapAdd}
              </button>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {cs.map((c) => {
                    const tc = TYPE_COLORS[c.type];
                    return (
                      <span
                        key={c.id}
                        title={`${c.typeLabel}${c.city ? " · " + c.city : ""} · ${dateSummary(c, t.common.appointments)}${c.educator ? " · " + c.educator.name : ""}`}
                        onClick={() => onChipClick(c)}
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: tc.solid,
                          border:
                            c.kind === "planned"
                              ? `1.5px dashed ${dark ? "white" : tc.ink}`
                              : "none",
                          cursor: "pointer",
                        }}
                      />
                    );
                  })}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 8,
                  }}
                >
                  <div
                    className="num"
                    style={{
                      fontSize: 10.5,
                      color: dark ? "rgba(255,255,255,0.85)" : "var(--text-3)",
                    }}
                  >
                    {format(t.views.seats, { n: seats })}
                  </div>
                  <button
                    onClick={() => onRequestAdd(w.year, w.mIdx)}
                    title={format(t.views.addTip, { month: w.name, year: w.year })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "2px 7px",
                      borderRadius: 5,
                      border: "none",
                      background: dark ? "rgba(255,255,255,0.22)" : "var(--surface)",
                      color: dark ? "white" : "var(--indigo-600)",
                      cursor: "pointer",
                      fontSize: 10.5,
                      fontFamily: "inherit",
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="plus" size={11} />
                    {t.views.addCourseShort}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 2) MONTHLY (timeline)
// ============================================================
function PL_TimelineView({ win, courses, onDropMonth, onRequestAdd, onChipClick }: ViewProps) {
  const t = useT().pianificatore;
  const [over, setOver] = useState<string | null>(null);
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        overflowX: "auto",
        border: "1px solid var(--border-2)",
        borderRadius: 8,
      }}
    >
      {win.map((w, i) => {
        const cs = monthCourses(courses, w.year, w.mIdx).sort(
          (a, b) => (a.day ?? 0) - (b.day ?? 0),
        );
        const seats = cs.reduce((s, c) => s + c.enrolled, 0);
        const isOver = over === w.key;
        const countLabel = cs.length
          ? cs.length === 1
            ? format(t.views.coursesOne, { n: cs.length, seats })
            : format(t.views.coursesMany, { n: cs.length, seats })
          : t.views.noCourses;
        return (
          <div
            key={w.key}
            {...plDrop(onDropMonth, w.year, w.mIdx)}
            onDragEnter={() => setOver(w.key)}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOver(null);
            }}
            onDrop={(e) => {
              setOver(null);
              plDrop(onDropMonth, w.year, w.mIdx).onDrop(e);
            }}
            style={{
              flex: "0 0 226px",
              width: 226,
              borderRight: i < 11 ? "1px solid var(--border-2)" : "none",
              background: isOver
                ? "var(--indigo-50)"
                : w.isCurrent
                  ? "var(--surface-2)"
                  : "var(--surface)",
              display: "flex",
              flexDirection: "column",
              transition: "background var(--dur-fast)",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border-2)",
                position: "sticky",
                top: 0,
                background: "inherit",
                zIndex: 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: w.isCurrent ? "var(--indigo-600)" : "var(--text)",
                  }}
                >
                  {w.name}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>{w.year}</span>
                {w.isCurrent && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      color: "var(--indigo-600)",
                      background: "var(--indigo-50)",
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}
                  >
                    {t.common.today}
                  </span>
                )}
              </div>
              <span
                className="num"
                style={{ fontSize: 10.5, color: cs.length ? "var(--text-3)" : "var(--text-mute)" }}
              >
                {countLabel}
              </span>
            </div>
            <div
              style={{
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 210,
                flex: 1,
              }}
            >
              {cs.map((c) => (
                <PL_AgendaCard key={c.id} c={c} onChipClick={onChipClick} />
              ))}
              <button
                onClick={() => onRequestAdd(w.year, w.mIdx)}
                title={format(t.views.addTip, { month: w.name, year: w.year })}
                style={{
                  marginTop: "auto",
                  minHeight: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderRadius: 7,
                  border: "1px dashed var(--border)",
                  background: "transparent",
                  color: "var(--text-4)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.setProperty("border-color", "var(--indigo)");
                  e.currentTarget.style.setProperty("color", "var(--indigo-600)");
                  e.currentTarget.style.setProperty("background", "var(--surface)");
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.setProperty("border-color", "var(--border)");
                  e.currentTarget.style.setProperty("color", "var(--text-4)");
                  e.currentTarget.style.setProperty("background", "transparent");
                }}
              >
                <Icon name="plus" size={13} />
                {t.views.addCourse}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 3) BARS BY TYPE
// ============================================================
function PL_BarsByTypeView({
  win,
  courses,
  onDropMonth,
  onRequestAdd,
  types,
  typeLabels,
}: ViewProps & { types: CourseTypeKey[]; typeLabels: Record<CourseTypeKey, string> }) {
  const t = useT().pianificatore;
  const router = useRouter();
  const [over, setOver] = useState<string | null>(null);
  const data = win.map((w) => {
    const cs = monthCourses(courses, w.year, w.mIdx);
    const byType = {} as Record<CourseTypeKey, number>;
    types.forEach((ty) => (byType[ty] = cs.filter((c) => c.type === ty).length));
    return { w, total: cs.length, byType };
  });
  const max = Math.max(3, ...data.map((d) => d.total));
  const H = 168;
  // Click a bar segment → open Corsi pre-filtered by that type (back returns here).
  const openCourses = (ty: CourseTypeKey) =>
    router.push(`/corsi?type=${ty}&from=pianificatore`);
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        {types.map((ty) => {
          const tc = TYPE_COLORS[ty];
          return (
            <div
              key={ty}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-2)" }}
            >
              <span style={{ width: 11, height: 11, borderRadius: 3, background: tc.solid }} />
              {typeLabels[ty]}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: H + 96, paddingTop: 4 }}>
        {data.map((d) => {
          const isOver = over === d.w.key;
          return (
            <div
              key={d.w.key}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                height: "100%",
                justifyContent: "flex-end",
              }}
              {...plDrop(onDropMonth, d.w.year, d.w.mIdx)}
              onDragEnter={() => setOver(d.w.key)}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setOver(null);
              }}
              onDrop={(e) => {
                setOver(null);
                plDrop(onDropMonth, d.w.year, d.w.mIdx).onDrop(e);
              }}
            >
              <span
                className="num"
                style={{ fontSize: 12, fontWeight: 700, color: d.total === 0 ? "var(--text-mute)" : "var(--text-2)" }}
              >
                {d.total || ""}
              </span>
              <div
                style={{
                  width: "100%",
                  maxWidth: 46,
                  height: H,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  gap: 2,
                  borderRadius: 6,
                  background: isOver ? "var(--indigo-50)" : "transparent",
                  outline: isOver ? "2px solid var(--indigo)" : "none",
                  padding: isOver ? 2 : 0,
                }}
              >
                {d.total === 0 ? (
                  <div style={{ height: 4, borderRadius: 2, background: "var(--border-2)" }} />
                ) : (
                  types.map((ty) => {
                    const n = d.byType[ty];
                    if (!n) return null;
                    const tc = TYPE_COLORS[ty];
                    return (
                      <div
                        key={ty}
                        role="button"
                        tabIndex={0}
                        title={`${typeLabels[ty]}: ${n} — apri i corsi`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openCourses(ty);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openCourses(ty);
                          }
                        }}
                        style={{
                          height: (n / max) * H,
                          background: tc.solid,
                          borderRadius: 3,
                          minHeight: 6,
                          cursor: "pointer",
                        }}
                      />
                    );
                  })
                )}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: d.w.isCurrent ? "var(--indigo-600)" : "var(--text-4)",
                  fontWeight: d.w.isCurrent ? 700 : 500,
                  textTransform: "uppercase",
                }}
              >
                {d.w.short}
              </div>
              <button
                onClick={() => onRequestAdd(d.w.year, d.w.mIdx)}
                title={format(t.views.addTip, { month: d.w.name, year: d.w.year })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  border: "1px dashed var(--border)",
                  background: "transparent",
                  color: "var(--text-4)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.setProperty("border-color", "var(--indigo)");
                  e.currentTarget.style.setProperty("color", "var(--indigo-600)");
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.setProperty("border-color", "var(--border)");
                  e.currentTarget.style.setProperty("color", "var(--text-4)");
                }}
              >
                <Icon name="plus" size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 4) CITY × MONTH GRID
// ============================================================
function PL_CityMonthGridView({ win, courses, onDropMonth, onRequestAdd, onChipClick }: ViewProps) {
  const t = useT().pianificatore;
  const [over, setOver] = useState<string | null>(null);
  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `132px repeat(12, minmax(58px, 1fr))`,
          minWidth: 760,
        }}
      >
        <div style={cellHead} />
        {win.map((w) => (
          <div key={w.key} style={{ ...cellHead, textAlign: "center" }}>
            <span style={{ color: w.isCurrent ? "var(--indigo-600)" : undefined, fontWeight: w.isCurrent ? 700 : 600 }}>
              {w.short}
            </span>
            <div style={{ fontSize: 8.5, color: "var(--text-4)", fontWeight: 400 }}>{String(w.year).slice(2)}</div>
          </div>
        ))}
        {CITIES.map((city) => {
          const isHub = HUB_CITIES.includes(city);
          const rowTot = courses.filter((c) => c.placed && c.city === city && c.mIdx !== null).length;
          return (
            <Fragment key={city}>
              <div style={{ ...cellLabel, color: rowTot === 0 ? "var(--text-4)" : "var(--text)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name={city === "Online" ? "globe" : "pin"} size={11} className="text-4" />
                  {city}
                  {isHub && (
                    <span style={{ fontSize: 8.5, color: "var(--text-mute)", fontWeight: 600 }}>{t.views.hub}</span>
                  )}
                </span>
                <span
                  className="num"
                  style={{ fontSize: 11, color: rowTot === 0 ? "var(--text-mute)" : "var(--text-2)", fontWeight: 600 }}
                >
                  {rowTot}
                </span>
              </div>
              {win.map((w) => {
                const cs = courses.filter(
                  (c) => c.placed && c.city === city && c.year === w.year && c.mIdx === w.mIdx,
                );
                const key = city + "|" + w.key;
                const isOver = over === key;
                return (
                  <div
                    key={key}
                    {...plDrop(onDropMonth, w.year, w.mIdx, { city })}
                    onDragEnter={() => setOver(key)}
                    onDragLeave={(e) => {
                      if (e.currentTarget === e.target) setOver(null);
                    }}
                    onDrop={(e) => {
                      setOver(null);
                      plDrop(onDropMonth, w.year, w.mIdx, { city }).onDrop(e);
                    }}
                    onClick={() => onRequestAdd(w.year, w.mIdx, { city })}
                    title={format(t.views.addCellTip, { city, month: w.name, year: w.year })}
                    style={{
                      borderBottom: "1px solid var(--border-2)",
                      borderRight: "1px solid var(--border-2)",
                      minHeight: 34,
                      padding: 4,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 2,
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      background: isOver ? "var(--indigo-50)" : cs.length ? "transparent" : "var(--surface)",
                    }}
                  >
                    {cs.map((c) => {
                      const tc = TYPE_COLORS[c.type];
                      return (
                        <span
                          key={c.id}
                          title={`${c.typeLabel} · ${dateSummary(c, t.common.appointments)}${c.educator ? " · " + c.educator.name : ""}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onChipClick(c);
                          }}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            background: tc.solid,
                            border: c.kind === "planned" ? `1.5px dashed ${tc.ink}` : "none",
                            cursor: "pointer",
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 5) EDUCATOR × MONTH GRID
// ============================================================
function PL_EducatorMonthGridView({
  win,
  courses,
  educators,
  onDropMonth,
  onRequestAdd,
  onChipClick,
}: ViewProps) {
  const t = useT().pianificatore;
  const [over, setOver] = useState<string | null>(null);
  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `168px repeat(12, minmax(54px, 1fr))`,
          minWidth: 800,
        }}
      >
        <div style={cellHead} />
        {win.map((w) => (
          <div key={w.key} style={{ ...cellHead, textAlign: "center" }}>
            <span style={{ color: w.isCurrent ? "var(--indigo-600)" : undefined, fontWeight: w.isCurrent ? 700 : 600 }}>
              {w.short}
            </span>
          </div>
        ))}
        {educators.map((e) => {
          const eCourses = courses.filter((c) => c.placed && c.educatorId === e.id && c.mIdx !== null);
          const giornate = eCourses.reduce((s, c) => s + (c.days || 1), 0);
          return (
            <Fragment key={e.id}>
              <div style={{ ...cellLabel, gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <Avatar name={e.name} initials={e.initials} size="sm" />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.name}
                  </span>
                </span>
                <span className="num" style={{ fontSize: 10, color: "var(--text-4)", whiteSpace: "nowrap" }}>
                  {format(t.views.eduStat, { c: eCourses.length, g: giornate })}
                </span>
              </div>
              {win.map((w) => {
                const cs = courses.filter(
                  (c) => c.placed && c.educatorId === e.id && c.year === w.year && c.mIdx === w.mIdx,
                );
                const key = e.id + "|" + w.key;
                const isOver = over === key;
                const conflict = cs.length > 1;
                return (
                  <div
                    key={key}
                    {...plDrop(onDropMonth, w.year, w.mIdx, { educatorId: e.id })}
                    onDragEnter={() => setOver(key)}
                    onDragLeave={(ev) => {
                      if (ev.currentTarget === ev.target) setOver(null);
                    }}
                    onDrop={(ev) => {
                      setOver(null);
                      plDrop(onDropMonth, w.year, w.mIdx, { educatorId: e.id }).onDrop(ev);
                    }}
                    onClick={() => onRequestAdd(w.year, w.mIdx, { educatorId: e.id })}
                    title={
                      conflict
                        ? t.views.conflictTip
                        : format(t.views.addEduTip, { name: e.name, month: w.name, year: w.year })
                    }
                    style={{
                      borderBottom: "1px solid var(--border-2)",
                      borderRight: "1px solid var(--border-2)",
                      minHeight: 32,
                      padding: 3,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 2,
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      background: isOver ? "var(--indigo-50)" : conflict ? "var(--danger-bg)" : "var(--surface)",
                    }}
                  >
                    {cs.map((c) => {
                      const tc = TYPE_COLORS[c.type];
                      return (
                        <span
                          key={c.id}
                          title={`${c.typeLabel}${c.city ? " · " + c.city : ""} · ${dateSummary(c, t.common.appointments)}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onChipClick(c);
                          }}
                          style={{
                            width: 13,
                            height: 13,
                            borderRadius: 3,
                            background: tc.solid,
                            border: c.kind === "planned" ? `1.5px dashed ${tc.ink}` : "none",
                            cursor: "pointer",
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

const cellHead: CSSProperties = {
  padding: "8px 6px",
  fontSize: 10.5,
  fontWeight: 600,
  color: "var(--text-3)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-2)",
  position: "sticky",
  top: 0,
};
const cellLabel: CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text)",
  borderBottom: "1px solid var(--border-2)",
  background: "var(--surface)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

export const PL_Views = {
  Heatmap: PL_HeatmapView,
  Timeline: PL_TimelineView,
  BarsByType: PL_BarsByTypeView,
  CityMonthGrid: PL_CityMonthGridView,
  EducatorMonthGrid: PL_EducatorMonthGridView,
};
