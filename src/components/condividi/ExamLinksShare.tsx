"use client";

import { useState } from "react";

// Local prop shape (structurally matches SharedExamTest) so this client
// component never imports the server-only loader module.
interface ExamTest {
  key: string;
  label: string;
  isFinal: boolean;
  url: string;
}

/**
 * Public "share with educator" exam section: one ready-to-share student link per
 * configured test (day mini-tests + the final exam). The educator pastes each
 * link into the class (e.g. a WhatsApp group); every student opens it, picks
 * their name and enters the waiting room. Read-only, copy-first UI.
 */
export default function ExamLinksShare({ tests }: { tests: ExamTest[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      window.prompt("Copia il link:", url);
    }
  };

  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Esame · link per gli studenti</h2>
      <p style={{ fontSize: 12, color: "var(--text-3, #6b7280)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Incolla il link nella chat della classe (es. gruppo WhatsApp). Ogni studente
        lo apre, sceglie il proprio nome ed entra in sala d&apos;attesa: lo ammetti tu.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tests.map((tst) => (
          <div
            key={tst.key}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${tst.isFinal ? "var(--indigo-100, #c7d2fe)" : "var(--border, #e5e7eb)"}`,
              background: tst.isFinal ? "var(--indigo-50, #eef2ff)" : "var(--surface, #fff)",
            }}
          >
            <div style={{ minWidth: 128, flexShrink: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: tst.isFinal ? 700 : 600 }}>
                {tst.label}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: ".04em",
                  color: tst.isFinal ? "var(--indigo-600, #4f46e5)" : "var(--text-4, #9ca3af)",
                }}
              >
                {tst.isFinal ? "UFFICIALE" : "MINI-TEST"}
              </span>
            </div>
            <input
              readOnly
              value={tst.url}
              onFocus={(e) => e.currentTarget.select()}
              className="mono"
              style={{
                flex: 1,
                minWidth: 160,
                fontSize: 11.5,
                padding: "7px 9px",
                borderRadius: 7,
                border: "1px solid var(--border, #e5e7eb)",
                background: "var(--surface-2, #f4f5f7)",
                color: "var(--text-2, #374151)",
              }}
            />
            <button
              type="button"
              onClick={() => copy(tst.key, tst.url)}
              style={{
                flexShrink: 0,
                fontSize: 12.5,
                fontWeight: 600,
                padding: "7px 14px",
                borderRadius: 7,
                border: "1px solid var(--indigo-600, #4f46e5)",
                background: copied === tst.key ? "var(--indigo-50, #eef2ff)" : "var(--indigo-600, #4f46e5)",
                color: copied === tst.key ? "var(--indigo-600, #4f46e5)" : "#fff",
                cursor: "pointer",
              }}
            >
              {copied === tst.key ? "Copiato ✓" : "Copia"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
