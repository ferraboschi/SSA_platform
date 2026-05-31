"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Icon, type IconName } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { CITIES, type CourseTypeKey } from "@/lib/domain";
import {
  MONTHS_SHORT,
  HUB_CITIES,
  NON_CITIES,
  TYPE_COLORS,
  keyOf,
  type PlannerEducator,
  type PlannerItem,
  type WindowMonth,
} from "@/lib/pianificatore";
import type { PrevYearItem } from "@/app/(app)/pianificatore/page";

const plDate = (c: PlannerItem) => new Date(c.year ?? 0, c.mIdx ?? 0, c.day || 1);
const plDayGap = (a: PlannerItem, b: PlannerItem) =>
  Math.abs(Math.round((plDate(a).getTime() - plDate(b).getTime()) / 86400000));

const SIGNAL_TONES: Record<string, { bg: string; fg: string }> = {
  warning: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
  danger: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
  indigo: { bg: "var(--indigo-50)", fg: "var(--indigo-600)" },
  oro: { bg: "var(--oro-bg)", fg: "#8A6E1A" },
};

function SignalSection({
  icon,
  tone,
  title,
  count,
  children,
}: {
  icon: IconName;
  tone: keyof typeof SIGNAL_TONES;
  title: string;
  count: number;
  children: ReactNode;
}) {
  const tn = SIGNAL_TONES[tone] || SIGNAL_TONES.indigo;
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRight: "1px solid var(--border-2)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 22,
            height: 22,
            borderRadius: 5,
            background: tn.bg,
            color: tn.fg,
          }}
        >
          <Icon name={icon} size={12} />
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em" }}>
          {title}
        </span>
        <span
          className="num"
          style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: count ? tn.fg : "var(--text-mute)" }}
        >
          {count}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

// ============================================================
// ENGAGEMENT
// ============================================================
export function PL_EngagementPanel({
  courses,
  educators,
}: {
  courses: PlannerItem[];
  educators: PlannerEducator[];
}) {
  const t = useT().pianificatore.engagement;
  const router = useRouter();
  const rows = educators
    .map((e) => {
      const cs = courses.filter((c) => c.placed && c.educatorId === e.id && c.mIdx !== null);
      const giornate = cs.reduce((s, c) => s + (c.days || 1), 0);
      const cities = Array.from(new Set(cs.map((c) => c.city).filter(Boolean)));
      const real = cs.filter((c) => c.kind === "real" && c.capacity > 0);
      const occ = real.length
        ? Math.round((real.reduce((s, c) => s + c.enrolled / c.capacity, 0) / real.length) * 100)
        : null;
      return {
        e,
        n: cs.length,
        giornate,
        cities,
        occ,
        planned: cs.filter((c) => c.kind === "planned").length,
      };
    })
    .sort((a, b) => b.giornate - a.giornate);
  const maxG = Math.max(1, ...rows.map((r) => r.giornate));

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="h3">{t.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{t.sub}</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => router.push("/educator")}>
          {t.team}
          <Icon name="arrow" size={11} />
        </button>
      </div>
      <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t.colEducator}</th>
              <th style={{ width: 70, textAlign: "center" }}>{t.colCourses}</th>
              <th style={{ width: 180 }}>{t.colDays}</th>
              <th style={{ width: 150 }}>{t.colCities}</th>
              <th style={{ width: 130 }}>{t.colOccupancy}</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const over = r.giornate >= 12;
              const idle = r.n === 0;
              return (
                <tr key={r.e.id} className="clickable" onClick={() => router.push(`/educator/${r.e.id}`)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={r.e.name} initials={r.e.initials} size="sm" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.e.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{r.e.city}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {r.n}
                    </span>
                    {r.planned > 0 && (
                      <span className="num" style={{ fontSize: 10, color: "var(--indigo-600)", marginLeft: 3 }}>
                        +{r.planned}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="num" style={{ minWidth: 26, fontWeight: 600 }}>
                        {r.giornate}
                      </span>
                      <div className={`bar ${over ? "warning" : "azzurro"}`} style={{ flex: 1 }}>
                        <i style={{ width: (r.giornate / maxG) * 100 + "%" }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    {r.cities.length === 0 ? (
                      <span style={{ fontSize: 11.5, color: "var(--text-mute)" }}>—</span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>
                          {r.cities.length}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-3)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 96,
                          }}
                        >
                          {r.cities.join(", ")}
                        </span>
                      </span>
                    )}
                  </td>
                  <td>
                    {r.occ === null ? (
                      <span style={{ fontSize: 11.5, color: "var(--text-mute)" }}>{t.nd}</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="num" style={{ minWidth: 32, fontWeight: 600 }}>
                          {r.occ}%
                        </span>
                        <div className={`bar ${r.occ < 50 ? "warning" : "success"}`} style={{ flex: 1 }}>
                          <i style={{ width: r.occ + "%" }} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    {over && (
                      <Badge tone="warning" dot>
                        {t.highLoad}
                      </Badge>
                    )}
                    {idle && <Badge tone="neutral">{t.idle}</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// SIGNALS
// ============================================================
export function PL_SignalsPanel({
  win,
  courses,
  conflictDays,
  canniDays,
  onThresholds,
  onAdd,
}: {
  win: WindowMonth[];
  courses: PlannerItem[];
  conflictDays: number;
  canniDays: number;
  onThresholds: (patch: { conflictDays: number; canniDays: number }) => void;
  onAdd: (
    type: CourseTypeKey | null,
    city: string | null,
    mIdx: number | null,
    year: number | null,
  ) => void;
}) {
  const t = useT().pianificatore.signals;
  const [editSoglie, setEditSoglie] = useState(false);
  const cd = conflictDays || 10;
  const nd = canniDays || 30;

  const placed = courses.filter((c) => c.placed && c.mIdx !== null);
  const gapsMonths = win.filter((w) => !placed.some((c) => c.year === w.year && c.mIdx === w.mIdx));

  const targetCities = CITIES.filter((c) => !HUB_CITIES.includes(c) && !NON_CITIES.includes(c));
  const coveredCities = new Set(placed.map((c) => c.city).filter(Boolean));
  const uncoveredCities = targetCities.filter((c) => !coveredCities.has(c));

  const conflicts: { a: PlannerItem; b: PlannerItem; gap: number }[] = [];
  const byEdu: Record<string, PlannerItem[]> = {};
  placed
    .filter((c) => c.educatorId)
    .forEach((c) => {
      (byEdu[c.educatorId!] = byEdu[c.educatorId!] || []).push(c);
    });
  Object.values(byEdu).forEach((list) => {
    const s = [...list].sort((a, b) => plDate(a).getTime() - plDate(b).getTime());
    for (let i = 1; i < s.length; i++) {
      if (plDayGap(s[i], s[i - 1]) <= cd)
        conflicts.push({ a: s[i - 1], b: s[i], gap: plDayGap(s[i], s[i - 1]) });
    }
  });

  const canni: { a: PlannerItem; b: PlannerItem; gap: number }[] = [];
  const byTC: Record<string, PlannerItem[]> = {};
  placed
    .filter((c) => c.city)
    .forEach((c) => {
      const k = c.type + "|" + c.city;
      (byTC[k] = byTC[k] || []).push(c);
    });
  Object.values(byTC).forEach((list) => {
    const s = [...list].sort((a, b) => plDate(a).getTime() - plDate(b).getTime());
    for (let i = 1; i < s.length; i++) {
      if (plDayGap(s[i], s[i - 1]) <= nd)
        canni.push({ a: s[i - 1], b: s[i], gap: plDayGap(s[i], s[i - 1]) });
    }
  });

  const empty = (
    <span style={{ fontSize: 11.5, color: "var(--text-mute)", fontStyle: "italic" }}>{t.none}</span>
  );

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-head" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "var(--indigo-50)",
                color: "var(--indigo-600)",
              }}
            >
              <Icon name="lightning" size={13} />
            </span>
            {t.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{t.sub}</div>
        </div>
        <button className={`btn btn-sm ${editSoglie ? "btn-primary" : ""}`} onClick={() => setEditSoglie((s) => !s)}>
          <Icon name="settings" size={12} />
          {t.setThresholds}
        </button>
      </div>
      {editSoglie && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border-2)",
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="info" size={12} />
            {t.thresholdsIntro}
          </span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
            {t.conflictWithin}
            <input
              className="input"
              type="number"
              min="1"
              value={cd}
              onChange={(e) =>
                onThresholds({ conflictDays: Math.max(1, parseInt(e.target.value || "1", 10)), canniDays: nd })
              }
              style={{ width: 56, height: 28, padding: "0 6px" }}
            />
            {t.days}
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
            {t.canniWithin}
            <input
              className="input"
              type="number"
              min="1"
              value={nd}
              onChange={(e) =>
                onThresholds({ conflictDays: cd, canniDays: Math.max(1, parseInt(e.target.value || "1", 10)) })
              }
              style={{ width: 56, height: 28, padding: "0 6px" }}
            />
            {t.days}
          </label>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        <SignalSection icon="calendar" tone="indigo" title={t.gaps} count={gapsMonths.length}>
          {gapsMonths.length === 0
            ? empty
            : gapsMonths.slice(0, 6).map((w) => (
                <button key={w.key} onClick={() => onAdd(null, null, w.mIdx, w.year)} title={t.planHere} style={sigRow}>
                  <span>
                    {w.name} <span className="num" style={{ color: "var(--text-4)" }}>{w.year}</span>
                  </span>
                  <Icon name="plus" size={12} className="text-3" />
                </button>
              ))}
        </SignalSection>

        <SignalSection icon="pin" tone="oro" title={t.uncovered} count={uncoveredCities.length}>
          {uncoveredCities.length === 0
            ? empty
            : uncoveredCities.slice(0, 6).map((c) => (
                <button key={c} onClick={() => onAdd("introduttivo", c, null, null)} title={t.planIntroHere} style={sigRow}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Icon name="pin" size={11} className="text-4" />
                    {c}
                  </span>
                  <Icon name="plus" size={12} className="text-3" />
                </button>
              ))}
        </SignalSection>

        <SignalSection icon="users" tone="danger" title={t.conflicts} count={conflicts.length}>
          {conflicts.length === 0
            ? empty
            : conflicts.slice(0, 5).map((cf, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.4 }}>
                  <strong>{cf.a.educator ? cf.a.educator.name.split(" ")[0] : "—"}</strong> · {cf.a.typeShort}{" "}
                  {MONTHS_SHORT[cf.a.mIdx ?? 0]} · {cf.b.typeShort} {MONTHS_SHORT[cf.b.mIdx ?? 0]}{" "}
                  <span className="num" style={{ color: "var(--danger-fg)" }}>
                    ({cf.gap}
                    {t.daysShort})
                  </span>
                </div>
              ))}
        </SignalSection>

        <SignalSection icon="warn" tone="warning" title={t.canni} count={canni.length}>
          {canni.length === 0
            ? empty
            : canni.slice(0, 5).map((cf, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.4 }}>
                  <strong>{cf.a.typeShort}</strong> · {cf.a.city}: {MONTHS_SHORT[cf.a.mIdx ?? 0]} +{" "}
                  {MONTHS_SHORT[cf.b.mIdx ?? 0]}{" "}
                  <span className="num" style={{ color: "var(--warning-fg)" }}>
                    ({cf.gap}
                    {t.daysShort})
                  </span>
                </div>
              ))}
        </SignalSection>
      </div>
    </div>
  );
}

const sigRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  width: "100%",
  textAlign: "left",
  background: "var(--surface-2)",
  border: "1px solid var(--border-2)",
  borderRadius: 6,
  padding: "5px 8px",
  cursor: "pointer",
  fontSize: 11.5,
  color: "var(--text)",
  fontFamily: "inherit",
};

// ============================================================
// YEAR-OVER-YEAR
// ============================================================
export function PL_YoYPanel({
  win,
  courses,
  prevYearItems,
  types,
  typeLabels,
}: {
  win: WindowMonth[];
  courses: PlannerItem[];
  prevYearItems: PrevYearItem[];
  types: CourseTypeKey[];
  typeLabels: Record<CourseTypeKey, string>;
}) {
  const t = useT().pianificatore.yoy;
  const nowCount = courses.filter((c) => c.placed && c.mIdx !== null).length;

  const prevKeys = new Set(win.map((w) => keyOf(w.year - 1, w.mIdx)));
  const prev = prevYearItems.filter((c) => prevKeys.has(keyOf(c.year, c.mIdx)));
  const prevCount = prev.length;

  const delta = nowCount - prevCount;
  const pct = prevCount ? Math.round((delta / prevCount) * 100) : null;

  const byTypeNow = {} as Record<CourseTypeKey, number>;
  const byTypePrev = {} as Record<CourseTypeKey, number>;
  types.forEach((ty) => {
    byTypeNow[ty] = courses.filter((c) => c.placed && c.mIdx !== null && c.type === ty).length;
    byTypePrev[ty] = prev.filter((c) => c.type === ty).length;
  });

  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="trending" size={12} /> {t.title}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 6 }}>
        <span className="num" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>
          {nowCount}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 5 }}>{t.nowLabel}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 14 }}>
        {t.prevLabel} <strong className="num">{prevCount}</strong>
        {pct !== null && (
          <span
            style={{
              marginLeft: 8,
              fontWeight: 600,
              color: delta >= 0 ? "var(--success-fg)" : "var(--danger-fg)",
            }}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(pct)}%
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {types.map((ty) => {
          const tc = TYPE_COLORS[ty];
          const n = byTypeNow[ty];
          const p = byTypePrev[ty];
          const mx = Math.max(1, n, p);
          return (
            <div
              key={ty}
              style={{ display: "grid", gridTemplateColumns: "92px 1fr 44px", alignItems: "center", gap: 8, fontSize: 11.5 }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-2)" }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: tc.solid }} />
                {typeLabels[ty]}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{ height: 7, borderRadius: 3, background: tc.solid, width: `${(n / mx) * 100}%`, minWidth: n ? 6 : 0 }}
                />
                <div
                  style={{ height: 7, borderRadius: 3, background: "var(--border)", width: `${(p / mx) * 100}%`, minWidth: p ? 6 : 0 }}
                />
              </div>
              <span className="num" style={{ textAlign: "right", color: "var(--text-3)" }}>
                {n}
                <span style={{ color: "var(--text-mute)" }}> / {p}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, fontSize: 10.5, color: "var(--text-4)", display: "flex", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 4, borderRadius: 2, background: "var(--text-2)" }} />
          {t.thisPeriod}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 4, borderRadius: 2, background: "var(--border)" }} />
          {t.prevPeriod}
        </span>
      </div>
    </div>
  );
}
