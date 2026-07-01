"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, KPI, PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import { monthLabel } from "@/lib/dashboard";
import type { RoleKey } from "@/lib/domain";
import {
  isToInvoice,
  type EconCourseRow,
} from "@/lib/economics/types";
import {
  setCourseAdvAction,
  setCourseInvoicedAction,
} from "@/lib/economics/actions";

type Filter = "all" | "toInvoice" | "withCampaign";

export function ContoEconomicoClient({
  rows,
  role,
  locale,
  canEditAdv,
  canEditInvoice,
}: {
  rows: EconCourseRow[];
  role: RoleKey;
  locale: string;
  canEditAdv: boolean;
  canEditInvoice: boolean;
}) {
  const t = useT().contoEconomico;
  // Accountant lands on the work to do; everyone else sees all.
  const [filter, setFilter] = useState<Filter>(role === "accountant" ? "toInvoice" : "all");

  const summary = useMemo(() => {
    const toInvoice = rows.filter(isToInvoice).length;
    const invoiced = rows.filter((r) => r.econ.invoiced).length;
    const withCampaign = rows.filter((r) => r.econ.advCost != null).length;
    const totalAdv = rows.reduce((s, r) => s + (r.econ.advCost ?? 0), 0);
    return { toInvoice, invoiced, withCampaign, totalAdv };
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === "toInvoice") return rows.filter(isToInvoice);
    if (filter === "withCampaign") return rows.filter((r) => r.econ.advCost != null);
    return rows;
  }, [rows, filter]);

  const roleHint =
    role === "social"
      ? t.hintSocial
      : role === "accountant"
        ? t.hintAccountant
        : t.hintManager;

  return (
    <div className="page">
      <PageHeader eyebrow={t.eyebrow} title={t.title} sub={roleHint} />

      <section className="kpi-grid cols-4" style={{ margin: "16px 0 20px" }}>
        <KPI label={t.kpiToInvoice} value={summary.toInvoice} accent="warning" />
        <KPI label={t.kpiInvoiced} value={summary.invoiced} accent="success" />
        <KPI label={t.kpiWithCampaign} value={summary.withCampaign} />
        <KPI label={t.kpiTotalAdv} value={formatEuro(summary.totalAdv)} />
      </section>

      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
          {t.filterAll}
        </button>
        <button className={filter === "toInvoice" ? "on" : ""} onClick={() => setFilter("toInvoice")}>
          {t.filterToInvoice} ({summary.toInvoice})
        </button>
        <button className={filter === "withCampaign" ? "on" : ""} onClick={() => setFilter("withCampaign")}>
          {t.filterWithCampaign}
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colCourse}</th>
              <th>{t.colPlace}</th>
              <th>{t.colStatus}</th>
              <th style={{ minWidth: 150 }}>{t.colCampaign}</th>
              <th style={{ minWidth: 160 }}>{t.colInvoicing}</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-3" style={{ padding: 24, textAlign: "center" }}>
                  {t.empty}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge tone={r.type === "certificato" ? "azzurro" : r.type === "introduttivo" ? "oro" : "neutral"}>
                        {r.typeLabel.toUpperCase()}
                      </Badge>
                      <span>{r.title}</span>
                    </div>
                  </td>
                  <td className="text-3" style={{ whiteSpace: "nowrap" }}>
                    {r.city} · {monthLabel(r.month, locale).slice(0, 3)} {r.year}
                  </td>
                  <td>
                    {r.ended ? (
                      <Badge tone="neutral">{t.statusEnded}</Badge>
                    ) : (
                      <span className="text-3" style={{ fontSize: 12 }}>{t.statusPlanned}</span>
                    )}
                  </td>
                  <td>
                    <AdvCell row={r} canEdit={canEditAdv} t={t} />
                  </td>
                  <td>
                    <InvoiceCell row={r} canEdit={canEditInvoice} t={t} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type T = ReturnType<typeof useT>["contoEconomico"];

// ===== Campaign / ADV cell =====

function AdvCell({
  row,
  canEdit,
  t,
}: {
  row: EconCourseRow;
  canEdit: boolean;
  t: T;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(row.econ.advCost != null ? String(row.econ.advCost) : "");

  if (!canEdit) {
    // Read-only signal: filled value, or grey "not set".
    return row.econ.advCost != null ? (
      <span
        style={{ fontWeight: 600 }}
        title={row.econ.advBy ? `${t.advBy} ${row.econ.advBy}` : undefined}
      >
        {formatEuro(row.econ.advCost)}
      </span>
    ) : (
      <span className="text-3" style={{ color: "var(--text-3)", fontStyle: "italic" }}>
        {t.advNotSet}
      </span>
    );
  }

  function save() {
    const trimmed = draft.trim();
    const amount = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (amount != null && Number.isNaN(amount)) return;
    const current = row.econ.advCost;
    if ((amount ?? null) === (current ?? null)) return; // no change
    startTransition(async () => {
      const res = await setCourseAdvAction(row.id, amount);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span className="text-3" style={{ fontSize: 13 }}>€</span>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={pending}
        placeholder={t.advPlaceholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        style={{
          width: 86,
          padding: "5px 8px",
          fontSize: 13,
          border: "1px solid var(--border-2)",
          borderRadius: 6,
          background: "var(--surface)",
        }}
      />
    </div>
  );
}

// ===== Invoicing cell =====

function InvoiceCell({
  row,
  canEdit,
  t,
}: {
  row: EconCourseRow;
  canEdit: boolean;
  t: T;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      const res = await setCourseInvoicedAction(row.id, next);
      if (res.ok) router.refresh();
    });
  }

  if (!canEdit) {
    // Read-only signal.
    if (row.econ.invoiced)
      return (
        <Badge tone="success" dot>
          {t.invMarked}
        </Badge>
      );
    if (row.ended)
      return (
        <span className="text-3" style={{ color: "var(--text-3)", fontStyle: "italic" }}>
          {t.invToInvoice}
        </span>
      );
    return <span className="text-3">—</span>;
  }

  // Editable.
  if (row.econ.invoiced) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Badge tone="success" dot>{t.invMarked}</Badge>
        <button
          className="link"
          disabled={pending}
          onClick={() => toggle(false)}
          style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
        >
          {t.invUnmark}
        </button>
      </span>
    );
  }
  if (!row.ended) {
    return <span className="text-3" style={{ fontSize: 12 }}>{t.invNotEnded}</span>;
  }
  return (
    <button className="btn btn-primary" disabled={pending} onClick={() => toggle(true)} style={{ height: 28, fontSize: 12.5 }}>
      {t.invMark}
    </button>
  );
}
