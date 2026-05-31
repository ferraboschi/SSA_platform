// V2 Esame section + Editor + Feedback + Risultati (in corso detail)
const { Icon: ES_Icon, Avatar: ES_Avatar, Badge: ES_Badge } = window.V2;

function V2_EsameSection({ course }) {
  const exam = course.exam;
  if (!exam) return <div className="text-3" style={{ padding: 24 }}>Questo corso non prevede esame.</div>;
  const tests = window.V2_ExamTests ? window.V2_ExamTests.buildTests(course, exam) : [];
  const finalTest = tests.find(t => t.key === "esame");
  const seqTests = tests.filter(t => t.key !== "esame"); // Day 1..N + Prova esame
  const [tab, setTab] = useState(seqTests[0] ? seqTests[0].key : "feedback");

  const activeSeq = seqTests.find(t => t.key === tab);

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 22, overflowX: "auto", flexWrap: "nowrap" }}>
        {seqTests.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)} style={{ whiteSpace: "nowrap" }}>
            {t.shortLabel}
          </button>
        ))}
        <button className={`tab ${tab === "feedback" ? "active" : ""}`} onClick={() => setTab("feedback")} style={{ whiteSpace: "nowrap" }}>Feedback</button>
        {finalTest && <button className={`tab ${tab === "esame" ? "active" : ""}`} onClick={() => setTab("esame")} style={{ whiteSpace: "nowrap" }}>Esame</button>}
        <button className={`tab ${tab === "risultati" ? "active" : ""}`} onClick={() => setTab("risultati")} style={{ whiteSpace: "nowrap" }}>Risultati</button>
      </div>

      {activeSeq && window.V2_ExamTests && <window.V2_ExamTests.TestRunner key={activeSeq.key} course={course} exam={exam} test={activeSeq}/>}
      {tab === "feedback" && window.V2_ExamTests && <window.V2_ExamTests.FeedbackRunner course={course} exam={exam}/>}
      {tab === "esame" && finalTest && window.V2_ExamTests && <window.V2_ExamTests.TestRunner key="esame" course={course} exam={exam} test={finalTest}/>}
      {tab === "risultati" && <EsameRisultati course={course} exam={exam}/>}
    </div>
  );
}

function EsameOverview({ course, exam }) {
  const phases = [exam.phases.mockTest, exam.phases.feedback, exam.phases.exam];
  const live = course.examLive || [];
  const submitted = live.filter(s => s.status === "submitted").length;
  const inProgress = live.filter(s => s.status === "in-progress").length;
  const notStarted = live.filter(s => s.status === "not-started").length;
  return (
    <div>
      {live.length > 0 && (
        <div className="card" style={{ background: "var(--navy)", color: "white", marginBottom: 20, border: "none", boxShadow: "var(--sh-3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span className="s-dot success pulse" style={{ width: 12, height: 12 }}></span>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Esame in corso · {course.month} {course.year}</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{inProgress} in svolgimento · {submitted} consegnati · {notStarted} non iniziato</div>
              </div>
            </div>
            <a className="btn btn-primary" href={`#/esame-live/${course.id}`}><ES_Icon name="trending" size={13}/>Apri cruscotto live</a>
          </div>
        </div>
      )}

      <div className="kpi-grid cols-5" style={{ marginBottom: 24 }}>
        <ExamMeta label="Famiglia" value={exam.family === "shochu" ? "Shochu" : "Nihonshu"} sub={`Template ${course.type}`}/>
        <ExamMeta label="Domande" value={exam.totalQuestions} sub={`${exam.cats.length} categorie · ${exam.totalPoints} pt`}/>
        <ExamMeta label="Durata" value={`${exam.duration}'`} sub={`Mock ${exam.mockDuration}' · Feedback ${exam.feedbackDuration}'`}/>
        <ExamMeta label="Soglia promosso" value={`${Math.round(exam.thresholds.pass * 100)}%`} sub={`Riserva da ${Math.round(exam.thresholds.retrial * 100)}%`}/>
        <ExamMeta label="Lingue" value="IT·EN·JP" sub="Report tri-lingua"/>
      </div>

      <ShareLinks course={course} exam={exam}/>

      <div className="kpi-grid cols-3" style={{ marginBottom: 24 }}>
        <ToolCard icon="users" title="Check-in studenti" desc={`${course.enrolled} iscritti da accettare al tablet`}/>
        <ToolCard icon="trending" title="Cruscotto live" desc={live.length > 0 ? `In corso · ${inProgress} attivi` : "Si attiva all'inizio dell'esame"} accent={live.length > 0} href={`#/esame-live/${course.id}`}/>
        <ToolCard icon="user" title="Vista studente" desc="Anteprima esame su mobile, tablet, browser" href={`#/esame-studente/${course.id}`}/>
        <ToolCard icon="book" title="Report PDF" desc="Anteprima report tri-lingua IT/EN/JP" href={course.examResults2 ? `#/esame-report/${course.id}/${encodeURIComponent(course.examResults2[0]?.email)}` : null}/>
        <ToolCard icon="download" title="Esporta risultati" desc="Excel + JSON con risposte e punteggi"/>
      </div>

      <ExamAnswerKey exam={exam} course={course}/>

      <div className="card">
        <div className="card-head"><div className="h3">Categorie domande</div></div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${exam.cats.length}, 1fr)` }}>
          {exam.cats.map((c, i) => {
            const qs = exam.questions.filter(q => q.cat === c.id);
            return (
              <div key={c.id} style={{ padding: 18, borderRight: i < exam.cats.length - 1 ? "1px solid var(--border-2)" : "none" }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{c.short}</div>
                <div style={{ fontSize: 22, fontWeight: 600 }} className="num">{qs.length}</div>
                <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>domande</div>
                <div className="bar" style={{ marginTop: 12 }}>
                  <i style={{ width: (qs.length / exam.totalQuestions * 100) + "%", background: ["var(--indigo)", "var(--azzurro)", "var(--success)", "var(--oro)", "var(--warning)"][i] }}></i>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Link da condividere con gli studenti (passwordless, login con mail di registrazione)
function ShareLinks({ course, exam }) {
  const meta = course.examMeta;
  const fam = exam.family === "shochu" ? "shochu" : "nihonshu";
  const base = "esami.sakesommelierassociation.it";
  const tok = (kind, n) => (SSA.seed(course.handle + kind + n) % 0xffffffff).toString(16).padStart(8, "0").slice(0, 8);

  const statusTone = { concluso: "success", attivo: "indigo", pianificato: "neutral", inviato: "success", pronto: "neutral" };

  const rows = [];
  // Mini-test, uno per giornata (fine giornata)
  (meta?.miniTests || []).forEach(m => {
    rows.push({
      key: "m" + m.day, tag: "D" + m.day, kind: "minitest",
      title: m.name, when: `Fine Giorno ${m.day}`,
      url: `${base}/t/${tok("mini", m.day)}`,
      status: m.status === "completato" ? "concluso" : (m.status === "in-corso" ? "attivo" : "pianificato")
    });
  });
  // Esame finale
  rows.push({
    key: "exam", tag: "E", kind: "exam", accent: true,
    title: `Esame finale ${fam === "shochu" ? "Shochu" : "Nihonshu"}`, when: `Giorno ${meta?.examDayNo} · ${meta?.examDateLabel}`,
    url: `${base}/e/${tok("exam", 0)}`,
    status: meta?.done ? "concluso" : (meta?.live ? "attivo" : "pianificato")
  });
  // Feedback (fine corso)
  rows.push({
    key: "fb", tag: "F", kind: "feedback",
    title: meta?.feedback?.name || "Feedback", when: "Fine corso",
    url: `${base}/f/${tok("fb", 0)}`,
    status: meta?.feedback?.status === "inviato" ? "inviato" : "pronto"
  });

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-head" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div className="h3">Link da condividere con gli studenti</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3 }}>
            Un link per ogni prova: <strong>{(meta?.miniTests || []).length} mini-test</strong> (fine giornata), <strong>esame finale</strong> e <strong>feedback</strong> (fine corso). Passwordless: lo studente entra con la mail di registrazione, il link scade dopo l'uso.
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-3)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }}></span>passwordless
        </span>
      </div>
      {rows.map((r, i) => <ShareLinkRow key={r.key} row={r} last={i === rows.length - 1} statusTone={statusTone}/>)}
    </div>
  );
}

function ShareLinkRow({ row: r, last, statusTone }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const full = "https://" + r.url;
    if (navigator.clipboard) navigator.clipboard.writeText(full).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const tagBg = r.kind === "exam" ? "var(--navy)" : r.kind === "feedback" ? "var(--oro)" : "var(--indigo)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "40px 1.3fr 1.4fr auto auto", gap: 16, alignItems: "center", padding: "14px 20px", borderBottom: last ? "none" : "1px solid var(--border-2)" }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: tagBg, color: "white", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 12.5 }}>{r.tag}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 2 }}>{r.when}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <code style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 5, padding: "6px 9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.url}</code>
      </div>
      <ES_Badge tone={statusTone[r.status] || "neutral"}>{r.status}</ES_Badge>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={copy} style={copied ? { color: "var(--success-fg)", borderColor: "var(--success)" } : undefined}>
          <ES_Icon name={copied ? "check" : "copy"} size={12}/>{copied ? "Copiato" : "Copia"}
        </button>
        <a className="btn btn-icon btn-sm btn-ghost" href={"https://" + r.url} target="_blank" rel="noopener" title="Apri link"><ES_Icon name="external" size={12}/></a>
      </div>
    </div>
  );
}

// Educator answer key — read-only consultation of the locked exam template
function ExamAnswerKey({ exam, course }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(exam.cats[0]?.id);
  const [query, setQuery] = useState("");
  const QT = { single: "Scelta singola", multi: "Scelta multipla", truefalse: "Vero / Falso", fill: "Riempi spazio", open: "Risposta libera", match: "Abbinamento", order: "Ordina", image: "Identifica immagine" };

  const inCat = exam.questions.filter(q => q.cat === cat);
  const list = query.trim()
    ? exam.questions.filter(q => q.text.toLowerCase().includes(query.toLowerCase()))
    : inCat;

  const correctText = (q) => {
    if (q.type === "open") return "Valutazione AI sul modello di risposta";
    if (q.type === "match") return (q.pairs || []).map(p => `${p.l} ↔ ${p.r}`).join(" · ");
    if (q.type === "order") return (q.items || []).join(" → ");
    if (q.type === "fill") return (q.correct || []).join(", ");
    if (q.options && q.correct) return q.correct.map(i => q.options[i]).join(", ");
    return "—";
  };

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-head" style={{ alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="h3">Soluzioni esame · per l'educator</div>
            <ES_Badge tone="neutral" dot>Template ufficiale · bloccato</ES_Badge>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3 }}>
            Domande e risposte corrette, in sola lettura. Serve a rispondere agli studenti durante l'esame. Le modifiche le fa solo l'organizzazione, dalla <strong>Libreria esami & test</strong> (menu a sinistra).
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => setOpen(o => !o)}>
          <ES_Icon name="chevron-d" size={12} className={open ? "flip-up" : ""}/>{open ? "Nascondi" : "Mostra domande e risposte"}
        </button>
      </div>

      {open && (
        <div style={{ animation: "expandIn 160ms var(--ease-out)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 20px", borderBottom: "1px solid var(--border-2)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
              {exam.cats.map(c => (
                <button key={c.id} className={`pill ${!query && cat === c.id ? "on" : ""}`} onClick={() => { setCat(c.id); setQuery(""); }}>
                  {c.short} <span className="num" style={{ opacity: 0.6 }}>{exam.questions.filter(q => q.cat === c.id).length}</span>
                </button>
              ))}
            </div>
            <div style={{ position: "relative", width: 200 }}>
              <ES_Icon name="search" size={13} className="text-4" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}/>
              <input className="input" placeholder="Cerca domanda…" value={query} onChange={e => setQuery(e.target.value)} style={{ paddingLeft: 28, height: 32, fontSize: 12.5 }}/>
            </div>
          </div>

          <div style={{ maxHeight: 460, overflow: "auto" }}>
            {list.map((q, i) => (
              <div key={q.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: 12, padding: "14px 20px", borderBottom: i < list.length - 1 ? "1px solid var(--border-2)" : "none" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", paddingTop: 2 }}>{(i+1).toString().padStart(2,"0")}</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <ES_Badge tone="neutral">{QT[q.type]}</ES_Badge>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>{q.points}pt</span>
                    {q.important && <ES_Badge tone="oro">Importante</ES_Badge>}
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--text)", marginBottom: 8, lineHeight: 1.4 }}>{q.text}</div>
                  {(q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(q.options || []).map((opt, oi) => {
                        const ok = q.correct?.includes(oi);
                        return (
                          <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: ok ? "var(--success-fg)" : "var(--text-3)", fontWeight: ok ? 600 : 400 }}>
                            <span style={{ width: 14, height: 14, borderRadius: q.type === "multi" ? 3 : "50%", border: "1.5px solid " + (ok ? "var(--success)" : "var(--border-strong)"), background: ok ? "var(--success)" : "transparent", color: "white", display: "grid", placeItems: "center", flexShrink: 0 }}>
                              {ok && <ES_Icon name="check" size={8}/>}
                            </span>
                            {opt}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(q.type === "open" || q.type === "match" || q.type === "order" || q.type === "fill") && (
                    <div style={{ fontSize: 12.5, color: "var(--success-fg)", background: "var(--success-bg)", borderRadius: 5, padding: "6px 10px", display: "inline-block" }}>
                      <strong>Soluzione:</strong> {correctText(q)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {list.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>Nessuna domanda trovata.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function ExamMeta({ label, value, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 22 }}>{value}</div>
      {sub && <div className="kpi-foot">{sub}</div>}
    </div>
  );
}

function PhaseRow({ phase, course, last }) {
  const tones = { completed: "success", ready: "indigo", scheduled: "neutral", draft: "neutral" };
  const labels = { completed: "Completato", ready: "Pronto", scheduled: "Pianificato", draft: "Bozza" };
  const colors = { completed: "var(--success)", ready: "var(--indigo)", scheduled: "var(--text-mute)", draft: "var(--text-mute)" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "32px 180px 1fr auto auto", gap: 16, alignItems: "center", padding: "16px 20px", borderBottom: last ? "none" : "1px solid var(--border-2)" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: colors[phase.status], color: phase.status === "scheduled" || phase.status === "draft" ? "var(--text-2)" : "white", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13 }}>
        {phase.id === "mock" ? "M" : phase.id === "feedback" ? "F" : "E"}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{phase.label}</div>
        <div style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "var(--ls-caps)", marginTop: 2 }}>{phase.scheduled}</div>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{phase.n} domande · {phase.duration} minuti</div>
      <ES_Badge tone={tones[phase.status]}>{labels[phase.status]}</ES_Badge>
      <div style={{ display: "flex", gap: 6 }}>
        {phase.status === "ready" && phase.id === "exam" && <a className="btn btn-primary btn-sm" href={`#/esame-live/${course.id}`}><ES_Icon name="play" size={11}/>Cruscotto</a>}
        {phase.status !== "ready" && <button className="btn btn-sm">Configura</button>}
      </div>
    </div>
  );
}

function ToolCard({ icon, title, desc, href, accent }) {
  const Tag = href ? "a" : "button";
  return (
    <Tag href={href} className="card card-pad" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 6, border: accent ? "1px solid var(--indigo)" : undefined, background: accent ? "var(--indigo-50)" : "var(--surface)", cursor: href ? "pointer" : "default", transition: "transform var(--dur-fast), box-shadow var(--dur-fast)" }} onMouseEnter={e => href && (e.currentTarget.style.transform = "translateY(-1px)", e.currentTarget.style.boxShadow = "var(--sh-3)")} onMouseLeave={e => href && (e.currentTarget.style.transform = "none", e.currentTarget.style.boxShadow = "var(--sh-card)")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: accent ? "var(--indigo)" : "var(--surface-2)", color: accent ? "white" : "var(--text-2)", display: "grid", placeItems: "center" }}><ES_Icon name={icon} size={14}/></div>
        {href && <ES_Icon name="arrow" size={14} className="text-4"/>}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, marginTop: 8 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.45 }}>{desc}</div>
    </Tag>
  );
}

// ============== Editor ==============
function EsameEditor({ course, exam }) {
  const [activeCat, setActiveCat] = useState(exam.cats[0].id);
  const [activeQ, setActiveQ] = useState(0);
  const qsInCat = exam.questions.filter(q => q.cat === activeCat);
  const q = qsInCat[activeQ] || qsInCat[0];

  const QT = { single: "Scelta singola", multi: "Scelta multipla", truefalse: "Vero / Falso", fill: "Riempi spazio", open: "Risposta libera", match: "Abbinamento", order: "Ordina", image: "Identifica immagine" };

  return (
    <div className="card" style={{ overflow: "hidden", display: "grid", gridTemplateColumns: "260px 1fr", minHeight: 600 }}>
      <div style={{ background: "var(--surface-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
          <div className="field-label" style={{ marginBottom: 6 }}>Categoria</div>
          <select className="select" value={activeCat} onChange={e => { setActiveCat(e.target.value); setActiveQ(0); }}>
            {exam.cats.map(c => {
              const n = exam.questions.filter(q => q.cat === c.id).length;
              return <option key={c.id} value={c.id}>{c.label} ({n})</option>;
            })}
          </select>
        </div>
        <div style={{ flex: 1, overflow: "auto", maxHeight: 560 }}>
          {qsInCat.map((qq, i) => (
            <button key={qq.id} onClick={() => setActiveQ(i)} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              width: "100%", padding: "10px 14px", textAlign: "left",
              borderBottom: "1px solid var(--border-2)",
              background: activeQ === i ? "var(--surface)" : "transparent",
              borderLeft: activeQ === i ? "3px solid var(--indigo)" : "3px solid transparent",
              transition: "background var(--dur-fast)"
            }}>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)", minWidth: 24, paddingTop: 1 }}>{(i+1).toString().padStart(2,"0")}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{qq.text}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                  <ES_Badge tone="neutral">{QT[qq.type]}</ES_Badge>
                  {qq.important && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--oro)" }}></span>}
                  <span style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{qq.points}pt</span>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <button className="btn btn-sm" style={{ width: "100%" }}><ES_Icon name="plus" size={12}/>Aggiungi domanda</button>
        </div>
      </div>

      <div style={{ padding: 24, overflow: "auto", maxHeight: 660 }}>
        {q && <QuestionEditor q={q} QT={QT}/>}
      </div>
    </div>
  );
}

// Stima tempo per tipo domanda (secondi): singola 8s, multipla 13s, testo libero 45s
const ES_EST_SEC = { single: 8, truefalse: 8, image: 8, rating: 8, multi: 13, fill: 13, match: 13, order: 13, open: 45 };

function QuestionEditor({ q, QT, readOnly, onChangeType }) {
  const ro = !!readOnly;
  const est = ES_EST_SEC[q.type] || 10;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {ro ? (
            <ES_Badge tone="indigo">{QT[q.type]}</ES_Badge>
          ) : (
            <select className="select" value={q.type} onChange={e => onChangeType && onChangeType(e.target.value)} style={{ height: 30, width: "auto", fontSize: 12.5, fontWeight: 600 }}>
              {Object.entries(QT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          <span className="text-3" style={{ fontSize: 12 }}>{q.points} punti</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", display: "inline-flex", alignItems: "center", gap: 4 }} title="Tempo stimato di risposta">
            <ES_Icon name="clock" size={11}/>stima {est}s
          </span>
          {q.important && <ES_Badge tone="oro">Importante</ES_Badge>}
        </div>
        {ro ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--success-fg)", fontWeight: 500 }}>
            <ES_Icon name="check" size={12}/>Risposta corretta evidenziata
          </span>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-sm">Duplica</button>
            <button className="btn btn-sm btn-ghost"><ES_Icon name="trash" size={12}/></button>
          </div>
        )}
      </div>

      <div className="field">
        <div className="field-label">Testo domanda</div>
        <textarea className="textarea" defaultValue={q.text} rows={3} readOnly={ro} style={ro ? { background: "var(--surface-2)", color: "var(--text-2)", cursor: "default" } : undefined}/>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
        {["it","en","ja"].map(l => (
          <button key={l} className={`pill ${q.lang === l ? "on" : ""}`} disabled={ro} style={ro && q.lang !== l ? { opacity: 0.5 } : undefined}>{l.toUpperCase()}</button>
        ))}
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>traduzioni: 1/3</span>
      </div>

      <div className="divider" style={{ margin: "20px 0" }}></div>

      <div className="field">
        <div className="field-label">{q.type === "open" ? "Modello risposta + criteri AI" : q.type === "match" ? "Coppie da abbinare" : q.type === "order" ? "Sequenza corretta" : "Opzioni"}</div>

        {(q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.type === "image" && <div className="ph-img" style={{ height: 140, marginBottom: 8 }}>Etichetta sake</div>}
            {(q.options || []).map((opt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: q.correct?.includes(i) ? "var(--success-bg)" : "var(--surface)" }}>
                <div style={{ width: 18, height: 18, borderRadius: q.type === "multi" ? 3 : "50%", border: "1.5px solid " + (q.correct?.includes(i) ? "var(--success)" : "var(--border-strong)"), display: "grid", placeItems: "center", background: q.correct?.includes(i) ? "var(--success)" : "transparent", color: "white", flexShrink: 0 }}>
                  {q.correct?.includes(i) && <ES_Icon name="check" size={10}/>}
                </div>
                <input className="input" defaultValue={opt} readOnly={ro} style={{ flex: 1, border: "none", height: "auto", padding: 0, background: "transparent", cursor: ro ? "default" : undefined }}/>
                {!ro && <button className="btn btn-icon btn-sm btn-ghost"><ES_Icon name="trash" size={11}/></button>}
              </div>
            ))}
            {!ro && <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }}><ES_Icon name="plus" size={11}/>Aggiungi opzione</button>}
          </div>
        )}

        {q.type === "open" && (
          <div>
            <textarea className="textarea" rows={4} placeholder="Modello di risposta corretta…" readOnly={ro} style={ro ? { background: "var(--surface-2)", color: "var(--text-2)", cursor: "default" } : undefined}/>
            <div className="card card-pad" style={{ marginTop: 12, background: "var(--indigo-50)", border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <ES_Icon name="sparkle" size={14} className="text-3"/>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                  L'AI confronterà la risposta dello studente con il modello e assegnerà un punteggio 0–{q.points}. Soglia auto-conferma: <strong>confidenza ≥ 80%</strong>. Le risposte sotto vanno in coda di revisione manuale.
                </div>
              </div>
            </div>
          </div>
        )}

        {q.type === "fill" && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>Risposte accettate (case-insensitive, separa con virgola):</div>
            <input className="input" defaultValue={(q.correct || []).join(", ")} readOnly={ro} style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}/>
          </div>
        )}

        {q.type === "match" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.pairs || []).map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: ro ? "1fr 24px 1fr" : "1fr 24px 1fr 28px", gap: 8, alignItems: "center" }}>
                <input className="input" defaultValue={p.l} readOnly={ro} style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}/>
                <div style={{ textAlign: "center", color: "var(--text-4)" }}>↔</div>
                <input className="input" defaultValue={p.r} readOnly={ro} style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}/>
                {!ro && <button className="btn btn-icon btn-sm btn-ghost"><ES_Icon name="trash" size={11}/></button>}
              </div>
            ))}
          </div>
        )}

        {q.type === "order" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.items || []).map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", minWidth: 22 }}>{i+1}</span>
                <input className="input" defaultValue={it} readOnly={ro} style={{ flex: 1, border: "none", height: "auto", padding: 0, background: "transparent", cursor: ro ? "default" : undefined }}/>
                {!ro && <ES_Icon name="more" size={13}/>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="divider" style={{ margin: "20px 0" }}></div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="field">
          <div className="field-label">Categoria</div>
          <select className="select" defaultValue={q.cat} disabled={ro}><option>{q.cat}</option></select>
        </div>
        <div className="field">
          <div className="field-label">Punti</div>
          <input className="input" type="number" defaultValue={q.points} readOnly={ro} style={ro ? { background: "var(--surface-2)", cursor: "default" } : undefined}/>
        </div>
        <div className="field">
          <div className="field-label">Importante</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
            <input type="checkbox" defaultChecked={q.important} disabled={ro}/>
            Mostra nel report se sbagliata
          </label>
        </div>
      </div>
    </div>
  );
}

// ============== Mini-test per giorno ==============
function EsameMiniTest({ course, exam }) {
  const meta = course.examMeta;
  const fam = exam.family === "shochu" ? "shochu" : "nihonshu";
  const tpl = (window.SSA_EXAM?.TEMPLATES || {})[fam];
  const [preview, setPreview] = useState(null);
  const tones = { completato: "success", "in-corso": "indigo", pianificato: "neutral" };
  const labels = { completato: "Completato", "in-corso": "In corso", pianificato: "Pianificato" };

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 20, background: "var(--indigo-50)", border: "1px solid var(--indigo-100)", boxShadow: "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <ES_Icon name="sparkle" size={16} className="text-2"/>
        <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
          Un <strong>mini-test</strong> alla fine di ogni giornata. I giorni arrivano dal <a className="link" href={`#/corsi/${course.id}`}>Template materiali</a> del corso ({meta.miniTests.length} {meta.miniTests.length === 1 ? "giorno" : "giorni"}). Le domande sono i template <strong>"{tpl?.label} · Day N test"</strong>, gestiti dall'organizzazione nella <strong>Libreria esami & test</strong> (sola lettura).
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {meta.miniTests.map((m, i) => {
          const tDay = tpl?.miniTests?.[i];
          return (
            <div key={m.day} className="card">
              <div style={{ display: "grid", gridTemplateColumns: "44px 1fr auto auto", gap: 16, alignItems: "center", padding: "16px 20px" }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: m.status === "completato" ? "var(--success)" : "var(--surface-2)", color: m.status === "completato" ? "white" : "var(--text-3)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13 }}>D{m.day}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 2 }}>{m.topic} · {m.nQuestions} domande · {tDay?.duration || 10} min · fine Giorno {m.day}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {m.avgScore != null
                    ? <><div className="num" style={{ fontSize: 18, fontWeight: 600, color: "var(--success-fg)" }}>{m.avgScore}%</div><div style={{ fontSize: 10.5, color: "var(--text-4)" }}>media classe</div></>
                    : <span className="text-4" style={{ fontSize: 12 }}>—</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ES_Badge tone={tones[m.status]}>{labels[m.status]}</ES_Badge>
                  <button className="btn btn-sm" onClick={() => setPreview(preview === m.day ? null : m.day)}>{preview === m.day ? "Nascondi" : "Anteprima"}</button>
                </div>
              </div>
              {preview === m.day && tDay && (
                <div style={{ borderTop: "1px solid var(--border-2)", padding: "14px 20px", background: "var(--surface-2)", animation: "expandIn 160ms var(--ease-out)" }}>
                  {tDay.questions.map((q, qi) => (
                    <div key={q.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: qi < tDay.questions.length - 1 ? "1px dashed var(--border-2)" : "none", fontSize: 12.5 }}>
                      <span className="mono" style={{ color: "var(--text-4)", minWidth: 22 }}>{(qi+1).toString().padStart(2,"0")}</span>
                      <span style={{ flex: 1, color: "var(--text-2)" }}>{q.text}</span>
                      <span className="mono" style={{ color: "var(--text-4)" }}>{q.points}pt</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-4)", display: "flex", alignItems: "center", gap: 6 }}>
                    <ES_Icon name="lock" size={11}/>Template ufficiale · sola lettura. Le modifiche le fa l'organizzazione dalla Libreria esami & test.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============== Feedback (link passwordless per studente) ==============
function EsameFeedback({ course, exam }) {
  const meta = course.examMeta;
  const fam = exam.family === "shochu" ? "shochu" : "nihonshu";
  const tpl = (window.SSA_EXAM?.TEMPLATES || {})[fam];
  const fb = tpl?.feedback;
  const QT = { rating: "Valutazione 1-5", single: "Scelta singola", multi: "Scelta multipla", open: "Risposta aperta" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20, alignItems: "start" }}>
      <div className="card card-pad-lg">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{fb?.name} · template famiglia</div>
        <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.55, marginTop: 6 }}>
          Modulo unico per tutta la famiglia <strong>{meta.familyLabel}</strong>, in sola lettura: lo gestisce l'organizzazione dalla Libreria esami & test. Ogni corso lo riusa identico.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {(fb?.questions || []).map((q, i) => (
            <div key={q.id} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 6, display: "flex", gap: 10, alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", minWidth: 22 }}>{(i+1).toString().padStart(2,"0")}</span>
              <div style={{ flex: 1, fontSize: 13 }}>{q.text}</div>
              <ES_Badge tone="neutral">{QT[q.type] || q.type}</ES_Badge>
            </div>
          ))}
        </div>
      </div>

      <MagicLinkPanel
        course={course}
        title="Invia feedback agli studenti"
        kind="feedback"
        desc="Ogni studente riceve un link personale. Accede con la mail di registrazione, nessuna password. Il link scade dopo l'invio del modulo."
        statusSent={meta.feedback.status === "inviato"}
        responses={meta.feedback.responses}
        total={meta.feedback.total}
      />
    </div>
  );
}

// Pannello link passwordless (effimero, login con mail di registrazione)
function MagicLinkPanel({ course, title, desc, kind, statusSent, responses, total }) {
  const [generated, setGenerated] = useState(statusSent);
  const studs = (course.students || []).slice(0, course.enrolled);
  const tokenFor = (email) => (SSA.seed(course.handle + kind + email) % 0xffffff).toString(16).padStart(6, "0") + Date.now().toString(36).slice(-3);
  const [rows] = useState(() => studs.map(s => ({
    name: s.name, email: s.email, token: tokenFor(s.email),
    compiled: statusSent && (SSA.seed(s.email + kind) % 10 < 7)
  })));
  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.5, margin: "0 0 14px" }}>{desc}</p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-3)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }}></span>passwordless
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>· login con mail di registrazione · scade dopo l'uso</span>
      </div>

      {!generated ? (
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setGenerated(true)}>
          <ES_Icon name="share" size={13}/>Genera e invia link ({studs.length})
        </button>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{responses ?? rows.filter(r => r.compiled).length}/{total ?? studs.length} compilati</span>
            <button className="btn btn-sm"><ES_Icon name="refresh" size={11}/>Reinvia ai mancanti</button>
          </div>
          <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid var(--border-2)", borderRadius: 6 }}>
            {rows.map((r, i) => (
              <div key={r.email} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: i < rows.length - 1 ? "1px solid var(--border-2)" : "none" }}>
                <ES_Avatar name={r.name} size="sm"/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>esami.ssa.it/{kind === "feedback" ? "f" : "e"}/{r.token}</div>
                </div>
                {r.compiled
                  ? <ES_Badge tone="success" dot>compilato</ES_Badge>
                  : <ES_Badge tone="neutral" dot>inviato</ES_Badge>}
                <button className="btn btn-icon btn-sm btn-ghost" title="Copia link"><ES_Icon name="copy" size={11}/></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============== Risultati ==============
function EsameRisultati({ course, exam }) {
  const results = course.examResults2;
  if (!results) {
    return <div className="card card-pad-lg" style={{ textAlign: "center", color: "var(--text-3)" }}>
      <div className="h2" style={{ marginBottom: 6 }}>Esame non ancora svolto</div>
      <div style={{ fontSize: 13 }}>I risultati appariranno qui dopo la correzione automatica.</div>
    </div>;
  }

  const passed = results.filter(r => r.status === "passed").length;
  const retrial = results.filter(r => r.status === "retrial").length;
  const failed = results.filter(r => r.status === "failed").length;
  const avg = Math.round(results.reduce((s,r) => s + r.score, 0) / results.length);
  const buckets = Array(10).fill(0);
  results.forEach(r => { buckets[Math.min(9, Math.floor(r.score / 10))]++; });
  const maxBucket = Math.max(...buckets, 1);

  return (
    <div>
      <div className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
        <ExamMeta label="Promossi" value={`${passed}/${results.length}`} sub={`${Math.round(passed/results.length*100)}%`}/>
        <ExamMeta label="Riserva" value={retrial} sub="70–79%"/>
        <ExamMeta label="Bocciati" value={failed} sub="<70%"/>
        <ExamMeta label="Media" value={`${avg}%`} sub={`min ${Math.min(...results.map(r => r.score))} · max ${Math.max(...results.map(r => r.score))}`}/>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-head"><div className="h3">Distribuzione punteggi</div></div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
            {buckets.map((n, i) => {
              const color = i >= 8 ? "var(--success)" : i === 7 ? "var(--warning)" : "var(--danger)";
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{n || ""}</div>
                  <div style={{ width: "100%", height: ((n/maxBucket) * 100) + "%", background: color, borderRadius: "3px 3px 0 0", minHeight: n > 0 ? 4 : 0, transition: "height 500ms var(--ease-out)" }}></div>
                  <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{i*10}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Studente</th><th>Punteggio</th><th>Durata</th><th>Categorie deboli</th><th>Esito</th><th>Report</th></tr>
          </thead>
          <tbody>
            {results.sort((a,b) => b.score - a.score).map(r => {
              const weakest = [...r.sections].sort((a,b) => a.pct - b.pct)[0];
              return (
                <tr key={r.email}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <ES_Avatar name={r.name} size="sm"/>
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 140 }}>
                      <span className="num" style={{ fontSize: 16, fontWeight: 600, color: r.status === "passed" ? "var(--success-fg)" : r.status === "retrial" ? "var(--warning-fg)" : "var(--danger-fg)" }}>{r.score}%</span>
                      <div className={`bar ${r.status === "passed" ? "success" : r.status === "retrial" ? "warning" : "danger"}`} style={{ width: 70 }}><i style={{ width: r.score + "%" }}></i></div>
                    </div>
                  </td>
                  <td className="num text-3">{r.durationMin}m</td>
                  <td>{weakest && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{weakest.short} · {Math.round(weakest.pct)}%</span>}</td>
                  <td>
                    {r.status === "passed" && <ES_Badge tone="success">Promosso</ES_Badge>}
                    {r.status === "retrial" && <ES_Badge tone="warning">Riserva</ES_Badge>}
                    {r.status === "failed" && <ES_Badge tone="danger">Bocciato</ES_Badge>}
                  </td>
                  <td><a className="btn btn-sm" href={`#/esame-report/${course.id}/${encodeURIComponent(r.email)}`}><ES_Icon name="book" size={11}/>PDF</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.V2_EsameSection = V2_EsameSection;
window.V2_ExamParts = { EsameOverview, EsameRisultati, QuestionEditor, ExamMeta, ToolCard, MagicLinkPanel };
