"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { format, useT } from "@/lib/i18n";
import {
  resolveAnomalyAction,
  dismissEmailClusterAction,
} from "@/lib/data/anomalie-actions";

interface AnomalyItem {
  id: number;
  email: string;
  name: string;
  note: string;
}

export interface EmailCluster {
  nameKey: string;
  name: string;
  members: { id: number; email: string; phone: string }[];
}
export interface RepaidCluster {
  corsistaId: number;
  name: string;
  type: string;
  courses: { title: string; paid: number }[];
}
export interface DupCourseGroup {
  label: string;
  courses: { id: string; title: string; enrolled: number }[];
}

export function AnomaliesClient({
  items,
  emailClusters = [],
  repaidClusters = [],
  dupCourses = [],
}: {
  items: AnomalyItem[];
  emailClusters?: EmailCluster[];
  repaidClusters?: RepaidCluster[];
  dupCourses?: DupCourseGroup[];
}) {
  const t = useT().anomalie;
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const [dismissedClusters, setDismissedClusters] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();

  const visible = items.filter((it) => !resolved.has(it.id));
  const clusters = emailClusters.filter((c) => !dismissedClusters.has(c.nameKey));

  const resolve = (id: number) => {
    setResolved((prev) => new Set(prev).add(id));
    startTransition(async () => {
      try {
        await resolveAnomalyAction(id);
      } catch {
        // roll back the optimistic removal so the row doesn't silently vanish
        setResolved((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  };
  const dismissCluster = (nameKey: string) => {
    setDismissedClusters((prev) => new Set(prev).add(nameKey));
    startTransition(() => void dismissEmailClusterAction(nameKey));
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 6 }}>
        <h1 className="display" style={{ fontSize: 28 }}>
          {t.title}
        </h1>
        <p className="text-3" style={{ fontSize: 13, marginTop: 6 }}>
          {t.subtitle}
        </p>
      </div>

      {/* ── Section 1: flagged review notes (e.g. phone duplicates) ── */}
      <div style={{ margin: "16px 0", fontSize: 13, color: "var(--text-2)" }}>
        {format(t.count, { n: visible.length })}
      </div>

      {visible.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
          {t.empty}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.colPerson}</th>
                <th>{t.colNote}</th>
                <th style={{ textAlign: "right" }}>{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    <div className="text-4" style={{ fontSize: 11 }}>{it.email}</div>
                  </td>
                  <td className="text-2" style={{ fontSize: 12.5, maxWidth: 460 }}>
                    {it.note}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <Link
                      className="btn btn-sm"
                      href={`/corsisti/${encodeURIComponent(it.email)}`}
                      style={{ marginRight: 8 }}
                    >
                      <Icon name="user" size={12} /> {t.openProfile}
                    </Link>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={pending}
                      onClick={() => resolve(it.id)}
                    >
                      <Icon name="check" size={12} /> {t.markOk}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Section 2: same person, multiple emails ── */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t.emailTitle}</h2>
        <p className="text-3" style={{ fontSize: 12.5, marginTop: 4 }}>
          {t.emailSubtitle}
        </p>
        <div style={{ margin: "12px 0", fontSize: 13, color: "var(--text-2)" }}>
          {format(t.emailCount, { n: clusters.length })}
        </div>

        {clusters.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {clusters.map((c) => (
              <div key={c.nameKey} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--warning-fg)",
                      background: "var(--warning-bg)",
                      padding: "1px 8px",
                      borderRadius: 999,
                    }}
                  >
                    {format(t.emailBadge, { n: c.members.length })}
                  </span>
                  <button
                    className="btn btn-sm"
                    style={{ marginLeft: "auto" }}
                    disabled={pending}
                    onClick={() => dismissCluster(c.nameKey)}
                  >
                    <Icon name="check" size={12} /> {t.emailReviewed}
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {c.members.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 10,
                        padding: "5px 8px",
                        borderRadius: 6,
                        background: "var(--surface-2)",
                        fontSize: 12.5,
                      }}
                    >
                      <Link
                        href={`/corsisti/${encodeURIComponent(m.email)}`}
                        className="link"
                        style={{ fontFamily: "var(--font-mono)", flex: "1 1 220px", minWidth: 0 }}
                      >
                        {m.email || "—"}
                      </Link>
                      {m.phone && <span className="text-3">{m.phone}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: paid re-participation (should be free) ── */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t.repaidTitle}</h2>
        <p className="text-3" style={{ fontSize: 12.5, marginTop: 4 }}>
          {t.repaidSubtitle}
        </p>
        <div style={{ margin: "12px 0", fontSize: 13, color: "var(--text-2)" }}>
          {format(t.repaidCount, { n: repaidClusters.length })}
        </div>
        {repaidClusters.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {repaidClusters.map((c) => (
              <div key={`${c.corsistaId}-${c.type}`} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>
                    {c.type}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--danger-fg)",
                      background: "var(--danger-bg)",
                      padding: "1px 8px",
                      borderRadius: 999,
                    }}
                  >
                    {format(t.repaidBadge, { n: c.courses.length })}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {c.courses.map((co, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "5px 8px",
                        borderRadius: 6,
                        background: "var(--surface-2)",
                        fontSize: 12.5,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>{co.title}</span>
                      <span className="num" style={{ color: "var(--danger-fg)", fontWeight: 600 }}>
                        {co.paid}€
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 4: duplicate courses (same real course twice) ── */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t.dupTitle}</h2>
        <p className="text-3" style={{ fontSize: 12.5, marginTop: 4 }}>
          {t.dupSubtitle}
        </p>
        <div style={{ margin: "12px 0", fontSize: 13, color: "var(--text-2)" }}>
          {format(t.dupCount, { n: dupCourses.length })}
        </div>
        {dupCourses.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dupCourses.map((g, gi) => (
              <div key={gi} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{g.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {g.courses.map((co) => (
                    <Link
                      key={co.id}
                      href={`/corsi/${co.id}`}
                      className="link"
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "5px 8px",
                        borderRadius: 6,
                        background: "var(--surface-2)",
                        fontSize: 12.5,
                        textDecoration: "none",
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>{co.title}</span>
                      <span className="text-3">{format(t.dupEnrolled, { n: co.enrolled })}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
