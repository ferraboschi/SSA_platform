"use client";

import { Fragment, useState } from "react";
import { Avatar } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { TYPE_COLORS, dateSummary } from "@/lib/pianificatore";
import type { ViewProps } from "./types";
import { plDrop, cellHead, cellLabel } from "./view-shared";

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

export { PL_EducatorMonthGridView };
