"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Icon, KPI } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { COURSE_TYPES, type CourseLifecycle, type CourseTypeColor, type CourseTypeKey } from "@/lib/domain";

export interface ArchivioCourse {
  id: string;
  handle: string;
  type: CourseTypeKey;
  typeColor: CourseTypeColor;
  typeShort: string;
  shortTitle: string;
  city: string;
  day: number;
  month: string;
  year: number;
  enrolled: number;
  revenue: number;
  lifecycle: CourseLifecycle;
  educatorName: string;
  cancelled: boolean;
}

type GroupBy = "anno" | "citta" | "educator" | "tipo";

const MONTH_ORDER = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const TYPE_ORDER: CourseTypeKey[] = ["certificato", "introduttivo", "shochu", "masterclass", "mixology"];

const TYPE_COLOR: Record<CourseTypeKey, string> = {
  certificato: "var(--indigo)",
  introduttivo: "var(--oro)",
  shochu: "var(--azzurro)",
  masterclass: "var(--success)",
  mixology: "var(--navy-400)",
};

const CHART_H = 160;

function YearStrip({
  courses,
  cancelledCourses,
  selectedYear,
  onSelect,
  cancelRate,
  cancelCount,
}: {
  courses: ArchivioCourse[];
  cancelledCourses: ArchivioCourse[];
  selectedYear: string;
  onSelect: (y: string) => void;
  cancelRate: number;
  cancelCount: number;
}) {
  const t = useT().archivio;

  const { byYear, byYearType, types } = useMemo(() => {
    const yMap = new Map<number, number>();
    const ytMap = new Map<string, number>();
    const tSet = new Set<CourseTypeKey>();
    courses.forEach((c) => {
      yMap.set(c.year, (yMap.get(c.year) || 0) + 1);
      const k = c.year + ":" + c.type;
      ytMap.set(k, (ytMap.get(k) || 0) + 1);
      tSet.add(c.type);
    });
    const orderedTypes = TYPE_ORDER.filter((ty) => tSet.has(ty));
    return { byYear: yMap, byYearType: ytMap, types: orderedTypes };
  }, [courses]);

  // Cancelled (planned but never held) per year — drawn as negative red bars.
  const byYearCancelled = useMemo(() => {
    const m = new Map<number, number>();
    cancelledCourses.forEach((c) => m.set(c.year, (m.get(c.year) || 0) + 1));
    return m;
  }, [cancelledCourses]);
  const maxCancelled = Math.max(1, ...Array.from(byYearCancelled.values()));
  const CANC_H = 46;

  const ys = Array.from(byYear.keys()).sort((a, b) => a - b);
  if (!ys.length) return null;
  const min = ys[0];
  const max = ys[ys.length - 1];
  const range: number[] = [];
  for (let y = min; y <= max; y++) range.push(y);

  const maxCount = Math.max(...range.map((y) => byYear.get(y) || 0));
  const axisMax = Math.ceil(maxCount / 5) * 5 || 5;
  const ticks = [0, axisMax * 0.25, axisMax * 0.5, axisMax * 0.75, axisMax];
  const total = courses.length;
  const avg = total / range.length;

  return (
    <section className="card card-pad-lg" style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 18,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {t.distribTitle}
          </div>
          <div className="text-3" style={{ fontSize: 12 }}>
            <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>
              {total}
            </span>{" "}
            {t.coursesTotal} · {t.avgWord}{" "}
            <span className="num" style={{ color: "var(--text-2)", fontWeight: 500 }}>
              {avg.toFixed(1)}
            </span>
            {t.perYear} · {t.peakWord}{" "}
            <span className="num" style={{ color: "var(--text-2)", fontWeight: 500 }}>
              {maxCount}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {types.map((ty) => (
            <div
              key={ty}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-2)" }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, background: TYPE_COLOR[ty] }} />
              {COURSE_TYPES[ty].label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 12 }}>
        <div style={{ position: "relative", height: CHART_H, marginRight: 4 }}>
          {ticks
            .slice()
            .reverse()
            .map((tick, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: (i / (ticks.length - 1)) * 100 + "%",
                  right: 0,
                  transform: "translateY(-50%)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "var(--text-4)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(tick)}
              </div>
            ))}
        </div>

        <div style={{ position: "relative", height: CHART_H }}>
          {ticks.map((tick, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (1 - tick / axisMax) * 100 + "%",
                borderTop: tick === 0 ? "1px solid var(--border)" : "1px dashed var(--border-2)",
                pointerEvents: "none",
              }}
            />
          ))}

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: (1 - avg / axisMax) * 100 + "%",
              borderTop: "1px dashed var(--indigo-400)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            <span
              style={{
                position: "absolute",
                right: 0,
                top: -8,
                padding: "1px 6px",
                background: "var(--indigo-50)",
                color: "var(--indigo)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                borderRadius: 3,
                border: "1px solid var(--indigo-100)",
                lineHeight: 1.4,
              }}
            >
              {format(t.avgBadge, { avg: avg.toFixed(1) })}
            </span>
          </div>

          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              gridTemplateColumns: `repeat(${range.length}, 1fr)`,
              gap: 4,
            }}
          >
            {range.map((y) => {
              const count = byYear.get(y) || 0;
              const sel = String(y) === selectedYear;
              return (
                <div key={y} style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <button
                    onClick={() => onSelect(String(y))}
                    style={{
                      position: "absolute",
                      inset: "-8px -8px 0 -8px",
                      background: sel ? "var(--indigo-50)" : "transparent",
                      border: sel ? "1px solid var(--indigo-100)" : "1px solid transparent",
                      borderRadius: 6,
                      transition: "background var(--dur-fast), border-color var(--dur-fast)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (!sel) e.currentTarget.style.setProperty("background", "var(--surface-2)");
                    }}
                    onMouseLeave={(e) => {
                      if (!sel) e.currentTarget.style.setProperty("background", "transparent");
                    }}
                    aria-label={String(y)}
                  />

                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      maxWidth: 56,
                      height: (count / axisMax) * 100 + "%",
                      minHeight: count > 0 ? 4 : 0,
                      display: "flex",
                      flexDirection: "column-reverse",
                      borderRadius: "3px 3px 0 0",
                      overflow: "hidden",
                      pointerEvents: "none",
                      boxShadow: sel ? "0 0 0 1.5px var(--indigo)" : "none",
                    }}
                  >
                    {types.map((ty) => {
                      const n = byYearType.get(y + ":" + ty) || 0;
                      if (!n) return null;
                      return (
                        <div
                          key={ty}
                          title={`${COURSE_TYPES[ty].label}: ${n}`}
                          style={{ height: (n / count) * 100 + "%", background: TYPE_COLOR[ty], transition: "all var(--dur)" }}
                        />
                      );
                    })}
                  </div>

                  {count > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: (count / axisMax) * 100 + "%",
                        left: "50%",
                        transform: "translateX(-50%) translateY(-6px)",
                        fontSize: 13,
                        fontWeight: 600,
                        color: sel ? "var(--indigo)" : "var(--text)",
                        letterSpacing: "-0.005em",
                        pointerEvents: "none",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Negative strip: cancelled courses (planned but never held) per year. */}
      {cancelledCourses.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
              fontSize: 11,
              color: "var(--danger-fg)",
              fontWeight: 600,
            }}
          >
            <span
              style={{ width: 10, height: 10, borderRadius: 2, background: "var(--danger)" }}
            />
            {t.cancelledWord ?? "Annullati"} · {t.cancelRateWord ?? "tasso"} {cancelRate}%
            <span style={{ color: "var(--text-4)", fontWeight: 500 }}>
              ({cancelCount} {t.cancelledWord?.toLowerCase() ?? "annullati"})
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 12, marginTop: 4 }}>
            <div />
            <div
              style={{
                position: "relative",
                height: CANC_H,
                display: "grid",
                gridTemplateColumns: `repeat(${range.length}, 1fr)`,
                gap: 4,
              }}
            >
              {range.map((y) => {
                const cc = byYearCancelled.get(y) || 0;
                const sel = String(y) === selectedYear;
                return (
                  <div
                    key={y}
                    style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}
                  >
                    {cc > 0 && (
                      <>
                        <div
                          title={`${cc} ${t.cancelledWord?.toLowerCase() ?? "annullati"} ${y}`}
                          style={{
                            width: "100%",
                            maxWidth: 56,
                            height: (cc / maxCancelled) * 100 + "%",
                            minHeight: 4,
                            background: sel ? "var(--danger)" : "var(--danger-bg)",
                            border: "1px solid var(--danger)",
                            borderRadius: "0 0 3px 3px",
                          }}
                        />
                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--danger-fg)", marginTop: 2 }}>
                          {cc}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 12, marginTop: 10 }}>
        <div />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${range.length}, 1fr)`, gap: 4 }}>
          {range.map((y) => {
            const sel = String(y) === selectedYear;
            return (
              <div
                key={y}
                className="mono"
                style={{ textAlign: "center", fontSize: 11, color: sel ? "var(--indigo)" : "var(--text-3)", fontWeight: sel ? 600 : 500 }}
              >
                {y}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ArchivioGroups({ courses, groupBy }: { courses: ArchivioCourse[]; groupBy: GroupBy }) {
  const t = useT().archivio;

  const groups = useMemo(() => {
    const map = new Map<string | number, ArchivioCourse[]>();
    courses.forEach((c) => {
      let key: string | number;
      if (groupBy === "anno") key = c.year;
      else if (groupBy === "citta") key = c.city;
      else if (groupBy === "educator") key = c.educatorName;
      else key = (COURSE_TYPES[c.type] ?? { label: c.type }).label;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    const arr = Array.from(map.entries());
    if (groupBy === "anno") arr.sort((a, b) => Number(b[0]) - Number(a[0]));
    else arr.sort((a, b) => b[1].length - a[1].length);
    return arr;
  }, [courses, groupBy]);

  if (!groups.length) {
    return (
      <div className="card card-pad-lg text-3" style={{ textAlign: "center" }}>
        {t.empty}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {groups.map(([key, list]) => {
        const sorted = [...list].sort(
          (a, b) => b.year - a.year || MONTH_ORDER.indexOf(b.month) - MONTH_ORDER.indexOf(a.month),
        );
        const studs = list.reduce((s, c) => s + c.enrolled, 0);
        const rev = list.reduce((s, c) => s + c.revenue, 0);
        return (
          <section key={key}>
            <header
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                paddingBottom: 10,
                marginBottom: 14,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h2 className="h2" style={{ fontSize: 22 }}>
                {key}
              </h2>
              <span
                className="mono"
                style={{ fontSize: 11, color: "var(--text-4)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase" }}
              >
                {format(t.groupSummary, { n: list.length, studs, rev: (rev / 1000).toFixed(1) })}
              </span>
            </header>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {sorted.map((c) => (
                <Link
                  key={c.id}
                  href={`/corsi/${c.handle}`}
                  className="card"
                  style={{ padding: 14, transition: "transform var(--dur-fast), box-shadow var(--dur-fast)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.setProperty("transform", "translateY(-1px)");
                    e.currentTarget.style.setProperty("box-shadow", "var(--sh-3)");
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.setProperty("transform", "none");
                    e.currentTarget.style.setProperty("box-shadow", "var(--sh-card)");
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</Badge>
                    {c.lifecycle === "passato" && (
                      <span className="mono" style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: "var(--ls-caps)" }}>
                        {t.cardConcluso}
                      </span>
                    )}
                    {c.lifecycle === "pubblicato" && (
                      <span className="mono" style={{ fontSize: 10, color: "var(--success-fg)", letterSpacing: "var(--ls-caps)" }}>
                        {t.cardProssimo}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{c.shortTitle}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
                    {c.day} {c.month} {c.year} · {c.city}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-4)",
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px solid var(--border-2)",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{c.educatorName}</span>
                    <span className="num">{format(t.cardIscritti, { n: c.enrolled })}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ArchivioClient({ items, citiesPossible }: { items: ArchivioCourse[]; citiesPossible: number }) {
  const t = useT().archivio;
  const [year, setYear] = useState("tutti");
  const [groupBy, setGroupBy] = useState<GroupBy>("anno");
  const [filterType, setFilterType] = useState<CourseTypeKey | "">("");
  const [search, setSearch] = useState("");

  // Held courses (the list/KPIs) vs cancelled (planned-but-never-held).
  const held = useMemo(() => items.filter((c) => !c.cancelled), [items]);
  const cancelledCourses = useMemo(() => items.filter((c) => c.cancelled), [items]);

  const years = Array.from(new Set(items.map((c) => c.year))).sort((a, b) => b - a);

  const filtered = useMemo(() => {
    let l = held;
    if (year !== "tutti") l = l.filter((c) => c.year === Number(year));
    if (filterType) l = l.filter((c) => c.type === filterType);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((c) => (c.shortTitle + " " + c.city + " " + c.educatorName).toLowerCase().includes(q));
    }
    return l;
  }, [held, year, filterType, search]);

  // Cancellation KPI (respects the year filter).
  const cancInYear =
    year === "tutti"
      ? cancelledCourses
      : cancelledCourses.filter((c) => c.year === Number(year));
  const heldInYear =
    year === "tutti" ? held : held.filter((c) => c.year === Number(year));
  const planned = heldInYear.length + cancInYear.length;
  const cancelRate = planned ? Math.round((cancInYear.length / planned) * 100) : 0;

  const stats = {
    total: filtered.length,
    students: filtered.reduce((s, c) => s + c.enrolled, 0),
    revenue: filtered.reduce((s, c) => s + c.revenue, 0),
    cities: new Set(filtered.map((c) => c.city)).size,
  };

  const groupSegs: [GroupBy, string][] = [
    ["anno", t.groupAnno],
    ["citta", t.groupCitta],
    ["educator", t.groupEducator],
    ["tipo", t.groupTipo],
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-sub">{t.sub}</p>
        </div>
        <div className="page-actions">
          <button className="btn">
            <Icon name="download" size={13} />
            {t.exportArchive}
          </button>
        </div>
      </div>

      <div className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
        <KPI anim label={t.kpiCorsi} value={stats.total} sub={year === "tutti" ? t.kpiTotali : format(t.kpiInYear, { year })} />
        <KPI anim label={t.kpiStudents} value={stats.students} />
        <KPI anim label={t.kpiRevenue} value={Math.round(stats.revenue / 1000)} unit="k €" accent="indigo" />
        <KPI anim label={t.kpiCities} value={stats.cities} sub={format(t.kpiCitiesSub, { n: citiesPossible })} />
      </div>

      <YearStrip
        courses={held}
        cancelledCourses={cancelledCourses}
        selectedYear={year}
        onSelect={setYear}
        cancelRate={cancelRate}
        cancelCount={cancInYear.length}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 280px" }}>
          <Icon name="search" size={14} className="topbar-search-icon" />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span style={{ width: 1, height: 22, background: "var(--border)" }} />
        <span className="eyebrow">{t.yearWord}</span>
        <div className="segmented">
          <button className={year === "tutti" ? "on" : ""} onClick={() => setYear("tutti")}>
            {t.all}
          </button>
          {years.map((y) => (
            <button key={y} className={year === String(y) ? "on" : ""} onClick={() => setYear(String(y))}>
              {y}
            </button>
          ))}
        </div>
        <span style={{ width: 1, height: 22, background: "var(--border)" }} />
        <span className="eyebrow">{t.typeWord}</span>
        <select
          className="select"
          style={{ width: "auto" }}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as CourseTypeKey | "")}
        >
          <option value="">{t.all}</option>
          {(Object.keys(COURSE_TYPES) as CourseTypeKey[]).map((k) => (
            <option key={k} value={k}>
              {COURSE_TYPES[k].label}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <span className="eyebrow">{t.groupWord}</span>
        <div className="segmented">
          {groupSegs.map(([k, l]) => (
            <button key={k} className={groupBy === k ? "on" : ""} onClick={() => setGroupBy(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <ArchivioGroups courses={filtered} groupBy={groupBy} />
    </div>
  );
}
