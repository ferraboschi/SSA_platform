"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { resetExamSandboxAction } from "@/lib/corsi/sandbox-actions";
import { SANDBOX_COURSE_HANDLE } from "@/lib/corsi/sandbox";

/**
 * Pinned "Test esame" card at the top of the Corsi section: the permanent
 * demo/sandbox course for trying the whole exam flow (day tests, feedback,
 * final exam, appello) and for showing it to educators. The reset button
 * wipes every trial trace and restores the demo roster.
 */
export function SandboxCard() {
  const s = useT().corsi.detail.sandbox;
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const runReset = () => {
    setConfirming(false);
    startTransition(async () => {
      const res = await resetExamSandboxAction().catch(() => null);
      if (res?.ok && res.summary) {
        const n = res.summary.submissions + res.summary.presenze + res.summary.partecipanti;
        setResult({ kind: "ok", text: n === 0 ? s.resetCleanAlready : s.resetDone });
      } else {
        setResult({ kind: "err", text: res?.error ?? s.resetError });
      }
      setTimeout(() => setResult(null), 6000);
    });
  };

  return (
    <div
      className="card card-pad"
      style={{
        marginBottom: 18,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        borderStyle: "dashed",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: "var(--indigo-50)",
          color: "var(--indigo-600)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="exam" size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{s.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.45 }}>{s.hint}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {result && (
          <span className={`sync-result ${result.kind}`} style={{ position: "static" }}>
            {result.text}
          </span>
        )}
        {confirming ? (
          <>
            <span style={{ fontSize: 12.5, color: "var(--danger-fg)", fontWeight: 600 }}>
              {s.resetConfirm}
            </span>
            <button className="btn btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
              {s.resetCancel}
            </button>
            <button className="btn btn-sm btn-danger" onClick={runReset} disabled={pending}>
              {s.resetYes}
            </button>
          </>
        ) : (
          <button className="btn btn-sm" onClick={() => setConfirming(true)} disabled={pending}>
            <Icon name="refresh" size={13} className={pending ? "is-spinning" : undefined} />
            {pending ? s.resetting : s.resetButton}
          </button>
        )}
        <Link href={`/corsi/${SANDBOX_COURSE_HANDLE}`} className="btn btn-sm btn-primary">
          <Icon name="external" size={13} />
          {s.open}
        </Link>
      </div>
    </div>
  );
}
