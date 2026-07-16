"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Icon, KPI, PageHeader, type BadgeTone } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import {
  paymentStatusKind,
  summarizePayments,
  type PaymentRow,
} from "@/lib/pagamenti/summary";
import { isPaidRevenue } from "@/lib/economics/revenue";

const PAGE_SIZE = 300;

type ClusterFilter = "tutti" | "corso" | "libro" | "evento" | "merchandise" | "altro";
type StatusFilter = "tutti" | "pagato" | "sospeso";

// One color = one meaning: green stays reserved for the PAID state below.
const CLUSTER_TONE: Record<string, BadgeTone> = {
  corso: "indigo",
  evento: "azzurro",
  libro: "oro",
  merchandise: "navy",
  altro: "neutral",
};

function formatDateIt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PagamentiClient({ rows }: { rows: PaymentRow[] }) {
  const t = useT().pagamenti;
  const [search, setSearch] = useState("");
  const [cluster, setCluster] = useState<ClusterFilter>("tutti");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState<StatusFilter>("tutti");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Register-level KPIs: always computed on the FULL dataset, not the filters.
  const summary = useMemo(() => summarizePayments(rows), [rows]);

  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const r of rows) if (r.orderedAt) ys.add(r.orderedAt.slice(0, 4));
    return [...ys].sort().reverse();
  }, [rows]);

  const list = useMemo(() => {
    let l = rows;
    if (cluster !== "tutti") l = l.filter((r) => r.cluster === cluster);
    if (year) l = l.filter((r) => r.orderedAt?.slice(0, 4) === year);
    if (status === "pagato") l = l.filter((r) => isPaidRevenue(r.financialStatus));
    if (status === "sospeso")
      l = l.filter((r) => paymentStatusKind(r.financialStatus) === "pending");
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((r) =>
        `${r.buyerName ?? ""} ${r.buyerEmail ?? ""} ${r.orderName ?? ""} ${r.productTitle}`
          .toLowerCase()
          .includes(q),
      );
    }
    return l; // server order preserved: ordered_at desc
  }, [rows, cluster, year, status, search]);

  const clusterLabel = (c: string) =>
    c === "corso"
      ? t.clusterCorso
      : c === "evento"
        ? t.clusterEvento
        : c === "libro"
          ? t.clusterLibro
          : c === "merchandise"
            ? t.clusterMerchandise
            : c === "altro"
              ? t.clusterAltro
              : c;

  const statusLabel = (r: PaymentRow) => {
    const kind = paymentStatusKind(r.financialStatus);
    if (kind === "paid") return t.badgePaid;
    if (kind === "pending") return t.badgePending;
    if (kind === "refunded")
      return r.financialStatus === "voided" ? t.badgeVoided : t.badgeRefunded;
    return "—";
  };

  const segments: [ClusterFilter, string][] = [
    ["tutti", t.filterAll],
    ["corso", t.filterCorsi],
    ["libro", t.filterLibri],
    ["evento", t.filterEventi],
    ["merchandise", t.filterMerch],
    ["altro", t.filterAltro],
  ];

  function exportCsv() {
    // Exports ALL filtered rows, not only the revealed ones.
    downloadCsv(
      "pagamenti",
      toCsv(
        ["Data", "Ordine", "Acquirente", "Email", "Prodotto", "Tipo", "Q.tà", "Lordo €", "Sconto €", "Netto €", "Stato"],
        list.map((r) => [
          formatDateIt(r.orderedAt),
          r.orderName,
          r.buyerName,
          r.buyerEmail,
          r.productTitle,
          clusterLabel(r.cluster),
          r.quantity,
          (r.grossCents / 100).toFixed(2),
          (r.discountCents / 100).toFixed(2),
          (r.netCents / 100).toFixed(2),
          statusLabel(r),
        ]),
      ),
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        sub={t.sub}
        actions={
          <button className="btn" onClick={exportCsv}>
            <Icon name="download" size={13} />
            {t.exportCsv}
          </button>
        }
      />

      <section className="kpi-grid cols-4" style={{ margin: "16px 0 20px" }}>
        <KPI
          label={t.kpiTotal}
          value={formatEuro(summary.totalPaidCents / 100)}
          sub={t.kpiTotalSub}
          accent="success"
        />
        <KPI
          label={t.kpiMonth}
          value={formatEuro(summary.monthPaidCents / 100)}
          sub={t.kpiMonthSub}
        />
        <KPI
          label={t.kpiPending}
          value={formatEuro(summary.pendingCents / 100)}
          sub={t.kpiPendingSub}
          accent="warning"
        />
        <KPI label={t.kpiOrders} value={summary.orderCount} sub={t.kpiOrdersSub} />
      </section>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 300px" }}>
          <Icon name="search" size={14} className="topbar-search-icon" />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="segmented">
          {segments.map(([k, l]) => (
            <button key={k} className={cluster === k ? "on" : ""} onClick={() => setCluster(k)}>
              {l}
            </button>
          ))}
        </div>
        <select
          className="select"
          style={{ width: "auto" }}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">{t.yearAll}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: "auto" }}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="tutti">{t.statusAll}</option>
          <option value="pagato">{t.statusPaid}</option>
          <option value="sospeso">{t.statusPending}</option>
        </select>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>
          {format(t.count, { n: list.length })}
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colDate}</th>
              <th>{t.colOrder}</th>
              <th>{t.colBuyer}</th>
              <th>{t.colProduct}</th>
              <th>{t.colType}</th>
              <th style={{ textAlign: "right" }}>{t.colQty}</th>
              <th style={{ textAlign: "right" }}>{t.colAmount}</th>
              <th>{t.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-3" style={{ padding: 24, textAlign: "center" }}>
                  {t.empty}
                </td>
              </tr>
            ) : (
              // Purchases ids are unstable across re-syncs → index keys are the
              // only stable-enough choice, and safe within a single render.
              list.slice(0, visible).map((r, i) => {
                const kind = paymentStatusKind(r.financialStatus);
                return (
                  <tr key={`${r.externalId}:${i}`}>
                    <td className="text-3" style={{ whiteSpace: "nowrap" }}>
                      {formatDateIt(r.orderedAt)}
                    </td>
                    <td className="num" style={{ fontSize: 12.5 }}>
                      {r.orderName ?? "—"}
                    </td>
                    <td>
                      {r.buyerEmail ? (
                        <Link
                          className="link"
                          href={`/corsisti/${encodeURIComponent(r.buyerEmail)}`}
                          style={{ fontWeight: 600 }}
                        >
                          {r.buyerName ?? r.buyerEmail}
                        </Link>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{r.buyerName ?? "—"}</span>
                      )}
                    </td>
                    <td>
                      {r.courseHandle ? (
                        <Link className="link" href={`/corsi/${r.courseHandle}`}>
                          {r.productTitle}
                        </Link>
                      ) : (
                        <span>{r.productTitle}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={CLUSTER_TONE[r.cluster] ?? "neutral"}>
                        {clusterLabel(r.cluster)}
                      </Badge>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {r.quantity}
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatEuro(r.netCents / 100)}
                    </td>
                    <td>
                      {kind === "none" ? (
                        <span className="text-mute">—</span>
                      ) : (
                        <Badge
                          tone={
                            kind === "paid"
                              ? "success"
                              : kind === "pending"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {statusLabel(r)}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {list.length > visible && (
        <div style={{ padding: 14, textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>
          {format(t.showingOf, { shown: Math.min(visible, list.length), n: list.length })}{" "}
          <button className="link" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            {t.showMore}
          </button>
        </div>
      )}
    </div>
  );
}
