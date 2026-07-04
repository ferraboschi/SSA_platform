"use client";

import { useState } from "react";
import { createExamLink } from "@/lib/exam-links/actions";
import type { ExamTestKey, ExamLinkMode } from "@/lib/exam-links/token";

interface TestDef {
  key: ExamTestKey;
  label: string;
  important?: boolean;
}

// Order: Test day 1..N → Feedback → ESAME (last, the most important).
function testsForFamily(family: "nihonshu" | "shochu"): TestDef[] {
  const days = family === "shochu" ? 2 : 3;
  return [
    ...Array.from({ length: days }, (_, i) => ({
      key: `day${i + 1}` as ExamTestKey,
      label: `Test giorno ${i + 1}`,
    })),
    { key: "feedback" as ExamTestKey, label: "Feedback" },
    { key: "final" as ExamTestKey, label: "Esame finale", important: true },
  ];
}

type LinkState = Record<string, { url: string; copied?: boolean }>;

/**
 * Exam links — one place. Per test: ONE "Link d'esame" (the shared class link:
 * whoever opens it enters the email confirmed at course start; on a match a
 * personal link is minted and they land directly in their own exam — the Esiti
 * tab shows live progress and results) and ONE "Anteprima" (full run to the
 * computed outcome, nothing saved).
 */
export function ExamLinkPanel({
  courseId,
  family,
}: {
  courseId: string;
  family: "nihonshu" | "shochu";
}) {
  const tests = testsForFamily(family);
  const [links, setLinks] = useState<LinkState>({});
  const [busy, setBusy] = useState<string | null>(null);

  const slot = (key: ExamTestKey, mode: ExamLinkMode) => `${key}:${mode}`;

  const generate = async (key: ExamTestKey, mode: ExamLinkMode) => {
    const id = slot(key, mode);
    setBusy(id);
    const res = await createExamLink({ courseId, testKey: key, mode });
    setBusy(null);
    if (res.ok && res.url) setLinks((l) => ({ ...l, [id]: { url: res.url! } }));
  };

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setLinks((l) => ({ ...l, [id]: { ...l[id], copied: true } }));
      setTimeout(() => setLinks((l) => ({ ...l, [id]: { ...l[id], copied: false } })), 1800);
    } catch {
      window.prompt("Copia il link:", url);
    }
  };

  const Cell = ({ tKey, mode }: { tKey: ExamTestKey; mode: ExamLinkMode }) => {
    const id = slot(tKey, mode);
    const st = links[id];
    if (st?.url) {
      return (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            readOnly
            value={st.url}
            onFocus={(e) => e.currentTarget.select()}
            className="input mono"
            style={{ flex: 1, minWidth: 0, fontSize: 11.5 }}
          />
          <button className="btn btn-sm" onClick={() => copy(id, st.url)} style={{ flexShrink: 0 }}>
            {st.copied ? "Copiato ✓" : "Copia"}
          </button>
        </div>
      );
    }
    return (
      <button
        className={`btn btn-sm ${mode === "exam" ? "btn-primary" : ""}`}
        disabled={busy === id}
        onClick={() => generate(tKey, mode)}
      >
        {busy === id ? "…" : mode === "exam" ? "Genera link" : "Genera anteprima"}
      </button>
    );
  };

  return (
    <div>
      <div
        className="card card-pad"
        style={{
          marginBottom: 16,
          background: "var(--indigo-50)",
          border: "1px solid var(--indigo-100)",
          boxShadow: "none",
          fontSize: 13,
          color: "var(--text-2)",
          lineHeight: 1.55,
        }}
      >
        <strong>Link d&apos;esame generale.</strong> Chi lo apre inserisce l&apos;email che ha
        confermato all&apos;inizio del corso: se corrisponde, entra direttamente nel proprio
        esame personale — nessuna sala d&apos;attesa, nessun riconoscimento video.
        In alternativa l&apos;educator può inviare a ogni studente il suo link personale
        dalla pagina <strong>Condividi</strong>. L&apos;<strong>anteprima</strong> percorre l&apos;esame
        fino all&apos;esito (nulla viene salvato). I link scadono.
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Test</th>
              <th>Link d&apos;esame (per la classe)</th>
              <th style={{ width: 240 }}>Anteprima (fino all&apos;esito)</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((tst) => (
              <tr
                key={tst.key}
                style={tst.important ? { background: "var(--indigo-50)" } : undefined}
              >
                <td style={{ whiteSpace: "nowrap" }}>
                  <strong style={{ fontWeight: tst.important ? 700 : 500 }}>{tst.label}</strong>{" "}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".04em",
                      color: tst.important ? "var(--indigo-600)" : "var(--text-4)",
                    }}
                  >
                    {tst.important ? "OBBLIGATORIO" : "facoltativo"}
                  </span>
                </td>
                <td>
                  {tst.key === "final" ? (
                    <Cell tKey={tst.key} mode="exam" />
                  ) : (
                    <span style={{ color: "var(--text-4)" }}>—</span>
                  )}
                </td>
                <td>
                  <Cell tKey={tst.key} mode="test" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
