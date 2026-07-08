"use client";

// Editor for the TWO end-of-course feedback questionnaires (Breve / Lungo),
// shared across all course types and independent of the exam families. Self
// contained: loads both sets, edits the active one, saves it. Reuses the same
// question detail + add-row as the exam editor.

import { useEffect, useState, useTransition } from "react";
import { Icon, Badge } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { plOverlay, plDialog } from "@/components/pianificatore/modal-styles";
import type { ExamQuestion, ExamQuestionType, FeedbackVariant } from "@/lib/domain";
import { QuestionDetail, AddQuestionRow } from "@/components/esami/QuestionDetail";
import {
  loadFeedbackSetsAction,
  saveFeedbackSetAction,
  type FeedbackSets,
} from "@/lib/esami/feedback-sets-actions";

const genId = () => "fb-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function newFeedbackQuestion(type: ExamQuestionType): ExamQuestion {
  const base: ExamQuestion = {
    id: genId(),
    cat: "",
    type,
    lang: "it",
    points: 0, // feedback answers aren't scored
    important: false,
    text: "Nuova domanda di feedback",
  };
  if (type === "single" || type === "multi") {
    base.options = ["Opzione 1", "Opzione 2"];
    base.correct = [];
  }
  return base;
}

export function FeedbackSetsEditor() {
  const esami = useT().esami;
  const [sets, setSets] = useState<FeedbackSets>({ short: [], long: [] });
  const [variant, setVariant] = useState<FeedbackVariant>("short");
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState<Record<FeedbackVariant, boolean>>({ short: false, long: false });
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Concurrency version of the stored row — sent back on save so a stale
  // editor gets a "reload first" conflict instead of clobbering (Bug 4).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    loadFeedbackSetsAction()
      .then((s) => {
        if (!alive) return;
        setSets({ short: s.short, long: s.long });
        setVersion(s.version);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const questions = sets[variant];
  const setQuestions = (qs: ExamQuestion[]) => {
    setSets((prev) => ({ ...prev, [variant]: qs }));
    setDirty((d) => ({ ...d, [variant]: true }));
    setMsg(null);
  };
  const addQuestion = (type: ExamQuestionType) => {
    setQuestions([...questions, newFeedbackQuestion(type)]);
    setOpenIdx(questions.length);
  };
  const updateQuestion = (i: number, patch: Partial<ExamQuestion>) =>
    setQuestions(questions.map((q, x) => (x === i ? { ...q, ...patch } : q)));
  const changeType = (i: number, type: ExamQuestionType) =>
    setQuestions(questions.map((q, x) => (x === i ? { ...newFeedbackQuestion(type), id: q.id, text: q.text } : q)));
  const removeQuestion = (i: number) => {
    setQuestions(questions.filter((_, x) => x !== i));
    setOpenIdx(null);
  };
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const arr = questions.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setQuestions(arr);
  };

  const save = () => {
    setMsg(null);
    startSave(async () => {
      const res = await saveFeedbackSetAction(variant, questions, version);
      if (res.ok) {
        if (res.newVersion != null) setVersion(res.newVersion);
        setDirty((d) => ({ ...d, [variant]: false }));
        setMsg("Salvato ✓");
      } else setMsg(res.error || "Salvataggio non riuscito");
    });
  };

  const modalQ = openIdx != null ? (questions[openIdx] ?? null) : null;

  return (
    <div className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Feedback di fine corso</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
            Due questionari: <strong>Breve</strong> (One Day, Masterclass) e <strong>Lungo</strong> (Certificato,
            Shochu). Sempre facoltativo per lo studente.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {msg && (
            <span style={{ fontSize: 12, color: msg.includes("✓") ? "var(--success-fg)" : "var(--danger-fg)" }}>{msg}</span>
          )}
          <button className="btn btn-sm btn-primary" onClick={save} disabled={saving || !dirty[variant]}>
            <Icon name="save" size={12} />
            {saving ? "Salvo…" : "Salva"}
          </button>
        </div>
      </div>

      <div className="segmented" style={{ marginBottom: 14, maxWidth: 320 }}>
        <button className={variant === "short" ? "on" : ""} onClick={() => { setVariant("short"); setOpenIdx(null); }}>
          Breve {sets.short.length ? `· ${sets.short.length}` : ""}
        </button>
        <button className={variant === "long" ? "on" : ""} onClick={() => { setVariant("long"); setOpenIdx(null); }}>
          Lungo {sets.long.length ? `· ${sets.long.length}` : ""}
        </button>
      </div>

      {loading ? (
        <div className="text-3" style={{ padding: 18, fontSize: 12.5 }}>Carico…</div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {questions.length === 0 ? (
            <div className="text-3" style={{ padding: 18, fontSize: 12.5 }}>
              Nessuna domanda nel questionario {variant === "short" ? "breve" : "lungo"}. Aggiungine una.
            </div>
          ) : (
            questions.map((qq, qi) => (
              <div key={qq.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border-2)" }}>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)", minWidth: 22 }}>
                  {(qi + 1).toString().padStart(2, "0")}
                </span>
                <button
                  onClick={() => setOpenIdx(qi)}
                  style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, padding: 0, textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.35 }}>{qq.text || "—"}</span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <Badge tone="neutral">{esami.qt[qq.type]}</Badge>
                  </span>
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button className="reorder-btn" disabled={qi === 0} onClick={() => move(qi, -1)}>
                    <Icon name="arrow-up" size={12} />
                  </button>
                  <button className="reorder-btn" disabled={qi === questions.length - 1} onClick={() => move(qi, 1)}>
                    <Icon name="arrow-dn" size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
          <AddQuestionRow onAdd={addQuestion} />
        </div>
      )}

      {modalQ && openIdx != null && (
        <div style={plOverlay} onClick={() => setOpenIdx(null)}>
          <div style={{ ...plDialog, maxWidth: 860, maxHeight: "92vh", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 14 }}>
                Domanda {openIdx + 1} di {questions.length} · {variant === "short" ? "Breve" : "Lungo"}
              </strong>
              <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setOpenIdx(null)} title="Chiudi (Esc)">
                <Icon name="x" size={14} />
              </button>
            </div>
            <div style={{ padding: 22, overflow: "auto" }}>
              <QuestionDetail
                q={modalQ}
                cats={null}
                onChange={(patch) => updateQuestion(openIdx, patch)}
                onChangeType={(type) => changeType(openIdx, type)}
                onDuplicate={() => {
                  setQuestions([...questions.slice(0, openIdx + 1), { ...modalQ, id: genId() }, ...questions.slice(openIdx + 1)]);
                  setOpenIdx(openIdx + 1);
                }}
                onDelete={() => removeQuestion(openIdx)}
                onCommitCategory={() => {}}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
