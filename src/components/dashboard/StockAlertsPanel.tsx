"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import {
  SakeProductPicker,
  StockBadge,
  type ScCatalogItem,
} from "@/components/sake/SakeProductPicker";
import { fetchSakeCatalog } from "@/lib/integrations/sakecompany/actions";
import { saveStockAlertsAction, sendTestStockAlertAction } from "./stock-alerts-actions";
import type { StockAlert } from "@/lib/domain";

export interface KitShipment {
  courseId: string;
  shortTitle: string;
  enrolled: number;
  shipBy: number; // days until the kit must ship (can be negative = overdue)
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sa_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }
}

export function StockAlertsPanel({
  initialAlerts,
  shipments = [],
}: {
  initialAlerts: StockAlert[];
  shipments?: KitShipment[];
}) {
  const t = useT();
  const s = t.dashboard.stockAlerts;
  const [alerts, setAlerts] = useState<StockAlert[]>(initialAlerts);
  const [catBySku, setCatBySku] = useState<Map<string, ScCatalogItem>>(new Map());
  const [adding, setAdding] = useState(false);
  const [draftSkus, setDraftSkus] = useState<string[]>([]);
  const [draftMin, setDraftMin] = useState(10);
  const [draftLabel, setDraftLabel] = useState("");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    fetchSakeCatalog()
      .then((c) => {
        if (!alive) return;
        const m = new Map<string, ScCatalogItem>();
        for (const it of c) if (it.sku) m.set(it.sku, it);
        setCatBySku(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function persist(next: StockAlert[]) {
    const prev = alerts;
    setAlerts(next);
    startTransition(async () => {
      const r = await saveStockAlertsAction(next);
      if (!r.ok) {
        setAlerts(prev); // revert so the UI matches what's actually saved
        setTestMsg(r.error || "Salvataggio non riuscito");
        setTimeout(() => setTestMsg(null), 5000);
      }
    });
  }

  function addDraftSku(item: ScCatalogItem) {
    if (!item.sku || draftSkus.includes(item.sku)) return;
    setDraftSkus((p) => [...p, item.sku as string]);
    setCatBySku((m) => {
      if (item.sku && !m.has(item.sku)) {
        const n = new Map(m);
        n.set(item.sku, item);
        return n;
      }
      return m;
    });
    if (!draftLabel) setDraftLabel(item.productTitle);
  }

  function saveDraft() {
    if (draftSkus.length === 0) return;
    const label =
      draftLabel.trim() ||
      catBySku.get(draftSkus[0])?.productTitle ||
      draftSkus[0];
    persist([
      ...alerts,
      { id: newId(), label, skus: draftSkus, min: Math.max(0, draftMin) },
    ]);
    setAdding(false);
    setDraftSkus([]);
    setDraftMin(10);
    setDraftLabel("");
  }

  function removeAlert(id: string) {
    persist(alerts.filter((a) => a.id !== id));
  }
  function setMin(id: string, min: number) {
    persist(alerts.map((a) => (a.id === id ? { ...a, min: Math.max(0, min) } : a)));
  }

  // Test email to Camilla — lets staff verify the stock-alert email works.
  function sendTest() {
    setTestMsg(null);
    startTransition(async () => {
      const r = await sendTestStockAlertAction();
      setTestMsg(r.ok ? s.testSent : r.error || s.testErr);
      setTimeout(() => setTestMsg(null), 5000);
    });
  }

  const triggered = useMemo(
    () =>
      alerts.filter((a) =>
        a.skus.some((sku) => {
          const st = catBySku.get(sku)?.stock;
          return st != null && st < a.min;
        }),
    ).length,
    [alerts, catBySku],
  );

  return (
    <section className="card" style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
      <div
        className="card-head"
        style={{ borderBottom: "1px solid var(--border)", alignItems: "center" }}
      >
        <div>
          <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 24,
                height: 24,
                borderRadius: 6,
                background: triggered > 0 ? "var(--danger-bg)" : "var(--surface-2)",
                color: triggered > 0 ? "var(--danger-fg)" : "var(--text-3)",
              }}
            >
              <Icon name="tag" size={13} />
            </span>
            {s.title}
            {triggered > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--danger-fg)",
                  background: "var(--danger-bg)",
                  padding: "1px 8px",
                  borderRadius: 999,
                }}
              >
                {triggered} {s.belowThreshold}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{s.sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {testMsg && (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{testMsg}</span>
          )}
          <button className="btn btn-sm btn-ghost" onClick={sendTest} title={s.testHint}>
            <Icon name="mail" size={12} />
            {s.testBtn}
          </button>
          {!adding && (
            <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={12} />
              {s.add}
            </button>
          )}
        </div>
      </div>

      {/* Spedizioni kit — corsi online */}
      {shipments.length > 0 && (
        <div style={{ borderBottom: "1px solid var(--border-2)", padding: "12px 16px" }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "var(--ls-caps)",
              textTransform: "uppercase",
              color: "var(--text-4)",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="download" size={12} />
            {s.shipmentsTitle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shipments.map((sh) => {
              const urgent = sh.shipBy <= 3;
              return (
                <a
                  key={sh.courseId}
                  href={`/corsi/${sh.courseId}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    borderRadius: 8,
                    textDecoration: "none",
                    background: urgent ? "var(--danger-bg)" : "var(--surface-2)",
                    borderLeft: `3px solid ${urgent ? "var(--danger)" : "var(--indigo)"}`,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: urgent ? "var(--danger-fg)" : "var(--indigo-600)",
                      minWidth: 54,
                    }}
                  >
                    {sh.shipBy <= 0
                      ? s.shipNow
                      : format(s.shipInDays, { n: sh.shipBy })}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
                    {sh.shortTitle}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                    {format(s.shipKits, { n: sh.enrolled })}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {adding && (
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border-2)",
            background: "var(--surface-2)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <SakeProductPicker
            onPick={addDraftSku}
            excludeSkus={draftSkus}
            placeholder={s.pickPlaceholder}
          />
          {draftSkus.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {draftSkus.map((sku) => {
                const it = catBySku.get(sku);
                return (
                  <span
                    key={sku}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11.5,
                      padding: "3px 6px 3px 8px",
                      borderRadius: 8,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {it?.name ?? sku}
                    <StockBadge stock={it?.stock ?? null} />
                    <button
                      className="btn btn-icon btn-ghost"
                      style={{ width: 18, height: 18 }}
                      onClick={() => setDraftSkus((p) => p.filter((x) => x !== sku))}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              {s.nameLabel}
              <input
                className="input"
                style={{ height: 30, width: 200 }}
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder={s.namePlaceholder}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              {s.minLabel}
              <input
                type="number"
                min={0}
                className="input"
                style={{ height: 30, width: 80 }}
                value={draftMin}
                onChange={(e) => setDraftMin(Number(e.target.value))}
              />
            </label>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setAdding(false);
                  setDraftSkus([]);
                  setDraftLabel("");
                  setDraftMin(10);
                }}
              >
                {s.cancel}
              </button>
              <button
                className="btn btn-sm btn-primary"
                disabled={draftSkus.length === 0}
                onClick={saveDraft}
              >
                {s.save}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: alerts.length === 0 ? 0 : "6px 0" }}>
        {alerts.length === 0 && !adding && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-4)",
              fontSize: 12.5,
              fontStyle: "italic",
            }}
          >
            {s.empty}
          </div>
        )}
        {alerts.map((a) => {
          const inAlarm = a.skus.some((sku) => {
            const st = catBySku.get(sku)?.stock;
            return st != null && st < a.min;
          });
          return (
            <div
              key={a.id}
              style={{
                padding: "11px 16px",
                borderBottom: "1px solid var(--border-2)",
                borderLeft: `3px solid ${inAlarm ? "var(--danger)" : "transparent"}`,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {inAlarm && (
                    <Icon name="warn" size={13} style={{ color: "var(--danger-fg)" }} />
                  )}
                  {a.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  {a.skus.map((sku) => {
                    const it = catBySku.get(sku);
                    const st = it?.stock ?? null;
                    const low = st != null && st < a.min;
                    return (
                      <span
                        key={sku}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11.5,
                          padding: "2px 8px 2px 2px",
                          borderRadius: 999,
                          background: low ? "var(--danger-bg)" : "var(--surface-2)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {it?.image ? (
                          <Image
                            src={it.image}
                            alt=""
                            width={20}
                            height={20}
                            style={{ borderRadius: 999, objectFit: "cover" }}
                            unoptimized
                          />
                        ) : (
                          <span
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 999,
                              background: "var(--surface)",
                              display: "inline-block",
                            }}
                          />
                        )}
                        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {it?.name ?? sku}
                        </span>
                        <StockBadge stock={st} />
                      </span>
                    );
                  })}
                </div>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  color: "var(--text-3)",
                  flexShrink: 0,
                }}
              >
                {s.minShort}
                <input
                  type="number"
                  min={0}
                  className="input"
                  style={{ height: 28, width: 64 }}
                  value={a.min}
                  onChange={(e) => setMin(a.id, Number(e.target.value))}
                />
              </label>
              <button
                className="btn btn-icon btn-ghost"
                title={s.remove}
                style={{ width: 26, height: 26, flexShrink: 0 }}
                onClick={() => removeAlert(a.id)}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
