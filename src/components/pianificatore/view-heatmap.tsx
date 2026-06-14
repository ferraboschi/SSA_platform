"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { TYPE_COLORS, dateSummary, monthCourses } from "@/lib/pianificatore";
import type { ViewProps } from "./types";
import { plDrop } from "./view-shared";

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

export { PL_HeatmapView };
