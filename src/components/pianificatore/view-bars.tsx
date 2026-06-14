"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { type CourseTypeKey } from "@/lib/domain";
import { TYPE_COLORS, monthCourses } from "@/lib/pianificatore";
import type { ViewProps } from "./types";
import { plDrop } from "./view-shared";

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

export { PL_BarsByTypeView };
