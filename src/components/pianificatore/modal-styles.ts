import type { CSSProperties } from "react";

// Shared modal shell (overlay + dialog) for the planner modals.
export const plOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 37, 64, 0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 200,
  padding: 20,
};
export const plDialog: CSSProperties = {
  background: "var(--surface)",
  borderRadius: 12,
  boxShadow: "var(--sh-popover)",
  width: "100%",
  display: "flex",
  flexDirection: "column",
};
