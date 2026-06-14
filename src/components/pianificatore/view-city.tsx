"use client";

import { Fragment, useState } from "react";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { CITIES } from "@/lib/domain";
import { TYPE_COLORS, dateSummary, HUB_CITIES } from "@/lib/pianificatore";
import type { ViewProps } from "./types";
import { plDrop, cellHead, cellLabel } from "./view-shared";

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

export { PL_CityMonthGridView };
