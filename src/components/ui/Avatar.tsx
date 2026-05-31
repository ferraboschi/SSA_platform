import type { CSSProperties } from "react";

export type AvatarTone = "indigo" | "navy" | "azzurro" | "oro";
export type AvatarSize = "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  name?: string;
  initials?: string;
  size?: AvatarSize;
  tone?: AvatarTone;
}

const TONES: AvatarTone[] = ["indigo", "navy", "azzurro", "oro"];

const TONE_MAP: Record<AvatarTone, CSSProperties> = {
  indigo: { background: "var(--indigo-100)", color: "var(--indigo-600)" },
  navy: { background: "#E3E8EE", color: "var(--navy)" },
  azzurro: { background: "var(--azzurro-bg)", color: "var(--azzurro)" },
  oro: { background: "var(--oro-bg)", color: "#8A6E1A" },
};

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "avatar-sm",
  md: "avatar-md",
  lg: "avatar-lg",
  xl: "avatar-xl",
};

export function Avatar({ name, initials, size = "md", tone }: AvatarProps) {
  const ini =
    initials ||
    (name
      ? name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
      : "?");
  const hash = (name || "")
    .split("")
    .reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const t = tone || TONES[hash % TONES.length];
  return (
    <span className={`avatar ${SIZE_CLASS[size]}`} style={TONE_MAP[t]}>
      {ini}
    </span>
  );
}
