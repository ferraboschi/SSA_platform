"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface RunnerQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
}
export interface RunnerHeader {
  courseName: string;
  testLabel: string;
  place: string;
  date: string;
  educator: string;
}

type Lang = "it" | "en" | "ja";
const LANGS: Lang[] = ["it", "en", "ja"];
const LANG_LABEL: Record<Lang, string> = { it: "IT", en: "EN", ja: "日本語" };

const CHROME: Record<Lang, Record<string, string>> = {
  it: {
    test: "MODALITÀ TEST",
    educator: "Educator",
    question: "Domanda",
    of: "di",
    back: "Indietro",
    next: "Avanti",
    finish: "Termina",
    empty: "Questo test non contiene ancora domande.",
    thanksTitle: "Grazie, hai terminato.",
    thanksBody: "Le tue risposte sono state registrate. Puoi chiudere questa pagina.",
    yourAnswer: "La tua risposta",
  },
  en: {
    test: "TEST MODE",
    educator: "Educator",
    question: "Question",
    of: "of",
    back: "Back",
    next: "Next",
    finish: "Finish",
    empty: "This test has no questions yet.",
    thanksTitle: "Thank you, you're done.",
    thanksBody: "Your answers have been recorded. You can close this page.",
    yourAnswer: "Your answer",
  },
  ja: {
    test: "テストモード",
    educator: "講師",
    question: "問題",
    of: "/",
    back: "戻る",
    next: "次へ",
    finish: "終了",
    empty: "このテストにはまだ問題がありません。",
    thanksTitle: "お疲れさまでした。終了です。",
    thanksBody: "回答が記録されました。このページを閉じてかまいません。",
    yourAnswer: "あなたの回答",
  },
};

// Block copy/cut/paste/right-click on exam content (anti-cheat deterrent).
const noCopy = {
  onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
  onCut: (e: React.ClipboardEvent) => e.preventDefault(),
  onPaste: (e: React.ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
};

export function ExamRunner({
  mode,
  forcedLang,
  header,
  questions,
}: {
  mode: "exam" | "test";
  forcedLang?: string;
  header: RunnerHeader;
  questions: RunnerQuestion[];
}) {
  const initialLang = (LANGS.includes(forcedLang as Lang) ? forcedLang : "it") as Lang;
  const [lang, setLang] = useState<Lang>(initialLang);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[] | string>>({});
  const [done, setDone] = useState(false);
  const t = CHROME[lang];

  const total = questions.length;
  const q = questions[idx];

  const setAnswer = (val: string[] | string) =>
    setAnswers((a) => ({ ...a, [q.id]: val }));

  const header_ = (
    <header className="exam-public-head" {...noCopy}>
      <div className="exam-public-head-top">
        <span className="exam-public-brand">SSA</span>
        {mode === "test" && <span className="exam-public-testbadge">{t.test}</span>}
        {!forcedLang && (
          <div className="exam-public-langs">
            {LANGS.map((l) => (
              <button
                key={l}
                className={`exam-public-lang ${l === lang ? "active" : ""}`}
                onClick={() => setLang(l)}
                type="button"
              >
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
        )}
      </div>
      <h1 className="exam-public-course">{header.courseName}</h1>
      <div className="exam-public-meta">
        <span>{header.testLabel}</span>
        <span aria-hidden>·</span>
        <span>{header.place}</span>
        <span aria-hidden>·</span>
        <span>{header.date}</span>
        {header.educator && (
          <>
            <span aria-hidden>·</span>
            <span>
              {t.educator}: {header.educator}
            </span>
          </>
        )}
      </div>
    </header>
  );

  if (done || total === 0) {
    return (
      <div className="exam-public-shell">
        <div className="exam-public-card">
          {header_}
          <div className="exam-public-thanks">
            <div className="exam-public-thanks-check">✓</div>
            <h2>{t.thanksTitle}</h2>
            <p>{total === 0 ? t.empty : t.thanksBody}</p>
          </div>
        </div>
      </div>
    );
  }

  const pct = Math.round(((idx + 1) / total) * 100);
  const current = answers[q.id];

  return (
    <div className="exam-public-shell">
      <div className="exam-public-card">
        {header_}

        <div className="exam-public-progress" aria-hidden>
          <div className="exam-public-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="exam-public-counter">
          {t.question} {idx + 1} {t.of} {total}
        </div>

        <div className="exam-public-q" {...noCopy}>
          <p className="exam-public-q-text">{q.text}</p>
          <QuestionInput
            q={q}
            value={current}
            onChange={setAnswer}
            answerLabel={t.yourAnswer}
          />
        </div>

        <div className="exam-public-nav">
          <button
            type="button"
            className="exam-public-btn ghost"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
          >
            {t.back}
          </button>
          {idx < total - 1 ? (
            <button
              type="button"
              className="exam-public-btn primary"
              onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            >
              {t.next}
            </button>
          ) : (
            <button
              type="button"
              className="exam-public-btn primary"
              onClick={() => setDone(true)}
            >
              {t.finish}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
  answerLabel,
}: {
  q: RunnerQuestion;
  value: string[] | string | undefined;
  onChange: (v: string[] | string) => void;
  answerLabel: string;
}): ReactNode {
  const multi = q.type === "multi";
  const optionTypes = ["single", "multi", "truefalse", "image"];
  const selected = useMemo<string[]>(
    () => (Array.isArray(value) ? value : value ? [value] : []),
    [value],
  );

  if (optionTypes.includes(q.type) && q.options.length > 0) {
    const toggle = (opt: string) => {
      if (multi) {
        onChange(
          selected.includes(opt)
            ? selected.filter((o) => o !== opt)
            : [...selected, opt],
        );
      } else {
        onChange([opt]);
      }
    };
    return (
      <div className="exam-public-options">
        {q.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className={`exam-public-opt ${selected.includes(opt) ? "selected" : ""}`}
            onClick={() => toggle(opt)}
          >
            <span className="exam-public-opt-mark" aria-hidden>
              {selected.includes(opt) ? "●" : "○"}
            </span>
            <span>{opt}</span>
          </button>
        ))}
      </div>
    );
  }

  if (q.type === "fill") {
    return (
      <input
        className="exam-public-input"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={answerLabel}
      />
    );
  }

  // open / match / order / rating fallback → free text
  return (
    <textarea
      className="exam-public-textarea"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={answerLabel}
      rows={5}
    />
  );
}
