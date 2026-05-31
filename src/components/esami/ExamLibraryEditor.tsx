"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, Badge } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { ExamCategory, ExamFamily, ExamQuestion, ExamQuestionType, ExamTemplate } from "@/lib/domain";
import { QUESTION_EST_SEC, estimateSeconds, formatEstimate } from "@/lib/esami";

type Section = string; // "day0".."dayN" | "feedback" | "esame"

interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  questions: ExamQuestion[];
}

export interface ExamLibraryEditorProps {
  templates: Record<ExamFamily, ExamTemplate>;
}

export function ExamLibraryEditor({ templates }: ExamLibraryEditorProps) {
  const esami = useT().esami;
  const t = esami.editor;
  const [fam, setFam] = useState<ExamFamily>("nihonshu");
  const [section, setSection] = useState<Section>("day0");
  const [unlocked, setUnlocked] = useState(false);

  const tpl = templates[fam];
  const miniDays = tpl.miniTests;

  const selectFam = (f: ExamFamily) => {
    if (section.startsWith("day")) {
      const di = parseInt(section.slice(3), 10) || 0;
      if (di >= templates[f].miniTests.length) setSection("day0");
    }
    setFam(f);
  };

  let mode: "questions" | "feedback" = "questions";
  let questions: ExamQuestion[] = [];
  let headerName = "";
  let headerMeta = "";
  if (section === "feedback") {
    mode = "feedback";
    questions = tpl.feedback.questions;
    headerName = tpl.feedback.name;
    headerMeta = format(t.headerMetaFeedback, { n: questions.length });
  } else if (section === "esame") {
    questions = tpl.finalExam.questions;
    headerName = tpl.finalExam.name;
    headerMeta = format(t.headerMetaEsame, {
      c: tpl.finalExam.cats.length,
      n: questions.length,
      est: formatEstimate(estimateSeconds(questions)),
    });
  } else {
    const di = parseInt(section.slice(3), 10) || 0;
    const d = miniDays[di];
    questions = d?.questions ?? [];
    headerName = d?.name ?? "";
    headerMeta = format(t.headerMetaMini, {
      topic: d?.topic ?? "",
      n: questions.length,
      est: formatEstimate(estimateSeconds(questions)),
    });
  }

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
            onClick={() => setSection("day" + i)}
            style={{ whiteSpace: "nowrap" }}
          >
            {format(t.testDay, { n: d.day })}
          </button>
        ))}
        <button
          className={`tab ${section === "feedback" ? "active" : ""}`}
          onClick={() => setSection("feedback")}
          style={{ whiteSpace: "nowrap" }}
        >
          {t.feedback}
        </button>
        <button
          className={`tab ${section === "esame" ? "active" : ""}`}
          onClick={() => setSection("esame")}
          style={{ whiteSpace: "nowrap" }}
        >
          {t.esame}
        </button>
      </div>

      {/* Header */}
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
        <div style={{ display: "flex", gap: 6 }}>
          {unlocked ? (
            <>
              <button className="btn btn-sm">
                <Icon name="copy" size={12} />
                {t.duplicate}
              </button>
              <button className="btn btn-sm btn-primary">
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

      {mode === "feedback" ? (
        <FeedbackEditor questions={questions} readOnly={!unlocked} />
      ) : (
        <QuestionBankEditor
          key={fam + "/" + section}
          questions={questions}
          cats={section === "esame" ? tpl.finalExam.cats : null}
          readOnly={!unlocked}
        />
      )}
    </div>
  );
}

function newQuestion(type: ExamQuestionType): ExamQuestion {
  const id = "q-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const base: ExamQuestion = {
    id,
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

function QuestionBankEditor({
  questions,
  cats,
  readOnly,
}: {
  questions: ExamQuestion[];
  cats: ExamCategory[] | null;
  readOnly: boolean;
}) {
  const t = useT().esami.editor;
  const qt = useT().esami.qt;
  const ro = readOnly;

  const buildChapters = (): Chapter[] => {
    if (cats && cats.length && questions[0]?.cat) {
      const known = new Set(cats.map((c) => c.id));
      const chs: Chapter[] = cats
        .map((c) => ({
          id: "ch-" + c.id,
          title: c.label,
          subtitle: "",
          questions: questions.filter((q) => q.cat === c.id).map((q) => ({ ...q })),
        }))
        .filter((ch) => ch.questions.length);
      const orphan = questions.filter((q) => !known.has(q.cat));
      if (orphan.length)
        chs.push({ id: "ch-altre", title: t.otherQuestions, subtitle: "", questions: orphan.map((q) => ({ ...q })) });
      return chs.length ? chs : [{ id: "ch1", title: "Capitolo 1", subtitle: "", questions: [] }];
    }
    return [{ id: "ch1", title: "Domande", subtitle: "", questions: questions.map((q) => ({ ...q })) }];
  };

  const [chapters, setChapters] = useState<Chapter[]>(buildChapters);
  const [active, setActive] = useState<{ ci: number; qi: number }>({ ci: 0, qi: 0 });

  const activeQ = chapters[active.ci]?.questions[active.qi] ?? null;
  const totalQ = chapters.reduce((s, c) => s + c.questions.length, 0);

  const mutate = (fn: (chs: Chapter[]) => Chapter[]) =>
    setChapters((prev) => fn(prev.map((c) => ({ ...c, questions: c.questions.slice() }))));

  const addChapter = () =>
    setChapters((prev) => [
      ...prev,
      { id: "ch-" + Date.now().toString(36), title: "Nuovo capitolo", subtitle: "", questions: [] },
    ]);
  const setChapterField = (ci: number, field: "title" | "subtitle", val: string) =>
    mutate((chs) => {
      chs[ci] = { ...chs[ci], [field]: val };
      return chs;
    });
  const removeChapter = (ci: number) => {
    mutate((chs) => {
      chs.splice(ci, 1);
      return chs;
    });
    setActive({ ci: 0, qi: 0 });
  };
  const addQuestion = (ci: number, type: ExamQuestionType) => {
    mutate((chs) => {
      chs[ci].questions.push(newQuestion(type));
      return chs;
    });
    setActive({ ci, qi: chapters[ci].questions.length });
  };
  const moveQuestion = (ci: number, qi: number, dir: number) => {
    const tgt = qi + dir;
    if (tgt < 0 || tgt >= chapters[ci].questions.length) return;
    mutate((chs) => {
      const a = chs[ci].questions;
      [a[qi], a[tgt]] = [a[tgt], a[qi]];
      return chs;
    });
    setActive((act) => (act.ci === ci && act.qi === qi ? { ci, qi: tgt } : act));
  };
  const changeType = (ci: number, qi: number, type: ExamQuestionType) => {
    mutate((chs) => {
      const q: ExamQuestion = { ...chs[ci].questions[qi], type };
      if ((type === "single" || type === "multi" || type === "image") && !q.options) {
        q.options = ["Opzione 1", "Opzione 2", "Opzione 3"];
        q.correct = [0];
      }
      if (type === "truefalse") {
        q.options = ["Vero", "Falso"];
        q.correct = q.correct ?? [0];
      }
      chs[ci].questions[qi] = q;
      return chs;
    });
  };

  return (
    <div className="card" style={{ overflow: "hidden", display: "grid", gridTemplateColumns: "320px 1fr", minHeight: 560 }}>
      {/* LEFT: chapters + questions */}
      <div style={{ background: "var(--surface-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", maxHeight: 620 }}>
          {chapters.map((ch, ci) => (
            <div key={ch.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ padding: "12px 14px 10px", background: "var(--surface)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="eyebrow" style={{ flex: 1 }}>
                    {format(t.chapter, { n: ci + 1 })}
                  </span>
                  {!ro && chapters.length > 1 && (
                    <button
                      className="btn btn-icon btn-sm btn-ghost"
                      title={t.removeChapter}
                      onClick={() => removeChapter(ci)}
                    >
                      <Icon name="trash" size={11} />
                    </button>
                  )}
                </div>
                {ro ? (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{ch.title}</div>
                    {ch.subtitle && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1 }}>{ch.subtitle}</div>}
                  </>
                ) : (
                  <>
                    <input
                      className="input"
                      value={ch.title}
                      onChange={(e) => setChapterField(ci, "title", e.target.value)}
                      placeholder={t.chapterTitlePlaceholder}
                      style={{ height: 28, fontSize: 13.5, fontWeight: 600, marginTop: 2, padding: "0 6px" }}
                    />
                    <input
                      className="input"
                      value={ch.subtitle}
                      onChange={(e) => setChapterField(ci, "subtitle", e.target.value)}
                      placeholder={t.chapterSubPlaceholder}
                      style={{ height: 26, fontSize: 11.5, marginTop: 4, padding: "0 6px", color: "var(--text-2)" }}
                    />
                  </>
                )}
              </div>
              {ch.questions.map((qq, qi) => {
                const sel = active.ci === ci && active.qi === qi;
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
                      onClick={() => setActive({ ci, qi })}
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
                          {qq.text}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                          <Badge tone="neutral">{qt[qq.type]}</Badge>
                          <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>
                            {format(t.points, { n: qq.points || 1, s: QUESTION_EST_SEC[qq.type] || 10 })}
                          </span>
                        </div>
                      </div>
                    </button>
                    {!ro && (
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6px", gap: 2 }}>
                        <button className="reorder-btn" title={t.moveUp} disabled={qi === 0} onClick={() => moveQuestion(ci, qi, -1)}>
                          <Icon name="arrow-up" size={12} />
                        </button>
                        <button
                          className="reorder-btn"
                          title={t.moveDown}
                          disabled={qi === ch.questions.length - 1}
                          onClick={() => moveQuestion(ci, qi, 1)}
                        >
                          <Icon name="arrow-dn" size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!ro && <AddQuestionRow onAdd={(type) => addQuestion(ci, type)} />}
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          {!ro ? (
            <button className="btn btn-sm" style={{ width: "100%" }} onClick={addChapter}>
              <Icon name="plus" size={12} />
              {t.addChapter}
            </button>
          ) : (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-4)",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Icon name="lock" size={11} />
              {format(t.chaptersSummary, { c: chapters.length, n: totalQ })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: detail */}
      <div style={{ padding: 24, overflow: "auto", maxHeight: 620 }}>
        {activeQ ? (
          <QuestionEditor
            key={activeQ.id}
            q={activeQ}
            readOnly={ro}
            onChangeType={(type) => changeType(active.ci, active.qi, type)}
          />
        ) : (
          <div className="text-3" style={{ padding: 20 }}>
            {t.selectQuestion}
          </div>
        )}
      </div>
    </div>
  );
}

function AddQuestionRow({ onAdd }: { onAdd: (type: ExamQuestionType) => void }) {
  const t = useT().esami.editor;
  const qt = useT().esami.qt;
  const [type, setType] = useState<ExamQuestionType>("single");
  return (
    <div style={{ display: "flex", gap: 6, padding: "8px 12px", background: "var(--surface-2)" }}>
      <select
        className="select"
        value={type}
        onChange={(e) => setType(e.target.value as ExamQuestionType)}
        style={{ height: 28, fontSize: 11.5, flex: 1 }}
      >
        {Object.entries(qt).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <button className="btn btn-sm" onClick={() => onAdd(type)}>
        <Icon name="plus" size={11} />
        {t.addQuestion}
      </button>
    </div>
  );
}

function FeedbackEditor({ questions, readOnly }: { questions: ExamQuestion[]; readOnly: boolean }) {
  const t = useT().esami.editor;
  const qt = useT().esami.qt;
  const ro = readOnly;
  return (
    <div className="card card-pad-lg">
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        {t.feedbackTitle}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
        {t.feedbackSub}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.map((f, i) => (
          <div
            key={f.id}
            style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 6 }}
          >
            <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", minWidth: 22 }}>
              {(i + 1).toString().padStart(2, "0")}
            </span>
            <input
              className="input"
              defaultValue={f.text}
              readOnly={ro}
              style={{
                flex: 1,
                border: "1px solid transparent",
                background: "transparent",
                height: 30,
                cursor: ro ? "default" : undefined,
                color: ro ? "var(--text-2)" : undefined,
              }}
              onFocus={
                ro
                  ? undefined
                  : (e) => {
                      e.currentTarget.style.setProperty("border", "1px solid var(--border)");
                      e.currentTarget.style.setProperty("background", "var(--surface)");
                    }
              }
              onBlur={
                ro
                  ? undefined
                  : (e) => {
                      e.currentTarget.style.setProperty("border", "1px solid transparent");
                      e.currentTarget.style.setProperty("background", "transparent");
                    }
              }
            />
            <Badge tone="neutral">{qt[f.type]}</Badge>
            {!ro && (
              <button className="btn btn-icon btn-sm btn-ghost">
                <Icon name="trash" size={11} />
              </button>
            )}
          </div>
        ))}
        {!ro && (
          <button className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <Icon name="plus" size={11} />
            {t.addQuestionFull}
          </button>
        )}
      </div>
    </div>
  );
}

function QuestionEditor({
  q,
  readOnly,
  onChangeType,
}: {
  q: ExamQuestion;
  readOnly: boolean;
  onChangeType: (type: ExamQuestionType) => void;
}) {
  const t = useT().esami.qEditor;
  const qt = useT().esami.qt;
  const ro = readOnly;
  const est = QUESTION_EST_SEC[q.type] || 10;
  const correctSet = new Set((q.correct ?? []).map((c) => c));
  const optionCorrect = (i: number) => correctSet.has(i);

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
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          )}
          <span className="text-3" style={{ fontSize: 12 }}>
            {format(t.punti, { n: q.points })}
          </span>
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--text-4)", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <Icon name="clock" size={11} />
            {format(t.stima, { s: est })}
          </span>
          {q.important && <Badge tone="oro">{t.importante}</Badge>}
        </div>
        {ro ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--success-fg)", fontWeight: 500 }}>
            <Icon name="check" size={12} />
            {t.correctHighlighted}
          </span>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-sm">{t.duplicate}</button>
            <button className="btn btn-sm btn-ghost">
              <Icon name="trash" size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="field">
        <div className="field-label">{t.qText}</div>
        <textarea
          className="textarea"
          defaultValue={q.text}
          rows={3}
          readOnly={ro}
          style={ro ? { background: "var(--surface-2)", color: "var(--text-2)", cursor: "default" } : undefined}
        />
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
        {["it", "en", "ja"].map((l) => (
          <button key={l} className={`pill ${q.lang === l ? "on" : ""}`} disabled={ro} style={ro && q.lang !== l ? { opacity: 0.5 } : undefined}>
            {l.toUpperCase()}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{t.translations}</span>
      </div>

      <div className="divider" style={{ margin: "20px 0" }} />

      <div className="field">
        <div className="field-label">
          {q.type === "open" ? t.labelOpen : q.type === "match" ? t.labelMatch : q.type === "order" ? t.labelOrder : t.labelOptions}
        </div>

        {(q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.type === "image" && (
              <div className="ph-img" style={{ height: 140, marginBottom: 8 }}>
                {t.imgPlaceholder}
              </div>
            )}
            {(q.options ?? []).map((opt, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: optionCorrect(i) ? "var(--success-bg)" : "var(--surface)",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: q.type === "multi" ? 3 : "50%",
                    border: "1.5px solid " + (optionCorrect(i) ? "var(--success)" : "var(--border-strong)"),
                    display: "grid",
                    placeItems: "center",
                    background: optionCorrect(i) ? "var(--success)" : "transparent",
                    color: "white",
                    flexShrink: 0,
                  }}
                >
                  {optionCorrect(i) && <Icon name="check" size={10} />}
                </div>
                <input
                  className="input"
                  defaultValue={opt}
                  readOnly={ro}
                  style={{ flex: 1, border: "none", height: "auto", padding: 0, background: "transparent", cursor: ro ? "default" : undefined }}
                />
                {!ro && (
                  <button className="btn btn-icon btn-sm btn-ghost">
                    <Icon name="trash" size={11} />
                  </button>
                )}
              </div>
            ))}
            {!ro && (
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }}>
                <Icon name="plus" size={11} />
                {t.addOption}
              </button>
            )}
          </div>
        )}

        {q.type === "open" && (
          <div>
            <textarea
              className="textarea"
              rows={4}
              placeholder={t.openModelPlaceholder}
              readOnly={ro}
              style={ro ? { background: "var(--surface-2)", color: "var(--text-2)", cursor: "default" } : undefined}
            />
            <div className="card card-pad" style={{ marginTop: 12, background: "var(--indigo-50)", border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Icon name="sparkle" size={14} className="text-3" />
                <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                  {format(t.aiNotePre, { points: q.points })}
                  <strong>{t.aiNoteStrong}</strong>
                  {t.aiNotePost}
                </div>
              </div>
            </div>
          </div>
        )}

        {q.type === "fill" && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>{t.fillHint}</div>
            <input
              className="input"
              defaultValue={(q.correct ?? []).join(", ")}
              readOnly={ro}
              style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}
            />
          </div>
        )}

        {q.type === "match" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.pairs ?? []).map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: ro ? "1fr 24px 1fr" : "1fr 24px 1fr 28px", gap: 8, alignItems: "center" }}>
                <input className="input" defaultValue={p.l} readOnly={ro} style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined} />
                <div style={{ textAlign: "center", color: "var(--text-4)" }}>↔</div>
                <input className="input" defaultValue={p.r} readOnly={ro} style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined} />
                {!ro && (
                  <button className="btn btn-icon btn-sm btn-ghost">
                    <Icon name="trash" size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {q.type === "order" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.items ?? []).map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", minWidth: 22 }}>
                  {i + 1}
                </span>
                <input
                  className="input"
                  defaultValue={it}
                  readOnly={ro}
                  style={{ flex: 1, border: "none", height: "auto", padding: 0, background: "transparent", cursor: ro ? "default" : undefined }}
                />
                {!ro && <Icon name="more" size={13} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="divider" style={{ margin: "20px 0" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="field">
          <div className="field-label">{t.categoria}</div>
          <select className="select" defaultValue={q.cat} disabled={ro}>
            <option>{q.cat}</option>
          </select>
        </div>
        <div className="field">
          <div className="field-label">{t.puntiField}</div>
          <input
            className="input"
            type="number"
            defaultValue={q.points}
            readOnly={ro}
            style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}
          />
        </div>
        <div className="field">
          <div className="field-label">{t.importanteField}</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
            <input type="checkbox" defaultChecked={q.important} disabled={ro} />
            {t.importanteCheck}
          </label>
        </div>
      </div>
    </div>
  );
}

