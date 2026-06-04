"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { createExamLink, createPersonalExamLinks, type PersonalExamLink } from "@/lib/exam-links/actions";
import type { ExamTestKey, ExamLinkMode } from "@/lib/exam-links/token";

interface TestDef {
  key: ExamTestKey;
  label: string;
  important?: boolean;
  optional?: boolean;
}

// Order: Test day 1..N → Feedback → ESAME (last, the most important).
function testsForFamily(family: "nihonshu" | "shochu"): TestDef[] {
  const days = family === "shochu" ? 2 : 3;
  return [
    ...Array.from({ length: days }, (_, i) => ({
      key: `day${i + 1}` as ExamTestKey,
      label: `Test giorno ${i + 1}`,
      optional: true,
    })),
    { key: "feedback", label: "Feedback", optional: true },
    { key: "final", label: "Esame finale", important: true },
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

  // Personal links (one per enrolled student), keyed by test.
  const [personal, setPersonal] = useState<
    Record<string, { links: PersonalExamLink[]; stored: boolean; open: boolean }>
  >({});
  const [pBusy, setPBusy] = useState<string | null>(null);
  const [pErr, setPErr] = useState<string | null>(null);

  const genPersonal = async (key: ExamTestKey) => {
    setPBusy(key);
    setPErr(null);
    const res = await createPersonalExamLinks(courseId, key, "exam");
    setPBusy(null);
    if (!res.ok) {
      setPErr(res.error || "Generazione non riuscita");
      return;
    }
    setPersonal((p) => ({
      ...p,
      [key]: { links: res.links ?? [], stored: Boolean(res.stored), open: true },
    }));
  };

  const downloadCsv = (key: ExamTestKey, label: string) => {
    const rows = personal[key]?.links ?? [];
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [
      ["Nome", "Email", "Link personale", "Scadenza"].join(","),
      ...rows.map((r) => [esc(r.name), esc(r.email), esc(r.url), esc(r.expiresAt)].join(",")),
    ].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `link-personali-${label.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

      {/* Meta-exam / validation link: full final exam, reveals correct answers. */}
      <div
        className="card card-pad"
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          border: "1px solid var(--success-fg, #1a7f43)",
          background: "var(--success-bg, #e8f6ee)",
          boxShadow: "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: "var(--text-2)" }}>
          <strong>Valida esame</strong> — prova completa dell&apos;esame finale con lo
          stato attuale delle domande, mostrando le <strong>risposte corrette</strong>.
          Per testare software e qualità dell&apos;esame.
        </div>
        {!links[slot("final", "validate")] ? (
          <button
            className="btn btn-sm"
            onClick={() => generate("final", "validate")}
            disabled={busy === slot("final", "validate")}
          >
            <Icon name="check" size={12} />
            {busy === slot("final", "validate") ? "…" : "Genera link validazione"}
          </button>
        ) : (
          <div style={{ display: "grid", gap: 4, minWidth: 240 }}>
            <input
              readOnly
              value={links[slot("final", "validate")].url}
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
              onClick={() => copy(slot("final", "validate"), links[slot("final", "validate")].url)}
            >
              <Icon name="copy" size={11} />
              {links[slot("final", "validate")].copied ? "Copiato!" : "Copia"}
            </button>
          </div>
        )}
      </div>

      {/* ── Personal links: one per enrolled student, stored + tied to them ── */}
      <div className="card card-pad" style={{ marginBottom: 16, border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>
            <strong>Link personali</strong> — uno per studente iscritto, memorizzato e collegato alla persona
            (così l&apos;esito torna sul suo profilo). Genera, scarica il CSV e invia a ciascuno il suo link.
          </div>
        </div>
        {pErr && <div style={{ fontSize: 12, color: "var(--danger-fg)", marginBottom: 8 }}>{pErr}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tests.map((tst) => (
            <button
              key={tst.key}
              className={`btn btn-sm ${tst.important ? "btn-primary" : ""}`}
              onClick={() => genPersonal(tst.key)}
              disabled={pBusy === tst.key}
            >
              <Icon name="users" size={12} />
              {pBusy === tst.key ? "…" : `Link personali · ${tst.label}`}
            </button>
          ))}
        </div>

        {tests.map((tst) => {
          const p = personal[tst.key];
          if (!p) return null;
          return (
            <div key={tst.key} style={{ marginTop: 12, borderTop: "1px solid var(--border-2)", paddingTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>{tst.label}</strong>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.links.length} studenti</span>
                <button className="btn btn-xs" onClick={() => downloadCsv(tst.key, tst.label)} disabled={!p.links.length}>
                  <Icon name="download" size={11} /> CSV
                </button>
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={() => setPersonal((s) => ({ ...s, [tst.key]: { ...p, open: !p.open } }))}
                >
                  {p.open ? "Nascondi" : "Mostra"}
                </button>
                {!p.stored && (
                  <span style={{ fontSize: 11, color: "var(--warning-fg)" }}>
                    ⚠ non memorizzati (applica la migrazione exam_student_links)
                  </span>
                )}
              </div>
              {p.open && (
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Studente</th>
                        <th>Email</th>
                        <th style={{ width: 90 }}>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.links.map((r) => (
                        <tr key={r.corsistaId}>
                          <td style={{ fontWeight: 600 }}>{r.name}</td>
                          <td style={{ color: "var(--text-3)", fontSize: 12 }}>{r.email}</td>
                          <td>
                            <button className="btn btn-xs btn-ghost" onClick={() => copy(`p:${tst.key}:${r.corsistaId}`, r.url)}>
                              <Icon name="copy" size={11} />
                              {links[`p:${tst.key}:${r.corsistaId}`]?.copied ? "Copiato!" : "Copia"}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {p.links.length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ color: "var(--text-4)", fontSize: 12 }}>
                            Nessuno studente iscritto a questo corso.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Test</th>
              <th style={{ width: 220 }}>Link esame (condiviso)</th>
              <th style={{ width: 220 }}>Link test (anteprima)</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((tst) => (
              <tr
                key={tst.key}
                style={
                  tst.important
                    ? { background: "var(--indigo-50)", borderTop: "2px solid var(--indigo)" }
                    : undefined
                }
              >
                <td style={{ fontWeight: tst.important ? 800 : 600 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {tst.important && <Icon name="exam" size={14} />}
                    {tst.label}
                    {tst.important && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--indigo)",
                          background: "var(--indigo-100)",
                          padding: "1px 6px",
                          borderRadius: 4,
                          letterSpacing: "0.03em",
                        }}
                      >
                        OBBLIGATORIO
                      </span>
                    )}
                    {tst.optional && (
                      <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>facoltativo</span>
                    )}
                  </span>
                </td>
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
