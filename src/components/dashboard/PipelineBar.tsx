"use client";

import { useState } from "react";
import Link from "next/link";
import { useT, useLocale } from "@/lib/i18n";
import type { PipelineBarData } from "@/lib/dashboard";
import { monthIndexIt } from "@/lib/dashboard";

const STATUS_COLOR: Record<string, string> = {
  "in-traiettoria": "#62E5A1",
  rischio: "#FFB366",
  critico: "#FFB366",
  monitor: "rgba(255,255,255,0.7)",
};

function barTone(status?: string): string {
  if (status === "rischio" || status === "critico") return "var(--warning)";
  if (status === "monitor") return "var(--text-mute)";
  return "var(--indigo)";
}

export function PipelineBar({ bar }: { bar: PipelineBarData }) {
  const t = useT();
  const locale = useLocale();
  const [hover, setHover] = useState(false);

  if (!bar.present) {
    return (
      <div
        style={{
          flex: 1,
          height: "100%",
          background: "var(--border-2)",
          borderRadius: 2,
          position: "relative",
          overflow: "hidden",
        }}
      />
    );
  }

  const tone = barTone(bar.status);
  const monthShort = bar.monthKey
    ? new Intl.DateTimeFormat(locale, { month: "short" })
        .format(new Date(2000, Math.max(0, monthIndexIt(bar.monthKey)), 1))
        .replace(".", "")
    : "";

  return (
    <Link
      href={`/corsi/${bar.courseId}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        height: "100%",
        background: "var(--border-2)",
        borderRadius: 2,
        position: "relative",
        cursor: "pointer",
        transition: "transform var(--dur-fast) var(--ease)",
        transform: hover ? "translateY(-2px)" : "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${Math.max(bar.fill * 100, 8)}%`,
          background: tone,
          borderRadius: 2,
          transition: "height 400ms var(--ease-out), box-shadow var(--dur-fast)",
          boxShadow: hover ? "0 0 0 1.5px var(--indigo)" : "none",
        }}
      />
      {hover && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--navy)",
            color: "white",
            padding: "10px 12px",
            borderRadius: 6,
            boxShadow: "var(--sh-3)",
            width: 220,
            fontSize: 11.5,
            lineHeight: 1.5,
            pointerEvents: "none",
            zIndex: 50,
            animation: "tipIn 120ms var(--ease-out)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid var(--navy)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span
              style={{
                display: "inline-block",
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                background: bar.typeColor === "oro" ? "var(--oro-bg)" : "var(--azzurro-bg)",
                color: bar.typeColor === "oro" ? "#8A6E1A" : "var(--azzurro)",
              }}
            >
              {bar.typeShort}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {bar.day} {monthShort}
            </span>
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 12.5,
              color: "white",
              marginBottom: 8,
              letterSpacing: "-0.005em",
              lineHeight: 1.3,
            }}
          >
            {bar.shortTitle}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "4px 10px",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{t.dashboard.tooltip.enrolled}</span>
            <span className="num" style={{ textAlign: "right", fontWeight: 600 }}>
              {bar.enrolled}/{bar.capacity}
            </span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{t.dashboard.tooltip.revenue}</span>
            <span className="num" style={{ textAlign: "right", fontWeight: 600 }}>
              {((bar.revenue ?? 0) / 1000).toFixed(1)}k €
            </span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{t.dashboard.tooltip.location}</span>
            <span style={{ textAlign: "right" }}>{bar.city}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{t.dashboard.tooltip.educator}</span>
            <span style={{ textAlign: "right" }}>{bar.educatorName}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{t.dashboard.tooltip.status}</span>
            <span
              style={{
                textAlign: "right",
                color: bar.status ? STATUS_COLOR[bar.status] : "rgba(255,255,255,0.7)",
                fontWeight: 600,
              }}
            >
              {bar.status ? t.status[bar.status] : ""}
            </span>
          </div>
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px solid rgba(255,255,255,0.1)",
              fontSize: 10.5,
              color: "rgba(255,255,255,0.5)",
              textAlign: "center",
            }}
          >
            {t.dashboard.tooltip.clickOpen}
          </div>
        </div>
      )}
    </Link>
  );
}
