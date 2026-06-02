import Link from "next/link";
import { Avatar, Badge, Icon, KPI, StatusBadge } from "@/components/ui";
import { getTranslations } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/dictionary";
import { getSession } from "@/lib/auth/session";
import { getDataSource } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { buildDashboard, capitalize, DASH_TODAY, DASH_WEEK, monthLabel } from "@/lib/dashboard";
import { loadCourseEconomics } from "@/lib/economics";
import {
  MonthReportButton,
  PipelineBar,
  StockAlertsPanel,
} from "@/components/dashboard";

export default async function DashboardPage() {
  const ds = await getDataSource();
  const [{ locale, t }, session, courses, corsisti, educators, thresholds] =
    await Promise.all([
      getTranslations(),
      getSession(),
      ds.courses.list(),
      ds.corsisti.list(),
      ds.educators.list(),
      ds.settings.getThresholds(),
    ]);
  const stockAlerts = await ds.settings.getStockAlerts();

  // Real "to invoice" count: held courses not yet marked invoiced (Conto economico).
  const econ = await loadCourseEconomics();
  const toInvoiceCount = courses.filter(
    (c) => c.lifecycle === "passato" && !c.cancelled && !econ.get(c.id)?.invoiced,
  ).length;

  // Real "last synced" timestamp — the refresh button re-runs the sync and
  // router.refresh()es, so this re-renders with the fresh time on every sync.
  let syncLabel = t.dashboard.updatedNever;
  try {
    const sbSync = await getSupabaseServerClient();
    const { data: syncRow } = await sbSync
      .from("sync_state")
      .select("last_synced_at")
      .eq("source", "shopify")
      .maybeSingle();
    const iso = (syncRow as { last_synced_at?: string } | null)?.last_synced_at;
    if (iso) {
      const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
      syncLabel =
        mins < 1
          ? t.dashboard.updatedNow
          : mins < 60
            ? format(t.dashboard.updatedAgo, { n: mins })
            : format(t.dashboard.updatedAt, {
                time: new Date(iso).toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              });
    }
  } catch {
    /* sync_state unavailable — keep the neutral fallback */
  }

  const d = buildDashboard(courses, corsisti, educators, thresholds);
  const dt = t.dashboard;
  const me = session.user;

  const { kpis } = d;
  const occupancy = kpis.totalCapacity ? (kpis.totalEnrolled / kpis.totalCapacity) * 100 : 0;
  const avgPerCourse = kpis.activeCount ? (kpis.totalEnrolled / kpis.activeCount).toFixed(1) : "0";
  const marginPct = kpis.totalRevenue ? Math.round((kpis.totalMargin / kpis.totalRevenue) * 100) : 0;

  const weekday = capitalize(new Intl.DateTimeFormat(locale, { weekday: "long" }).format(DASH_TODAY));
  const fullMonth = capitalize(new Intl.DateTimeFormat(locale, { month: "long" }).format(DASH_TODAY));
  const eyebrowDate = `${weekday} · ${DASH_TODAY.getDate()} ${fullMonth} ${DASH_TODAY.getFullYear()} · ${format(dt.week, { n: DASH_WEEK })}`;

  return (
    <div className="page">
      {/* Hero */}
      <section className="hero hero-mesh" style={{ padding: "32px 36px" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {eyebrowDate} <span className="dot" /> {syncLabel}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 48,
            alignItems: "center",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              {format(dt.greeting, { name: me.first })}{" "}
              <span style={{ color: "var(--text-3)" }}>{dt.headlineHas}</span>{" "}
              <span style={{ color: "var(--indigo)" }}>
                {format(dt.headlineCourses, { n: kpis.atRiskCount })}
              </span>{" "}
              <span style={{ color: "var(--text-3)" }}>{dt.headlineMid}</span>{" "}
              <span style={{ color: "var(--text)" }}>{format(dt.headlineInvoices, { n: toInvoiceCount })}</span>{" "}
              <span style={{ color: "var(--text-3)" }}>{dt.headlineEnd}</span>
            </h1>
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              {d.examLive && (
                <Link className="btn btn-dark" href={`/esami/${d.examLive.id}`}>
                  <span className="s-dot success pulse" />
                  {dt.examLive} · {d.examLive.shortTitle}
                  <Icon name="arrow" size={13} />
                </Link>
              )}
              <Link className="btn" href="/corsi">
                <Icon name="book" size={13} />
                {dt.openCatalog}
              </Link>
              <MonthReportButton courses={d.reportCourses} />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: 20,
              background: "rgba(255,255,255,0.7)",
              borderRadius: 12,
              backdropFilter: "blur(8px)",
              border: "1px solid var(--border-2)",
            }}
          >
            <div className="eyebrow">{dt.pipelineTitle}</div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {(kpis.totalRevenue / 1000).toFixed(1)}
              <span style={{ fontSize: "0.6em", color: "var(--text-3)", marginLeft: 4 }}>k €</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>
              {format(dt.pipelineSeats, { enrolled: kpis.totalEnrolled, total: kpis.totalCapacity })}
            </div>
            <div className="bar azzurro" style={{ marginTop: 10 }}>
              <i style={{ width: `${occupancy}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* KPI row */}
      <section className="kpi-grid cols-4" style={{ marginBottom: 28 }}>
        <KPI
          anim
          label={dt.kpi.activeCourses}
          value={kpis.activeCount}
          sub={format(dt.kpi.belowThreshold, { n: kpis.atRiskCount })}
          delta={`+${kpis.activeCount - kpis.pastCount}`}
          deltaDir="up"
          accent="indigo"
        />
        <KPI
          anim
          label={dt.kpi.totalEnrolled}
          value={kpis.totalEnrolled.toLocaleString(locale)}
          sub={format(dt.kpi.avgPerCourse, { n: avgPerCourse })}
          delta="+18%"
          deltaDir="up"
          accent="azzurro"
        />
        <KPI
          anim
          label={dt.kpi.expectedMargin}
          value={Math.round(kpis.totalMargin / 1000)}
          unit="k €"
          sub={format(dt.kpi.onRevenue, { n: marginPct })}
          delta="-4%"
          deltaDir="dn"
          accent={kpis.totalMargin > 0 ? "green" : "danger"}
        />
        <KPI
          anim
          label={dt.kpi.examPassRate}
          value="78"
          unit="%"
          sub={dt.kpi.last12}
          delta="+3%"
          deltaDir="up"
          accent="oro"
        />
      </section>

      {/* Memoria operativa: SKU stock watches + online-course kit shipping,
          merged into one section. */}
      <StockAlertsPanel
        initialAlerts={stockAlerts}
        shipments={d.reminders.shipments.map((sh) => ({
          courseId: sh.courseId,
          shortTitle: sh.shortTitle,
          enrolled: sh.enrolled,
          shipBy: sh.shipBy,
        }))}
      />

      {/* Pipeline strip */}
      <section className="card" style={{ marginBottom: 28 }}>
        <div className="card-head">
          <div>
            <div className="h3">{dt.pipelineTitle}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{dt.pipelineSub}</div>
          </div>
          <Link href="/corsi" className="btn btn-sm">
            {dt.seeAll}
            <Icon name="arrow" size={11} />
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
          {d.pipeline.map((p, i) => (
            <div
              key={p.monthKey}
              style={{
                padding: "18px 20px 20px",
                borderRight: i < 5 ? "1px solid var(--border-2)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  fontWeight: 500,
                  marginBottom: 6,
                }}
              >
                {monthLabel(p.monthKey, locale)} 2026
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {p.count}
                <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 6, fontWeight: 400 }}>
                  {dt.courses}
                </span>
              </div>
              <div style={{ height: 56, display: "flex", alignItems: "flex-end", gap: 3, marginTop: 12 }}>
                {p.bars.map((bar, j) => (
                  <PipelineBar key={bar.courseId ?? `empty-${j}`} bar={bar} />
                ))}
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border-2)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 4,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-4)",
                      fontWeight: 600,
                      letterSpacing: "var(--ls-caps)",
                      textTransform: "uppercase",
                      marginBottom: 3,
                    }}
                  >
                    {dt.enrolledLabel}
                  </div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.005em" }}
                    className="num"
                  >
                    {p.enrolled}
                    <span style={{ color: "var(--text-4)", fontWeight: 400 }}>/{p.capacity || 0}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-4)",
                      fontWeight: 600,
                      letterSpacing: "var(--ls-caps)",
                      textTransform: "uppercase",
                      marginBottom: 3,
                    }}
                  >
                    {dt.revenueLabel}
                  </div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.005em" }}
                    className="num"
                  >
                    {(p.revenue / 1000).toFixed(1)}
                    <span style={{ color: "var(--text-4)", fontWeight: 400, marginLeft: 1 }}>k€</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Two columns: attention + recent */}
      <section style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="h3">{dt.attention.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {format(dt.attention.sub, { n: kpis.atRiskCount })}
              </div>
            </div>
            <button className="btn btn-sm btn-ghost">
              <Icon name="filter" size={12} />
            </button>
          </div>
          <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
            <table className="table">
              <tbody>
                {d.attention.map((c) => (
                  <tr key={c.id} className="clickable">
                    <td style={{ width: 56 }}>
                      <Link
                        href={`/corsi/${c.id}`}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-2)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--text-2)",
                        }}
                        className="num"
                      >
                        {c.day}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/corsi/${c.id}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</Badge>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.shortTitle}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                            {monthLabel(c.monthKey, locale)} · {c.city} · {c.educatorName}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>
                          {c.enrolled}/{c.capacity}
                        </span>
                        <div
                          className={`bar ${c.enrolled < c.minStudents ? "warning" : "azzurro"}`}
                          style={{ flex: 1 }}
                        >
                          <i style={{ width: `${c.capacity ? (c.enrolled / c.capacity) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={c.status} label={t.status[c.status]} />
                    </td>
                    <td style={{ width: 30 }}>
                      <Icon name="chevron" size={14} className="text-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="h3">{dt.recent.title}</div>
            <Link href="/corsisti" className="btn btn-sm btn-ghost">
              {dt.viewAll}
              <Icon name="arrow" size={11} />
            </Link>
          </div>
          <div style={{ padding: "4px 0" }}>
            {d.recent.map((e, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  borderBottom: i < d.recent.length - 1 ? "1px solid var(--border-2)" : "none",
                }}
              >
                <Avatar name={e.name} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {e.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-3)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {e.courseShortTitle} · {e.city}
                  </div>
                </div>
                {e.discountCode && <Badge tone="oro">{e.discountCode}</Badge>}
                <span
                  style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}
                  className="num"
                >
                  {e.amount}€
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom row: top educators + community */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 28 }}>
        <div className="card">
          <div className="card-head">
            <div className="h3">{dt.topEducators.title}</div>
            <Link href="/educator" className="btn btn-sm btn-ghost">
              {dt.viewAll}
              <Icon name="arrow" size={11} />
            </Link>
          </div>
          <div>
            {d.topEducators.map((e, i) => (
              <Link
                key={e.id}
                href={`/educator/${e.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 20px",
                  borderBottom: i < d.topEducators.length - 1 ? "1px solid var(--border-2)" : "none",
                }}
              >
                <Avatar name={e.name} initials={e.initials} size="md" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                    {e.role} · {e.city}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1 }} className="num">
                    {e.courseCount}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>
                    {format(dt.topEducators.enrolledCount, { n: e.enrolled })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {dt.community.title}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 16 }}>
            <span
              style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}
              className="num"
            >
              {d.community.total}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>
              {dt.community.totalSince}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <MiniStat label={dt.community.current} value={d.community.current} sub={dt.community.currentSub} />
            <MiniStat
              label={dt.community.returning}
              value={d.community.returning}
              sub={format(dt.community.returningSub, { n: d.community.returningPct })}
              accent="oro"
            />
            <MiniStat
              label={dt.community.certified}
              value={d.community.certified}
              sub={dt.community.certifiedSub}
              accent="success"
            />
          </div>
          <div
            style={{
              marginTop: 18,
              padding: 14,
              background: "var(--indigo-50)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--text-2)",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <Icon name="sparkle" size={14} className="text-3" />
            <span>
              <strong style={{ color: "var(--text)" }}>{dt.community.insight}</strong> —{" "}
              {format(dt.community.insightText, { x: "2.3" })}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent?: string;
}) {
  return (
    <div style={{ paddingTop: 12, borderTop: `2px solid var(--${accent || "border"})` }}>
      <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.01em" }} className="num">
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}
