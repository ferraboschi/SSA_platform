import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral" | "success" | "warning" | "danger"
  | "indigo" | "navy" | "azzurro" | "oro";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
  size?: "lg";
}

export function Badge({ tone = "neutral", children, dot, size }: BadgeProps) {
  const cls = [
    "badge",
    `badge-${tone}`,
    dot ? "badge-dot" : "",
    size === "lg" ? "badge-lg" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={cls}>{children}</span>;
}
