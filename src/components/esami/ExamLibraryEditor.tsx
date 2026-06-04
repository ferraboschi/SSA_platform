"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon, Badge } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type {
  ExamCategory,
  ExamFamily,
  ExamQuestion,
  ExamQuestionType,
  ExamTemplate,
} from "@/lib/domain";
import { QUESTION_EST_SEC, estimateSeconds, formatEstimate } from "@/lib/esami";
import { saveExamTemplateAction } from "@/lib/esami/actions";
import { createExamLink } from "@/lib/exam-links/actions";
import type { ExamTestKey, ExamLinkMode } from "@/lib/exam-links/token";
import { translateExamTemplateAction } from "@/lib/esami/ai-actions";

type Section = "esame" | "feedback" | `day${number}`;

export interface ExamLibraryEditorProps {
  templates: Record<ExamFamily, ExamTemplate>;
  /** Representative course id per family, to mint preview links. */
  previewCourse?: Partial<Record<ExamFamily, string>>;
}

const cloneTpl = (t: ExamTemplate): ExamTemplate =>
  JSON.parse(JSON.stringify(t)) as ExamTemplate;

const genId = () =>
  "q-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Short "how this works" tip shown above each question type in the editor.
const TYPE_TIPS: Record<string, string> = {
  single: "Scelta singola: lo studente sceglie UNA risposta. Tocca il cerchio per segnare la corretta. Auto-correzione.",
  multi: "Scelta multipla: lo studente può sceglierne PIÙ di una. Segna TUTTE le corrette. Auto-correzione (devono coincidere esattamente).",
  truefalse: "Vero / Falso: due opzioni, segna quella corretta. Auto-correzione.",
  image: "Identifica immagine: mostra un'immagine (incolla l'URL qui sotto) e lo studente sceglie l'opzione corretta. Segna la corretta. Auto-correzione.",
  fill: "Riempi spazio: lo studente DIGITA la risposta. Elenca le risposte accettate separate da virgola (maiuscole/minuscole e spazi non contano). Auto-correzione.",
  open: "Testo libero: risposta aperta, corretta dall'AI in base alla knowledge base SSA (suggerimento, poi confermi a mano).",
  match: "Abbinamento: lo studente abbina gli elementi di sinistra a quelli di destra. ⚠ Non ancora disponibile nel test studente.",
  order: "Ordina: lo studente mette gli elementi nell'ordine corretto. ⚠ Non ancora disponibile nel test studente.",
  rating: "Valutazione 1–5 stelle (usata nel modulo di feedback di fine corso, non nell'esame).",
};

function newQuestion(type: ExamQuestionType): ExamQuestion {
  const base: ExamQuestion = {
    id: genId(),
    cat: "",
    type,
    lang: "it",
    points: type === "open" ? 3 : 1,
    important: false,
    text: "Nuova domanda",
  };
  if (type === "single" || type === "multi" || type === "image") {
    base.options = ["Opzione 1", "Opzione 2", "Opzione 3"];
    base.correct = [0];
  }
  if (type === "truefalse") {
    base.options = ["Vero", "Falso"];
    base.correct = [0];
  }
  if (type === "fill") base.correct = ["risposta"];
  if (type === "match") base.pairs = [{ l: "A", r: "1" }, { l: "B", r: "2" }];
  if (type === "order") base.items = ["Primo", "Secondo", "Terzo"];
  return base;
}

function sectionQuestions(t: ExamTemplate, sec: Section): ExamQuestion[] {
  if (sec === "esame") return t.finalExam.questions;
  if (sec === "feedback") return t.feedback.questions;
  const di = parseInt(sec.slice(3), 10) || 0;
  return t.miniTests[di]?.questions ?? [];
}

export function ExamLibraryEditor({ templates, previewCourse }: ExamLibraryEditorProps) {
  const esami = useT().esami;
  const t = esami.editor;
  const router = useRouter();
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [translating, startTranslate] = useTransition();
  const [translateMsg, setTranslateMsg] = useState<string | null>(null);
  const runTranslate = () => {
    setTranslateMsg(null);
    startTranslate(async () => {
      const res = await translateExamTemplateAction(fam);
      setTranslateMsg(
        res.ok
          ? `Tradotte ${res.count ?? 0} domande in EN e JA ✓`
          : res.error || "Traduzione non riuscita",
      );
    });
  };

  const [drafts, setDrafts] = useState<Record<ExamFamily, ExamTemplate>>(() => {
    const out = {} as Record<ExamFamily, ExamTemplate>;
    for (const k of Object.keys(templates) as ExamFamily[]) out[k] = cloneTpl(templates[k]);
    return out;
  });
  const [fam, setFam] = useState<ExamFamily>("nihonshu");
  const [section, setSection] = useState<Section>("day0");
  const [active, setActive] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const tpl = drafts[fam];
  const miniDays = tpl.miniTests;
  const ro = !unlocked;

  const selectFam = (f: ExamFamily) => {
    if (section.startsWith("day")) {
      const di = parseInt(section.slice(3), 10) || 0;
      if (di >= drafts[f].miniTests.length) setSection("day0");
    }
    setActive(0);
    setFam(f);
  };
  const selectSection = (s: Section) => {
    setActive(0);
    setSection(s);
  };

  const questions = sectionQuestions(tpl, section);
  const cats: ExamCategory[] | null = section === "esame" ? tpl.finalExam.cats : null;

  // Header label + meta for the active section.
  let headerName = "";
  let headerMeta = "";
  if (section === "feedback") {
    headerName = tpl.feedback.name;
    headerMeta = format(t.headerMetaFeedback, { n: questions.length });
  } else if (section === "esame") {
    headerName = tpl.finalExam.name;
    headerMeta = format(t.headerMetaEsame, {
      c: tpl.finalExam.cats.length,
      n: questions.length,
      est: formatEstimate(estimateSeconds(questions)),
    });
  } else {
    const di = parseInt(section.slice(3), 10) || 0;
    const d = miniDays[di];
    headerName = d?.name ?? "";
    headerMeta = format(t.headerMetaMini, {
      topic: d?.topic ?? "",
      n: questions.length,
      est: formatEstimate(estimateSeconds(questions)),
    });
  }

  // ---- mutations (immutable; mark dirty) ----
  const setQuestions = (qs: ExamQuestion[]) => {
    setDirty(true);
    setSaveErr(null);
    setDrafts((prev) => {
      const cur = prev[fam];
      let nt: ExamTemplate;
      if (section === "esame") {
        nt = { ...cur, finalExam: { ...cur.finalExam, questions: qs, totalQuestions: qs.length } };
      } else if (section === "feedback") {
        nt = { ...cur, feedback: { ...cur.feedback, questions: qs } };
      } else {
        const di = parseInt(section.slice(3), 10) || 0;
        nt = { ...cur, miniTests: cur.miniTests.map((m, i) => (i === di ? { ...m, questions: qs } : m)) };
      }
      return { ...prev, [fam]: nt };
    });
  };

  const addQuestion = (type: ExamQuestionType) => {
    const q = newQuestion(type);
    if (cats && cats.length) q.cat = cats[0].id;
    setQuestions([...questions, q]);
    setActive(questions.length);
  };
  const removeQuestion = (i: number) => {
    setQuestions(questions.filter((_, x) => x !== i));
    setActive((a) => Math.max(0, Math.min(a, questions.length - 2)));
  };
  const duplicateQuestion = (i: number) => {
    const copy: ExamQuestion = { ...questions[i], id: genId() };
    setQuestions([...questions.slice(0, i + 1), copy, ...questions.slice(i + 1)]);
    setActive(i + 1);
  };
  const moveQuestion = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const arr = questions.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setQuestions(arr);
    setActive(j);
  };
  const updateQuestion = (i: number, patch: Partial<ExamQuestion>) => {
    setQuestions(questions.map((q, x) => (x === i ? { ...q, ...patch } : q)));
  };
  const changeType = (i: number, type: ExamQuestionType) => {
    const q: ExamQuestion = { ...questions[i], type };
    if ((type === "single" || type === "multi" || type === "image") && !q.options) {
      q.options = ["Opzione 1", "Opzione 2", "Opzione 3"];
      q.correct = [0];
    }
    if (type === "truefalse") {
      q.options = ["Vero", "Falso"];
      q.correct = (q.correct as number[] | undefined) ?? [0];
    }
    if (type === "fill" && !q.correct) q.correct = ["risposta"];
    if (type === "match" && !q.pairs) q.pairs = [{ l: "A", r: "1" }, { l: "B", r: "2" }];
    if (type === "order" && !q.items) q.items = ["Primo", "Secondo", "Terzo"];
    setQuestions(questions.map((x, xi) => (xi === i ? q : x)));
  };

  const save = () => {
    setSaveErr(null);
    startSave(async () => {
      const res = await saveExamTemplateAction(drafts[fam]);
      if (res.ok) {
        setDirty(false);
        router.refresh();
      } else {
        setSaveErr(res.error ?? t.saveError);
      }
    });
  };

  const activeQ = questions[active] ?? null;

  // Preview links for the current section against a representative course.
  const previewCourseId = previewCourse?.[fam];
  const currentTestKey: ExamTestKey =
    section === "esame"
      ? "final"
      : section === "feedback"
        ? "feedback"
        : (`day${miniDays[parseInt(section.slice(3), 10) || 0]?.day ?? 1}` as ExamTestKey);
  const openPreview = async (mode: ExamLinkMode) => {
    if (!previewCourseId) return;
    setPreviewing(mode);
    const res = await createExamLink({ courseId: previewCourseId, testKey: currentTestKey, mode });
    setPreviewing(null);
    if (res.ok && res.url) window.open(res.url, "_blank", "noopener");
  };

  return (
    <div className="page">
      <Link className="btn btn-sm btn-ghost" href="/esami" style={{ marginBottom: 14 }}>
        <Icon name="arrow-l" size={12} />
        {t.back}
      </Link>

      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-sub">{t.sub}</p>
        </div>
      </div>

      {/* Lock banner */}
      <div
        className="card card-pad"
        style={{
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: unlocked ? "var(--warning-bg)" : "var(--surface-2)",
          border: "1px solid " + (unlocked ? "var(--warning)" : "var(--border)"),
          boxShadow: "none",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: unlocked ? "var(--warning)" : "var(--navy)",
            color: "white",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Icon name={unlocked ? "unlock" : "lock"} size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{unlocked ? t.unlockedTitle : t.lockedTitle}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
            {unlocked ? t.unlockedBody : t.lockedBody}
          </div>
        </div>
        <button className={`btn btn-sm ${unlocked ? "" : "btn-primary"}`} onClick={() => setUnlocked((u) => !u)}>
          <Icon name={unlocked ? "lock" : "unlock"} size={12} />
          {unlocked ? t.lock : t.unlock}
        </button>
      </div>
      <div
        style={{
          marginTop: -8,
          marginBottom: 18,
          paddingLeft: 4,
          fontSize: 11,
          color: "var(--text-4)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon name="info" size={11} />
        {t.roleNote}
      </div>

      {/* Macro family */}
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={fam === "nihonshu" ? "on" : ""} onClick={() => selectFam("nihonshu")}>
          {esami.famNihonshu}
        </button>
        <button className={fam === "shochu" ? "on" : ""} onClick={() => selectFam("shochu")}>
          {esami.famShochu}
        </button>
      </div>

      {/* Sub-section tabs */}
      <div className="tabs" style={{ marginBottom: 18, overflowX: "auto", flexWrap: "nowrap" }}>
        {miniDays.map((d, i) => (
          <button
            key={d.day}
            className={`tab ${section === "day" + i ? "active" : ""}`}
            onClick={() => selectSection(("day" + i) as Section)}
            style={{ whiteSpace: "nowrap" }}
          >
            {format(t.testDay, { n: d.day })}
          </button>
        ))}
        <button
          className={`tab ${section === "feedback" ? "active" : ""}`}
          onClick={() => selectSection("feedback")}
          style={{ whiteSpace: "nowrap" }}
        >
          {t.feedback}
        </button>
        <button
          className={`tab ${section === "esame" ? "active" : ""}`}
          onClick={() => selectSection("esame")}
          style={{ whiteSpace: "nowrap" }}
        >
          {t.esame}
        </button>
      </div>

      {/* Header + save */}
      <div
        className="card card-pad"
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{headerName}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{headerMeta}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Preview links for the current section (open the real student/QA page). */}
          {previewCourseId ? (
            <span style={{ display: "inline-flex", gap: 6 }}>
              <button className="btn btn-sm" onClick={() => openPreview("test")} disabled={previewing !== null} title={t.previewHint}>
                <Icon name="monitor" size={12} />
                {previewing === "test" ? "…" : t.preview}
              </button>
              <button className="btn btn-sm" onClick={() => openPreview("validate")} disabled={previewing !== null} title={t.validateHint}>
                <Icon name="check" size={12} />
                {previewing === "validate" ? "…" : t.validate}
              </button>
            </span>
          ) : (
            <span className="text-3" style={{ fontSize: 11 }}>{t.noPreviewCourse}</span>
          )}
          {unlocked && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button
                className="btn btn-sm"
                onClick={runTranslate}
                disabled={translating}
                title="Traduci tutte le domande in inglese e giapponese (una volta, con AI). Le traduzioni vengono salvate."
              >
                <Icon name="globe" size={12} />
                {translating ? "Traduco…" : "Traduci (AI)"}
              </button>
              {translateMsg && (
                <span style={{ fontSize: 11, color: translateMsg.includes("✓") ? "var(--success-fg)" : "var(--danger-fg)" }}>
                  {translateMsg}
                </span>
              )}
            </span>
          )}
          {unlocked ? (
            <>
              <span style={{ fontSize: 12, color: saveErr ? "var(--danger-fg)" : dirty ? "var(--warning-fg)" : "var(--success-fg)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name={saveErr ? "warn" : dirty ? "edit" : "check"} size={12} />
                {saveErr ? saveErr : saving ? t.saving : dirty ? t.unsaved : t.saved}
              </span>
              <button className="btn btn-sm btn-primary" onClick={save} disabled={saving || !dirty}>
                <Icon name="save" size={12} />
                {t.save}
              </button>
            </>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
              <Icon name="lock" size={12} />
              {t.readOnly}
            </span>
          )}
        </div>
      </div>

      {/* Editor: list + detail */}
      <div className="card" style={{ overflow: "hidden", display: "grid", gridTemplateColumns: "320px 1fr", minHeight: 560 }}>
        {/* LEFT */}
        <div style={{ background: "var(--surface-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflow: "auto", maxHeight: 640 }}>
            {questions.length === 0 ? (
              <div className="text-3" style={{ padding: 18, fontSize: 12.5 }}>{t.emptySection}</div>
            ) : (
              questions.map((qq, qi) => {
                const sel = qi === active;
                return (
                  <div
                    key={qq.id}
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      borderBottom: "1px solid var(--border-2)",
                      background: sel ? "var(--surface)" : "transparent",
                      borderLeft: sel ? "3px solid var(--indigo)" : "3px solid transparent",
                    }}
                  >
                    <button
                      onClick={() => setActive(qi)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "10px 8px 10px 12px",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)", minWidth: 20, paddingTop: 1 }}>
                        {(qi + 1).toString().padStart(2, "0")}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text)",
                            lineHeight: 1.35,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {qq.text || "—"}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                          <Badge tone="neutral">{esami.qt[qq.type]}</Badge>
                          {qq.important && <Badge tone="oro">★</Badge>}
                        </div>
                      </div>
                    </button>
                    {!ro && (
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6px", gap: 2 }}>
                        <button className="reorder-btn" title={t.moveUp} disabled={qi === 0} onClick={() => moveQuestion(qi, -1)}>
                          <Icon name="arrow-up" size={12} />
                        </button>
                        <button className="reorder-btn" title={t.moveDown} disabled={qi === questions.length - 1} onClick={() => moveQuestion(qi, 1)}>
                          <Icon name="arrow-dn" size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {!ro && <AddQuestionRow onAdd={addQuestion} />}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ padding: 24, overflow: "auto", maxHeight: 700 }}>
          {activeQ ? (
            <QuestionDetail
              q={activeQ}
              readOnly={ro}
              cats={cats}
              onChange={(patch) => updateQuestion(active, patch)}
              onChangeType={(type) => changeType(active, type)}
              onDuplicate={() => duplicateQuestion(active)}
              onDelete={() => removeQuestion(active)}
            />
          ) : (
            <div className="text-3" style={{ padding: 20 }}>{t.selectQuestion}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddQuestionRow({ onAdd }: { onAdd: (type: ExamQuestionType) => void }) {
  const t = useT().esami.editor;
  const qt = useT().esami.qt;
  const [type, setType] = useState<ExamQuestionType>("single");
  return (
    <div style={{ display: "flex", gap: 6, padding: "10px 12px", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
      <select
        className="select"
        value={type}
        onChange={(e) => setType(e.target.value as ExamQuestionType)}
        style={{ height: 30, fontSize: 11.5, flex: 1 }}
      >
        {Object.entries(qt).map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </select>
      <button className="btn btn-sm btn-primary" onClick={() => onAdd(type)}>
        <Icon name="plus" size={11} />
        {t.addQuestionShort}
      </button>
    </div>
  );
}

function QuestionDetail({
  q,
  readOnly,
  cats,
  onChange,
  onChangeType,
  onDuplicate,
  onDelete,
}: {
  q: ExamQuestion;
  readOnly: boolean;
  cats: ExamCategory[] | null;
  onChange: (patch: Partial<ExamQuestion>) => void;
  onChangeType: (type: ExamQuestionType) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT().esami.qEditor;
  const te = useT().esami.editor;
  const qt = useT().esami.qt;
  const ro = readOnly;
  const est = QUESTION_EST_SEC[q.type] || 10;
  const correctNums = ((q.correct ?? []) as Array<number | string>).filter(
    (c): c is number => typeof c === "number",
  );
  const correctSet = new Set(correctNums);

  const setOption = (i: number, val: string) => {
    const options = (q.options ?? []).map((o, x) => (x === i ? val : o));
    onChange({ options });
  };
  const addOption = () => onChange({ options: [...(q.options ?? []), "Nuova opzione"] });
  const removeOption = (i: number) => {
    const options = (q.options ?? []).filter((_, x) => x !== i);
    const correct = correctNums.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c));
    onChange({ options, correct });
  };
  const toggleCorrect = (i: number) => {
    if (q.type === "multi") {
      const next = correctSet.has(i) ? correctNums.filter((c) => c !== i) : [...correctNums, i];
      onChange({ correct: next.sort((a, b) => a - b) });
    } else {
      onChange({ correct: [i] });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {ro ? (
            <Badge tone="indigo">{qt[q.type]}</Badge>
          ) : (
            <select
              className="select"
              value={q.type}
              onChange={(e) => onChangeType(e.target.value as ExamQuestionType)}
              style={{ height: 30, width: "auto", fontSize: 12.5, fontWeight: 600 }}
            >
              {Object.entries(qt).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          )}
          <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="clock" size={11} />
            {format(t.stima, { s: est })}
          </span>
          {q.important && <Badge tone="oro">{t.importante}</Badge>}
        </div>
        {!ro && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-sm" title={te.duplicateQuestion} onClick={onDuplicate}>
              <Icon name="copy" size={12} />
            </button>
            <button className="btn btn-sm btn-ghost" title={te.deleteQuestion} onClick={onDelete}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        )}
      </div>

      {/* How this question type works (for the operator building the exam). */}
      {TYPE_TIPS[q.type] && (
        <div
          style={{
            display: "flex",
            gap: 7,
            alignItems: "flex-start",
            fontSize: 12,
            color: "var(--text-3)",
            background: "var(--indigo-50)",
            border: "1px solid var(--indigo-100)",
            borderRadius: 7,
            padding: "8px 10px",
            marginBottom: 14,
            lineHeight: 1.45,
          }}
        >
          <Icon name="info" size={13} className="text-2" style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{TYPE_TIPS[q.type]}</span>
        </div>
      )}

      <div className="field">
        <div className="field-label">{t.qText}</div>
        <textarea
          className="textarea"
          value={q.text}
          rows={3}
          readOnly={ro}
          onChange={(e) => onChange({ text: e.target.value })}
          style={ro ? { background: "var(--surface-2)", color: "var(--text-2)", cursor: "default" } : undefined}
        />
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
        {["it", "en", "ja"].map((l) => (
          <button
            key={l}
            className={`pill ${q.lang === l ? "on" : ""}`}
            disabled={ro}
            onClick={() => !ro && onChange({ lang: l })}
            style={ro && q.lang !== l ? { opacity: 0.5 } : undefined}
          >
            {l.toUpperCase()}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{t.translations}</span>
      </div>

      <div className="divider" style={{ margin: "20px 0" }} />

      <div className="field">
        <div className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            {q.type === "open" ? t.labelOpen : q.type === "match" ? t.labelMatch : q.type === "order" ? t.labelOrder : t.labelOptions}
          </span>
          {!ro && (q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
            <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 400 }}>{te.markCorrectHint}</span>
          )}
        </div>

        {(q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.type === "image" && (
              <div style={{ marginBottom: 8 }}>
                {!ro && (
                  <input
                    className="input"
                    placeholder="URL immagine (es. https://…/etichetta.jpg)"
                    value={q.imageId ?? ""}
                    onChange={(e) => onChange({ imageId: e.target.value })}
                    style={{ marginBottom: 8 }}
                  />
                )}
                {q.imageId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.imageId}
                    alt=""
                    style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, objectFit: "contain", border: "1px solid var(--border)" }}
                  />
                ) : (
                  <div className="ph-img" style={{ height: 120 }}>{t.imgPlaceholder}</div>
                )}
              </div>
            )}
            {(q.options ?? []).map((opt, i) => {
              const isC = correctSet.has(i);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    background: isC ? "var(--success-bg)" : "var(--surface)",
                  }}
                >
                  <button
                    type="button"
                    disabled={ro}
                    onClick={() => !ro && toggleCorrect(i)}
                    title="Segna corretta"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: q.type === "multi" ? 3 : "50%",
                      border: "1.5px solid " + (isC ? "var(--success)" : "var(--border-strong)"),
                      display: "grid",
                      placeItems: "center",
                      background: isC ? "var(--success)" : "transparent",
                      color: "white",
                      flexShrink: 0,
                      cursor: ro ? "default" : "pointer",
                      padding: 0,
                    }}
                  >
                    {isC && <Icon name="check" size={10} />}
                  </button>
                  <input
                    className="input"
                    value={opt}
                    readOnly={ro}
                    onChange={(e) => setOption(i, e.target.value)}
                    style={{ flex: 1, border: "none", height: "auto", padding: 0, background: "transparent", cursor: ro ? "default" : undefined }}
                  />
                  {!ro && q.type !== "truefalse" && (
                    <button className="btn btn-icon btn-sm btn-ghost" onClick={() => removeOption(i)}>
                      <Icon name="trash" size={11} />
                    </button>
                  )}
                </div>
              );
            })}
            {!ro && q.type !== "truefalse" && (
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={addOption}>
                <Icon name="plus" size={11} />
                {t.addOption}
              </button>
            )}
          </div>
        )}

        {q.type === "open" && (
          <div className="card card-pad" style={{ background: "var(--indigo-50)", border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Icon name="sparkle" size={14} className="text-3" />
              <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                {format(t.aiNotePre, { points: q.points })}
                <strong>{t.aiNoteStrong}</strong>
                {t.aiNotePost}
              </div>
            </div>
          </div>
        )}

        {q.type === "fill" && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>{t.fillHint}</div>
            <input
              className="input"
              value={((q.correct ?? []) as Array<number | string>).join(", ")}
              readOnly={ro}
              onChange={(e) => onChange({ correct: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}
            />
          </div>
        )}

        {q.type === "match" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.pairs ?? []).map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: ro ? "1fr 24px 1fr" : "1fr 24px 1fr 28px", gap: 8, alignItems: "center" }}>
                <input
                  className="input"
                  value={p.l}
                  readOnly={ro}
                  onChange={(e) => onChange({ pairs: (q.pairs ?? []).map((x, xi) => (xi === i ? { ...x, l: e.target.value } : x)) })}
                />
                <div style={{ textAlign: "center", color: "var(--text-4)" }}>↔</div>
                <input
                  className="input"
                  value={p.r}
                  readOnly={ro}
                  onChange={(e) => onChange({ pairs: (q.pairs ?? []).map((x, xi) => (xi === i ? { ...x, r: e.target.value } : x)) })}
                />
                {!ro && (
                  <button className="btn btn-icon btn-sm btn-ghost" onClick={() => onChange({ pairs: (q.pairs ?? []).filter((_, xi) => xi !== i) })}>
                    <Icon name="trash" size={11} />
                  </button>
                )}
              </div>
            ))}
            {!ro && (
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => onChange({ pairs: [...(q.pairs ?? []), { l: "", r: "" }] })}>
                <Icon name="plus" size={11} />
                {t.addOption}
              </button>
            )}
          </div>
        )}

        {q.type === "order" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.items ?? []).map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", minWidth: 22 }}>{i + 1}</span>
                <input
                  className="input"
                  value={it}
                  readOnly={ro}
                  onChange={(e) => onChange({ items: (q.items ?? []).map((x, xi) => (xi === i ? e.target.value : x)) })}
                  style={{ flex: 1, border: "none", height: "auto", padding: 0, background: "transparent", cursor: ro ? "default" : undefined }}
                />
                {!ro && (
                  <button className="btn btn-icon btn-sm btn-ghost" onClick={() => onChange({ items: (q.items ?? []).filter((_, xi) => xi !== i) })}>
                    <Icon name="trash" size={11} />
                  </button>
                )}
              </div>
            ))}
            {!ro && (
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => onChange({ items: [...(q.items ?? []), ""] })}>
                <Icon name="plus" size={11} />
                {t.addOption}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="divider" style={{ margin: "20px 0" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="field">
          <div className="field-label">{t.categoria}</div>
          {cats && cats.length ? (
            <select
              className="select"
              value={q.cat}
              disabled={ro}
              onChange={(e) => onChange({ cat: e.target.value })}
            >
              {!cats.some((c) => c.id === q.cat) && <option value={q.cat}>{q.cat || "—"}</option>}
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              value={q.cat}
              readOnly={ro}
              onChange={(e) => onChange({ cat: e.target.value })}
              style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}
            />
          )}
        </div>
        <div className="field">
          <div className="field-label">{t.puntiField}</div>
          <input
            className="input"
            type="number"
            value={q.points}
            readOnly={ro}
            onChange={(e) => onChange({ points: Math.max(0, Number(e.target.value) || 0) })}
            style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}
          />
        </div>
        <div className="field">
          <div className="field-label">{t.importanteField}</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
            <input
              type="checkbox"
              checked={!!q.important}
              disabled={ro}
              onChange={(e) => onChange({ important: e.target.checked })}
            />
            {t.importanteCheck}
          </label>
        </div>
      </div>
    </div>
  );
}
