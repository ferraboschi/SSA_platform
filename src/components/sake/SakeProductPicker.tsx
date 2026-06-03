"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { fetchSakeCatalog } from "@/lib/integrations/sakecompany/actions";
import type { ScCatalogItem } from "@/lib/integrations/sakecompany/admin-client";

export type { ScCatalogItem };

/** Low-stock threshold — below this a sake shows a red alarm. */
export const LOW_STOCK = 10;

export function StockBadge({ stock }: { stock: number | null }) {
  if (stock == null) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const low = stock < LOW_STOCK;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        fontWeight: 700,
        padding: "1px 7px",
        borderRadius: 999,
        color: low ? "var(--danger-fg, #b42318)" : "var(--success-fg, #1a7f43)",
        background: low ? "var(--danger-bg, #fde8e6)" : "var(--success-bg, #e8f6ee)",
      }}
      title={low ? "Scorta bassa" : "Disponibile"}
    >
      {low && <Icon name="warn" size={10} />}
      {stock} pz
    </span>
  );
}

/**
 * Type-ahead picker over the Sake Company catalog. Search by name / producer /
 * SKU; calls onPick with the chosen item. Reusable (template, alerts, …).
 */
export function SakeProductPicker({
  onPick,
  placeholder = "Cerca un sake per nome, produttore o SKU…",
  excludeSkus = [],
}: {
  onPick: (item: ScCatalogItem) => void;
  placeholder?: string;
  excludeSkus?: string[];
}) {
  const [catalog, setCatalog] = useState<ScCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchSakeCatalog()
      .then((c) => {
        if (alive) setCatalog(c);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const excluded = useMemo(() => new Set(excludeSkus.filter(Boolean)), [excludeSkus]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const avail = catalog.filter((i) => !(i.sku && excluded.has(i.sku)));
    // Empty query → show the first products so it's clear the catalog loaded
    // (sake products are named by producer/label, not the word "sake").
    if (!q) return avail.slice(0, 25);
    return avail
      .filter((i) => `${i.name} ${i.vendor ?? ""} ${i.sku ?? ""}`.toLowerCase().includes(q))
      .slice(0, 25);
  }, [catalog, query, excluded]);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Icon
          name="search"
          size={14}
          className="text-4"
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          className="input"
          style={{ paddingLeft: 32 }}
          placeholder={loading ? "Carico il catalogo Sake Company…" : placeholder}
          value={query}
          disabled={loading}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && query.trim() && (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 360,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "var(--sh-3)",
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, color: "var(--text-3)" }}>
              Nessun prodotto trovato per “{query}”.
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.variantId}
                type="button"
                onClick={() => {
                  onPick(item);
                  setQuery("");
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: "1px solid var(--border-2)",
                  background: "transparent",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => e.currentTarget.style.setProperty("background", "var(--surface-2)")}
                onMouseLeave={(e) => e.currentTarget.style.setProperty("background", "transparent")}
              >
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image}
                    alt=""
                    style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 6,
                      background: "var(--surface-2)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{item.name}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--text-3)" }}>
                    {item.vendor ?? "—"}
                    {item.sku ? ` · SKU ${item.sku}` : ""}
                  </span>
                </span>
                <StockBadge stock={item.stock} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
