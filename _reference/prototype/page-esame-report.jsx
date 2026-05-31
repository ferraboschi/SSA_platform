// V2 Esame Report — anteprima PDF tri-lingua
const { Icon: RP_Icon, PageHeader: RP_PageHeader } = window.V2;

function V2_PageEsameReport({ id, email }) {
  const course = SSA.COURSES.find(c => c.id === id);
  if (!course || !course.examResults2) return <div className="page">Report non disponibile</div>;
  const result = course.examResults2.find(r => r.email === decodeURIComponent(email)) || course.examResults2[0];
  const [lang, setLang] = useState("it");
  const [view, setView] = useState("single");

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 14 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Anteprima report PDF</div>
          <h1 className="display" style={{ fontSize: 28 }}>{result.name}</h1>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-3)" }}>
            Punteggio <strong className="num" style={{ color: result.status === "passed" ? "var(--success-fg)" : result.status === "retrial" ? "var(--warning-fg)" : "var(--danger-fg)" }}>{result.score}%</strong> · {result.status === "passed" ? "Promosso" : result.status === "retrial" ? "Promosso con riserva" : "Non promosso"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="segmented">
            <button className={view === "single" ? "on" : ""} onClick={() => setView("single")}>Singolo</button>
            <button className={view === "trio" ? "on" : ""} onClick={() => setView("trio")}>Tri-lingua</button>
          </div>
          {view === "single" && (
            <div className="segmented">
              {["it","en","ja"].map(l => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
            </div>
          )}
          <button className="btn"><RP_Icon name="download" size={13}/>Scarica PDF</button>
          <button className="btn btn-primary"><RP_Icon name="mail" size={13}/>Invia per email</button>
        </div>
      </div>

      <div style={{ background: "linear-gradient(135deg, var(--indigo-50), var(--surface-2))", padding: 32, borderRadius: 12, display: "flex", justifyContent: "center", gap: 24, overflow: "auto", border: "1px solid var(--border)" }}>
        {view === "single" && <ReportPage course={course} result={result} lang={lang}/>}
        {view === "trio" && (
          <>
            <ReportPage course={course} result={result} lang="it" mini/>
            <ReportPage course={course} result={result} lang="en" mini/>
            <ReportPage course={course} result={result} lang="ja" mini/>
          </>
        )}
      </div>
    </div>
  );
}

const RP_T = {
  it: {
    cert: "Certificato di Esame",
    family: { nihonshu: "Sake Sommelier · Livello Certificato", shochu: "Shochu Sommelier · Livello Certificato" },
    passedTitle: "Promosso", retrialTitle: "Promosso con riserva", failedTitle: "Non promosso",
    score: "Punteggio finale", breakdown: "Punteggio per categoria",
    aiSummary: "Sintesi del percorso", weakAreas: "Aree da approfondire",
    issued: "Rilasciato il", examDate: "Data esame", location: "Sede", educator: "Educator",
    importantWrong: "Domande importanti da rivedere",
    correctAnswer: "Risposta corretta", yourAnswer: "La tua risposta",
    footer: "Sake Sommelier Association · sakesommelierassociation.it",
    advice: {
      passed: "Ottimo lavoro. Hai dimostrato una buona padronanza del programma. Continua con masterclass per consolidare l'esperienza.",
      retrial: "Hai raggiunto un buon livello generale ma alcune aree richiedono approfondimento. Sostieni la sessione di recupero entro 60 giorni.",
      failed: "Il punteggio è sotto la soglia richiesta. Ti consigliamo di rivedere il materiale e ripetere il corso o sostenere il recupero."
    }
  },
  en: {
    cert: "Examination Report", family: { nihonshu: "Sake Sommelier · Certified Level", shochu: "Shochu Sommelier · Certified Level" },
    passedTitle: "Passed", retrialTitle: "Passed with reservation", failedTitle: "Not passed",
    score: "Final score", breakdown: "Score by category",
    aiSummary: "Path summary", weakAreas: "Areas to deepen",
    issued: "Issued on", examDate: "Exam date", location: "Location", educator: "Educator",
    importantWrong: "Important questions to review",
    correctAnswer: "Correct answer", yourAnswer: "Your answer",
    footer: "Sake Sommelier Association · sakesommelierassociation.it",
    advice: {
      passed: "Excellent work. You demonstrated strong mastery of the program. Continue with masterclasses to consolidate your experience.",
      retrial: "You achieved a good general level, but some areas need further study. Take the retrial session within 60 days.",
      failed: "Your score is below the required threshold. We recommend reviewing the material and retaking the course or sitting the retrial."
    }
  },
  ja: {
    cert: "試験報告書", family: { nihonshu: "酒ソムリエ · 認定レベル", shochu: "焼酎ソムリエ · 認定レベル" },
    passedTitle: "合格", retrialTitle: "条件付き合格", failedTitle: "不合格",
    score: "最終点数", breakdown: "カテゴリ別点数",
    aiSummary: "学習の要約", weakAreas: "復習が必要な分野",
    issued: "発行日", examDate: "試験日", location: "会場", educator: "講師",
    importantWrong: "復習すべき重要な問題",
    correctAnswer: "正解", yourAnswer: "あなたの回答",
    footer: "サケソムリエ協会 · sakesommelierassociation.it",
    advice: {
      passed: "素晴らしい成果です。プログラム全体に対する確かな理解を示しました。マスタークラスを継続しましょう。",
      retrial: "全体的に良い水準に達しましたが、いくつかの分野で更なる学習が必要です。60日以内に再試験を受けてください。",
      failed: "点数が基準を下回っています。教材を見直し、コースの再受講または再試験をお勧めします。"
    }
  }
};

function ReportPage({ course, result, lang, mini }) {
  const t = RP_T[lang];
  const exam = course.exam;
  const isPass = result.status === "passed";
  const isRetrial = result.status === "retrial";
  const FS = mini ? 0.65 : 1;
  const W = mini ? 340 : 540;
  return (
    <div style={{
      width: W, minHeight: mini ? 480 : 760,
      background: "white",
      boxShadow: "var(--sh-4)",
      padding: 32 * FS,
      fontFamily: lang === "ja" ? "'Hiragino Mincho ProN', 'Yu Mincho', serif" : "var(--font-sans)",
      color: "var(--text)",
      display: "flex",
      flexDirection: "column",
      gap: 16 * FS,
      borderRadius: 4
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 * FS, borderBottom: "1.5px solid var(--navy)" }}>
        <div>
          <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600 }}>Sake Sommelier Association</div>
          <div style={{ fontWeight: 600, fontSize: 13 * FS, marginTop: 4, letterSpacing: "-0.005em" }}>{t.cert}</div>
        </div>
        <div style={{ width: 36 * FS, height: 36 * FS, background: "var(--navy)", color: "white", display: "grid", placeItems: "center", borderRadius: 4, position: "relative", overflow: "hidden" }}>
          <span style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, var(--indigo) 0%, transparent 60%)", opacity: 0.6 }}></span>
          <span style={{ position: "relative", zIndex: 1, fontWeight: 700, fontSize: 18 * FS, letterSpacing: "-0.02em" }}>S</span>
        </div>
      </div>

      <div>
        <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 6 }}>{t.family[exam.family]}</div>
        <h1 style={{ fontSize: 28 * FS, margin: 0, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{result.name}</h1>
        <div style={{ marginTop: 8, fontSize: 11 * FS, color: "var(--text-3)" }}>
          {t.examDate}: <strong style={{ color: "var(--text-2)" }}>{course.day} {course.month} {course.year}</strong> · {t.location}: {course.city} · {t.educator}: {course.educator?.name}
        </div>
      </div>

      <div style={{
        padding: 18 * FS,
        background: isPass ? "var(--success-bg)" : isRetrial ? "var(--warning-bg)" : "var(--danger-bg)",
        border: "1.5px solid " + (isPass ? "var(--success)" : isRetrial ? "var(--warning)" : "var(--danger)"),
        borderRadius: 6,
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>{t.score}</div>
          <div className="num" style={{ fontSize: 40 * FS, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: isPass ? "var(--success-fg)" : isRetrial ? "var(--warning-fg)" : "var(--danger-fg)" }}>{result.score}<span style={{ fontSize: 20 * FS, color: "var(--text-3)", fontWeight: 500 }}>%</span></div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 24 * FS, color: isPass ? "var(--success-fg)" : isRetrial ? "var(--warning-fg)" : "var(--danger-fg)", letterSpacing: "-0.01em" }}>
          {isPass ? t.passedTitle : isRetrial ? t.retrialTitle : t.failedTitle}
        </div>
      </div>

      <div>
        <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 6 }}>{t.aiSummary}</div>
        <p style={{ fontSize: 11.5 * FS, lineHeight: 1.55, color: "var(--text)", margin: 0 }}>{t.advice[result.status]}</p>
      </div>

      <div>
        <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 10 }}>{t.breakdown}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 * FS }}>
          {result.sections.map(sec => (
            <div key={sec.cat} style={{ display: "grid", gridTemplateColumns: "1fr 50px", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11.5 * FS, marginBottom: 3, fontWeight: 500 }}>{sec.label}</div>
                <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2 }}>
                  <div style={{ width: sec.pct + "%", height: "100%", background: sec.pct >= 80 ? "var(--success)" : sec.pct >= 70 ? "var(--warning)" : "var(--danger)", borderRadius: 2 }}></div>
                </div>
              </div>
              <div className="num" style={{ textAlign: "right", fontSize: 11 * FS, fontWeight: 600, color: sec.pct >= 80 ? "var(--success-fg)" : sec.pct >= 70 ? "var(--warning-fg)" : "var(--danger-fg)" }}>{Math.round(sec.pct)}%</div>
            </div>
          ))}
        </div>
      </div>

      {result.wrongImportant.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 10 }}>{t.importantWrong}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 * FS }}>
            {result.wrongImportant.slice(0,2).map((w, i) => (
              <div key={i} style={{ paddingLeft: 12 * FS, borderLeft: "3px solid var(--danger)" }}>
                <div style={{ fontSize: 11 * FS, lineHeight: 1.4, color: "var(--text)", marginBottom: 4 * FS }}>{w.text}</div>
                <div className="mono" style={{ fontSize: 10 * FS, color: "var(--danger-fg)" }}>✗ {t.yourAnswer}: {w.wrongAnswer}</div>
                <div className="mono" style={{ fontSize: 10 * FS, color: "var(--success-fg)" }}>✓ {t.correctAnswer}: {w.correctAnswer}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 12 * FS, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 9.5 * FS, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
        <span>{t.issued}: 14 Marzo 2026</span>
        <span>{t.footer}</span>
      </div>
    </div>
  );
}

window.V2_PageEsameReport = V2_PageEsameReport;
