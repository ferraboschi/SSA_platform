"use client";

import type { CSSProperties, DragEvent } from "react";
import type { AddExtra, ViewProps } from "./types";

// ---------- Drop helper ----------
export function plDrop(
  onDropMonth: ViewProps["onDropMonth"],
  year: number | null,
  mIdx: number,
  extra?: AddExtra,
) {
  return {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) onDropMonth(id, year, mIdx, extra || {});
    },
  };
}

export const cellHead: CSSProperties = {
  padding: "8px 6px",
  fontSize: 10.5,
  fontWeight: 600,
  color: "var(--text-3)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-2)",
  position: "sticky",
  top: 0,
};
export const cellLabel: CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text)",
  borderBottom: "1px solid var(--border-2)",
  background: "var(--surface)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
