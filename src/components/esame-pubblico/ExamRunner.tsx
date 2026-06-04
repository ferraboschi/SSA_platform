"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { submitExam } from "@/lib/exam-links/actions";

export interface RunnerQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  /** Stored EN/JA translations (one-time, via Claude). */
  i18n?: Partial<Record<"en" | "ja", { text: string; options: string[] }>>;
  /** Correct answers — option INDICES for choice questions, accepted STRINGS for
   *  "fill". Present only in validate mode. */
  correct?: Array<number | string>;
  /** Image URL for "image" (identify) questions. */
  image?: string;
}

/** Render a question in the chosen language, falling back to the original (IT). */
function localizeQ(q: RunnerQuestion, lang: "it" | "en" | "ja"): RunnerQuestion {
  if (lang === "it") return q;
  const tr = q.i18n?.[lang];
  if (!tr) return q;
  return { ...q, text: tr.text || q.text, options: tr.options?.length ? tr.options : q.options };
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
    saveErrTitle: "Salvataggio non riuscito",
    saveErrBody: "Le tue risposte NON sono state salvate. Controlla la connessione e riprova.",
    retry: "Riprova",
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
    iDone: "Ho finito",
    emailInvalid: "Inserisci un'email valida",
    emptyListTitle: "Domande lasciate vuote",
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
    saveErrTitle: "Saving failed",
    saveErrBody: "Your answers were NOT saved. Check your connection and try again.",
    retry: "Try again",
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
    iDone: "I'm done",
    emailInvalid: "Enter a valid email",
    emptyListTitle: "Questions left empty",
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
    saveErrTitle: "保存に失敗しました",
    saveErrBody: "回答は保存されていません。接続を確認して、もう一度お試しください。",
    retry: "再試行",
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
    iDone: "完了",
    emailInvalid: "有効なメールを入力してください",
    emptyListTitle: "未回答の問題",
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
  token,
}: {
  mode: "exam" | "test" | "validate";
  forcedLang?: string;
  collectRegistration?: boolean;
  reveal?: boolean;
  header: RunnerHeader;
  questions: RunnerQuestion[];
  /** Signed exam token — required to persist a real ("exam") submission. */
  token?: string;
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const t = CHROME[lang];

  // Persist a real exam submission, then show the thank-you screen. For
  // test/validate (or a missing token) nothing is written — just finish.
  const finish = async () => {
    if (mode !== "exam" || !token) {
      setDone(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(false);
    try {
      const r = await submitExam(token, { answers, lang, elapsed });
      if (r.ok) setDone(true);
      else setSubmitError(true);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

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

  // ── Save failed — answers NOT persisted; let the student retry ───────────
  if (submitError) {
    return (
      <div className="exam-public-shell">
        <div className="exam-public-card">
          {headerBar}
          <div className="exam-public-thanks">
            <div className="exam-public-thanks-check" style={{ background: "#fde8e6", color: "#b42318" }}>!</div>
            <h2>{t.saveErrTitle}</h2>
            <p>{t.saveErrBody}</p>
            <button
              type="button"
              className="exam-public-btn primary"
              style={{ marginTop: 16 }}
              onClick={() => void finish()}
              disabled={submitting}
            >
              {submitting ? "…" : t.retry}
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
    else void finish();
  };

  // Block "Avanti" while sitting on the email step with an invalid address.
  const curEmail =
    step.kind === "reg" && step.field === "email"
      ? (answers["reg:email"] as string | undefined)
      : undefined;
  const emailInvalid =
    typeof curEmail === "string" && curEmail.trim() !== "" && !EMAIL_RE.test(curEmail.trim());
  const atLast = idx === total - 1;

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
            (() => {
              const lq = localizeQ(step.q, lang);
              return (
                <>
                  <p className="exam-public-q-text">{lq.text}</p>
                  {lq.type === "image" && lq.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={lq.image}
                      alt=""
                      style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, margin: "8px 0 14px", objectFit: "contain" }}
                    />
                  )}
                  <QuestionInput
                    q={lq}
                    value={answers[step.q.id]}
                    onChange={(v) => setAnswer(step.q.id, v)}
                    answerLabel={t.yourAnswer}
                    reveal={reveal}
                  />
                </>
              );
            })()
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
          {!atLast && (
            <button
              type="button"
              className="exam-public-btn primary"
              onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
              disabled={emailInvalid}
            >
              {t.next}
            </button>
          )}
          {/* "Ho finito" is always present; it turns orange + clickable on the
              last step, regardless of how many questions are still empty. */}
          <button
            type="button"
            className="exam-public-btn"
            onClick={goFinish}
            disabled={!atLast || submitting}
            style={
              atLast
                ? { background: "#f59e0b", borderColor: "#f59e0b", color: "#fff" }
                : { opacity: 0.45 }
            }
          >
            {submitting ? "…" : t.iDone}
          </button>
        </div>
      </div>

      {/* Skipped-question review prompt */}
      {pendingPrompt && (
        <div className="exam-public-modal-backdrop">
          <div className="exam-public-modal">
            <h3>{t.pendingTitle}</h3>
            <p>{t.pendingBody.replace("{n}", String(pendingPrompt.length))}</p>
            <div style={{ fontSize: 12, color: "var(--text-3, #6b7280)", margin: "2px 0 6px" }}>
              {t.emptyListTitle}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {pendingPrompt.map((si) => (
                <button
                  key={si}
                  type="button"
                  className="exam-public-btn ghost"
                  style={{ padding: "4px 11px", fontSize: 13, minWidth: 0 }}
                  onClick={() => {
                    setIdx(Number(si));
                    setPendingPrompt(null);
                  }}
                >
                  {t.question} {Number(si) + 1}
                </button>
              ))}
            </div>
            <div className="exam-public-modal-actions">
              <button
                className="exam-public-btn ghost"
                onClick={() => {
                  setPendingPrompt(null);
                  void finish();
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

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Country dial codes — Italy first (the SSA audience), then common ones.
const COUNTRY_CODES: { c: string; n: string }[] = [
  { c: "+39", n: "Italia" },
  { c: "+1", n: "USA / Canada" },
  { c: "+44", n: "Regno Unito" },
  { c: "+33", n: "Francia" },
  { c: "+49", n: "Germania" },
  { c: "+34", n: "Spagna" },
  { c: "+41", n: "Svizzera" },
  { c: "+43", n: "Austria" },
  { c: "+32", n: "Belgio" },
  { c: "+31", n: "Paesi Bassi" },
  { c: "+81", n: "Giappone" },
  { c: "+86", n: "Cina" },
  { c: "+61", n: "Australia" },
];

function splitPhone(val: string): { code: string; num: string } {
  const m = /^(\+\d{1,4})\s*(.*)$/.exec(val.trim());
  if (m && COUNTRY_CODES.some((x) => x.c === m[1])) return { code: m[1], num: m[2] };
  return { code: "+39", num: val.replace(/^\+\d{1,4}\s*/, "") };
}

// ── Google Places address autocomplete (optional) ───────────────────────────
// Enabled only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set (Render env). Without
// it the field degrades gracefully to a plain textarea.
interface GPlace {
  formatted_address?: string;
}
interface GAutocomplete {
  addListener(ev: string, cb: () => void): void;
  getPlace(): GPlace;
}
interface GMaps {
  maps: { places: { Autocomplete: new (input: HTMLInputElement, opts?: object) => GAutocomplete } };
}
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
let gmapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined" || !GMAPS_KEY) return Promise.reject(new Error("no key"));
  const w = window as unknown as { google?: GMaps };
  if (w.google?.maps?.places) return Promise.resolve();
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&language=it`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gmaps load failed"));
    document.head.appendChild(s);
  });
  return gmapsPromise;
}

function GoogleAddressInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!GMAPS_KEY) return;
    loadGoogleMaps()
      .then(() => {
        const w = window as unknown as { google?: GMaps };
        if (!ref.current || !w.google) return;
        const ac = new w.google.maps.places.Autocomplete(ref.current, {
          types: ["address"],
          fields: ["formatted_address"],
        });
        ac.addListener("place_changed", () => {
          const a = ac.getPlace().formatted_address;
          if (a) onChange(a);
        });
      })
      .catch(() => {
        /* key invalid / network → keep the input usable as free text */
      });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!GMAPS_KEY) {
    return (
      <textarea
        className="exam-public-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }
  return (
    <input
      ref={ref}
      className="exam-public-input"
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Inizia a digitare l'indirizzo…"
      autoComplete="off"
    />
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
      ) : field === "name" ? (
        (() => {
          const sp = val.indexOf(" ");
          const first = sp >= 0 ? val.slice(0, sp) : val;
          const last = sp >= 0 ? val.slice(sp + 1) : "";
          return (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="exam-public-input"
                type="text"
                placeholder="Nome"
                autoComplete="given-name"
                value={first}
                onChange={(e) => onChange(`${e.target.value} ${last}`.trim())}
                style={{ flex: 1 }}
              />
              <input
                className="exam-public-input"
                type="text"
                placeholder="Cognome"
                autoComplete="family-name"
                value={last}
                onChange={(e) => onChange(`${first} ${e.target.value}`.trim())}
                style={{ flex: 1 }}
              />
            </div>
          );
        })()
      ) : field === "address" ? (
        <GoogleAddressInput value={val} onChange={onChange} />
      ) : field === "email" ? (
        <>
          <input
            className="exam-public-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={val}
            onChange={(e) => onChange(e.target.value)}
          />
          {val.trim() !== "" && !EMAIL_RE.test(val.trim()) && (
            <p style={{ color: "#b42318", fontSize: 13, marginTop: 6 }}>{t.emailInvalid}</p>
          )}
        </>
      ) : field === "phone" ? (
        (() => {
          const { code, num } = splitPhone(val);
          return (
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="exam-public-input"
                value={code}
                onChange={(e) => onChange(`${e.target.value} ${num}`.trim())}
                style={{ flex: "0 0 130px" }}
              >
                {COUNTRY_CODES.map((cc) => (
                  <option key={cc.c + cc.n} value={cc.c}>
                    {cc.n} ({cc.c})
                  </option>
                ))}
              </select>
              <input
                className="exam-public-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={num}
                onChange={(e) => onChange(`${code} ${e.target.value}`.trim())}
                style={{ flex: 1 }}
              />
            </div>
          );
        })()
      ) : (
        <input
          className="exam-public-input"
          type="text"
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

  if (q.type === "rating") {
    const current = Number(typeof value === "string" ? value : Array.isArray(value) ? value[0] : 0) || 0;
    return (
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n))}
            aria-label={`${n}`}
            style={{
              width: 46,
              height: 46,
              borderRadius: 10,
              border: "1.5px solid " + (n <= current ? "#e8a33d" : "var(--border, #d4d4d8)"),
              background: n <= current ? "#fbe9c8" : "transparent",
              color: n <= current ? "#b97400" : "var(--text-mute, #9ca3af)",
              fontSize: 20,
              cursor: "pointer",
              transition: "all 120ms",
            }}
          >
            ★
          </button>
        ))}
      </div>
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
