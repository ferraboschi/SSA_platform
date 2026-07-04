"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon, Badge } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type {
  ExamFamily,
  ExamQuestion,
  ExamQuestionType,
  ExamTemplate,
} from "@/lib/domain";
import { estimateSeconds, formatEstimate } from "@/lib/esami";
import { saveExamTemplateAction } from "@/lib/esami/actions";
import { listExamCategoriesAction, addExamCategoryAction } from "@/lib/esami/categories-actions";
import { createExamLink } from "@/lib/exam-links/actions";
import type { ExamTestKey, ExamLinkMode } from "@/lib/exam-links/token";
import { translateExamTemplateAction } from "@/lib/esami/ai-actions";
import { ExamEmailTemplatesEditor } from "@/components/esami/ExamEmailTemplatesEditor";
import { QuestionDetail, AddQuestionRow } from "@/components/esami/QuestionDetail";
import type { ExamEmailTemplates, UpcomingCourseLine } from "@/lib/esami/exam-email";

type Section = "esame" | "feedback" | "mail" | `day${number}`;

export interface ExamLibraryEditorProps {
  templates: Record<ExamFamily, ExamTemplate>;
  /** Representative course id per family, to mint preview links. */
  previewCourse?: Partial<Record<ExamFamily, string>>;
  /** "Mail Template" section, right after "Esame" — Bocciato/Rimandato/
   *  Promosso outcome emails (not per-family: one shared set for the org). */
  emailTemplates: ExamEmailTemplates;
  testTo: string;
  upcomingCourses: UpcomingCourseLine[];
}

const cloneTpl = (t: ExamTemplate): ExamTemplate =>
  JSON.parse(JSON.stringify(t)) as ExamTemplate;

const genId = () =>
  "q-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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

export function ExamLibraryEditor({
  templates,
  previewCourse,
  emailTemplates,
  testTo,
  upcomingCourses,
}: ExamLibraryEditorProps) {
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
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  // Reusable category list per family (owner: pick-or-type combobox, no more
  // free-text duplicates). Fetched once — both families, so switching the
  // macro-family tab never needs a refetch.
  const [categories, setCategories] = useState<Record<ExamFamily, string[]>>({
    nihonshu: [],
    shochu: [],
  });
  useEffect(() => {
    let alive = true;
    Promise.all([listExamCategoriesAction("nihonshu"), listExamCategoriesAction("shochu")]).then(
      ([nihonshu, shochu]) => {
        if (alive) setCategories({ nihonshu, shochu });
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  const commitCategory = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    setCategories((prev) => {
      const cur = prev[fam] ?? [];
      if (cur.some((c) => c.toLowerCase() === clean.toLowerCase())) return prev;
      return { ...prev, [fam]: [...cur, clean].sort((a, b) => a.localeCompare(b)) };
    });
    addExamCategoryAction(fam, clean).catch(() => {});
  };

  const tpl = drafts[fam];
  const miniDays = tpl.miniTests;

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
  // Categories are selectable everywhere EXCEPT feedback (owner: day1/day2/
  // day3/esame need them; feedback questions don't).
  const cats: string[] | null = section === "feedback" ? null : categories[fam];

  // Header label + meta for the active section.
  let headerName = "";
  let headerMeta = "";
  if (section === "feedback") {
    headerName = tpl.feedback.name;
    headerMeta = format(t.headerMetaFeedback, { n: questions.length });
  } else if (section === "esame") {
    headerName = tpl.finalExam.name;
    headerMeta = format(t.headerMetaEsame, {
      c: categories[fam]?.length || tpl.finalExam.cats.length,
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
    if (cats && cats.length) q.cat = cats[0];
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
    // Normalize on type change: the answer key (`correct`) and the type-specific
    // fields of the OLD type are meaningless (and mis-grade) under the new type,
    // so start each type from a clean shape instead of letting stale data survive.
    const prev = questions[i];
    const q: ExamQuestion = {
      id: prev.id,
      cat: prev.cat,
      type,
      lang: prev.lang,
      points: prev.points,
      important: prev.important,
      text: prev.text,
    };
    if (type === "single" || type === "multi" || type === "image") {
      q.options = prev.options ?? ["Opzione 1", "Opzione 2", "Opzione 3"];
      q.correct = [];
    }
    if (type === "truefalse") {
      q.options = ["Vero", "Falso"];
      q.correct = [];
    }
    if (type === "image") q.imageId = prev.imageId;
    if (type === "fill") q.correct = [];
    if (type === "match") q.pairs = prev.pairs ?? [{ l: "A", r: "1" }, { l: "B", r: "2" }];
    if (type === "order") q.items = prev.items ?? ["Primo", "Secondo", "Terzo"];
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

      {/* Macro family — not applicable to Mail Template (one shared set, not
          per-family), so it's hidden while that section is active. */}
      {section !== "mail" && (
        <div className="segmented" style={{ marginBottom: 14 }}>
          <button className={fam === "nihonshu" ? "on" : ""} onClick={() => selectFam("nihonshu")}>
            {esami.famNihonshu}
          </button>
          <button className={fam === "shochu" ? "on" : ""} onClick={() => selectFam("shochu")}>
            {esami.famShochu}
          </button>
        </div>
      )}

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
        <button
          className={`tab ${section === "mail" ? "active" : ""}`}
          onClick={() => selectSection("mail")}
          style={{ whiteSpace: "nowrap" }}
        >
          Mail Template
        </button>
      </div>

      {section === "mail" ? (
        <ExamEmailTemplatesEditor initial={emailTemplates} testTo={testTo} upcoming={upcomingCourses} />
      ) : (
      <>
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
          <span style={{ fontSize: 12, color: saveErr ? "var(--danger-fg)" : dirty ? "var(--warning-fg)" : "var(--success-fg)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name={saveErr ? "warn" : dirty ? "edit" : "check"} size={12} />
            {saveErr ? saveErr : saving ? t.saving : dirty ? t.unsaved : t.saved}
          </span>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={saving || !dirty}>
            <Icon name="save" size={12} />
            {t.save}
          </button>
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
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6px", gap: 2 }}>
                      <button className="reorder-btn" title={t.moveUp} disabled={qi === 0} onClick={() => moveQuestion(qi, -1)}>
                        <Icon name="arrow-up" size={12} />
                      </button>
                      <button className="reorder-btn" title={t.moveDown} disabled={qi === questions.length - 1} onClick={() => moveQuestion(qi, 1)}>
                        <Icon name="arrow-dn" size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            <AddQuestionRow onAdd={addQuestion} />
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ padding: 24, overflow: "auto", maxHeight: 700 }}>
          {activeQ ? (
            <QuestionDetail
              q={activeQ}
              cats={cats}
              onChange={(patch) => updateQuestion(active, patch)}
              onChangeType={(type) => changeType(active, type)}
              onDuplicate={() => duplicateQuestion(active)}
              onDelete={() => removeQuestion(active)}
              onCommitCategory={commitCategory}
            />
          ) : (
            <div className="text-3" style={{ padding: 20 }}>{t.selectQuestion}</div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
