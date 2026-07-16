"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { format, useT } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import { isAutoMergeableCluster } from "@/lib/anomalie/rules";
import {
  resolveAnomalyAction,
  dismissEmailClusterAction,
  mergeCorsistiAction,
  mergeAllHighConfidenceAction,
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
  reasons: string[];
  confidence: "alta" | "media";
  survivorId: number;
  members: { id: number; name: string; email: string; phone: string; enrollments: number }[];
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
export interface MissingCompanion {
  corsistaName: string;
  courseTitle: string;
  ticketsBought: number;
  missing: number;
}
export interface FullDiscountCancelled {
  corsistaName: string;
  courseTitle: string;
  amount: number;
}
export interface CashOnCancelled {
  courseTitle: string;
  corsistaName: string;
  amount: number;
}
export interface OpenCredit {
  corsistaName: string;
  amount: number;
  originCourseTitle: string;
}

export function AnomaliesClient({
  items,
  emailClusters = [],
  repaidClusters = [],
  dupCourses = [],
  missingCompanions = [],
  fullDiscountCancelled = [],
  cashOnCancelled = [],
  openCredits = [],
}: {
  items: AnomalyItem[];
  emailClusters?: EmailCluster[];
  repaidClusters?: RepaidCluster[];
  dupCourses?: DupCourseGroup[];
  missingCompanions?: MissingCompanion[];
  fullDiscountCancelled?: FullDiscountCancelled[];
  cashOnCancelled?: CashOnCancelled[];
  openCredits?: OpenCredit[];
}) {
  const t = useT().anomalie;
  const router = useRouter();
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const [dismissedClusters, setDismissedClusters] = useState<Set<string>>(() => new Set());
  const [mergedKeys, setMergedKeys] = useState<Set<string>>(() => new Set());
  const [bulkResult, setBulkResult] = useState<{ clusters: number; peopleMerged: number } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const visible = items.filter((it) => !resolved.has(it.id));
  const clusters = emailClusters.filter(
    (c) => !dismissedClusters.has(c.nameKey) && !mergedKeys.has(c.nameKey),
  );
  // Only the clusters the server-side bulk action will actually merge:
  // shared email/phone AND every member with the same normalized name — a
  // shared contact alone can be a family phone or a company email.
  const altaClusters = clusters.filter(
    (c) =>
      c.confidence === "alta" &&
      isAutoMergeableCluster(c.members.map((m) => m.name)),
  );

  const merge = (c: EmailCluster) => {
    const dupIds = c.members.map((m) => m.id).filter((id) => id !== c.survivorId);
    setMergedKeys((prev) => new Set(prev).add(c.nameKey));
    startTransition(async () => {
      try {
        await mergeCorsistiAction(c.survivorId, dupIds);
      } catch {
        setMergedKeys((prev) => {
          const n = new Set(prev);
          n.delete(c.nameKey);
          return n;
        });
      }
    });
  };

  const mergeAll = () => {
    if (altaClusters.length === 0) return;
    if (!confirm(format(t.mergeAllConfirm, { n: altaClusters.length }))) return;
    const keys = altaClusters.map((c) => c.nameKey);
    startTransition(async () => {
      try {
        const res = await mergeAllHighConfidenceAction();
        setBulkResult(res);
        setMergedKeys((prev) => {
          const next = new Set(prev);
          for (const k of keys) next.add(k);
          return next;
        });
        router.refresh();
      } catch {
        // leave the clusters visible so the operator can retry
      }
    });
  };

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

      {/* ── Section 2: probable duplicate people → merge into one profile ── */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Possibili duplicati corsisti</h2>
        <p className="text-3" style={{ fontSize: 12.5, marginTop: 4, maxWidth: 680 }}>
          Stessa email o stesso telefono = quasi certamente la stessa persona; stesso nome = possibile
          omonimia. &ldquo;Unisci&rdquo; fonde i record in un unico profilo principale (email/telefoni
          e iscrizioni vengono conservati, niente viene cancellato).
        </p>
        <div
          style={{
            margin: "12px 0",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>{clusters.length} gruppi</span>
          {altaClusters.length > 0 && (
            <button className="btn btn-sm btn-primary" disabled={pending} onClick={mergeAll}>
              <Icon name="users" size={12} /> {format(t.mergeAllBtn, { n: altaClusters.length })}
            </button>
          )}
          {bulkResult && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--success-fg)" }}>
              {format(t.mergeAllDone, {
                people: bulkResult.peopleMerged,
                clusters: bulkResult.clusters,
              })}
            </span>
          )}
        </div>

        {clusters.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {clusters.map((c) => {
              const REASON: Record<string, string> = {
                email: "Stessa email",
                phone: "Stesso telefono",
                name: "Stesso nome",
              };
              return (
                <div key={c.nameKey} className="card" style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warning-fg)", background: "var(--warning-bg)", padding: "1px 8px", borderRadius: 999 }}>
                      {c.members.length} record
                    </span>
                    {c.reasons.map((r) => (
                      <span
                        key={r}
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: r === "name" ? "var(--text-3)" : "var(--danger-fg)",
                          background: r === "name" ? "var(--surface-2)" : "var(--danger-bg)",
                          padding: "1px 7px",
                          borderRadius: 999,
                        }}
                      >
                        {REASON[r]}
                      </span>
                    ))}
                    <span style={{ fontSize: 10.5, color: c.confidence === "alta" ? "var(--danger-fg)" : "var(--text-4)" }}>
                      {c.confidence === "alta" ? "duplicato quasi certo" : "possibile omonimia"}
                    </span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => merge(c)}>
                        <Icon name="users" size={12} /> Unisci
                      </button>
                      <button className="btn btn-sm" disabled={pending} onClick={() => dismissCluster(c.nameKey)}>
                        Non è duplicato
                      </button>
                    </div>
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
                          background: m.id === c.survivorId ? "var(--success-bg)" : "var(--surface-2)",
                          fontSize: 12.5,
                        }}
                      >
                        {m.id === c.survivorId && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--success-fg)", letterSpacing: "0.04em" }}>
                            PRINCIPALE
                          </span>
                        )}
                        <span style={{ fontWeight: 500 }}>{m.name || "—"}</span>
                        <Link
                          href={`/corsisti/${encodeURIComponent(m.email)}`}
                          className="link"
                          style={{ fontFamily: "var(--font-mono)", flex: "1 1 200px", minWidth: 0 }}
                        >
                          {m.email || "—"}
                        </Link>
                        {m.phone && <span className="text-3">{m.phone}</span>}
                        <span className="text-4" style={{ fontSize: 11 }}>{m.enrollments} corsi</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
                        {formatEuro(co.paid)}
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

      {/* ── Section 5: double ticket with no 2nd attendee named ── */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t.companionTitle}</h2>
        <p className="text-3" style={{ fontSize: 12.5, marginTop: 4, maxWidth: 680 }}>
          {t.companionSubtitle}
        </p>
        <div style={{ margin: "12px 0", fontSize: 13, color: "var(--text-2)" }}>
          {format(t.companionCount, { n: missingCompanions.length })}
        </div>
        {missingCompanions.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {missingCompanions.map((c, i) => (
              <div key={i} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.corsistaName}</div>
                  <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: 12.5 }} className="text-2">
                    {c.courseTitle}
                  </span>
                  <span className="text-4" style={{ fontSize: 11 }}>
                    {format(t.companionTickets, { n: c.ticketsBought })}
                  </span>
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
                    {format(t.companionBadge, { n: c.missing })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 6: 100% discount on a cancelled/missing course ── */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t.fullDiscTitle}</h2>
        <p className="text-3" style={{ fontSize: 12.5, marginTop: 4, maxWidth: 680 }}>
          {t.fullDiscSubtitle}
        </p>
        <div style={{ margin: "12px 0", fontSize: 13, color: "var(--text-2)" }}>
          {format(t.fullDiscCount, { n: fullDiscountCancelled.length })}
        </div>
        {fullDiscountCancelled.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {fullDiscountCancelled.map((c, i) => (
              <div key={i} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.corsistaName}</div>
                  <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: 12.5 }} className="text-2">
                    {c.courseTitle}
                  </span>
                  <span className="num" style={{ color: "var(--danger-fg)", fontWeight: 600 }}>
                    {formatEuro(c.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 7: money collected on a cancelled course, not yet a credit ── */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t.cashCancelTitle}</h2>
        <p className="text-3" style={{ fontSize: 12.5, marginTop: 4, maxWidth: 680 }}>
          {t.cashCancelSubtitle}
        </p>
        <div style={{ margin: "12px 0", fontSize: 13, color: "var(--text-2)" }}>
          {format(t.cashCancelCount, { n: cashOnCancelled.length })}
        </div>
        {cashOnCancelled.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cashOnCancelled.map((c, i) => (
              <div key={i} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.corsistaName}</div>
                  <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: 12.5 }} className="text-2">
                    {c.courseTitle}
                  </span>
                  <span className="num" style={{ color: "var(--danger-fg)", fontWeight: 600 }}>
                    {formatEuro(c.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 8: open transfer credits with no destination yet ── */}
      <div style={{ marginTop: 36 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t.openCreditTitle}</h2>
          <Link className="link" href="/crediti" style={{ fontSize: 12.5 }}>
            {t.openCreditLink}
          </Link>
        </div>
        <p className="text-3" style={{ fontSize: 12.5, marginTop: 4, maxWidth: 680 }}>
          {t.openCreditSubtitle}
        </p>
        <div style={{ margin: "12px 0", fontSize: 13, color: "var(--text-2)" }}>
          {format(t.openCreditCount, { n: openCredits.length })}
        </div>
        {openCredits.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {openCredits.map((c, i) => (
              <div key={i} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.corsistaName}</div>
                  <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: 12.5 }} className="text-2">
                    {c.originCourseTitle}
                  </span>
                  <span className="num" style={{ color: "var(--warning-fg)", fontWeight: 600 }}>
                    {formatEuro(c.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
