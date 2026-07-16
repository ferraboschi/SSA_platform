import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./Icon";

export interface KPIProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  deltaDir?: "up" | "dn";
  accent?: string;
  anim?: boolean;
  /** When set, the whole card becomes a link — a KPI should answer "which ones",
   *  not just "how many". */
  href?: string;
}

export function KPI({
  label,
  value,
  unit,
  sub,
  delta,
  deltaDir,
  accent,
  anim,
  href,
}: KPIProps) {
  const body = (
    <>
      {accent && <span className={`kpi-accent ${accent}`} />}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {(delta || sub) && (
        <div>
          {delta && (
            <span
              className={`kpi-delta ${
                deltaDir === "up" ? "up" : deltaDir === "dn" ? "dn" : ""
              }`}
            >
              {deltaDir === "up" ? (
                <Icon name="arrow-up" size={11} />
              ) : deltaDir === "dn" ? (
                <Icon name="arrow-dn" size={11} />
              ) : null}
              {delta}
            </span>
          )}
          {sub && <div className="kpi-foot">{sub}</div>}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`kpi ${anim ? "kpi-anim" : ""}`} style={{ cursor: "pointer" }}>
        {body}
      </Link>
    );
  }
  return <div className={`kpi ${anim ? "kpi-anim" : ""}`}>{body}</div>;
}
