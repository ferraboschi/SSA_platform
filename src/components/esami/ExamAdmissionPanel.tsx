"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Badge, Icon, type BadgeTone } from "@/components/ui";
import {
  listExamSessionsAction,
  admitExamSessionAction,
  type ExamSessionRow,
} from "@/lib/exam-links/sessions";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  checked_in: { label: "In attesa", tone: "warning" },
  admitted: { label: "Ammesso", tone: "indigo" },
  submitted: { label: "Consegnato", tone: "success" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Live admission control for a remote (Zoom) exam: shows who has checked in and
 * lets the educator ADMIT each student (after recognising them on video). Polls
 * every 3s while LIVE.
 */
export function ExamAdmissionPanel({
  courseId,
  testKey = "final",
}: {
  courseId: string;
  testKey?: string;
}) {
  const [sessions, setSessions] = useState<ExamSessionRow[]>([]);
  const [live, setLive] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [, startAdmit] = useTransition();

  const load = useCallback(async () => {
    const r = await listExamSessionsAction(courseId, testKey);
    if (r.ok && r.sessions) setSessions(r.sessions);
    setLoaded(true);
  }, [courseId, testKey]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [live, load]);

  const admit = (id: number) =>
    startAdmit(async () => {
      await admitExamSessionAction(id);
      await load();
    });
  const admitAll = () =>
    startAdmit(async () => {
      await Promise.all(sessions.filter((s) => s.status === "checked_in").map((s) => admitExamSessionAction(s.id)));
      await load();
    });

  const waiting = sessions.filter((s) => s.status === "checked_in").length;

  return (
    <section className="card card-pad" style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="monitor" size={12} />
          Ammissione esame (live)
        </div>
        <span style={{ flex: 1 }} />
        {waiting > 0 && (
          <button className="btn btn-sm btn-primary" onClick={admitAll}>
            Ammetti tutti ({waiting})
          </button>
        )}
        <button
          className={`btn btn-sm ${live ? "" : "btn-ghost"}`}
          onClick={() => setLive((v) => !v)}
          title="Aggiornamento automatico ogni 3s"
        >
          <span className={`s-dot ${live ? "success pulse" : ""}`} style={{ marginRight: 5 }} />
          {live ? "LIVE" : "in pausa"}
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.5 }}>
        Gli studenti che aprono il link e scelgono il nome compaiono qui. Riconoscili
        su Zoom (chiedi un documento se serve) e premi <b>Ammetti</b>: solo allora
        il loro esame si sblocca.
      </div>

      {!loaded ? (
        <p className="text-3" style={{ fontSize: 13 }}>Caricamento…</p>
      ) : sessions.length === 0 ? (
        <p className="text-3" style={{ fontSize: 13 }}>
          Nessuno studente in attesa. Quando aprono il link d&apos;esame compaiono qui.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map((s) => {
            const st = STATUS[s.status] ?? { label: s.status, tone: "neutral" as BadgeTone };
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 12px",
                  border: "1px solid var(--border-2)",
                  borderRadius: 9,
                  background: s.status === "checked_in" ? "var(--warning-bg, #fffbeb)" : "var(--surface)",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, fontWeight: 600 }}>{s.student_name}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>arrivato {fmtTime(s.checked_in_at)}</span>
                <Badge tone={st.tone} dot>
                  {st.label}
                </Badge>
                {s.status === "checked_in" && (
                  <button className="btn btn-sm btn-primary" onClick={() => admit(s.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Icon name="check" size={12} />
                    Ammetti
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
