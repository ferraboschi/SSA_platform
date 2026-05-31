import { Badge, type BadgeTone } from "./Badge";

export type CourseStatus = "in-traiettoria" | "monitor" | "rischio" | "critico";

const MAP: Record<CourseStatus, { tone: BadgeTone; label: string }> = {
  "in-traiettoria": { tone: "success", label: "In traiettoria" },
  monitor: { tone: "neutral", label: "Da monitorare" },
  rischio: { tone: "warning", label: "A rischio" },
  critico: { tone: "danger", label: "Critico" },
};

export interface StatusBadgeProps {
  status: CourseStatus;
  size?: "lg";
  /** Localized label override; falls back to the built-in Italian label. */
  label?: string;
}

export function StatusBadge({ status, size, label }: StatusBadgeProps) {
  const m = MAP[status];
  if (!m) return null;
  return (
    <Badge tone={m.tone} size={size} dot>
      {label ?? m.label}
    </Badge>
  );
}
