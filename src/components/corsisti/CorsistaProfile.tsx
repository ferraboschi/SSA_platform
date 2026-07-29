"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  mergeCorsistiAction,
  dismissEmailClusterAction,
} from "@/lib/data/anomalie-actions";
import { Avatar, Badge, Icon } from "@/components/ui";
import { useT, format, type Dictionary } from "@/lib/i18n";
import { formatEuro, formatNumberIt } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import { COURSE_TYPES, type Corsista, type CorsistaEnrollment, type Purchase, type PossibleDuplicate } from "@/lib/domain";
import { monthIndexIt } from "@/lib/dates/italian-months";

type ProfileT = Dictionary["corsisti"]["profile"];

function ProfStat({
  label,
  value,
  unit,
  sub,
  last,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  last?: boolean;
}) {
  return (
    <div style={{ padding: "18px 24px", borderRight: last ? "none" : "1px solid var(--border-2)" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {value}
        {unit && <span style={{ fontSize: "0.6em", color: "var(--text-3)", marginLeft: 2 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function JourneyTimeline({ courses, passedLabel }: { courses: CorsistaEnrollment[]; passedLabel: string }) {
  if (!courses.length) return null;
  const firstYear = courses[0].year;
  const lastYear = Math.max(courses[courses.length - 1].year, 2026);
  const years: number[] = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);

  return (
    <div className="card" style={{ padding: "24px 20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${years.length}, 1fr)`, gap: 0 }}>
        {years.map((y, i) => (
          <div
            key={y}
            style={{
              borderLeft: i === 0 ? "none" : "1px dashed var(--border)",
              paddingLeft: 12,
              paddingRight: 12,
              minHeight: 120,
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {y}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {courses
                .filter((c) => c.year === y)
                .map((c, ci) => {
                  const palette =
                    c.courseType === "certificato"
                      ? { bg: "var(--azzurro-bg)", fg: "var(--azzurro)" }
                      : c.courseType === "introduttivo"
                        ? { bg: "var(--oro-bg)", fg: "#8A6E1A" }
                        : { bg: "var(--surface-2)", fg: "var(--text-2)" };
                  return (
                    <div key={ci} style={{ padding: 8, borderRadius: 4, background: palette.bg, color: palette.fg, fontSize: 11 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 9.5,
                          letterSpacing: "var(--ls-caps)",
                          textTransform: "uppercase",
                          marginBottom: 2,
                        }}
                      >
                        {c.month.slice(0, 3)}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>
                        {c.courseTitle.split(" ").slice(0, 3).join(" ")}
                      </div>
                      <div style={{ marginTop: 2, color: "var(--text-3)", fontSize: 10.5 }}>{c.city}</div>
                      {c.examResult === "passed" && (
                        <div style={{ marginTop: 4, fontSize: 10, color: "var(--success-fg)", fontWeight: 600 }}>
                          ✓ {passedLabel}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CorsistaProfile({ corsista: s }: { corsista: Corsista }) {
  const t: ProfileT = useT().corsisti.profile;
  const router = useRouter();
  const [pending, startAction] = useTransition();
  const [handled, setHandled] = useState<Set<number>>(() => new Set());
  const dups = (s.possibleDuplicates ?? []).filter((d) => !handled.has(d.candidateId));

  // Merge this look-alike into the suggested survivor, then land on the
  // consolidated profile. Optimistic: hide the row immediately, roll back on error.
  const mergeDup = (d: PossibleDuplicate) => {
    setHandled((prev) => new Set(prev).add(d.candidateId));
    startAction(async () => {
      try {
        await mergeCorsistiAction(d.survivorId, [d.dupId]);
        router.push(`/corsisti/${encodeURIComponent(d.survivorEmail.toLowerCase())}`);
        router.refresh();
      } catch {
        setHandled((prev) => {
          const n = new Set(prev);
          n.delete(d.candidateId);
          return n;
        });
      }
    });
  };
  // "Not a duplicate": persist the dismissal (same key Anomalie uses) so the pair
  // never re-surfaces here or there.
  const dismissDup = (d: PossibleDuplicate) => {
    setHandled((prev) => new Set(prev).add(d.candidateId));
    startAction(async () => {
      try {
        await dismissEmailClusterAction(d.dismissKey);
      } catch {
        setHandled((prev) => {
          const n = new Set(prev);
          n.delete(d.candidateId);
          return n;
        });
      }
    });
  };

  const certificate = s.courses.some((c) => c.examResult === "passed");
  const sorted = [...s.courses].sort(
    (a, b) => a.year - b.year || monthIndexIt(a.month) - monthIndexIt(b.month),
  );
  const firstYear = sorted[0]?.year;
  const lastYear = sorted[sorted.length - 1]?.year;
  const examCount = s.courses.filter((c) => c.examResult).length;
  const status = certificate ? t.statusCertified : s.courses.length > 1 ? t.statusReturning : t.statusActive;

  return (
    <div className="page">
      {/* Live look-alikes: offer to merge (or dismiss) right where you meet them.
          Supersedes the static "Possibile duplicato" review note below. */}
      {dups.map((d) => (
        <div
          key={d.candidateId}
          style={{
            marginBottom: 12,
            padding: "12px 16px",
            background: "var(--warning-bg)",
            color: "var(--warning-fg)",
            border: "1px solid var(--warning)",
            borderRadius: 10,
            fontSize: 12.5,
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <Icon name="warn" size={14} />
            <span>
              Ho trovato un profilo simile: <strong>{d.name}</strong> ({d.email}) — {d.reason}. È la stessa persona?
            </span>
          </span>
          <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => mergeDup(d)}>
              <Icon name="users" size={12} /> Unisci
            </button>
            <button className="btn btn-sm" disabled={pending} onClick={() => dismissDup(d)}>
              No, sono diversi
            </button>
          </span>
        </div>
      ))}
      {/* Non-duplicate review notes (e.g. B2B buyer-name mismatch) stay as a plain
          flag; the "Possibile duplicato" ones are handled by the banner above. */}
      {s.reviewNote && !s.reviewNote.startsWith("Possibile duplicato") && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            background: "var(--warning-bg)",
            color: "var(--warning-fg)",
            border: "1px solid var(--warning)",
            borderRadius: 10,
            fontSize: 12.5,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Icon name="warn" size={14} />
          {s.reviewNote}
        </div>
      )}
      <section className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, padding: "28px 32px", alignItems: "center" }}>
          <Avatar name={s.name} size="xl" tone={s.historical ? "navy" : undefined} />
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {t.dossier}
              {s.historical && <span>{t.historicalTag}</span>}
              {s.isReturning && !s.historical && <span style={{ color: "var(--oro)" }}>{t.returningTag}</span>}
            </div>
            <h1 className="display" style={{ fontSize: 32 }}>
              {s.name}
            </h1>
            <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 13, color: "var(--text-2)", flexWrap: "wrap" }}>
              <span>
                <Icon name="mail" size={12} className="text-3" /> {s.email}
              </span>
              <span>
                {s.hasWhatsApp && <span style={{ color: "var(--success)" }}>● </span>}
                <Icon name="phone" size={12} className="text-3" /> {s.phone}
              </span>
              <span>
                <Icon name="pin" size={12} className="text-3" /> {s.city}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <a className="btn btn-icon" href={`mailto:${s.email}`}>
              <Icon name="mail" size={13} />
            </a>
            <a className="btn btn-icon" href={`tel:${(s.phone || "").replace(/\s/g, "")}`}>
              <Icon name="whatsapp" size={13} />
            </a>
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  `scheda-${s.name.replace(/[^\w-]+/g, "-").toLowerCase()}`,
                  toCsv(
                    ["Corso", "Tipo", "Città", "Mese", "Anno", "Esito", "Punteggio %", "Pagato €"],
                    s.courses.map((c) => [
                      c.courseTitle,
                      COURSE_TYPES[c.courseType]?.label ?? c.courseType,
                      c.city,
                      c.month,
                      c.year,
                      c.examResult ?? "",
                      c.examScorePct ?? "",
                      Math.round(c.amount),
                    ]),
                  ),
                )
              }
            >
              {t.exportSheet}
            </button>
          </div>
        </div>
        <div className="rgrid-4" style={{ borderTop: "1px solid var(--border)" }}>
          <ProfStat label={t.statCorsi} value={s.courses.length} sub={s.courses.length ? format(t.statCorsiSub, { first: firstYear, last: lastYear }) : "—"} />
          <ProfStat label={t.statEsami} value={examCount} sub={certificate ? t.statEsamiPassed : "—"} />
          <ProfStat label={t.statSpeso} value={formatNumberIt(s.totalSpent)} unit="€" />
          <ProfStat label={t.statStatus} value={status} last />
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 className="h2" style={{ marginBottom: 6 }}>
          {t.journeyTitle}
        </h2>
        <p className="text-3" style={{ fontSize: 13, marginTop: 4, marginBottom: 18 }}>
          {s.courses.length === 0
            ? "—"
            : s.courses.length === 1
              ? t.journeyOne
              : format(t.journeyMany, { n: s.courses.length, years: lastYear - firstYear + 1 })}
        </p>
        <JourneyTimeline courses={sorted} passedLabel={t.passed} />
      </section>

      <section>
        <h3 className="eyebrow" style={{ marginBottom: 12 }}>
          {t.detailTitle}
        </h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.colData}</th>
                <th>{t.colCorso}</th>
                <th>{t.colCitta}</th>
                <th>{t.colEsito}</th>
                <th style={{ textAlign: "right" }}>{t.colImporto}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr
                  key={i}
                  className={c.historical ? "" : "clickable"}
                  onClick={() => !c.historical && router.push(`/corsi/${c.courseId}`)}
                >
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {c.month.slice(0, 3)} {c.year}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge tone={c.courseType === "certificato" ? "azzurro" : c.courseType === "introduttivo" ? "oro" : "neutral"}>
                        {COURSE_TYPES[c.courseType].label.toUpperCase()}
                      </Badge>
                      <span style={{ fontWeight: 500 }}>{c.courseTitle}</span>
                      {c.historical && <Badge tone="neutral">{t.badgeHistorical}</Badge>}
                    </div>
                  </td>
                  <td className="text-3">{c.city}</td>
                  <td>
                    {c.examResult === "passed" && <Badge tone="success">{t.passed}</Badge>}
                    {c.examResult === "retrial" && <Badge tone="warning">{t.retrial}</Badge>}
                    {c.examResult === "failed" && <Badge tone="danger">{t.failed}</Badge>}
                    {!c.examResult && <span className="text-mute">—</span>}
                    {c.examResult && c.examScorePct != null && (
                      <span className="num text-3" style={{ marginLeft: 6, fontSize: 12 }}>
                        {c.examScorePct}%
                      </span>
                    )}
                    {c.certificateUrl && (
                      <a
                        href={c.certificateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: 8, fontSize: 12, color: "var(--indigo-600)", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
                        title={t.downloadCertificate}
                      >
                        📄 {t.downloadCertificate}
                      </a>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {c.amount > 0 ? (
                      formatEuro(c.amount)
                    ) : (
                      <span className="text-3" style={{ fontSize: 12 }}>{t.free}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {s.purchases && s.purchases.length > 0 && (
        <PurchasesSection purchases={s.purchases} t={t} />
      )}
    </div>
  );
}

const CLUSTER_TONE: Record<string, "azzurro" | "oro" | "indigo" | "neutral"> = {
  corso: "azzurro",
  evento: "indigo",
  libro: "oro",
  merchandise: "neutral",
};

function PurchasesSection({ purchases, t }: { purchases: Purchase[]; t: ProfileT }) {
  const counts = purchases.reduce<Record<string, number>>((acc, p) => {
    acc[p.cluster] = (acc[p.cluster] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section style={{ marginTop: 28 }}>
      <h3 className="eyebrow" style={{ marginBottom: 12 }}>
        {format(t.purchasesTitle, { n: purchases.length })}
      </h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {Object.entries(counts).map(([cluster, n]) => (
          <Badge key={cluster} tone={CLUSTER_TONE[cluster] ?? "neutral"}>
            {cluster.toUpperCase()} · {n}
          </Badge>
        ))}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colData}</th>
              <th>{t.purchaseColProduct}</th>
              <th>{t.purchaseColType}</th>
              <th>{t.purchaseColBuyer}</th>
              <th style={{ textAlign: "right" }}>{t.colImporto}</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p, i) => (
              <tr key={i}>
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  {p.orderedAt ? p.orderedAt.slice(0, 10) : "—"}
                </td>
                <td>{p.productTitle}</td>
                <td>
                  <Badge tone={CLUSTER_TONE[p.cluster] ?? "neutral"}>{p.cluster}</Badge>
                  {p.subtype && <span className="text-3" style={{ marginLeft: 6, fontSize: 11 }}>{p.subtype}</span>}
                  {p.delivery && <span className="text-4" style={{ marginLeft: 6, fontSize: 11 }}>· {p.delivery}</span>}
                </td>
                <td className="text-3">{p.buyerName ?? "—"}</td>
                <td className="num" style={{ textAlign: "right" }}>{formatEuro(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
