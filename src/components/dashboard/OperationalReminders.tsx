"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, Icon, type IconName } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { DashThresholds } from "@/lib/domain";
import type { RemindersData } from "@/lib/dashboard";
import { DashThresholdsModal } from "./DashThresholdsModal";

type ColTone = "indigo" | "warning" | "oro" | "neutral";

const TONE_MAP: Record<ColTone, { bg: string; fg: string }> = {
  indigo: { bg: "var(--indigo-50)", fg: "var(--indigo-600)" },
  warning: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
  oro: { bg: "var(--oro-bg)", fg: "#8A6E1A" },
  neutral: { bg: "var(--surface-2)", fg: "var(--text-2)" },
};

function ReminderColumn({
  title,
  icon,
  tone,
  countText,
  last,
  children,
}: {
  title: string;
  icon: IconName;
  tone: ColTone;
  countText: string;
  last?: boolean;
  children: ReactNode;
}) {
  const tm = TONE_MAP[tone];
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRight: last ? "none" : "1px solid var(--border-2)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 20,
            height: 20,
            borderRadius: 4,
            background: tm.bg,
            color: tm.fg,
          }}
        >
          <Icon name={icon} size={11} />
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text)",
            letterSpacing: "0.005em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-4)", fontWeight: 500 }}>
          {countText}
        </span>
      </div>
      {children}
    </div>
  );
}

function EmptyMsg({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: "var(--text-4)", padding: "8px 4px", fontStyle: "italic" }}>
      {children}
    </div>
  );
}

export function OperationalReminders({
  reminders,
  thresholds,
}: {
  reminders: RemindersData;
  thresholds: DashThresholds;
}) {
  const t = useT();
  const r = t.dashboard.reminders;
  const [showThresholds, setShowThresholds] = useState(false);
  const { shipments, bookStock, sakeExam } = reminders;

  return (
    <section className="card" style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
      <div className="card-head" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "var(--warning-bg)",
                color: "var(--warning-fg)",
              }}
            >
              <Icon name="bell" size={13} />
            </span>
            {r.title}
            <Badge tone="warning" dot>
              {format(r.open, { n: reminders.total })}
            </Badge>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{r.sub}</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowThresholds(true)}>
          {r.setThresholds}
          <Icon name="settings" size={11} />
        </button>
      </div>
      {showThresholds && (
        <DashThresholdsModal thresholds={thresholds} onClose={() => setShowThresholds(false)} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        <ReminderColumn
          title={r.shipments}
          icon="download"
          tone="indigo"
          countText={format(r.onlineCourses, { n: shipments.length })}
        >
          {shipments.length === 0 && <EmptyMsg>{r.noShipments}</EmptyMsg>}
          {shipments.map((s) => (
            <Link key={s.courseId} href={`/corsi/${s.courseId}`} className="reminder-row">
              <div className={`reminder-deadline ${s.shipBy <= 3 ? "urgent" : ""}`}>
                <span className="num">{s.shipBy}</span>
                <span>{r.days}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="reminder-title">{s.shortTitle}</div>
                <div className="reminder-sub">
                  {format(r.kitsLine, { n: s.enrolled, days: Math.max(0, s.shipBy) })}
                </div>
              </div>
            </Link>
          ))}
        </ReminderColumn>

        <ReminderColumn
          title={r.bookStock}
          icon="book"
          tone="warning"
          countText={format(r.belowMin, { n: bookStock.length })}
        >
          {bookStock.length === 0 && <EmptyMsg>{r.allGood}</EmptyMsg>}
          {bookStock.map((b, i) => (
            <div key={i} className="reminder-row">
              <div className={`reminder-deadline ${b.days <= 5 ? "urgent" : ""}`}>
                <span className="num">{b.qty}</span>
                <span>{r.pieces}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="reminder-title">{b.sku}</div>
                <div className="reminder-sub">
                  {format(r.bookLine, { min: thresholds.bookMin, days: b.days })}
                </div>
              </div>
            </div>
          ))}
        </ReminderColumn>

        <ReminderColumn
          title={r.sakeExam}
          icon="exam"
          tone="oro"
          countText={sakeExam.length > 0 ? r.verifyThreshold : r.ok}
        >
          {sakeExam.length === 0 && <EmptyMsg>{r.noExam}</EmptyMsg>}
          {sakeExam.map((a) => (
            <Link key={a.courseId} href={`/corsi/${a.courseId}`} className="reminder-row">
              <div className="reminder-deadline urgent">
                <span className="num">{a.stock}</span>
                <span>/{a.need}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="reminder-title">{a.shortTitle}</div>
                <div className="reminder-sub">{format(r.sakeLine, { n: a.need - a.stock })}</div>
              </div>
            </Link>
          ))}
        </ReminderColumn>

        <ReminderColumn title={r.other} icon="warn" tone="neutral" countText={format(r.open, { n: 2 })} last>
          <div className="reminder-row">
            <div className="reminder-deadline" style={{ background: "var(--surface-2)" }}>
              <Icon name="mail" size={11} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="reminder-title">{r.invoices}</div>
              <div className="reminder-sub">{r.invoicesSub}</div>
            </div>
          </div>
          <div className="reminder-row">
            <div className="reminder-deadline" style={{ background: "var(--surface-2)" }}>
              <Icon name="calendar" size={11} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="reminder-title">{r.location}</div>
              <div className="reminder-sub">{r.locationSub}</div>
            </div>
          </div>
        </ReminderColumn>
      </div>
    </section>
  );
}
