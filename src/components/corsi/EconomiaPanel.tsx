"use client";

import { Icon, KPI } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatEuro, formatNumberIt } from "@/lib/format";
import {
  StockBadge,
  SakeProductPicker,
  type ScCatalogItem,
} from "@/components/sake/SakeProductPicker";
import type { CostLine, StockCheckRow } from "./programma-types";
import { CostLineRow } from "./programma-rows";

// Presentational economics side of the Programma & Economia section: the
// financial KPI strip, the conto economico (auto + editable cost lines), the
// margin card and the Sake Company live stock check. All state lives in
// ProgrammaEconomiaSection; the left program column is passed as `children`
// so the KPI strip (above the grid) and the right column (inside it) keep
// their exact places in the layout.
export function EconomiaPanel({
  revenue,
  price,
  enrolled,
  sakeCost,
  bottlesPerSku,
  autoLines,
  customLines,
  updateCustom,
  addCustom,
  removeCustom,
  stockCheck,
  catalogReady,
  replacingSku,
  setReplacingSku,
  replaceSakeEverywhere,
  children,
}: {
  revenue: number;
  price: number;
  enrolled: number;
  sakeCost: number;
  bottlesPerSku: number;
  autoLines: CostLine[];
  customLines: CostLine[];
  updateCustom: (id: string, patch: Partial<CostLine>) => void;
  addCustom: () => void;
  removeCustom: (id: string) => void;
  stockCheck: StockCheckRow[];
  catalogReady: boolean;
  /** Which stock-check row (by SKU) has its "sostituisci prodotto" picker open. */
  replacingSku: string | null;
  setReplacingSku: React.Dispatch<React.SetStateAction<string | null>>;
  replaceSakeEverywhere: (oldCode: string, item: ScCatalogItem) => void;
  /** The left program column (days/sakes editor) rendered by the parent. */
  children: React.ReactNode;
}) {
  const tr = useT();
  const t = tr.corsi.programma;

  const insufficientCount = stockCheck.filter((r) => r.insufficient).length;

  const totalAuto = autoLines.reduce((s, l) => s + l.value, 0);
  const totalCustom = customLines.reduce((s, l) => s + l.value, 0);
  const totalCost = totalAuto + totalCustom;
  const margin = revenue - totalCost;
  const marginPct = revenue ? Math.round((margin / revenue) * 100) : 0;
  const marginPerIscritto = enrolled ? Math.round(margin / enrolled) : 0;

  return (
    <>
      {/* Financial KPI strip */}
      <div className="kpi-grid cols-4" style={{ marginBottom: 20 }}>
        <KPI
          label={t.kpiRevenue}
          value={formatNumberIt(revenue)}
          unit="€"
          sub={format(t.kpiAvgPrice, { n: enrolled, p: formatNumberIt(price) })}
          accent="indigo"
        />
        <KPI
          label={t.kpiTotalCosts}
          value={formatNumberIt(totalCost)}
          unit="€"
          sub={format(t.kpiSakeVariable, { s: formatNumberIt(sakeCost), v: formatNumberIt(totalCustom) })}
        />
        <KPI
          label={t.kpiNetMargin}
          value={`${margin >= 0 ? "+" : ""}${formatNumberIt(margin)}`}
          unit="€"
          sub={format(t.kpiOnRevenue, { n: marginPct })}
          accent={margin >= 0 ? "green" : "danger"}
        />
        <KPI
          label={t.kpiMarginPerStudent}
          value={`${marginPerIscritto >= 0 ? "+" : ""}${marginPerIscritto}`}
          unit="€"
          sub={format(t.kpiBreakeven, { n: price ? Math.ceil(totalCost / price) : "—" })}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        {/* LEFT: program */}
        {children}

        {/* RIGHT: economics */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div className="eyebrow">{t.econTitle}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{t.econSub}</div>
            </div>
            <button className="btn btn-sm" onClick={addCustom}>
              <Icon name="plus" size={12} />
              {t.customLine}
            </button>
          </div>

          <div className="card">
            <div
              style={{
                padding: "10px 16px",
                background: "var(--surface-2)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "var(--ls-caps)",
                  textTransform: "uppercase",
                  color: "var(--text-4)",
                }}
              >
                {t.automatic}
              </div>
              <span className="num" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {formatEuro(totalAuto)}
              </span>
            </div>
            {autoLines.map((line) => (
              <CostLineRow key={line.id} line={line} locked />
            ))}

            <div
              style={{
                padding: "10px 16px",
                background: "var(--surface-2)",
                borderTop: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "var(--ls-caps)",
                  textTransform: "uppercase",
                  color: "var(--text-4)",
                }}
              >
                {t.editable}
              </div>
              <span className="num" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {formatEuro(totalCustom)}
              </span>
            </div>
            {customLines.map((line) => (
              <CostLineRow
                key={line.id}
                line={line}
                onChange={(p) => updateCustom(line.id, p)}
                onRemove={() => removeCustom(line.id)}
              />
            ))}

            <div
              style={{
                padding: "14px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                background: "var(--surface-2)",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t.totalCosts}</span>
              <span className="num" style={{ fontWeight: 600, fontSize: 18, letterSpacing: "-0.01em" }}>
                {formatEuro(totalCost)}
              </span>
            </div>
          </div>

          <div
            className="card card-pad"
            style={{
              marginTop: 12,
              background: margin >= 0 ? "var(--success-bg)" : "var(--danger-bg)",
              border: `1px solid ${margin >= 0 ? "var(--success)" : "var(--danger)"}`,
              boxShadow: "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
              <div>
                <div
                  className="eyebrow"
                  style={{ marginBottom: 6, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}
                >
                  {t.netMargin}
                </div>
                <div
                  className="num"
                  style={{
                    fontSize: 30,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)",
                    lineHeight: 1,
                  }}
                >
                  {margin >= 0 ? "+" : ""}
                  {formatEuro(margin)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  className="eyebrow"
                  style={{ marginBottom: 4, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}
                >
                  %
                </div>
                <div
                  className="num"
                  style={{ fontSize: 22, fontWeight: 600, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}
                >
                  {marginPct}%
                </div>
              </div>
            </div>
          </div>

          {/* Sake Company live stock check */}
          <div className="card" style={{ marginTop: 12, overflow: "hidden" }}>
            <div
              style={{
                padding: "11px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background:
                  insufficientCount > 0 ? "var(--danger-bg)" : "var(--surface-2)",
              }}
            >
              <Icon
                name={insufficientCount > 0 ? "warn" : "tag"}
                size={13}
                style={{
                  color:
                    insufficientCount > 0 ? "var(--danger-fg)" : "var(--text-3)",
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{t.stockTitle}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>
                  {format(t.stockSub, { b: bottlesPerSku, s: enrolled || 0 })}
                </div>
              </div>
              {insufficientCount > 0 && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "var(--danger-fg)",
                    background: "var(--surface)",
                    padding: "2px 8px",
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {format(t.stockInsufficient, { n: insufficientCount })}
                </span>
              )}
            </div>

            {!catalogReady && (
              <div style={{ padding: "12px 16px", fontSize: 11.5, color: "var(--text-4)", fontStyle: "italic" }}>
                {t.stockNoCatalog}
              </div>
            )}
            {catalogReady && stockCheck.length === 0 && (
              <div style={{ padding: "12px 16px", fontSize: 11.5, color: "var(--text-4)", fontStyle: "italic" }}>
                {t.stockAllOk}
              </div>
            )}
            {catalogReady &&
              stockCheck.map((r) => (
                <div
                  key={r.sake.code}
                  style={{
                    padding: "9px 16px",
                    borderTop: "1px solid var(--border-2)",
                    borderLeft: `3px solid ${
                      r.insufficient ? "var(--danger)" : r.low ? "var(--warning)" : "transparent"
                    }`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.item?.name ?? r.sake.name}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>
                        {r.sake.code} · {t.stockNeed} {r.need} {t.stockBottles}
                        {r.insufficient && (
                          <span style={{ color: "var(--danger-fg)", fontWeight: 600 }}>
                            {" "}· {t.stockSubstitute}
                          </span>
                        )}
                      </div>
                    </div>
                    <StockBadge stock={r.stock} />
                    <button
                      className="btn btn-icon btn-sm btn-ghost"
                      title={t.stockReplace}
                      onClick={() => setReplacingSku((cur) => (cur === r.sake.code ? null : r.sake.code))}
                    >
                      <Icon name="refresh" size={12} />
                    </button>
                  </div>
                  {replacingSku === r.sake.code && (
                    <div style={{ marginTop: 8 }}>
                      <SakeProductPicker
                        placeholder={t.stockReplaceSearch}
                        excludeSkus={[r.sake.code]}
                        onPick={(item) => {
                          replaceSakeEverywhere(r.sake.code, item);
                          setReplacingSku(null);
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
