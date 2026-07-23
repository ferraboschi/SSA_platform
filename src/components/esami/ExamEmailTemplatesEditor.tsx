"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import {
  renderExamEmail,
  EXAM_OUTCOMES,
  EXAM_EMAIL_LANGS,
  OUTCOME_LABEL_IT,
  OUTCOME_LABEL_BY_LANG,
  LANG_LABEL,
  EXAM_EMAIL_VARS,
  DEFAULTS_BY_LANG,
  type ExamEmailLang,
  type ExamEmailTemplates,
  type ExamOutcome,
  type UpcomingCourseLine,
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
  upcoming = [],
}: {
  initial: Record<ExamEmailLang, ExamEmailTemplates>;
  testTo: string;
  upcoming?: UpcomingCourseLine[];
}) {
  const [byLang, setByLang] = useState<Record<ExamEmailLang, ExamEmailTemplates>>(initial);
  const [lang, setLang] = useState<ExamEmailLang>("it");
  const [active, setActive] = useState<ExamOutcome>("passed");
  const [testEmail, setTestEmail] = useState(testTo || "");
  const [savePending, startSave] = useTransition();
  const [testPending, startTest] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  const cur = byLang[lang][active];
  const setCur = (patch: Partial<{ subject: string; body: string }>) =>
    setByLang((prev) => ({
      ...prev,
      [lang]: { ...prev[lang], [active]: { ...prev[lang][active], ...patch } },
    }));

  // Built-in default for the current language + outcome. "Ripristina predefinito"
  // discards a saved customization and restores the faithful default (e.g. an
  // Italian body edited drier than the English original). Reversible until Save.
  const def = DEFAULTS_BY_LANG[lang][active];
  const isDefault = cur.subject === def.subject && cur.body === def.body;
  const resetToDefault = () => setCur({ subject: def.subject, body: def.body });

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
      const r = await saveExamEmailTemplatesAction(byLang);
      setMsg({ ok: r.ok, text: r.ok ? "Modelli salvati ✓" : r.error || "Errore nel salvataggio." });
    });
  };

  const sendTest = () => {
    setMsg(null);
    startTest(async () => {
      const r = await sendExamResultTestAction(active, testEmail, byLang[lang][active], lang);
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
      esito: OUTCOME_LABEL_BY_LANG[lang][active],
    },
    { reportUrl: "#", outcome: active, courses: upcoming, lang },
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <p className="text-3" style={{ fontSize: 13, lineHeight: 1.5, margin: 0, maxWidth: 560 }}>
          Personalizza le email inviate allo studente in base all&apos;esito, in ogni
          lingua. Lo studente riceve l&apos;email nella lingua scelta per l&apos;esame.
          Usa le variabili per inserire automaticamente nome, corso e punteggio;
          il certificato PDF resta allegato in automatico.
        </p>
        <button className="btn btn-primary" disabled={savePending} onClick={save}>
          <Icon name="save" size={13} />
          {savePending ? "Salvo…" : "Salva modelli"}
        </button>
      </div>

      {/* Language switcher — one editable set per language */}
      <div className="tabs" style={{ marginBottom: 12 }}>
        {EXAM_EMAIL_LANGS.map((l) => (
          <button
            key={l}
            className={`tab ${lang === l ? "active" : ""}`}
            onClick={() => setLang(l)}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
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
            <div className="field-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>Testo dell&apos;email</span>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={resetToDefault}
                disabled={isDefault}
                title={
                  isDefault
                    ? "Questo testo è già quello predefinito"
                    : `Ripristina il testo predefinito (fedele) per "${OUTCOME_LABEL_IT[active]}" · ${LANG_LABEL[lang]}`
                }
                style={{ fontSize: 11.5, fontWeight: 500 }}
              >
                <Icon name="refresh" size={11} /> Ripristina predefinito
              </button>
            </div>
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
                {testPending ? "Invio…" : `Invia prova "${OUTCOME_LABEL_IT[active]}" (${LANG_LABEL[lang]})`}
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
