"use client";

import { Badge, KPI, PageHeader, type BadgeTone } from "@/components/ui";
import { useT, format, type Dictionary } from "@/lib/i18n";
import { monthLabel } from "@/lib/dashboard";
import { COURSE_TYPES } from "@/lib/domain/constants";
import type { CourseTypeKey } from "@/lib/domain";
import type {
  AnalisiData,
  CityStat,
  MonthStat,
  Recommendation,
  RecoPriority,
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

const eur = (n: number) => `€ ${n.toLocaleString("it-IT")}`;

export function AnalisiClient({ data, locale }: { data: AnalisiData; locale: string }) {
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
          <section className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
            <KPI label={t.kpi.held} value={data.kpis.heldCourses} sub={`${data.kpis.plannedCourses} ${t.kpi.planned.toLowerCase()}`} />
            <KPI label={t.kpi.enrolled} value={data.kpis.totalEnrolled} />
            <KPI label={t.kpi.fill} value={data.kpis.avgFill} unit="%" />
            <KPI label={t.kpi.revenue} value={eur(data.kpis.totalRevenue)} sub={`${t.kpi.margin}: ${data.kpis.avgMargin}%`} />
          </section>

          <RecommendationsSection recos={data.recommendations} t={t} mLabel={mLabel} />

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, marginTop: 20 }} className="analisi-split">
            <SeasonalitySection data={data} t={t} mLabel={mLabel} />
            <TypesSection data={data} t={t} mLabel={mLabel} />
          </div>

          <GeographySection cities={data.cityStats} t={t} mLabel={mLabel} />
        </>
      )}

      <style>{`@media (max-width: 900px){.analisi-split{grid-template-columns:minmax(0,1fr) !important}}`}</style>
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
    <section className="card" style={{ marginTop: 16 }}>
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

// ===== Types trend =====

function TypesSection({
  data,
  t,
  mLabel: _mLabel,
}: {
  data: AnalisiData;
  t: AnalisiT;
  mLabel: (m: string) => string;
}) {
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
    <section className="card" style={{ marginTop: 20 }}>
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
