"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { createExamLink } from "@/lib/exam-links/actions";
import type { ExamTestKey, ExamLinkMode } from "@/lib/exam-links/token";

interface TestDef {
  key: ExamTestKey;
  label: string;
}

function testsForFamily(family: "nihonshu" | "shochu"): TestDef[] {
  const days = family === "shochu" ? 2 : 3;
  return [
    { key: "final", label: "Esame finale" },
    ...Array.from({ length: days }, (_, i) => ({
      key: `day${i + 1}` as ExamTestKey,
      label: `Test giorno ${i + 1}`,
    })),
    { key: "feedback", label: "Feedback" },
  ];
}

type LinkState = Record<string, { url: string; expiresAt?: string; copied?: boolean }>;

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
    if (res.ok && res.url) {
      setLinks((l) => ({ ...l, [id]: { url: res.url!, expiresAt: res.expiresAt } }));
    }
  };

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setLinks((l) => ({ ...l, [id]: { ...l[id], copied: true } }));
      setTimeout(
        () => setLinks((l) => ({ ...l, [id]: { ...l[id], copied: false } })),
        1800,
      );
    } catch {
      /* clipboard blocked — user can select manually */
    }
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
        }}
      >
        Genera i link d&apos;accesso per gli studenti. Il <strong>link esame</strong> apre
        la sessione reale; il <strong>link test</strong> apre l&apos;anteprima.
        Ogni link è <strong>temporaneo</strong> (scade) e specifico del test.
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Test</th>
              <th style={{ width: 220 }}>Link esame (studente)</th>
              <th style={{ width: 220 }}>Link test (anteprima)</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((tst) => (
              <tr key={tst.key}>
                <td style={{ fontWeight: 600 }}>{tst.label}</td>
                {(["exam", "test"] as ExamLinkMode[]).map((mode) => {
                  const id = slot(tst.key, mode);
                  const st = links[id];
                  return (
                    <td key={mode}>
                      {!st ? (
                        <button
                          className={`btn btn-sm ${mode === "exam" ? "btn-primary" : ""}`}
                          onClick={() => generate(tst.key, mode)}
                          disabled={busy === id}
                        >
                          <Icon name={mode === "exam" ? "share" : "monitor"} size={12} />
                          {busy === id ? "…" : mode === "exam" ? "Genera link" : "Link test"}
                        </button>
                      ) : (
                        <div style={{ display: "grid", gap: 4 }}>
                          <input
                            readOnly
                            value={st.url}
                            onFocus={(e) => e.currentTarget.select()}
                            style={{
                              fontSize: 11,
                              padding: "5px 7px",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              width: "100%",
                              fontFamily: "monospace",
                            }}
                          />
                          <button
                            className="btn btn-xs btn-ghost"
                            onClick={() => copy(id, st.url)}
                          >
                            <Icon name="copy" size={11} />
                            {st.copied ? "Copiato!" : "Copia"}
                          </button>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
