// V2 Esami & test — sezione estratta dal singolo corso
// Liste corsi (da fare / fatti) + Editor centrale (esame finale / mini-test / feedback per famiglia)
// + dettaglio esame per corso (riusa V2_EsameSection).
const { Icon: EX_Icon, Badge: EX_Badge, Avatar: EX_Avatar, PageHeader: EX_PageHeader } = window.V2;
const { useState: EX_useState } = React;

function exFamLabel(c) { return c.type === "shochu" ? "Shochu" : "Nihonshu · Certificato"; }
function exFamTone(c) { return c.type === "shochu" ? "oro" : "azzurro"; }
function exExamCourses() { return SSA.COURSES.filter(c => c.exam && c.examMeta); }

// ====================================================== //
function V2_PageEsami({ view, courseId }) {
  if (view === "editor") return <div className="page"><EsameEditorHub/></div>;
  if (view === "course") return <EsameCourseView courseId={courseId}/>;
  return <div className="page"><EsamiHub/></div>;
}

// ============ HUB: liste corsi ============
function EsamiHub() {
  const courses = exExamCourses();
  const daFare = courses.filter(c => !c.examMeta.done);
  const fatti = courses.filter(c => c.examMeta.done);

  // KPI
  const allResults = fatti.flatMap(c => c.examResults2 || []);
  const passRate = allResults.length ? Math.round(allResults.filter(r => r.status === "passed").length / allResults.length * 100) : 0;
  const studentsDaFare = daFare.reduce((s, c) => s + c.enrolled, 0);

  return (
    <>
      <EX_PageHeader
        eyebrow="Catalogo"
        title="Esami & test"
        sub="Solo i corsi Nihonshu (Certificato) e Shochu prevedono esame. Qui i corsi con esame da svolgere e quelli con esame concluso. Esame finale, mini-test giornalieri e feedback si configurano nella Libreria esami & test (menu a sinistra)."
      />

      <div className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
        <HubKPI label="Esami da fare" value={daFare.length} sub={`${studentsDaFare} studenti attesi`} accent="indigo"/>
        <HubKPI label="Esami conclusi" value={fatti.length} sub={`${allResults.length} risultati`}/>
        <HubKPI label="Tasso promossi" value={`${passRate}%`} sub="sui corsi conclusi" accent="green"/>
        <HubKPI label="Template attivi" value="2" sub="Nihonshu · Shochu"/>
      </div>

      <ExamList title="Da fare" hint="esame non ancora svolto" courses={daFare} tone="indigo" empty="Nessun esame in programma."/>
      <div style={{ height: 24 }}></div>
      <ExamList title="Fatti" hint="esame con risultati registrati" courses={fatti} tone="success" empty="Nessun esame concluso."/>
    </>
  );
}

function HubKPI({ label, value, sub, accent }) {
  return (
    <div className="kpi">
      {accent && <span className={`kpi-accent ${accent}`}></span>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 26 }}>{value}</div>
      {sub && <div className="kpi-foot">{sub}</div>}
    </div>
  );
}

function ExamList({ title, hint, courses, tone, empty }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 15 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone === "success" ? "var(--success)" : "var(--indigo)" }}></span>
          {title}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-4)" }}>· {hint}</span>
        <span className="num" style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>{courses.length}</span>
      </div>
      {courses.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {courses.map(c => <ExamCourseRow key={c.id} course={c} done={tone === "success"}/>)}
        </div>
      )}
    </div>
  );
}

function ExamCourseRow({ course: c, done }) {
  const meta = c.examMeta;
  const miniDone = meta.miniTests.filter(m => m.status === "completato").length;
  const results = c.examResults2 || [];
  const passed = results.filter(r => r.status === "passed").length;
  return (
    <a href={`#/esami/${c.id}`} className="card" style={{ display: "block", textDecoration: "none", color: "inherit", transition: "transform var(--dur-fast), box-shadow var(--dur-fast)" }}
       onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "var(--sh-3)"; }}
       onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--sh-card)"; }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr auto", gap: 16, alignItems: "center", padding: "16px 20px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
            <EX_Badge tone={exFamTone(c)}>{exFamLabel(c)}</EX_Badge>
            {c.examMeta.live && <EX_Badge tone="indigo" dot>esame live</EX_Badge>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.shortTitle}</div>
          <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 2 }}>{c.day} {c.month} {c.year} · {c.city} · {c.enrolled} iscritti</div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Esame finale</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>Giorno {meta.examDayNo}</div>
          <div style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{meta.examDateLabel}</div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Mini-test</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{miniDone}/{meta.miniTests.length}</span>
            <div className="bar" style={{ width: 54 }}><i style={{ width: (miniDone / meta.miniTests.length * 100) + "%", background: "var(--indigo)" }}></i></div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>{meta.feedback.status === "inviato" ? `feedback ${meta.feedback.responses}/${meta.feedback.total}` : "feedback pronto"}</div>
        </div>

        <div>
          {done ? (
            <>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Esito</div>
              <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--success-fg)" }}>{passed}/{results.length} promossi</div>
              <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>{results.length ? Math.round(passed/results.length*100) : 0}%</div>
            </>
          ) : (
            <>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Stato</div>
              {c.examMeta.live
                ? <EX_Badge tone="indigo" dot>in corso</EX_Badge>
                : <EX_Badge tone="neutral">pianificato</EX_Badge>}
            </>
          )}
        </div>

        <EX_Icon name="arrow" size={16} className="text-4"/>
      </div>
    </a>
  );
}

// ============ DETTAGLIO esame per corso ============
function EsameCourseView({ courseId }) {
  const c = SSA.COURSES.find(x => x.id === courseId);
  if (!c || !c.exam) {
    return <div className="page"><div className="card card-pad-lg">Corso o esame non trovato. <a className="link" href="#/esami">Torna a Esami & test</a></div></div>;
  }
  const meta = c.examMeta;
  return (
    <div className="page">
      <a className="btn btn-sm btn-ghost" href="#/esami" style={{ marginBottom: 14 }}><EX_Icon name="arrow-l" size={12}/>Esami & test</a>

      <div className="card" style={{ marginBottom: 22, overflow: "hidden" }}>
        <div style={{ padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <EX_Badge tone={exFamTone(c)} size="lg">{exFamLabel(c)}</EX_Badge>
            {meta.done ? <EX_Badge tone="success" size="lg">Esame concluso</EX_Badge>
              : meta.live ? <EX_Badge tone="indigo" size="lg" dot>Esame in corso</EX_Badge>
              : <EX_Badge tone="neutral" size="lg">Da svolgere</EX_Badge>}
          </div>
          <h1 className="display" style={{ fontSize: 28, marginBottom: 14 }}>{c.shortTitle}</h1>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: "var(--text-2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><EX_Icon name="calendar" size={14} className="text-3"/>Corso: {c.day} {c.month} {c.year}{c.days > 1 ? ` · ${c.days} giorni` : ""}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><EX_Icon name="exam" size={14} className="text-3"/>Esame finale: <strong>Giorno {meta.examDayNo}</strong> · {meta.examDateLabel}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><EX_Icon name="pin" size={14} className="text-3"/>{c.city}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><EX_Icon name="users" size={14} className="text-3"/>{c.enrolled} iscritti</span>
          </div>
        </div>
      </div>

      {window.V2_EsameSection ? <window.V2_EsameSection course={c}/> : null}
    </div>
  );
}

// ============ EDITOR CENTRALE ============
const EX_QT = { single: "Scelta singola", multi: "Scelta multipla", truefalse: "Vero / Falso", fill: "Riempi spazio", open: "Risposta libera", match: "Abbinamento", order: "Ordina", image: "Identifica immagine", rating: "Valutazione 1-5" };
// Stima tempo per tipo (s): singola 8 · multipla 13 · testo libero 45
const EX_EST = { single: 8, truefalse: 8, image: 8, rating: 8, multi: 13, fill: 13, match: 13, order: 13, open: 45 };
function esEst2(qs) { return (qs || []).reduce((s, q) => s + (EX_EST[q.type] || 10), 0); }
function esFmtEst2(sec) { return sec >= 60 ? `~${Math.round(sec / 60)} min` : `~${sec}s`; }

function EsameEditorHub() {
  const T = window.SSA_EXAM?.TEMPLATES || {};
  const [fam, setFam] = EX_useState("nihonshu");
  const [section, setSection] = EX_useState("day0"); // day0..dayN | feedback | esame | risultati
  const [activeQ, setActiveQ] = EX_useState(0);
  const [unlocked, setUnlocked] = EX_useState(false); // org-only edit mode

  const tpl = T[fam] || {};
  const miniDays = tpl.miniTests || [];

  const selectFam = (f) => {
    setActiveQ(0);
    if (section.startsWith("day")) {
      const di = parseInt(section.slice(3), 10) || 0;
      const newDays = (T[f]?.miniTests || []).length;
      if (di >= newDays) setSection("day0");
    }
    setFam(f);
  };
  const selectSection = (s) => { setSection(s); setActiveQ(0); };

  let mode = "questions"; // questions | feedback | risultati
  let questions = [], headerName = "", headerMeta = "";
  if (section === "feedback") {
    mode = "feedback";
    questions = tpl.feedback?.questions || [];
    headerName = tpl.feedback?.name;
    headerMeta = `${questions.length} domande · inviato come link agli studenti`;
  } else if (section === "esame") {
    questions = tpl.finalExam?.questions || [];
    headerName = tpl.finalExam?.name;
    headerMeta = `${tpl.finalExam?.cats?.length} capitoli · ${questions.length} domande · tempo stimato ${esFmtEst2(esEst2(questions))}`;
  } else {
    const di = parseInt(section.slice(3), 10) || 0;
    const d = miniDays[di];
    questions = d?.questions || [];
    headerName = d?.name;
    headerMeta = `${d?.topic} · ${questions.length} domande · tempo stimato ${esFmtEst2(esEst2(questions))}`;
  }
  const q = questions[activeQ] || questions[0];

  return (
    <>
      <a className="btn btn-sm btn-ghost" href="#/esami" style={{ marginBottom: 14 }}><EX_Icon name="arrow-l" size={12}/>Esami & test</a>
      <EX_PageHeader
        eyebrow="Esami & test"
        title="Libreria esami & test"
        sub="Le domande sono il template ufficiale, uguale per tutti i corsi della famiglia. In sola lettura: la modifica è riservata all'organizzazione. Organizzato per famiglia (Nihonshu · Shochu) e per fase: Test Day, Feedback, Esame."
      />

      {/* Lock banner */}
      <div className="card card-pad" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 14, background: unlocked ? "var(--warning-bg, #fdf6e3)" : "var(--surface-2)", border: "1px solid " + (unlocked ? "var(--warning, #d9a441)" : "var(--border)"), boxShadow: "none" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: unlocked ? "var(--warning, #d9a441)" : "var(--navy)", color: "white", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <EX_Icon name={unlocked ? "unlock" : "lock"} size={17}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{unlocked ? "Modalità organizzazione attiva" : "Template ufficiale · bloccato"}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
            {unlocked
              ? "Le modifiche qui cambiano il template per tutti i corsi della famiglia. Ricordati di salvare."
              : "Manager ed educator consultano domande e risposte. Solo l'organizzazione può modificare il template."}
          </div>
        </div>
        <button className={`btn btn-sm ${unlocked ? "" : "btn-primary"}`} onClick={() => setUnlocked(u => !u)}>
          <EX_Icon name={unlocked ? "lock" : "unlock"} size={12}/>{unlocked ? "Blocca template" : "Sblocca modifica (Organizzazione)"}
        </button>
      </div>
      <div style={{ marginTop: -8, marginBottom: 18, paddingLeft: 4, fontSize: 11, color: "var(--text-4)", display: "flex", alignItems: "center", gap: 6 }}>
        <EX_Icon name="info" size={11}/>In arrivo: lo sblocco sarà visibile solo ai ruoli <strong>Admin</strong> e <strong>Manager</strong>; gli altri vedono in sola lettura.
      </div>


      {/* Macro family */}
      <div className="segmented" style={{ marginBottom: 14 }}>
        {[["nihonshu","Nihonshu · Certificato"],["shochu","Shochu"]].map(([k,l]) => (
          <button key={k} className={fam === k ? "on" : ""} onClick={() => selectFam(k)}>{l}</button>
        ))}
      </div>

      {/* Sub-section tabs (mirror del menu esami del corso) — Test Day dinamici per famiglia */}
      <div className="tabs" style={{ marginBottom: 18, overflowX: "auto", flexWrap: "nowrap" }}>
        {miniDays.map((d, i) => (
          <button key={i} className={`tab ${section === "day" + i ? "active" : ""}`} onClick={() => selectSection("day" + i)} style={{ whiteSpace: "nowrap" }}>Test Day {d.day}</button>
        ))}
        <button className={`tab ${section === "feedback" ? "active" : ""}`} onClick={() => selectSection("feedback")} style={{ whiteSpace: "nowrap" }}>Feedback</button>
        <button className={`tab ${section === "esame" ? "active" : ""}`} onClick={() => selectSection("esame")} style={{ whiteSpace: "nowrap" }}>Esame</button>
      </div>

      {/* Header */}
      <div className="card card-pad" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{headerName}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{headerMeta}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {unlocked ? (
            <>
              <button className="btn btn-sm"><EX_Icon name="copy" size={12}/>Duplica template</button>
              <button className="btn btn-sm btn-primary"><EX_Icon name="save" size={12}/>Salva modifiche</button>
            </>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
              <EX_Icon name="lock" size={12}/>Sola lettura
            </span>
          )}
        </div>
      </div>

      {mode === "feedback" ? (
        <FeedbackEditor questions={questions} readOnly={!unlocked}/>
      ) : (
        <QuestionBankEditor key={fam + "/" + section} questions={questions} cats={section === "esame" ? (tpl.finalExam?.cats || []) : null} readOnly={!unlocked}/>
      )}
    </>
  );
}

// Editor domande con capitoli (titolo + sottotitolo), riordino su/giù, scelta tipologia
function QuestionBankEditor({ questions, cats, readOnly }) {
  const ro = !!readOnly;

  const buildChapters = () => {
    if (cats && cats.length && questions[0]?.cat) {
      const chs = cats.map(c => ({
        id: "ch-" + c.id, title: c.label, subtitle: "",
        questions: questions.filter(q => q.cat === c.id).map(q => ({ ...q }))
      })).filter(ch => ch.questions.length);
      // questions without a known cat → "Altre domande"
      const known = new Set(cats.map(c => c.id));
      const orphan = questions.filter(q => !known.has(q.cat));
      if (orphan.length) chs.push({ id: "ch-altre", title: "Altre domande", subtitle: "", questions: orphan.map(q => ({ ...q })) });
      return chs.length ? chs : [{ id: "ch1", title: "Capitolo 1", subtitle: "", questions: [] }];
    }
    return [{ id: "ch1", title: "Domande", subtitle: "", questions: questions.map(q => ({ ...q })) }];
  };

  const [chapters, setChapters] = EX_useState(buildChapters);
  const [active, setActive] = EX_useState({ ci: 0, qi: 0 });

  const activeQ = chapters[active.ci]?.questions[active.qi] || null;
  const totalQ = chapters.reduce((s, c) => s + c.questions.length, 0);

  const newQuestion = (type) => {
    const id = "q-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const base = { id, type, lang: "it", points: type === "open" ? 3 : 1, important: false, text: "Nuova domanda" };
    if (type === "single" || type === "multi" || type === "image") { base.options = ["Opzione 1", "Opzione 2", "Opzione 3"]; base.correct = [0]; }
    if (type === "truefalse") { base.options = ["Vero", "Falso"]; base.correct = [0]; }
    if (type === "fill") base.correct = ["risposta"];
    if (type === "match") base.pairs = [{ l: "A", r: "1" }, { l: "B", r: "2" }];
    if (type === "order") base.items = ["Primo", "Secondo", "Terzo"];
    return base;
  };

  const mutate = (fn) => setChapters(prev => fn(prev.map(c => ({ ...c, questions: c.questions.slice() }))));

  const addChapter = () => setChapters(prev => [...prev, { id: "ch-" + Date.now().toString(36), title: "Nuovo capitolo", subtitle: "", questions: [] }]);
  const setChapterField = (ci, field, val) => mutate(chs => { chs[ci] = { ...chs[ci], [field]: val }; return chs; });
  const removeChapter = (ci) => { mutate(chs => { chs.splice(ci, 1); return chs; }); setActive({ ci: 0, qi: 0 }); };
  const addQuestion = (ci, type) => {
    mutate(chs => { chs[ci].questions.push(newQuestion(type)); return chs; });
    setActive({ ci, qi: chapters[ci].questions.length });
  };
  const moveQuestion = (ci, qi, dir) => {
    const tgt = qi + dir;
    if (tgt < 0 || tgt >= chapters[ci].questions.length) return;
    mutate(chs => { const a = chs[ci].questions; [a[qi], a[tgt]] = [a[tgt], a[qi]]; return chs; });
    setActive(act => (act.ci === ci && act.qi === qi) ? { ci, qi: tgt } : act);
  };
  const changeType = (ci, qi, type) => {
    mutate(chs => {
      const q = { ...chs[ci].questions[qi], type };
      if ((type === "single" || type === "multi" || type === "image") && !q.options) { q.options = ["Opzione 1", "Opzione 2", "Opzione 3"]; q.correct = [0]; }
      if (type === "truefalse") { q.options = ["Vero", "Falso"]; q.correct = q.correct || [0]; }
      chs[ci].questions[qi] = q; return chs;
    });
  };

  return (
    <div className="card" style={{ overflow: "hidden", display: "grid", gridTemplateColumns: "320px 1fr", minHeight: 560 }}>
      {/* LEFT: chapters + questions */}
      <div style={{ background: "var(--surface-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", maxHeight: 620 }}>
          {chapters.map((ch, ci) => (
            <div key={ch.id} style={{ borderBottom: "1px solid var(--border)" }}>
              {/* Chapter header */}
              <div style={{ padding: "12px 14px 10px", background: "var(--surface)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="eyebrow" style={{ flex: 1 }}>Capitolo {ci + 1}</span>
                  {!ro && chapters.length > 1 && <button className="btn btn-icon btn-sm btn-ghost" title="Rimuovi capitolo" onClick={() => removeChapter(ci)}><EX_Icon name="trash" size={11}/></button>}
                </div>
                {ro ? (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{ch.title}</div>
                    {ch.subtitle && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1 }}>{ch.subtitle}</div>}
                  </>
                ) : (
                  <>
                    <input className="input" value={ch.title} onChange={e => setChapterField(ci, "title", e.target.value)} placeholder="Titolo capitolo" style={{ height: 28, fontSize: 13.5, fontWeight: 600, marginTop: 2, padding: "0 6px" }}/>
                    <input className="input" value={ch.subtitle} onChange={e => setChapterField(ci, "subtitle", e.target.value)} placeholder="Sottotitolo / commento…" style={{ height: 26, fontSize: 11.5, marginTop: 4, padding: "0 6px", color: "var(--text-2)" }}/>
                  </>
                )}
              </div>
              {/* Questions */}
              {ch.questions.map((qq, qi) => {
                const sel = active.ci === ci && active.qi === qi;
                return (
                  <div key={qq.id} style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border-2)", background: sel ? "var(--surface)" : "transparent", borderLeft: sel ? "3px solid var(--indigo)" : "3px solid transparent" }}>
                    <button onClick={() => setActive({ ci, qi })} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 8px 10px 12px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)", minWidth: 20, paddingTop: 1 }}>{(qi + 1).toString().padStart(2, "0")}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{qq.text}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                          <EX_Badge tone="neutral">{EX_QT[qq.type] || qq.type}</EX_Badge>
                          <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>{qq.points || 1}pt · {(EX_EST[qq.type] || 10)}s</span>
                        </div>
                      </div>
                    </button>
                    {!ro && (
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6px", gap: 2 }}>
                        <button className="reorder-btn" title="Su" disabled={qi === 0} onClick={() => moveQuestion(ci, qi, -1)}><EX_Icon name="arrow-up" size={12}/></button>
                        <button className="reorder-btn" title="Giù" disabled={qi === ch.questions.length - 1} onClick={() => moveQuestion(ci, qi, 1)}><EX_Icon name="arrow-dn" size={12}/></button>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Add question to chapter */}
              {!ro && <AddQuestionRow onAdd={(t) => addQuestion(ci, t)}/>}
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          {!ro
            ? <button className="btn btn-sm" style={{ width: "100%" }} onClick={addChapter}><EX_Icon name="plus" size={12}/>Aggiungi capitolo</button>
            : <div style={{ fontSize: 11, color: "var(--text-4)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><EX_Icon name="lock" size={11}/>{chapters.length} capitoli · {totalQ} domande · sola lettura</div>}
        </div>
      </div>

      {/* RIGHT: detail */}
      <div style={{ padding: 24, overflow: "auto", maxHeight: 620 }}>
        {activeQ && window.V2_ExamParts?.QuestionEditor
          ? <window.V2_ExamParts.QuestionEditor q={activeQ} QT={EX_QT} readOnly={ro} onChangeType={(t) => changeType(active.ci, active.qi, t)}/>
          : <div className="text-3" style={{ padding: 20 }}>Seleziona o aggiungi una domanda.</div>}
      </div>
    </div>
  );
}

// Footer riga "Aggiungi domanda" con scelta tipologia (design system)
function AddQuestionRow({ onAdd }) {
  const [type, setType] = EX_useState("single");
  return (
    <div style={{ display: "flex", gap: 6, padding: "8px 12px", background: "var(--surface-2)" }}>
      <select className="select" value={type} onChange={e => setType(e.target.value)} style={{ height: 28, fontSize: 11.5, flex: 1 }}>
        {Object.entries(EX_QT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <button className="btn btn-sm" onClick={() => onAdd(type)}><EX_Icon name="plus" size={11}/>Domanda</button>
    </div>
  );
}

function FeedbackEditor({ questions, readOnly }) {
  const ro = !!readOnly;
  return (
    <div className="card card-pad-lg">
      <div className="eyebrow" style={{ marginBottom: 4 }}>Domande del modulo feedback</div>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
        Inviato agli studenti tramite link passwordless (accesso con la mail di registrazione, scade dopo l'uso). Stesso modulo per tutti i corsi della famiglia.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.map((f, i) => (
          <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 6 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", minWidth: 22 }}>{(i+1).toString().padStart(2,"0")}</span>
            <input className="input" defaultValue={f.text} readOnly={ro} style={ro
              ? { flex: 1, border: "1px solid transparent", background: "transparent", height: 30, cursor: "default", color: "var(--text-2)" }
              : { flex: 1, border: "1px solid transparent", background: "transparent", height: 30 }}
              onFocus={ro ? undefined : (e => { e.target.style.border = "1px solid var(--border)"; e.target.style.background = "var(--surface)"; })}
              onBlur={ro ? undefined : (e => { e.target.style.border = "1px solid transparent"; e.target.style.background = "transparent"; })}/>
            <EX_Badge tone="neutral">{EX_QT[f.type] || f.type}</EX_Badge>
            {!ro && <button className="btn btn-icon btn-sm btn-ghost"><EX_Icon name="trash" size={11}/></button>}
          </div>
        ))}
        {!ro && <button className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: 6 }}><EX_Icon name="plus" size={11}/>Aggiungi domanda</button>}
      </div>
    </div>
  );
}

window.V2_PageEsami = V2_PageEsami;
