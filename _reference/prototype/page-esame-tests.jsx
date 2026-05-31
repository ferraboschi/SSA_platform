// V2 Esame — Test runner + cruscotto live (in-page, light)
// Un componente unico per: Test Day N (mini-test), Prova esame (simulazione), Feedback.
// Link passwordless + copia, Start/Stop, timer (dove serve), cruscotto live espandibile,
// per-partecipante (date/corrette/sbagliate/mancanti) con drill-down, e per-domanda (% + distribuzione).

const { Icon: T_Icon, Avatar: T_Avatar, Badge: T_Badge } = window.V2;

// ---------- helpers ----------
const T_BASE = "esami.sakesommelierassociation.it";
function t_tok(course, key) {
  return (SSA.seed(course.handle + key) % 0xffffffff).toString(16).padStart(8, "0").slice(0, 8);
}
function t_pointsTotal(qs) { return qs.reduce((s, q) => s + (q.points || 1), 0); }

// Build the ordered list of tests for a course: Day 1..N + Prova esame
function buildTests(course, exam) {
  const meta = course.examMeta;
  const fam = exam.family === "shochu" ? "shochu" : "nihonshu";
  const tpl = (window.SSA_EXAM?.TEMPLATES || {})[fam];
  const out = [];
  (meta?.miniTests || []).forEach((m, i) => {
    const tplDay = tpl?.miniTests?.[i] || tpl?.miniTests?.[tpl.miniTests.length - 1];
    let state = "bozza";
    if (meta.done) state = "chiuso";
    else if (meta.live) state = m.status === "completato" ? "chiuso" : "bozza";
    out.push({
      key: "day" + m.day, kind: "minitest", tag: "D" + m.day, shortLabel: "Day " + m.day,
      title: m.name, topic: m.topic, when: `Fine Giorno ${m.day}`,
      questions: (tplDay?.questions || []).map(q => ({ ...q })),
      hasScore: true, hasTimer: false, state
    });
  });
  // Prova esame — simulazione dell'esame finale (sottoinsieme)
  const provaQs = exam.questions.slice(0, 20).map((q, i) => ({ ...q, n: i + 1 }));
  let provaState = "bozza";
  if (meta?.done) provaState = "chiuso";
  else if (meta?.live) provaState = "aperto"; // demo: simulazione in corso
  out.push({
    key: "prova", kind: "prova", tag: "P", shortLabel: "Prova esame",
    title: `Prova esame · ${fam === "shochu" ? "Shochu" : "Nihonshu"}`,
    topic: "Simulazione dell'esame finale (non certifica)", when: "Prima dell'esame finale",
    questions: provaQs, hasScore: true, hasTimer: true, duration: 45, state: provaState
  });
  // Esame finale — quello che certifica, ~1 settimana dopo l'ultimo giorno
  const esameQs = exam.questions.slice(0, 30).map((q, i) => ({ ...q, n: i + 1 }));
  const esameState = meta?.done ? "chiuso" : "bozza"; // si apre il giorno dell'esame
  out.push({
    key: "esame", kind: "esame", tag: "E", shortLabel: "Esame",
    title: `Esame finale · ${fam === "shochu" ? "Shochu" : "Nihonshu"}`,
    topic: `Esame di certificazione · Giorno ${meta?.examDayNo} · ${meta?.examDateLabel}`,
    when: `Giorno ${meta?.examDayNo}`,
    questions: esameQs, hasScore: true, hasTimer: true, duration: exam.duration || 60, state: esameState,
    isFinal: true
  });
  return out;
}

// Deterministic per-test roster
function buildRoster(course, test) {
  const studs = (course.students || []).slice(0, course.enrolled);
  const qs = test.questions;
  const totalPts = t_pointsTotal(qs);
  return studs.map(s => {
    const k = SSA.seed(s.email + course.handle + test.key);
    const ability = 55 + (k % 44); // 55–98
    let conn;
    if (test.state === "chiuso") conn = (k % 100 < 94) ? "submitted" : "absent";
    else if (test.state === "aperto") {
      const b = k % 100;
      conn = b < 8 ? "absent" : b < 26 ? "waiting" : b < 72 ? "in-progress" : "submitted";
    } else conn = "absent"; // bozza: link non ancora aperto

    const progressTarget = conn === "submitted" ? qs.length
      : conn === "in-progress" ? Math.max(1, Math.round(qs.length * ((30 + (k % 60)) / 100)))
      : 0;

    const answers = qs.map((q, qi) => {
      const kk = SSA.seed(s.email + test.key + qi);
      const answered = qi < progressTarget;
      if (!answered) return { answered: false, correct: false, timeSec: null, given: null };
      const correct = test.hasScore ? (kk % 100) < ability : true;
      let given = null;
      if (q.options && q.options.length) {
        if (test.hasScore) {
          given = correct ? (q.correct ? q.correct[0] : 0)
            : (((q.correct ? q.correct[0] : 0) + 1 + (kk % Math.max(1, q.options.length - 1))) % q.options.length);
        } else given = kk % q.options.length;
      }
      return { answered: true, correct, timeSec: 18 + (kk % 110), given };
    });

    const nAnswered = answers.filter(a => a.answered).length;
    const nCorrect = answers.filter(a => a.correct && a.answered).length;
    const nWrong = answers.filter(a => a.answered && !a.correct).length;
    const nMissing = qs.length - nAnswered;
    const corrPts = qs.reduce((sum, q, qi) => sum + (answers[qi].correct && answers[qi].answered ? (q.points || 1) : 0), 0);
    const score = totalPts ? Math.round(corrPts / totalPts * 100) : 0;
    const totalTime = answers.reduce((sum, a) => sum + (a.timeSec || 0), 0);
    return { name: s.name, email: s.email, conn, checkedIn: conn !== "absent",
      answers, nAnswered, nCorrect, nWrong, nMissing, score, totalTime };
  });
}

const CONN_META = {
  submitted: { label: "Consegnato", tone: "success", dot: "var(--success)" },
  "in-progress": { label: "In corso", tone: "indigo", dot: "var(--indigo)" },
  waiting: { label: "In attesa", tone: "warning", dot: "var(--warning)" },
  absent: { label: "Non connesso", tone: "neutral", dot: "var(--text-mute)" }
};

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ============================================================ //
function TestRunner({ course, exam, test }) {
  const [state, setState] = useState(test.state); // bozza | aperto | chiuso
  const [dashOpen, setDashOpen] = useState(test.state === "aperto" || test.state === "chiuso");
  const [copied, setCopied] = useState(false);
  const [openRow, setOpenRow] = useState(null);
  const [dashView, setDashView] = useState(test.state === "bozza" ? "domande" : "partecipanti"); // partecipanti | domande
  const roster = useMemo(() => buildRoster(course, { ...test, state }), [course.id, test.key, state]);

  // Timer (solo se hasTimer e stato aperto)
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!test.hasTimer || state !== "aperto") return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [test.hasTimer, state]);
  const totalSec = (test.duration || 0) * 60;
  const remaining = Math.max(0, totalSec - elapsed);

  const link = `${T_BASE}/${test.kind === "prova" ? "p" : test.kind === "esame" ? "e" : "t"}/${t_tok(course, test.key)}`;
  const copy = () => { if (navigator.clipboard) navigator.clipboard.writeText("https://" + link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  const connected = roster.filter(r => r.checkedIn).length;
  const inProg = roster.filter(r => r.conn === "in-progress").length;
  const submitted = roster.filter(r => r.conn === "submitted").length;
  const submittedRows = roster.filter(r => r.score != null && (r.conn === "submitted"));
  const avg = submittedRows.length ? Math.round(submittedRows.reduce((s, r) => s + r.score, 0) / submittedRows.length) : null;

  const stateBadge = { bozza: { label: "Bozza · link chiuso", tone: "neutral" }, aperto: { label: "Aperto · link attivo", tone: "indigo" }, chiuso: { label: "Chiuso", tone: "success" } }[state];

  const start = () => { setState("aperto"); setDashOpen(true); setElapsed(0); };
  const stop = () => { setState("chiuso"); };
  const reopen = () => { setState("aperto"); };

  return (
    <div>
      {/* HEADER + LINK + CONTROLS */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ padding: "18px 22px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: (test.kind === "prova" || test.kind === "esame") ? "var(--navy)" : "var(--indigo)", color: "white", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 15 }}>{test.tag}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{test.title}</div>
                <T_Badge tone={stateBadge.tone} dot={state === "aperto"}>{stateBadge.label}</T_Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3 }}>{test.topic} · {test.questions.length} domande · {test.when}{test.hasTimer ? ` · tempo ${test.duration}'` : " · senza tempo"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {test.hasTimer && state === "aperto" && (
              <div style={{ textAlign: "right" }}>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)", color: remaining < 300 ? "var(--danger-fg)" : "var(--text)" }}>{fmtClock(remaining)}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>tempo rimasto</div>
              </div>
            )}
            {state === "bozza" && <button className="btn btn-primary" onClick={start}><T_Icon name="play" size={13}/>{test.isFinal ? "Avvia esame" : "Avvia test"}</button>}
            {state === "aperto" && <button className="btn btn-danger" onClick={stop}><T_Icon name="stop" size={12}/>Ferma & chiudi</button>}
            {state === "chiuso" && <button className="btn" onClick={reopen}><T_Icon name="refresh" size={12}/>Riapri</button>}
          </div>
        </div>

        {/* link row */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: state === "bozza" ? "var(--text-mute)" : "var(--success)" }}></span>
            Link {state === "bozza" ? "non ancora attivo" : "passwordless"}
          </span>
          <code style={{ flex: 1, minWidth: 200, fontFamily: "var(--font-mono)", fontSize: 12, color: state === "bozza" ? "var(--text-4)" : "var(--text-2)", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "7px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</code>
          <button className="btn btn-sm" onClick={copy} disabled={state === "bozza"} style={copied ? { color: "var(--success-fg)", borderColor: "var(--success)" } : undefined}>
            <T_Icon name={copied ? "check" : "copy"} size={12}/>{copied ? "Copiato" : "Copia link"}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-4)", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
            <T_Icon name="smartphone" size={12}/>Pagina responsive · check-in con la mail di registrazione
          </span>
        </div>
      </div>

      {/* LIVE DASHBOARD */}
      <div className="card">
        <div className="card-head" style={{ alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            {state === "aperto" && <span className="s-dot success pulse" style={{ width: 9, height: 9 }}></span>}
            <div className="h3">Cruscotto {state === "aperto" ? "live" : "esiti"}</div>
            <T_Badge tone="neutral">{connected}/{roster.length} connessi</T_Badge>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {dashOpen && (
              <div className="segmented sm">
                <button className={dashView === "partecipanti" ? "on" : ""} onClick={() => setDashView("partecipanti")}>Per partecipante</button>
                <button className={dashView === "domande" ? "on" : ""} onClick={() => setDashView("domande")}>Per domanda</button>
              </div>
            )}
            <button className="btn btn-sm" onClick={() => setDashOpen(o => !o)}><T_Icon name="chevron-d" size={12} className={dashOpen ? "flip-up" : ""}/>{dashOpen ? "Comprimi" : "Espandi"}</button>
          </div>
        </div>

        {/* summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: test.hasScore ? "repeat(4,1fr)" : "repeat(3,1fr)", borderBottom: dashOpen ? "1px solid var(--border-2)" : "none" }}>
          <DashStat label="Connessi" value={`${connected}/${roster.length}`} icon="users"/>
          <DashStat label="In corso" value={inProg} icon="edit" tone="indigo"/>
          <DashStat label="Consegnati" value={submitted} icon="check" tone="success"/>
          {test.hasScore && <DashStat label="Media classe" value={avg != null ? `${avg}%` : "—"} icon="trending" last/>}
        </div>

        {dashOpen && dashView === "domande" && (
          <QuestionStats roster={roster} test={test}/>
        )}
        {dashOpen && dashView === "partecipanti" && state === "bozza" && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-4)" }}>
            <T_Icon name="play" size={22} className="text-4"/>
            <div style={{ fontSize: 13.5, marginTop: 10, fontWeight: 500, color: "var(--text-3)" }}>Test non ancora avviato</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Premi <strong>Avvia test</strong> per attivare il link: gli studenti faranno il check-in con la mail e compariranno qui in tempo reale.<br/>Intanto puoi consultare le domande e le risposte corrette in <strong>Per domanda</strong>.</div>
          </div>
        )}
        {dashOpen && dashView === "partecipanti" && state !== "bozza" && (
          <ParticipantTable roster={roster} test={test} openRow={openRow} setOpenRow={setOpenRow}/>
        )}
      </div>
    </div>
  );
}

function DashStat({ label, value, icon, tone, last }) {
  return (
    <div style={{ padding: "16px 20px", borderRight: last ? "none" : "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: tone === "success" ? "var(--success-bg)" : tone === "indigo" ? "var(--indigo-50)" : "var(--surface-2)", color: tone === "success" ? "var(--success-fg)" : tone === "indigo" ? "var(--indigo-600)" : "var(--text-3)", display: "grid", placeItems: "center" }}><T_Icon name={icon} size={15}/></div>
      <div>
        <div className="num" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

// ---------- Per-partecipante (con drill-down) ----------
function ParticipantTable({ roster, test, openRow, setOpenRow }) {
  const order = { "in-progress": 0, submitted: 1, waiting: 2, absent: 3 };
  const sorted = [...roster].sort((a, b) => (order[a.conn] - order[b.conn]) || (b.score - a.score));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1.4fr 0.7fr 32px", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--border-2)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "var(--ls-caps)", color: "var(--text-4)", fontWeight: 600 }}>
        <span>Partecipante</span><span>Stato</span><span>Risposte</span>{test.hasScore ? <span style={{ textAlign: "right" }}>Punteggio</span> : <span></span>}<span></span>
      </div>
      {sorted.map(r => {
        const cm = CONN_META[r.conn];
        const isOpen = openRow === r.email;
        return (
          <div key={r.email} style={{ borderBottom: "1px solid var(--border-2)" }}>
            <div
              onClick={() => r.checkedIn && setOpenRow(isOpen ? null : r.email)}
              style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1.4fr 0.7fr 32px", gap: 12, padding: "12px 20px", alignItems: "center", cursor: r.checkedIn ? "pointer" : "default", background: isOpen ? "var(--surface-2)" : "transparent" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <T_Avatar name={r.name} size="sm"/>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.email}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: cm.dot }}></span>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{cm.label}</span>
              </div>
              {r.checkedIn ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5 }}>
                  {test.hasScore && <span style={{ color: "var(--success-fg)", display: "inline-flex", alignItems: "center", gap: 3 }}><T_Icon name="check" size={11}/>{r.nCorrect}</span>}
                  {test.hasScore && <span style={{ color: "var(--danger-fg)", display: "inline-flex", alignItems: "center", gap: 3 }}><T_Icon name="x" size={11}/>{r.nWrong}</span>}
                  {!test.hasScore && <span style={{ color: "var(--text-2)" }}>{r.nAnswered} date</span>}
                  <span style={{ color: "var(--text-4)" }}>{r.nMissing} mancanti</span>
                </div>
              ) : <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>—</span>}
              {test.hasScore ? (
                <div style={{ textAlign: "right" }}>
                  {r.conn === "submitted" ? <span className="num" style={{ fontSize: 14, fontWeight: 700, color: r.score >= 80 ? "var(--success-fg)" : r.score >= 70 ? "var(--warning-fg)" : "var(--danger-fg)" }}>{r.score}%</span>
                    : r.conn === "in-progress" ? <span style={{ fontSize: 11, color: "var(--text-4)" }}>in corso</span>
                    : <span style={{ fontSize: 11, color: "var(--text-4)" }}>—</span>}
                </div>
              ) : <span></span>}
              <div style={{ textAlign: "center", color: "var(--text-4)" }}>{r.checkedIn && <T_Icon name="chevron-d" size={13} className={isOpen ? "flip-up" : ""}/>}</div>
            </div>
            {isOpen && <ParticipantDetail r={r} test={test}/>}
          </div>
        );
      })}
    </div>
  );
}

function ParticipantDetail({ r, test }) {
  return (
    <div style={{ padding: "6px 20px 18px 20px", background: "var(--surface-2)", animation: "expandIn 160ms var(--ease-out)" }}>
      <div style={{ display: "flex", gap: 18, padding: "10px 0 14px", fontSize: 12, color: "var(--text-3)", flexWrap: "wrap" }}>
        {test.hasScore && <span><strong className="num" style={{ color: "var(--success-fg)" }}>{r.nCorrect}</strong> corrette</span>}
        {test.hasScore && <span><strong className="num" style={{ color: "var(--danger-fg)" }}>{r.nWrong}</strong> sbagliate</span>}
        <span><strong className="num">{r.nMissing}</strong> mancanti</span>
        <span>tempo totale <strong className="num">{fmtClock(r.totalTime)}</strong></span>
        {test.hasScore && r.conn === "submitted" && <span style={{ marginLeft: "auto" }}>punteggio <strong className="num">{r.score}%</strong></span>}
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, overflow: "hidden" }}>
        {test.questions.map((q, qi) => {
          const a = r.answers[qi];
          const givenText = q.options && a.given != null ? q.options[a.given] : (a.answered ? "(risposta inviata)" : null);
          const correctText = q.options && q.correct ? q.correct.map(i => q.options[i]).join(", ") : "—";
          return (
            <div key={qi} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 10, padding: "10px 14px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none", alignItems: "start" }}>
              <div style={{ paddingTop: 1 }}>
                {!a.answered ? <span title="Mancante" style={{ width: 16, height: 16, borderRadius: "50%", border: "1.5px dashed var(--border-strong)", display: "inline-block" }}></span>
                  : !test.hasScore ? <T_Icon name="check" size={14} className="text-3"/>
                  : a.correct ? <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--success)", color: "white", display: "grid", placeItems: "center" }}><T_Icon name="check" size={10}/></span>
                  : <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--danger)", color: "white", display: "grid", placeItems: "center" }}><T_Icon name="x" size={10}/></span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: a.answered ? 4 : 0 }}><span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>{(qi+1).toString().padStart(2,"0")}</span>{q.text}</div>
                {a.answered && (
                  <div style={{ fontSize: 11.5, display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
                    <span style={{ color: test.hasScore ? (a.correct ? "var(--success-fg)" : "var(--danger-fg)") : "var(--text-2)" }}>Risposta: <strong>{givenText}</strong></span>
                    {test.hasScore && !a.correct && <span style={{ color: "var(--text-3)" }}>Corretta: <strong>{correctText}</strong></span>}
                  </div>
                )}
                {!a.answered && <span style={{ fontSize: 11, color: "var(--text-4)" }}>non risposta</span>}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{a.timeSec != null ? fmtClock(a.timeSec) : "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Per-domanda (% corrette + distribuzione) ----------
function QuestionStats({ roster, test }) {
  return (
    <div>
      {test.questions.map((q, qi) => {
        const ans = roster.map(r => r.answers[qi]).filter(a => a.answered);
        const nCorrect = ans.filter(a => a.correct).length;
        const pct = ans.length ? Math.round(nCorrect / ans.length * 100) : 0;
        // distribution over options
        const dist = (q.options || []).map((opt, oi) => ({
          opt, oi, count: ans.filter(a => a.given === oi).length,
          correct: q.correct ? q.correct.includes(oi) : false
        }));
        const maxCount = Math.max(1, ...dist.map(d => d.count));
        const tone = !test.hasScore ? "var(--indigo)" : pct >= 70 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
        return (
          <div key={qi} style={{ padding: "14px 20px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: dist.length ? 10 : 0 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", paddingTop: 2 }}>{(qi+1).toString().padStart(2,"0")}</span>
              <div style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{q.text}</div>
              {test.hasScore && (
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span className="num" style={{ fontSize: 15, fontWeight: 700, color: tone }}>{pct}%</span>
                  <div style={{ fontSize: 10, color: "var(--text-4)" }}>{nCorrect}/{ans.length} corrette</div>
                </div>
              )}
              {!test.hasScore && <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>{ans.length} risposte</span>}
            </div>
            {dist.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 23 }}>
                {dist.map(d => (
                  <div key={d.oi} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 150, fontSize: 11.5, color: d.correct && test.hasScore ? "var(--success-fg)" : "var(--text-3)", fontWeight: d.correct && test.hasScore ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {d.correct && test.hasScore && <T_Icon name="check" size={10} style={{ color: "var(--success)" }}/>}{d.opt}
                    </span>
                    <div className="bar" style={{ flex: 1, maxWidth: 240 }}><i style={{ width: (d.count / maxCount * 100) + "%", background: d.correct && test.hasScore ? "var(--success)" : "var(--indigo)" }}></i></div>
                    <span className="num" style={{ fontSize: 11, color: "var(--text-3)", minWidth: 20 }}>{d.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ paddingLeft: 23, fontSize: 11.5, color: "var(--text-4)" }}>Domanda aperta · valutazione {test.hasScore ? "AI + revisione" : "testuale"}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================ //
// FEEDBACK runner — come un test, senza punteggio/giusto-sbagliato
function FeedbackRunner({ course, exam }) {
  const meta = course.examMeta;
  const fam = exam.family === "shochu" ? "shochu" : "nihonshu";
  const tpl = (window.SSA_EXAM?.TEMPLATES || {})[fam];
  const fb = tpl?.feedback;
  const fbTest = {
    key: "feedback", kind: "feedback", tag: "F", title: fb?.name || "Feedback",
    topic: "Modulo di fine corso · senza punteggio", when: "Fine corso",
    questions: (fb?.questions || []).map(q => ({ ...q })),
    hasScore: false, hasTimer: true, duration: 15,
    state: meta?.done ? "chiuso" : (meta?.live ? "aperto" : "bozza")
  };
  return (
    <div>
      <TestRunner course={course} exam={exam} test={fbTest}/>
      <FeedbackAggregate course={course} test={fbTest}/>
    </div>
  );
}

// Risposte aggregate del feedback (no giusto/sbagliato)
function FeedbackAggregate({ course, test }) {
  const roster = useMemo(() => buildRoster(course, test), [course.id, test.state]);
  const answeredRoster = roster.filter(r => r.conn === "submitted" || r.conn === "in-progress");
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-head"><div className="h3">Risposte aggregate</div><span style={{ fontSize: 11.5, color: "var(--text-4)" }}>{answeredRoster.length} risposte</span></div>
      <div>
        {test.questions.map((q, qi) => {
          const ans = answeredRoster.map(r => r.answers[qi]).filter(a => a.answered);
          if (q.type === "rating") {
            // synth ratings 1-5 from seed
            const ratings = answeredRoster.map(r => 3 + (SSA.seed(r.email + test.key + qi + "rt") % 3)); // 3..5
            const avg = ratings.length ? (ratings.reduce((s, v) => s + v, 0) / ratings.length) : 0;
            const buckets = [1,2,3,4,5].map(v => ratings.filter(x => x === v).length);
            const mx = Math.max(1, ...buckets);
            return (
              <div key={qi} style={{ padding: "14px 20px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13 }}><span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>{(qi+1).toString().padStart(2,"0")}</span>{q.text}</span>
                  <span className="num" style={{ fontSize: 15, fontWeight: 700, color: "var(--oro)" }}>{avg.toFixed(1)}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 44, paddingLeft: 23 }}>
                  {buckets.map((n, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ width: "60%", height: (n / mx * 32) + 2, background: "var(--oro)", borderRadius: "2px 2px 0 0" }}></div>
                      <span style={{ fontSize: 9.5, color: "var(--text-4)" }}>{i + 1}★</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          if (q.options) {
            const dist = q.options.map((opt, oi) => ({ opt, count: ans.filter(a => a.given === oi).length }));
            const mx = Math.max(1, ...dist.map(d => d.count));
            return (
              <div key={qi} style={{ padding: "14px 20px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}>
                <div style={{ fontSize: 13, marginBottom: 10 }}><span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>{(qi+1).toString().padStart(2,"0")}</span>{q.text}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 23 }}>
                  {dist.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 150, fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.opt}</span>
                      <div className="bar" style={{ flex: 1, maxWidth: 240 }}><i style={{ width: (d.count / mx * 100) + "%", background: "var(--indigo)" }}></i></div>
                      <span className="num" style={{ fontSize: 11, color: "var(--text-3)", minWidth: 20 }}>{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          // open
          return (
            <div key={qi} style={{ padding: "14px 20px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}><span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>{(qi+1).toString().padStart(2,"0")}</span>{q.text}</div>
              <div style={{ paddingLeft: 23, fontSize: 11.5, color: "var(--text-4)" }}><T_Icon name="edit" size={11}/> {ans.length} risposte testuali · apri per leggerle</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.V2_ExamTests = { buildTests, TestRunner, FeedbackRunner };
