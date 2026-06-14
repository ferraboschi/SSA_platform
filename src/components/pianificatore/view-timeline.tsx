"use client";

import { useState } from "react";
import { Avatar, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { TYPE_COLORS, dateSummary, monthCourses, type PlannerItem } from "@/lib/pianificatore";
import type { ViewProps } from "./types";
import { plDrop } from "./view-shared";

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
// 2) MONTHLY (timeline)
// ============================================================
// Week buckets within a month (by day-of-month) for the "Settimane" grouping.
const WEEK_BUCKETS = [
  { lo: 1, hi: 7, label: "1–7" },
  { lo: 8, hi: 14, label: "8–14" },
  { lo: 15, hi: 21, label: "15–21" },
  { lo: 22, hi: 28, label: "22–28" },
  { lo: 29, hi: 31, label: "29–31" },
];
function groupByWeek<T extends { day?: number | null }>(cs: T[]) {
  return WEEK_BUCKETS.map((b) => ({
    label: b.label,
    items: cs.filter((c) => {
      const d = c.day ?? 1;
      return d >= b.lo && d <= b.hi;
    }),
  })).filter((g) => g.items.length > 0);
}

function PL_TimelineView({ win, courses, onDropMonth, onRequestAdd, onChipClick }: ViewProps) {
  const t = useT().pianificatore;
  const [over, setOver] = useState<string | null>(null);
  const [byWeek, setByWeek] = useState(false);
  return (
    <div>
      {/* Mese / Settimane grouping toggle. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--border-2)", borderRadius: 8, overflow: "hidden" }}>
          {([["Mese", false], ["Settimane", true]] as const).map(([label, val]) => (
            <button
              key={label}
              onClick={() => setByWeek(val)}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "inherit",
                border: "none",
                cursor: "pointer",
                background: byWeek === val ? "var(--indigo-600)" : "transparent",
                color: byWeek === val ? "#fff" : "var(--text-3)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
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
              {byWeek
                ? groupByWeek(cs).map((g) => (
                    <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--text-4)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          paddingTop: 2,
                        }}
                      >
                        {g.label}
                      </div>
                      {g.items.map((c) => (
                        <PL_AgendaCard key={c.id} c={c} onChipClick={onChipClick} />
                      ))}
                    </div>
                  ))
                : cs.map((c) => (
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
    </div>
  );
}

export { PL_TimelineView };
