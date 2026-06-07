"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import {
  renderExamEmail,
  EXAM_OUTCOMES,
  OUTCOME_LABEL_IT,
  EXAM_EMAIL_VARS,
  type ExamEmailTemplates,
  type ExamOutcome,
} from "@/lib/esami/exam-email";
import {
  saveExamEmailTemplatesAction,
  sendExamResultTestAction,
} from "@/lib/esami/exam-email-actions";

const OUTCOME_TONE: Record<ExamOutcome, string> = {
  passed: "var(--success-fg, #15803d)",
  retrial: "var(--warning-fg, #b45309)",
  failed: "var(--danger-fg, #b91c1c)",
};

export function ExamEmailTemplatesEditor({
  initial,
  testTo,
}: {
  initial: ExamEmailTemplates;
  testTo: string;
}) {
  const [templates, setTemplates] = useState<ExamEmailTemplates>(initial);
  const [active, setActive] = useState<ExamOutcome>("passed");
  const [testEmail, setTestEmail] = useState(testTo || "");
  const [savePending, startSave] = useTransition();
  const [testPending, startTest] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  const cur = templates[active];
  const setCur = (patch: Partial<{ subject: string; body: string }>) =>
    setTemplates((t) => ({ ...t, [active]: { ...t[active], ...patch } }));

  const insertVar = (v: string) => {
    const field = lastFocused.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    if (!el) {
      setCur(field === "subject" ? { subject: cur.subject + v } : { body: cur.body + v });
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + v + el.value.slice(end);
    setCur(field === "subject" ? { subject: next } : { body: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + v.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const save = () => {
    setMsg(null);
    startSave(async () => {
      const r = await saveExamEmailTemplatesAction(templates);
      setMsg({ ok: r.ok, text: r.ok ? "Modelli salvati ✓" : r.error || "Errore nel salvataggio." });
    });
  };

  const sendTest = () => {
    setMsg(null);
    startTest(async () => {
      const r = await sendExamResultTestAction(active, testEmail, templates[active]);
      setMsg({
        ok: r.ok && r.status !== "skipped",
        text: r.ok
          ? r.status === "skipped"
            ? r.error || "Email non configurata."
            : `Email di prova inviata a ${testEmail} ✓`
          : r.error || "Invio non riuscito.",
      });
    });
  };

  const preview = renderExamEmail(
    cur,
    {
      nome: "Mario Rossi",
      corso: "Sake Sommelier Certificato",
      punteggio: 82,
      esito: OUTCOME_LABEL_IT[active],
    },
    { reportUrl: "#", outcome: active },
  );

  return (
    <div className="page">
      <Link className="btn btn-sm btn-ghost" href="/esami" style={{ marginBottom: 14 }}>
        <Icon name="arrow" size={12} style={{ transform: "rotate(180deg)" }} />
        Torna agli esami
      </Link>
      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">Esami</div>
          <h1 className="page-title">Modelli email esito</h1>
          <p className="page-sub">
            Personalizza le 3 email inviate allo studente in base all&apos;esito.
            Usa le variabili per inserire automaticamente nome, corso e punteggio.
            Il certificato PDF resta allegato in automatico.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" disabled={savePending} onClick={save}>
            <Icon name="save" size={13} />
            {savePending ? "Salvo…" : "Salva modelli"}
          </button>
        </div>
      </div>

      {/* Outcome tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {EXAM_OUTCOMES.map((o) => (
          <button
            key={o}
            className={`tab ${active === o ? "active" : ""}`}
            onClick={() => setActive(o)}
          >
            <span
              className="dot"
              style={{ background: OUTCOME_TONE[o], width: 8, height: 8, marginRight: 6, display: "inline-block", borderRadius: 999 }}
            />
            {OUTCOME_LABEL_IT[o]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        {/* Editor column */}
        <div className="card card-pad" style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <div className="field-label">Oggetto</div>
            <input
              ref={subjectRef}
              className="input"
              value={cur.subject}
              onFocus={() => (lastFocused.current = "subject")}
              onChange={(e) => setCur({ subject: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>
          <div className="field">
            <div className="field-label">Testo dell&apos;email</div>
            <textarea
              ref={bodyRef}
              className="input"
              value={cur.body}
              onFocus={() => (lastFocused.current = "body")}
              onChange={(e) => setCur({ body: e.target.value })}
              rows={12}
              style={{ width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
            />
          </div>
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>Variabili (clicca per inserire)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {EXAM_EMAIL_VARS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className="pill"
                  title={v.desc}
                  onClick={() => insertVar(v.key)}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 8 }}>
            <div className="field-label">Invia una prova</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input mono"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tua@email.it"
                style={{ flex: 1, minWidth: 200 }}
              />
              <button
                className="btn"
                disabled={testPending || !testEmail.includes("@")}
                onClick={sendTest}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Icon name="mail" size={13} />
                {testPending ? "Invio…" : `Invia prova "${OUTCOME_LABEL_IT[active]}"`}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>
              La prova usa dati di esempio (Mario Rossi · 82%) e non tocca nessuno studente.
            </div>
          </div>

          {msg && (
            <div
              style={{
                fontSize: 12.5,
                color: msg.ok ? "var(--success-fg, #15803d)" : "var(--danger-fg, #b91c1c)",
              }}
            >
              {msg.text}
            </div>
          )}
        </div>

        {/* Preview column */}
        <div className="card" style={{ position: "sticky", top: 16, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              fontSize: 11.5,
              color: "var(--text-3)",
              display: "flex",
              gap: 8,
            }}
          >
            <Icon name="mail" size={12} />
            Anteprima · Oggetto: <strong style={{ color: "var(--text-2)" }}>{preview.subject}</strong>
          </div>
          <div style={{ padding: 20, background: "#fff" }}>
            <div dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      </div>
    </div>
  );
}
