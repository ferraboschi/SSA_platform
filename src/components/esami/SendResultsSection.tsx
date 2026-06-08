"use client";

import { useState, useTransition } from "react";
import { Badge, Icon, type BadgeTone } from "@/components/ui";
import { sendExamResultEmailAction } from "@/lib/esami/email-actions";
import type { ExamResult } from "@/lib/domain";

const TONE: Record<string, BadgeTone> = { passed: "success", retrial: "warning", failed: "danger" };
const LABEL: Record<string, string> = { passed: "Promosso", retrial: "Recupero", failed: "Bocciato" };

function scoreColor(s: number): string {
  return s >= 80 ? "var(--success-fg)" : s >= 70 ? "var(--warning-fg)" : "var(--danger-fg)";
}

/**
 * "Invia esiti" — per-course: review each student's result PDF, see the score,
 * and send the result email. TEST MODE routes the email to the admin (not the
 * student); the banner flags this as temporary.
 */
export function SendResultsSection({
  courseId,
  results,
  adminEmail,
}: {
  courseId: string;
  results: ExamResult[];
  adminEmail: string;
}) {
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const xlsHref = `/api/esami/${encodeURIComponent(courseId)}/attendance`;
  const pdfHref = (email: string) =>
    `/api/esami/${encodeURIComponent(courseId)}/pdf?email=${encodeURIComponent(email)}`;

  return (
    <section className="card card-pad" style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="mail" size={12} />
          Invia esiti
        </div>
        <span style={{ flex: 1 }} />
        <a className="btn btn-sm" href={xlsHref} download style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="download" size={13} />
          Scarica XLS (lista presenze)
        </a>
      </div>

      {/* TEST MODE banner — remove the override at go-live. */}
      <div
        style={{
          background: "var(--warning-bg, #fef3c7)",
          color: "var(--warning-fg, #92400e)",
          border: "1px solid var(--warning-fg, #f59e0b)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12.5,
          lineHeight: 1.5,
          marginBottom: 14,
        }}
      >
        ⚠️ <b>Modalità test</b>: gli invii vanno a <b>te</b> ({adminEmail || "admin"}), non allo studente.
        Da disattivare in fase operativa.
      </div>

      {results.length === 0 ? (
        <p className="text-3" style={{ fontSize: 13 }}>
          Nessun esito confermato per questo corso. Conferma gli esiti dalla tabella
          dei risultati per poterli inviare.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((r) => (
            <ResultRow
              key={r.email}
              courseId={courseId}
              r={r}
              adminEmail={adminEmail}
              pdfUrl={pdfHref(r.email)}
              open={openEmail === r.email}
              onToggle={() => setOpenEmail((e) => (e === r.email ? null : r.email))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ResultRow({
  courseId,
  r,
  adminEmail,
  pdfUrl,
  open,
  onToggle,
}: {
  courseId: string;
  r: ExamResult;
  adminEmail: string;
  pdfUrl: string;
  open: boolean;
  onToggle: () => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const send = () =>
    start(async () => {
      setMsg(null);
      const res = await sendExamResultEmailAction(courseId, r.email, { toOverride: adminEmail || undefined });
      if (!res.ok) setMsg(res.error || "Invio non riuscito");
      else setMsg(`Inviata a ${res.sentTo} ✓`);
      setTimeout(() => setMsg(null), 6000);
    });

  return (
    <div style={{ border: "1px solid var(--border-2)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 160 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
          <span style={{ display: "block", fontSize: 11.5, color: "var(--text-3)" }}>{r.email}</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(r.score), minWidth: 48, textAlign: "right" }}>
          {r.score}%
        </span>
        <Badge tone={TONE[r.status] ?? "neutral"} dot>
          {LABEL[r.status] ?? r.status}
        </Badge>
        <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={onToggle} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name={open ? "chevron-d" : "chevron"} size={12} />
            Anteprima
          </button>
          <a className="btn btn-ghost btn-sm" href={pdfUrl} download style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="download" size={12} />
            PDF
          </a>
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={send} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="mail" size={12} />
            {pending ? "Invio…" : "Invia"}
          </button>
        </span>
        {msg && <span style={{ fontSize: 12, color: "var(--text-3)", width: "100%" }}>{msg}</span>}
      </div>
      {open && (
        <iframe
          title={`Esito ${r.name}`}
          src={pdfUrl}
          style={{ width: "100%", height: 520, border: "none", borderTop: "1px solid var(--border-2)" }}
        />
      )}
    </div>
  );
}
