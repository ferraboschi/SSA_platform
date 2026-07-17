"use client";

import { useState } from "react";
import { createExamLink } from "@/lib/exam-links/actions";
import type { ExamTestKey } from "@/lib/exam-links/token";

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
 * Staff PREVIEWS only — one "Anteprima" per test (full run to the computed
 * outcome, nothing saved). Student link DISTRIBUTION lives exclusively in the
 * Condividi educator page (batch 12): links minted here carried no issue
 * stamp (`ia`), so after any closure/reset they were born dead, and they
 * bypassed the send log and the roll-call gate.
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

  const slot = (key: ExamTestKey) => `${key}:test`;

  const generate = async (key: ExamTestKey) => {
    const id = slot(key);
    setBusy(id);
    const res = await createExamLink({ courseId, testKey: key, mode: "test" });
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

  const Cell = ({ tKey }: { tKey: ExamTestKey }) => {
    const id = slot(tKey);
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
      <button className="btn btn-sm" disabled={busy === id} onClick={() => generate(tKey)}>
        {busy === id ? "…" : "Genera anteprima"}
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
        {/* La distribuzione dei link VIVE nella pagina Condividi: i link
            emessi da qui non portavano il timbro di emissione (`ia`), quindi
            dopo una chiusura o un reset nascevano già morti — e senza log
            invii, controllo presenze e riapertura. Qui resta solo
            l'anteprima staff, che non salva nulla. */}
        <strong>
          I link d&apos;esame per gli studenti si inviano dalla pagina condivisa con
          l&apos;educator (pulsante «Condividi con educator» in alto).
        </strong>{" "}
        Lì ogni invio è tracciato, rispetta l&apos;appello e può essere chiuso e
        riaperto. Da questa scheda puoi solo percorrere ogni test in{" "}
        <strong>anteprima</strong> fino all&apos;esito (nulla viene salvato).
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Test</th>
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
                  <Cell tKey={tst.key} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
