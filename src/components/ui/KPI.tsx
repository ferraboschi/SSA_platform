import type { ReactNode } from "react";
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
}: KPIProps) {
  return (
    <div className={`kpi ${anim ? "kpi-anim" : ""}`}>
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
    </div>
  );
}
