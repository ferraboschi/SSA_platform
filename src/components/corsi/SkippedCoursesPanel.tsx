"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { shopifyAdminProductUrl } from "@/lib/integrations/shopify/admin-url";
import type { SkippedCourse } from "@/lib/sync/skipped-courses";

/**
 * "Corsi non importati": Shopify products the sync could not turn into a course.
 * Surfaced so nothing published stays silently invisible — the operator sees the
 * title + why, and opens the product on Shopify to fix its title/metafields.
 * Collapsed by default; renders nothing when there's nothing to show.
 */
export function SkippedCoursesPanel({ skipped }: { skipped: SkippedCourse[] }) {
  const [open, setOpen] = useState(false);
  if (!skipped.length) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 20,
        borderLeft: "3px solid var(--warning)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="warn" size={16} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--warning-fg)" }}>
            {skipped.length} {skipped.length === 1 ? "prodotto Shopify non importato" : "prodotti Shopify non importati"}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            — pubblicati su Shopify ma non ancora corsi in piattaforma
          </span>
        </span>
        <Icon name={open ? "chevron-d" : "chevron"} size={16} />
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border-2)" }}>
          {skipped.map((p) => (
            <div
              key={p.productId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 16px",
                borderBottom: "1px solid var(--border-2)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{p.reason}</div>
              </div>
              <Link
                className="btn btn-sm"
                href={shopifyAdminProductUrl(p.productId)}
                target="_blank"
                rel="noreferrer"
                style={{ flexShrink: 0 }}
              >
                Apri su Shopify
              </Link>
            </div>
          ))}
          <div style={{ padding: "10px 16px", fontSize: 11.5, color: "var(--text-4)" }}>
            Correggi titolo/metafield su Shopify (tipo + mese + anno) e al prossimo sync il corso entra da solo.
            Gli eventi e i pacchetti restano fuori di proposito.
          </div>
        </div>
      )}
    </div>
  );
}
