"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

export interface RunnerQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  /** Correct option indices — present only in validate mode. */
  correct?: number[];
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
const LANG_LABEL: Record<Lang, string> = { it: "Italiano", en: "English", ja: "日本語" };

const CHROME: Record<Lang, Record<string, string>> = {
  it: {
    test: "MODALITÀ TEST",
    educator: "Educator",
    chooseLang: "Scegli la lingua dell'esame",
    question: "Domanda",
    of: "di",
    back: "Indietro",
    next: "Avanti",
    finish: "Termina",
    start: "Inizia",
    empty: "Questo test non contiene ancora domande.",
    thanksTitle: "Grazie, hai terminato.",
    thanksBody: "Le tue risposte sono state registrate. Puoi chiudere questa pagina.",
    yourAnswer: "La tua risposta",
    pendingTitle: "Domande in sospeso",
    pendingBody: "Hai {n} domande senza risposta. Vuoi rivederle prima di terminare?",
    review: "Rivedi le domande saltate",
    finishAnyway: "Termina comunque",
    regName: "Nome e cognome",
    regGender: "Sesso alla nascita",
    regNationality: "Nazionalità",
    regEmail: "Email",
    regPhone: "Telefono",
    regAddress: "Indirizzo di spedizione del materiale",
    male: "Maschile",
    female: "Femminile",
  },
  en: {
    test: "TEST MODE",
    educator: "Educator",
    chooseLang: "Choose the exam language",
    question: "Question",
    of: "of",
    back: "Back",
    next: "Next",
    finish: "Finish",
    start: "Start",
    empty: "This test has no questions yet.",
    thanksTitle: "Thank you, you're done.",
    thanksBody: "Your answers have been recorded. You can close this page.",
    yourAnswer: "Your answer",
    pendingTitle: "Pending questions",
    pendingBody: "You have {n} unanswered questions. Review them before finishing?",
    review: "Review skipped questions",
    finishAnyway: "Finish anyway",
    regName: "Full name",
    regGender: "Sex at birth",
    regNationality: "Nationality",
    regEmail: "Email",
    regPhone: "Phone",
    regAddress: "Shipping address for materials",
    male: "Male",
    female: "Female",
  },
  ja: {
    test: "テストモード",
    educator: "講師",
    chooseLang: "試験の言語を選択",
    question: "問題",
    of: "/",
    back: "戻る",
    next: "次へ",
    finish: "終了",
    start: "開始",
    empty: "このテストにはまだ問題がありません。",
    thanksTitle: "お疲れさまでした。終了です。",
    thanksBody: "回答が記録されました。このページを閉じてかまいません。",
    yourAnswer: "あなたの回答",
    pendingTitle: "未回答の問題",
    pendingBody: "未回答の問題が{n}件あります。終了前に確認しますか？",
    review: "スキップした問題を確認",
    finishAnyway: "このまま終了",
    regName: "氏名",
    regGender: "出生時の性別",
    regNationality: "国籍",
    regEmail: "メール",
    regPhone: "電話番号",
    regAddress: "教材の配送先住所",
    male: "男性",
    female: "女性",
  },
};

// Block copy/cut/paste/right-click on exam content (anti-cheat deterrent).
const noCopy = {
  onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
  onCut: (e: React.ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
};

type RegField = "name" | "gender" | "nationality" | "email" | "phone" | "address";
const REG_ORDER: RegField[] = ["name", "gender", "nationality", "email", "phone", "address"];

type Step =
  | { kind: "reg"; field: RegField }
  | { kind: "q"; q: RunnerQuestion };

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ExamRunner({
  mode,
  forcedLang,
  collectRegistration,
  reveal,
  header,
  questions,
}: {
  mode: "exam" | "test" | "validate";
  forcedLang?: string;
  collectRegistration?: boolean;
  reveal?: boolean;
  header: RunnerHeader;
  questions: RunnerQuestion[];
}) {
  // Language is the FIRST step (a gate), unless forced by the link.
  const forced = LANGS.includes(forcedLang as Lang) ? (forcedLang as Lang) : null;
  const [lang, setLang] = useState<Lang>(forced ?? "it");
  const [langPicked, setLangPicked] = useState<boolean>(Boolean(forced));
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[] | string>>({});
  const [done, setDone] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string[] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const t = CHROME[lang];

  // Clock — ticks once the language is chosen.
  useEffect(() => {
    if (!langPicked || done) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [langPicked, done]);

  // Flatten the flow: registration fields (final exam only) + graded questions.
  const steps = useMemo<Step[]>(() => {
    const reg: Step[] = collectRegistration
      ? REG_ORDER.map((field) => ({ kind: "reg", field }) as Step)
      : [];
    return [...reg, ...questions.map((q) => ({ kind: "q", q }) as Step)];
  }, [collectRegistration, questions]);

  const total = steps.length;
  const step = steps[idx];

  const setAnswer = (key: string, val: string[] | string) =>
    setAnswers((a) => ({ ...a, [key]: val }));

  // ── Header (course + timer) ──────────────────────────────────────────────
  const headerBar = (
    <header className="exam-public-head" {...noCopy}>
      <div className="exam-public-head-top">
        <span className="exam-public-brand">SSA</span>
        {mode === "test" && <span className="exam-public-testbadge">{t.test}</span>}
        {mode === "validate" && (
          <span className="exam-public-testbadge" style={{ background: "#e8f6ee", color: "#1a7f43" }}>
            VALIDAZIONE
          </span>
        )}
        {langPicked && (
          <span className="exam-public-clock" aria-label="timer">
            ⏱ {fmtClock(elapsed)}
          </span>
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

  // ── Step 0: language gate ────────────────────────────────────────────────
  if (!langPicked) {
    return (
      <div className="exam-public-shell">
        <div className="exam-public-card">
          {headerBar}
          <div className="exam-public-q" {...noCopy}>
            <p className="exam-public-q-text">{CHROME[lang].chooseLang}</p>
            <div className="exam-public-options">
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`exam-public-opt ${l === lang ? "selected" : ""}`}
                  onClick={() => setLang(l)}
                >
                  <span className="exam-public-opt-mark" aria-hidden>
                    {l === lang ? "●" : "○"}
                  </span>
                  <span>{LANG_LABEL[l]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="exam-public-nav">
            <span />
            <button
              type="button"
              className="exam-public-btn primary"
              onClick={() => setLangPicked(true)}
            >
              {CHROME[lang].start}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Done / empty ─────────────────────────────────────────────────────────
  if (done || total === 0) {
    return (
      <div className="exam-public-shell">
        <div className="exam-public-card">
          {headerBar}
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

  // Skipped GRADED questions (registration is optional, not "skipped").
  const skippedQ = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.kind === "q")
    .filter(({ s }) => {
      const q = (s as { q: RunnerQuestion }).q;
      const a = answers[q.id];
      return a === undefined || (Array.isArray(a) ? a.length === 0 : a === "");
    })
    .map(({ i }) => String(i));

  const goFinish = () => {
    if (skippedQ.length > 0) setPendingPrompt(skippedQ);
    else setDone(true);
  };

  return (
    <div className="exam-public-shell">
      <div className="exam-public-card">
        {headerBar}

        <div className="exam-public-progress" aria-hidden>
          <div className="exam-public-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="exam-public-counter">
          {t.question} {idx + 1} {t.of} {total} · {idx + 1}/{total}
        </div>

        <div className="exam-public-q" {...noCopy}>
          {step.kind === "reg" ? (
            <RegInput
              field={step.field}
              t={t}
              value={answers["reg:" + step.field]}
              onChange={(v) => setAnswer("reg:" + step.field, v)}
            />
          ) : (
            <>
              <p className="exam-public-q-text">{step.q.text}</p>
              <QuestionInput
                q={step.q}
                value={answers[step.q.id]}
                onChange={(v) => setAnswer(step.q.id, v)}
                answerLabel={t.yourAnswer}
                reveal={reveal}
              />
            </>
          )}
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
            <button type="button" className="exam-public-btn primary" onClick={goFinish}>
              {t.finish}
            </button>
          )}
        </div>
      </div>

      {/* Skipped-question review prompt */}
      {pendingPrompt && (
        <div className="exam-public-modal-backdrop">
          <div className="exam-public-modal">
            <h3>{t.pendingTitle}</h3>
            <p>{t.pendingBody.replace("{n}", String(pendingPrompt.length))}</p>
            <div className="exam-public-modal-actions">
              <button
                className="exam-public-btn ghost"
                onClick={() => {
                  setPendingPrompt(null);
                  setDone(true);
                }}
              >
                {t.finishAnyway}
              </button>
              <button
                className="exam-public-btn primary"
                onClick={() => {
                  setIdx(Number(pendingPrompt[0]));
                  setPendingPrompt(null);
                }}
              >
                {t.review}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RegInput({
  field,
  t,
  value,
  onChange,
}: {
  field: RegField;
  t: Record<string, string>;
  value: string[] | string | undefined;
  onChange: (v: string) => void;
}): ReactNode {
  const labels: Record<RegField, string> = {
    name: t.regName,
    gender: t.regGender,
    nationality: t.regNationality,
    email: t.regEmail,
    phone: t.regPhone,
    address: t.regAddress,
  };
  const val = typeof value === "string" ? value : "";
  return (
    <>
      <p className="exam-public-q-text">{labels[field]}</p>
      {field === "gender" ? (
        <div className="exam-public-options">
          {[t.male, t.female].map((opt) => (
            <button
              key={opt}
              type="button"
              className={`exam-public-opt ${val === opt ? "selected" : ""}`}
              onClick={() => onChange(opt)}
            >
              <span className="exam-public-opt-mark" aria-hidden>
                {val === opt ? "●" : "○"}
              </span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      ) : field === "address" ? (
        <textarea
          className="exam-public-textarea"
          value={val}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          className="exam-public-input"
          type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
          value={val}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
  answerLabel,
  reveal,
}: {
  q: RunnerQuestion;
  value: string[] | string | undefined;
  onChange: (v: string[] | string) => void;
  answerLabel: string;
  reveal?: boolean;
}): ReactNode {
  const multi = q.type === "multi";
  const optionTypes = ["single", "multi", "truefalse", "image"];
  const selected = useMemo<string[]>(
    () => (Array.isArray(value) ? value : value ? [value] : []),
    [value],
  );
  const correctSet = new Set(q.correct ?? []);

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
        {q.options.map((opt, i) => {
          const isCorrect = reveal && correctSet.has(i);
          return (
            <button
              key={i}
              type="button"
              className={`exam-public-opt ${selected.includes(opt) ? "selected" : ""} ${isCorrect ? "correct" : ""}`}
              onClick={() => toggle(opt)}
            >
              <span className="exam-public-opt-mark" aria-hidden>
                {selected.includes(opt) ? "●" : "○"}
              </span>
              <span>{opt}</span>
              {isCorrect && (
                <span style={{ marginLeft: "auto", color: "#1a7f43", fontWeight: 700 }}>
                  ✓ corretta
                </span>
              )}
            </button>
          );
        })}
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
