"use client";

import { useEffect, useState } from "react";
import {
  getExamProgressForStaffAction,
  type LiveRosterEntry,
} from "@/lib/exam-links/live-progress-actions";

const timeIt = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/**
 * Mirrors the educator's live "Esami" panel (condividi) inside the internal
 * platform: who's doing the final exam RIGHT NOW, before any grading exists.
 * Owner's rule: staff (here) OBSERVES the run and confirms the outcome in the
 * results table below — the educator only ever observes, never decides.
 * Polls every 10s; renders nothing until at least one student has started.
 */
export function LiveExamProgress({ courseId }: { courseId: string }) {
  const [progress, setProgress] = useState<Record<
    string,
    { pct: number; question: number; total: number; submittedAt: string | null }
  > | null>(null);
  const [roster, setRoster] = useState<LiveRosterEntry[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      getExamProgressForStaffAction(courseId, "final")
        .then((r) => {
          if (!alive) return;
          if (r.ok) {
            setProgress(r.progress ?? {});
            if (r.roster) setRoster(r.roster);
          }
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [courseId]);

  if (!progress) return null;
  const running = roster
    .map((s) => ({ s, p: progress[`${s.kind === "corsista" ? "c" : "p"}${s.id}`] }))
    .filter((r) => r.p);
  if (running.length === 0) return null;

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span className="s-dot success pulse" />
        <strong style={{ fontSize: 13.5 }}>Esame in corso ora</strong>
        <span className="text-3" style={{ fontSize: 12 }}>
          — come lo vede l&apos;educator; l&apos;esito lo conferma la SSA qui sotto.
        </span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {running.map(({ s, p }) => (
          <div key={`${s.kind}-${s.id}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                flex: "0 0 170px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.name || "—"}
            </span>
            <div
              role="progressbar"
              aria-valuenow={p.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                flex: 1,
                height: 8,
                borderRadius: 999,
                background: "var(--border-2)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${p.pct}%`,
                  borderRadius: 999,
                  background: p.submittedAt ? "var(--success)" : "var(--indigo)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                flexShrink: 0,
                color: p.submittedAt ? "var(--success-fg)" : "var(--indigo-600)",
              }}
            >
              {p.submittedAt ? `Consegnato ${timeIt(p.submittedAt)}` : `dom. ${p.question}/${p.total}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
