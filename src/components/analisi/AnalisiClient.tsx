"use client";

import Link from "next/link";
import { Badge, KPI, PageHeader, type BadgeTone } from "@/components/ui";
import { useT, format, type Dictionary } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import { monthLabel } from "@/lib/dashboard";
import { MONTH_NAMES_IT } from "@/lib/dates/italian-months";
import { COURSE_TYPES } from "@/lib/domain/constants";
import type { CourseTypeKey } from "@/lib/domain";
import type {
  ActivityStat,
  AnalisiData,
  CityStat,
  EducatorStat,
  MonthStat,
  PersonStat,
  Recommendation,
  RecoPriority,
  YearMonthRow,
  YoyMonth,
} from "@/lib/analisi";

type AnalisiT = Dictionary["analisi"];

const TYPE_TONE: Record<string, BadgeTone> = {
  certificato: "azzurro",
  introduttivo: "oro",
};
const typeTone = (t: CourseTypeKey): BadgeTone => TYPE_TONE[t] ?? "neutral";

const PRIO_TONE: Record<RecoPriority, BadgeTone> = {
  alta: "danger",
  media: "warning",
  bassa: "neutral",
};

const eur = (n: number) => formatEuro(n);

export function AnalisiClient({
  data,
  activities,
  people,
  educators,
  locale,
}: {
  data: AnalisiData;
  activities: ActivityStat[];
  people: PersonStat[];
  educators: EducatorStat[];
  locale: string;
}) {
  const t = useT().analisi;
  const mLabel = (m: string) => monthLabel(m, locale);

  return (
    <div className="page">
      <PageHeader eyebrow={t.eyebrow} title={t.title} sub={t.sub} />

      {!data.hasData ? (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <p className="text-3">{t.noData}</p>
        </div>
      ) : (
        <>
          <section className="kpi-grid cols-4" style={{ marginBottom: 8 }}>
            <KPI label={t.kpi.held} value={data.kpis.heldCourses} sub={`${data.kpis.plannedCourses} ${t.kpi.planned.toLowerCase()}`} />
            <KPI label={t.kpi.enrolled} value={data.kpis.totalEnrolled} />
            <KPI label={t.kpi.fill} value={data.kpis.avgFill} unit="%" />
            <KPI label={t.kpi.revenue} value={eur(data.kpis.totalRevenue)} sub={`${t.kpi.margin}: ${data.kpis.avgMargin}%`} />
          </section>

          <GroupLabel>{t.groups.plan}</GroupLabel>
          <RecommendationsSection recos={data.recommendations} t={t} mLabel={mLabel} />

          <GroupLabel>{t.groups.when}</GroupLabel>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, marginTop: 12 }} className="analisi-split">
            <SeasonalitySection data={data} t={t} mLabel={mLabel} />
            <YearMatrixSection rows={data.yearMatrix} t={t} mLabel={mLabel} />
          </div>

          <GroupLabel>{t.groups.growth}</GroupLabel>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, marginTop: 12 }} className="analisi-split">
            <YoySection yoy={data.yoy} t={t} mLabel={mLabel} />
            <TypesSection data={data} t={t} />
          </div>

          <GroupLabel>{t.groups.what}</GroupLabel>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, marginTop: 12 }} className="analisi-split">
            <TypeRankingSection data={data} t={t} />
            <ActivitiesSection activities={activities} t={t} />
          </div>

          <GroupLabel>{t.groups.who}</GroupLabel>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, marginTop: 12 }} className="analisi-split">
            <PeopleSection people={people} t={t} />
            <EducatorsSection educators={educators} t={t} />
          </div>

          <GroupLabel>{t.groups.where}</GroupLabel>
          <GeographySection cities={data.cityStats} t={t} mLabel={mLabel} />
        </>
      )}

      <style>{`@media (max-width: 900px){.analisi-split{grid-template-columns:minmax(0,1fr) !important}}`}</style>
    </div>
  );
}

/** Uppercase eyebrow separating the page's thematic groups. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-3"
      style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", margin: "28px 2px 0" }}
    >
      {children}
    </div>
  );
}

// ===== Recommendations =====

function RecommendationsSection({
  recos,
  t,
  mLabel,
}: {
  recos: Recommendation[];
  t: AnalisiT;
  mLabel: (m: string) => string;
}) {
  const prioLabel: Record<RecoPriority, string> = {
    alta: t.reco.priorityHigh,
    media: t.reco.priorityMed,
    bassa: t.reco.priorityLow,
  };
  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.reco.title}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.reco.sub}</div>
        </div>
        <Badge tone="indigo">{recos.length}</Badge>
      </div>
      <div className="card-body">
        {recos.length === 0 ? (
          <p className="text-3" style={{ fontSize: 13 }}>{t.reco.empty}</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {recos.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: 12,
                  padding: "14px 16px",
                  border: "1px solid var(--border-2)",
                  borderRadius: "var(--r-3)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{r.city}</span>
                    <Badge tone={typeTone(r.type)}>{r.typeLabel.toUpperCase()}</Badge>
                    <Badge tone="neutral">{r.mode === "online" ? t.reco.online : t.reco.presenza}</Badge>
                    <Badge tone={PRIO_TONE[r.priority]} dot>{prioLabel[r.priority]}</Badge>
                  </div>
                  <div className="text-3" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{r.reason}</div>
                </div>
                <div style={{ display: "flex", gap: 18, alignItems: "center", whiteSpace: "nowrap" }}>
                  <RecoMetric label={t.reco.suggested} value={`${mLabel(r.suggestedMonth)} ${r.suggestedYear}`} strong />
                  <RecoMetric label={t.reco.expected} value={`${r.expectedEnrolled}`} />
                  <RecoMetric label={t.reco.fill} value={`${r.fillRate}%`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RecoMetric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div className="text-3" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontWeight: strong ? 700 : 600, fontSize: strong ? 15 : 14, color: strong ? "var(--indigo-600)" : undefined }}>{value}</div>
    </div>
  );
}

// ===== Seasonality =====

function SeasonalitySection({
  data,
  t,
  mLabel,
}: {
  data: AnalisiData;
  t: AnalisiT;
  mLabel: (m: string) => string;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.season.title}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.season.sub}</div>
        </div>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 7 }}>
        {data.seasonality.map((m: MonthStat) => (
          <div key={m.idx} style={{ display: "grid", gridTemplateColumns: "70px 1fr 86px", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: m.isDead ? "var(--text-3)" : "var(--text)", fontWeight: m.isPeak ? 600 : 400 }}>
              {mLabel(m.month).slice(0, 3)}
            </span>
            <div className={`bar ${m.isPeak ? "success" : m.courses === 0 ? "" : "azzurro"}`} style={{ height: 8 }}>
              <i style={{ width: `${Math.max(m.share, m.enrolled > 0 ? 4 : 0)}%` }} />
            </div>
            <span style={{ fontSize: 11.5, textAlign: "right", color: "var(--text-3)" }}>
              {m.courses === 0 ? (
                <em>{t.season.noCourses}</em>
              ) : (
                <>
                  <strong style={{ color: "var(--text)" }}>{m.enrolled}</strong> · {format(t.season.courses, { n: String(m.courses) })}
                </>
              )}
            </span>
          </div>
        ))}
        {data.bestSeason.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--border-2)" }}>
            <div className="text-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>{t.season.best}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.bestSeason.map((b) => (
                <span key={b.type} className="pill" style={{ fontSize: 12 }}>
                  <strong>{COURSE_TYPES[b.type]?.label ?? b.label}</strong>&nbsp;→&nbsp;{mLabel(b.month)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ===== Year × month matrix (historic busiest months) =====

// Discrete indigo scale — one hue (demand), 4 intensities. Tier 0 = never held.
const TIER_BG = ["transparent", "var(--indigo-50)", "var(--indigo-100)", "var(--indigo-400)", "var(--indigo)"];

function YearMatrixSection({
  rows,
  t,
  mLabel,
}: {
  rows: YearMonthRow[];
  t: AnalisiT;
  mLabel: (m: string) => string;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.matrix.title}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.matrix.sub}</div>
        </div>
      </div>
      <div className="card-body">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 3, width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                <th className="text-3" style={{ fontSize: 10.5, fontWeight: 500, textAlign: "left", padding: "0 4px" }}>{t.matrix.colYear}</th>
                {MONTH_NAMES_IT.map((m) => (
                  <th key={m} className="text-3" style={{ fontSize: 10.5, fontWeight: 500, textAlign: "center", padding: "0 2px" }}>
                    {mLabel(m).slice(0, 1)}
                  </th>
                ))}
                <th className="text-3" style={{ fontSize: 10.5, fontWeight: 500, textAlign: "right", padding: "0 4px" }}>{t.matrix.colTotal}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year}>
                  <td style={{ fontSize: 12, fontWeight: 600, padding: "0 4px", whiteSpace: "nowrap" }}>{r.year}</td>
                  {r.cells.map((c, idx) => (
                    <td
                      key={idx}
                      title={`${mLabel(MONTH_NAMES_IT[idx])} ${r.year} — ${format(t.matrix.cellTitle, { courses: String(c.courses), enrolled: String(c.enrolled) })}`}
                      style={{
                        background: TIER_BG[c.tier],
                        color: c.tier >= 3 ? "#fff" : c.tier === 0 ? "var(--text-4)" : "var(--text)",
                        borderRadius: 4,
                        textAlign: "center",
                        fontSize: 11.5,
                        fontWeight: c.tier >= 3 ? 600 : 400,
                        fontVariantNumeric: "tabular-nums",
                        padding: "6px 2px",
                        minWidth: 28,
                        border: c.tier === 0 ? "1px solid var(--border-2)" : "1px solid transparent",
                      }}
                    >
                      {c.courses === 0 ? "·" : c.enrolled}
                    </td>
                  ))}
                  <td style={{ fontSize: 11.5, textAlign: "right", padding: "0 4px", whiteSpace: "nowrap" }}>
                    <strong>{r.enrolled}</strong>{" "}
                    <span className="text-3">· {format(t.season.courses, { n: String(r.courses) })}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-3" style={{ fontSize: 11, marginTop: 10 }}>{t.matrix.legend}</div>
      </div>
    </section>
  );
}

// ===== YoY growth (weakest months first) =====

function YoySection({
  yoy,
  t,
  mLabel,
}: {
  yoy: YoyMonth[];
  t: AnalisiT;
  mLabel: (m: string) => string;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.yoy.title}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.yoy.sub}</div>
        </div>
      </div>
      {yoy.length === 0 ? (
        <div className="card-body">
          <p className="text-3" style={{ fontSize: 13 }}>{t.yoy.empty}</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t.yoy.colMonth}</th>
                <th style={{ textAlign: "right" }}>{t.yoy.colCourses}</th>
                <th style={{ textAlign: "right" }}>{t.yoy.colEnrolled}</th>
                <th style={{ textAlign: "right" }}>{t.yoy.colPrev}</th>
                <th style={{ textAlign: "right" }}>{t.yoy.colDelta}</th>
              </tr>
            </thead>
            <tbody>
              {yoy.map((m) => (
                <tr key={`${m.year}-${m.idx}`}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    {mLabel(m.month).slice(0, 3)} {m.year}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {m.courses} <span className="text-3">({m.prevCourses})</span>
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.enrolled}</td>
                  <td className="text-3" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.prevEnrolled}</td>
                  <td style={{ textAlign: "right" }}>
                    <Delta value={m.deltaEnrolled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-3" style={{ fontVariantNumeric: "tabular-nums" }}>=</span>;
  const up = value > 0;
  return (
    <span
      style={{
        color: up ? "var(--success-fg)" : "var(--danger-fg)",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {up ? "▲" : "▼"} {up ? "+" : "−"}{Math.abs(value)}
    </span>
  );
}

// ===== Types trend =====

function TypesSection({ data, t }: { data: AnalisiData; t: AnalisiT }) {
  const maxYearCount = Math.max(
    1,
    ...data.typeStats.flatMap((ts) => ts.byYear.map((y) => y.courses)),
  );
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.types.title}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.types.sub}</div>
        </div>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 16 }}>
        {data.typeStats.map((ts) => (
          <div key={ts.type}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge tone={typeTone(ts.type)}>{ts.label.toUpperCase()}</Badge>
                <span className="text-3" style={{ fontSize: 12 }}>
                  {ts.courses} {t.types.courses} · {ts.avgFill}% {t.types.fill}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 56 }}>
              {ts.byYear.map((y) => (
                <div key={y.year} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: "0 0 auto" }}>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{y.courses}</div>
                  <div
                    style={{
                      width: 26,
                      height: `${Math.max(6, (y.courses / maxYearCount) * 40)}px`,
                      background: "var(--indigo)",
                      borderRadius: 4,
                    }}
                  />
                  <div className="text-3" style={{ fontSize: 10.5 }}>{y.year}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ===== Best activities: course types ranked =====

function TypeRankingSection({ data, t }: { data: AnalisiData; t: AnalisiT }) {
  const ranked = [...data.typeStats].sort((a, b) => b.enrolled - a.enrolled);
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.best.typesTitle}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.best.typesSub}</div>
        </div>
      </div>
      <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t.best.colType}</th>
              <th style={{ textAlign: "right" }}>{t.best.colCourses}</th>
              <th style={{ textAlign: "right" }}>{t.best.colEnrolled}</th>
              <th style={{ textAlign: "right" }}>{t.best.colFill}</th>
              <th style={{ textAlign: "right" }}>{t.best.colRevenue}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((ts) => (
              <tr key={ts.type}>
                <td><Badge tone={typeTone(ts.type)}>{ts.label.toUpperCase()}</Badge></td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ts.courses}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{ts.enrolled}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ts.avgFill}%</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(ts.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ===== Best activities: non-course purchases =====

function ActivitiesSection({ activities, t }: { activities: ActivityStat[]; t: AnalisiT }) {
  const clusterLabel = (c: string) => t.best.clusters[c] ?? c;
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.best.otherTitle}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.best.otherSub}</div>
        </div>
      </div>
      {activities.length === 0 ? (
        <div className="card-body">
          <p className="text-3" style={{ fontSize: 13 }}>{t.best.otherEmpty}</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t.best.colProduct}</th>
                <th style={{ textAlign: "right" }}>{t.best.colOrders}</th>
                <th style={{ textAlign: "right" }}>{t.best.colRevenue}</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={`${a.cluster}|${a.title}`}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Badge tone="neutral">{clusterLabel(a.cluster).toUpperCase()}</Badge>
                      <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }} title={a.title}>
                        {a.title}
                      </span>
                    </div>
                    <div className="bar azzurro" style={{ height: 4, marginTop: 6, maxWidth: 220 }}>
                      <i style={{ width: `${Math.max(a.share, 3)}%` }} />
                    </div>
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{a.orders}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{eur(a.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ===== Most active people =====

function PeopleSection({ people, t }: { people: PersonStat[]; t: AnalisiT }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.people.corsistiTitle}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.people.corsistiSub}</div>
        </div>
      </div>
      {people.length === 0 ? (
        <div className="card-body">
          <p className="text-3" style={{ fontSize: 13 }}>{t.people.corsistiEmpty}</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t.people.colName}</th>
                <th style={{ textAlign: "right" }}>{t.people.colCourses}</th>
                <th style={{ textAlign: "right" }}>{t.people.colSpent}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.email}>
                  <td>
                    <Link href={`/corsisti/${encodeURIComponent(p.email)}`} style={{ fontWeight: 600, color: "var(--indigo-600)", textDecoration: "none" }}>
                      {p.name || p.email}
                    </Link>
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{p.courses}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(p.totalSpent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EducatorsSection({ educators, t }: { educators: EducatorStat[]; t: AnalisiT }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.people.educatorsTitle}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.people.educatorsSub}</div>
        </div>
      </div>
      <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t.people.colName}</th>
              <th style={{ textAlign: "right" }}>{t.people.colCourses}</th>
              <th style={{ textAlign: "right" }}>{t.people.colEnrolled}</th>
            </tr>
          </thead>
          <tbody>
            {educators.map((e) => (
              <tr key={e.name}>
                <td>
                  {e.id ? (
                    <Link href={`/educator/${e.id}`} style={{ fontWeight: 600, color: "var(--indigo-600)", textDecoration: "none" }}>
                      {e.name}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 600 }}>{e.name}</span>
                  )}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{e.courses}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{e.enrolled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ===== Geography =====

function GeographySection({
  cities,
  t,
  mLabel,
}: {
  cities: CityStat[];
  t: AnalisiT;
  mLabel: (m: string) => string;
}) {
  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <div>
          <div className="h3" style={{ fontWeight: 600 }}>{t.geo.title}</div>
          <div className="text-3" style={{ fontSize: 12 }}>{t.geo.sub}</div>
        </div>
      </div>
      <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t.geo.colCity}</th>
              <th style={{ textAlign: "right" }}>{t.geo.colCourses}</th>
              <th>{t.geo.colEnrolled}</th>
              <th style={{ textAlign: "right" }}>{t.geo.colFill}</th>
              <th style={{ textAlign: "right" }}>{t.geo.colRevenue}</th>
              <th>{t.geo.colLast}</th>
              <th style={{ textAlign: "right" }}>{t.geo.colCadence}</th>
              <th>{t.geo.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {cities.map((c) => (
              <tr key={c.city}>
                <td style={{ fontWeight: 600 }}>{c.city}</td>
                <td style={{ textAlign: "right" }}>{c.courses}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                    <div className="bar azzurro" style={{ flex: 1, height: 6 }}>
                      <i style={{ width: `${Math.max(c.share, 4)}%` }} />
                    </div>
                    <span style={{ fontSize: 12, width: 28, textAlign: "right" }}>{c.enrolled}</span>
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>{c.avgFill}%</td>
                <td style={{ textAlign: "right" }}>{eur(c.revenue)}</td>
                <td className="text-3" style={{ whiteSpace: "nowrap" }}>{mLabel(c.lastMonth).slice(0, 3)} {c.lastYear}</td>
                <td style={{ textAlign: "right" }} className="text-3">
                  {c.cadenceMonths == null ? t.geo.single : format(t.geo.months, { n: String(c.cadenceMonths) })}
                </td>
                <td>
                  <Badge tone={c.due ? "warning" : "success"} dot>
                    {c.due ? t.geo.due : t.geo.ok}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
