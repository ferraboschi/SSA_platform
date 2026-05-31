// V2 Esame Live — cruscotto controllo dark mode
const { Icon: EL_Icon } = window.V2;

function V2_PageEsameLive({ id }) {
  const course = SSA.COURSES.find(c => c.id === id);
  if (!course || !course.exam) return <div style={{ padding: 80, textAlign: "center", color: "var(--text-3)" }}>Esame non trovato. <a className="link" href="#/corsi">Torna</a></div>;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 4000);
    return () => clearInterval(t);
  }, []);

  const live = useMemo(() => {
    const base = course.examLive || [];
    return base.map((s, i) => {
      if (s.status === "submitted" || s.status === "not-started") return s;
      const newProg = Math.min(100, s.progress + (tick * 3 + (i % 4)));
      const newStatus = newProg >= 100 ? "submitted" : "in-progress";
      return { ...s, progress: newProg, status: newStatus, score: newStatus === "submitted" ? Math.max(s.score || 75, 65 + (i*7) % 35) : null };
    });
  }, [tick, course]);

  const exam = course.exam;
  const elapsed = Math.min(exam.duration, 12 + tick * 2);
  const remaining = exam.duration - elapsed;

  const counts = {
    notStarted: live.filter(s => s.status === "not-started").length,
    inProgress: live.filter(s => s.status === "in-progress").length,
    submitted: live.filter(s => s.status === "submitted").length
  };
  const submittedScores = live.filter(s => s.status === "submitted").map(s => s.score).filter(Boolean);
  const avgScore = submittedScores.length ? Math.round(submittedScores.reduce((a,b) => a+b, 0) / submittedScores.length) : null;

  const buckets = Array(10).fill(0);
  submittedScores.forEach(sc => buckets[Math.min(9, Math.floor(sc / 10))]++);
  const maxBucket = Math.max(...buckets, 1);

  return (
    <div style={{ background: "#0A1124", color: "white", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ padding: "18px 28px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#0A1124", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <a href={`#/corsi/${course.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.6)", fontSize: 13, padding: "6px 10px", borderRadius: 6, transition: "background var(--dur-fast)" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <EL_Icon name="arrow-l" size={13}/>Torna al corso
          </a>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }}></div>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Cruscotto esame live</div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 2 }}>{course.shortTitle} <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>· {course.month} {course.year} · {course.city}</span></div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "rgba(0, 217, 36, 0.12)", border: "1px solid rgba(0, 217, 36, 0.3)", borderRadius: 999 }}>
            <span className="s-dot success pulse"></span>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", fontWeight: 600 }}>IN CORSO</span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
            {String(Math.floor(remaining)).padStart(2,"0")}:{String(Math.floor((remaining % 1) * 60)).padStart(2,"0")}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "none" }}>+5 min</button>
            <button className="btn btn-sm" style={{ background: "var(--warning)", color: "white", borderColor: "transparent", boxShadow: "none" }}><EL_Icon name="pause" size={11}/>Pausa</button>
            <button className="btn btn-sm btn-danger"><EL_Icon name="stop" size={11}/>Stop esame</button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ padding: "24px 28px", display: "grid", gridTemplateColumns: "repeat(4, 1fr) 1.5fr", gap: 28, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <LiveKpi label="Iscritti totali" value={live.length} sub={`${counts.notStarted} non iniziato`}/>
        <LiveKpi label="In svolgimento" value={counts.inProgress} accentColor="#8A82FF" sub={`media ${counts.inProgress ? Math.round(live.filter(s => s.status === "in-progress").reduce((s,x) => s+x.progress, 0) / counts.inProgress) : 0}% completato`}/>
        <LiveKpi label="Consegnati" value={counts.submitted} accentColor="#00D924" sub={`${Math.round(counts.submitted / live.length * 100)}% del totale`}/>
        <LiveKpi label="Media punteggio" value={avgScore !== null ? avgScore + "%" : "—"} sub={submittedScores.length ? `${submittedScores.filter(s => s >= 80).length} promossi / ${submittedScores.filter(s => s < 70).length} sotto soglia` : "in attesa"}/>

        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Distribuzione punteggi · live</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64 }}>
            {buckets.map((n, i) => {
              const color = i >= 8 ? "#00D924" : i === 7 ? "var(--warning)" : "var(--danger)";
              return (
                <div key={i} style={{ flex: 1, position: "relative", height: "100%", background: "rgba(255,255,255,0.04)", borderRadius: 2 }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: ((n/maxBucket) * 100) + "%", background: color, borderRadius: 2, minHeight: n > 0 ? 3 : 0, transition: "height 500ms var(--ease-out)" }}></div>
                </div>
              );
            })}
          </div>
          <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            <span>0%</span><span>50%</span><span style={{ color: "var(--warning)" }}>70%</span><span style={{ color: "#00D924" }}>80%</span><span>100%</span>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ padding: 28, display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Studenti</h2>
            <div className="segmented" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <button className="on" style={{ color: "white", background: "rgba(255,255,255,0.1)" }}>Tutti</button>
              <button style={{ color: "rgba(255,255,255,0.6)" }}>In corso</button>
              <button style={{ color: "rgba(255,255,255,0.6)" }}>Consegnati</button>
            </div>
          </div>
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
            {live.sort((a,b) => (b.progress - a.progress)).map((s, i) => <LiveRow key={s.email} s={s} last={i === live.length - 1}/>)}
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 14 }}>Attività recente</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {live.filter(s => s.status === "submitted").slice(0, 6).map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.score >= 80 ? "#00D924" : s.score >= 70 ? "var(--warning)" : "var(--danger)" }}></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>consegnato · {s.durationMin}m</div>
                </div>
                <span className="num" style={{ fontSize: 16, fontWeight: 600 }}>{s.score}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, padding: 18, background: "rgba(99, 91, 255, 0.1)", border: "1px solid rgba(99, 91, 255, 0.25)", borderRadius: 8 }}>
            <div style={{ fontSize: 10.5, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", fontWeight: 600, marginBottom: 8 }}><EL_Icon name="sparkle" size={10}/> Correzione AI</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{counts.submitted * 8} risposte</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.45, marginBottom: 12 }}>
              corrette automaticamente. <strong style={{ color: "white" }}>{Math.round(counts.submitted * 1.5)}</strong> domande aperte con bassa confidenza in coda di revisione.
            </div>
            <button className="btn btn-sm" style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "none" }}>Apri coda revisione</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveKpi({ label, value, sub, accentColor }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 600, color: accentColor || "white", lineHeight: 1, letterSpacing: "-0.02em" }} className="num">{value}</div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function LiveRow({ s, last }) {
  const tone = s.status === "submitted" ? (s.score >= 80 ? "#00D924" : s.score >= 70 ? "var(--warning)" : "var(--danger)") : s.status === "in-progress" ? "#635BFF" : "rgba(255,255,255,0.2)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 240px 90px auto", gap: 14, alignItems: "center", padding: "12px 16px", borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)", transition: "background var(--dur-fast)" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone }}></span>
      <div>
        <div style={{ fontSize: 13 }}>{s.name}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{s.checkedIn ? "✓ check-in" : "in attesa"}{s.status === "in-progress" && ` · ${s.durationMin} min`}</div>
      </div>
      <div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{ width: s.progress + "%", height: "100%", background: tone, borderRadius: 2, transition: "width 400ms var(--ease-out)" }}></div>
        </div>
        <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, letterSpacing: "var(--ls-caps)", textTransform: "uppercase" }}>
          {s.status === "submitted" ? "CONSEGNATO" : s.status === "in-progress" ? `${s.progress}% · ${Math.round(s.progress * 1.1)} di 110` : "NON INIZIATO"}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        {s.score !== null && s.score !== undefined ? (
          <span className="num" style={{ fontSize: 18, fontWeight: 600, color: tone }}>{s.score}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>%</span></span>
        ) : <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button className="btn btn-icon btn-sm" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "none" }}><EL_Icon name="user" size={11}/></button>
        <button className="btn btn-icon btn-sm" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "none" }}><EL_Icon name="more" size={11}/></button>
      </div>
    </div>
  );
}

window.V2_PageEsameLive = V2_PageEsameLive;
