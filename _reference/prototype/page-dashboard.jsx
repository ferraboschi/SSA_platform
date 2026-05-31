// V2 Dashboard — Stripe-style overview
const { Icon: D_Icon, Avatar: D_Avatar, Badge: D_Badge, StatusBadge: D_Status, KPI: D_KPI, PageHeader: D_PageHeader } = window.V2;

function V2_PageDashboard() {
  const me = SSA.getCurrentUser();
  const active = SSA.COURSES.filter(c => c.lifecycle === "pubblicato");
  const past = SSA.COURSES.filter(c => c.lifecycle === "passato");
  const today = new Date(2026, 4, 25);
  const monthIdx = (m) => ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].indexOf(m);

  const totalEnrolled = active.reduce((s,c) => s + c.enrolled, 0);
  const totalRevenue = active.reduce((s,c) => s + c.revenue, 0);
  const totalMargin = active.reduce((s,c) => s + c.margin, 0);
  const atRisk = active.filter(c => c.status === "rischio" || c.status === "critico");

  // Pipeline 6 months
  const months = ["Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre"];
  const pipeline = months.map(m => {
    const cs = active.filter(c => c.month === m);
    return { month: m, count: cs.length, revenue: cs.reduce((s,c) => s + c.revenue, 0), enrolled: cs.reduce((s,c) => s + c.enrolled, 0), capacity: cs.reduce((s,c) => s + c.capacity, 0) };
  });

  // Recent enrollments
  const recent = [];
  active.forEach(c => c.students.forEach(s => recent.push({ ...s, course: c })));
  recent.sort((a,b) => new Date(b.orderDate) - new Date(a.orderDate));

  // Live exam alert
  const liveExam = SSA.COURSES.find(c => c.examLive);
  const [showReport, setShowReport] = useState(false);

  return (
    <div className="page">
      {/* Hero with greeting + headline metric */}
      <section className="hero hero-mesh" style={{ padding: "32px 36px" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Lunedì · 25 Maggio 2026 · Settimana 22 <span className="dot"></span> Aggiornato 4 min fa
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2, margin: 0 }}>
              Buongiorno, {me.first}. <span style={{ color: "var(--text-3)" }}>Hai</span> <span style={{ color: "var(--indigo)" }}>{atRisk.length} corsi</span> <span style={{ color: "var(--text-3)" }}>sotto soglia e</span> <span style={{ color: "var(--text)" }}>3 fatture</span> <span style={{ color: "var(--text-3)" }}>da chiudere.</span>
            </h1>
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              {liveExam && (
                <a className="btn btn-dark" href={`#/esami/${liveExam.id}`}>
                  <span className="s-dot success pulse"></span>
                  Esame live · {liveExam.shortTitle}
                  <D_Icon name="arrow" size={13}/>
                </a>
              )}
              <a className="btn" href="#/corsi"><D_Icon name="book" size={13}/>Apri catalogo</a>
              <button className="btn btn-ghost" onClick={() => setShowReport(true)}><D_Icon name="calendar" size={13}/>Report mese</button>
              {showReport && <MonthlyReportModal onClose={() => setShowReport(false)} />}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 20, background: "rgba(255,255,255,0.7)", borderRadius: 12, backdropFilter: "blur(8px)", border: "1px solid var(--border-2)" }}>
            <div className="eyebrow">Pipeline 6 mesi</div>
            <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
              {(totalRevenue/1000).toFixed(1)}<span style={{ fontSize: "0.6em", color: "var(--text-3)", marginLeft: 4 }}>k €</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>
              {totalEnrolled} iscritti su {active.reduce((s,c) => s + c.capacity, 0)} posti totali
            </div>
            <div className="bar azzurro" style={{ marginTop: 10 }}>
              <i style={{ width: `${totalEnrolled / active.reduce((s,c) => s + c.capacity, 0) * 100}%` }}></i>
            </div>
          </div>
        </div>
      </section>

      {/* KPI row */}
      <section className="kpi-grid cols-4" style={{ marginBottom: 28 }}>
        <D_KPI anim label="Corsi attivi" value={active.length} sub={`${atRisk.length} sotto soglia`} delta={`+${active.length - past.length}`} deltaDir="up" accent="indigo"/>
        <D_KPI anim label="Iscritti totali" value={totalEnrolled.toLocaleString("it-IT")} sub={`media ${(totalEnrolled / active.length).toFixed(1)} per corso`} delta="+18%" deltaDir="up" accent="azzurro"/>
        <D_KPI anim label="Margine atteso" value={Math.round(totalMargin / 1000)} unit="k €" sub={`${Math.round(totalMargin / totalRevenue * 100)}% sui ricavi`} delta="-4%" deltaDir="dn" accent={totalMargin > 0 ? "green" : "danger"}/>
        <D_KPI anim label="Tasso promozione esame" value="78" unit="%" sub="ultimi 12 mesi · 184 esami" delta="+3%" deltaDir="up" accent="oro"/>
      </section>

      {/* Operational reminders — spedizioni, stock, soglia esame */}
      <OperationalReminders active={active}/>

      {/* Pipeline strip */}
      <section className="card" style={{ marginBottom: 28 }}>
        <div className="card-head">
          <div>
            <div className="h3">Pipeline 6 mesi</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Distribuzione corsi e occupazione per mese</div>
          </div>
          <a href="#/corsi" className="btn btn-sm">Vedi tutti<D_Icon name="arrow" size={11}/></a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
          {pipeline.map((p, i) => (
            <div key={p.month} style={{ padding: "18px 20px 20px", borderRight: i < 5 ? "1px solid var(--border-2)" : "none" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 500, marginBottom: 6 }}>{p.month} 2026</div>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{p.count}<span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 6, fontWeight: 400 }}>corsi</span></div>
              <div style={{ height: 56, display: "flex", alignItems: "flex-end", gap: 3, marginTop: 12 }}>
                {[...Array(p.count || 1)].map((_, j) => {
                  const c = active.filter(x => x.month === p.month)[j];
                  const fill = c ? (c.enrolled / c.capacity) : 0;
                  const tone = !c ? "var(--border-2)" : c.status === "rischio" || c.status === "critico" ? "var(--warning)" : c.status === "monitor" ? "var(--text-mute)" : "var(--indigo)";
                  if (!c) {
                    return (
                      <div key={j} style={{ flex: 1, height: "100%", background: "var(--border-2)", borderRadius: 2, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "0%", background: tone, borderRadius: 2 }}></div>
                      </div>
                    );
                  }
                  return <PipelineBar key={c.id} course={c} fill={fill} tone={tone}/>;
                })}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-2)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-4)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginBottom: 3 }}>Iscritti</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.005em" }} className="num">
                    {p.enrolled}<span style={{ color: "var(--text-4)", fontWeight: 400 }}>/{p.capacity || 0}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "var(--text-4)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginBottom: 3 }}>Ricavi</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.005em" }} className="num">
                    {(p.revenue/1000).toFixed(1)}<span style={{ color: "var(--text-4)", fontWeight: 400, marginLeft: 1 }}>k€</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Two columns */}
      <section style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24 }}>
        {/* Attention list */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="h3">Richiede attenzione</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{atRisk.length} corsi sotto soglia minima</div>
            </div>
            <button className="btn btn-sm btn-ghost"><D_Icon name="filter" size={12}/></button>
          </div>
          <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
            <table className="table">
              <tbody>
                {atRisk.map(c => (
                  <tr key={c.id} className="clickable" onClick={() => location.hash = `#/corsi/${c.id}`}>
                    <td style={{ width: 56 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border-2)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)" }} className="num">
                        {c.day}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <D_Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</D_Badge>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.shortTitle}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{c.month} · {c.city} · {c.educator?.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>{c.enrolled}/{c.capacity}</span>
                        <div className={`bar ${c.enrolled < c.minStudents ? "warning" : "azzurro"}`} style={{ flex: 1 }}><i style={{ width: (c.enrolled/c.capacity*100) + "%" }}></i></div>
                      </div>
                    </td>
                    <td><D_Status status={c.status}/></td>
                    <td style={{ width: 30 }}><D_Icon name="chevron" size={14} className="text-4"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="card-head">
            <div className="h3">Ultime iscrizioni</div>
            <a href="#/corsisti" className="btn btn-sm btn-ghost">Tutti<D_Icon name="arrow" size={11}/></a>
          </div>
          <div style={{ padding: "4px 0" }}>
            {recent.slice(0, 7).map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: i < 6 ? "1px solid var(--border-2)" : "none" }}>
                <D_Avatar name={e.name} size="sm"/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.course.shortTitle} · {e.course.city}</div>
                </div>
                {e.discountCode && <D_Badge tone="oro">{e.discountCode}</D_Badge>}
                <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }} className="num">{e.amount}€</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom row */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 28 }}>
        <div className="card">
          <div className="card-head">
            <div className="h3">Top educator</div>
            <a href="#/educator" className="btn btn-sm btn-ghost">Tutti<D_Icon name="arrow" size={11}/></a>
          </div>
          <div>
            {SSA.EDUCATORS.slice(0, 4).map((e, i) => {
              const eCourses = SSA.COURSES.filter(c => c.educator?.id === e.id);
              const eStud = eCourses.reduce((s,c) => s + c.enrolled, 0);
              return (
                <a key={e.id} href={`#/educator/${e.id}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: i < 3 ? "1px solid var(--border-2)" : "none", transition: "background var(--dur-fast)" }} onMouseEnter={ev => ev.currentTarget.style.background = "var(--surface-hover)"} onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                  <D_Avatar name={e.name} initials={e.initials} size="md"/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{e.role} · {e.city}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1 }} className="num">{eCourses.length}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{eStud} iscritti</div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Comunità SSA</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }} className="num">{SSA.STUDENTS.length}</span>
            <span style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>corsisti totali dal 2016</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <MiniStat label="Attuali" value={SSA.STUDENTS.filter(s => !s.historical).length} sub="post-2024"/>
            <MiniStat label="Ripartecipanti" value={SSA.STUDENTS.filter(s => s.isReturning).length} sub={`${Math.round(SSA.STUDENTS.filter(s => s.isReturning).length / SSA.STUDENTS.length * 100)}% del totale`} accent="oro"/>
            <MiniStat label="Certificati" value={SSA.STUDENTS.filter(s => s.courses.some(c => c.examResult === "passed")).length} sub="esame superato" accent="success"/>
          </div>
          <div style={{ marginTop: 18, padding: 14, background: "var(--indigo-50)", borderRadius: 6, fontSize: 12, color: "var(--text-2)", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <D_Icon name="sparkle" size={14} className="text-3"/>
            <span><strong style={{ color: "var(--text)" }}>Insight</strong> — i ripartecipanti spendono in media <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>2.3×</span> rispetto ai nuovi iscritti.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value, sub, accent }) {
  return (
    <div style={{ paddingTop: 12, borderTop: `2px solid var(--${accent || "border"})` }}>
      <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.01em" }} className="num">{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function PipelineBar({ course: c, fill, tone }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={`#/corsi/${c.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, height: "100%", background: "var(--border-2)",
        borderRadius: 2, position: "relative", cursor: "pointer",
        transition: "transform var(--dur-fast) var(--ease)",
        transform: hover ? "translateY(-2px)" : "none"
      }}
    >
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: `${Math.max(fill * 100, 8)}%`,
        background: tone,
        borderRadius: 2,
        transition: "height 400ms var(--ease-out), box-shadow var(--dur-fast)",
        boxShadow: hover ? "0 0 0 1.5px var(--indigo)" : "none"
      }}></div>
      {hover && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--navy)",
          color: "white",
          padding: "10px 12px",
          borderRadius: 6,
          boxShadow: "var(--sh-3)",
          width: 220,
          fontSize: 11.5,
          lineHeight: 1.5,
          pointerEvents: "none",
          zIndex: 50,
          animation: "tipIn 120ms var(--ease-out)"
        }}>
          {/* Arrow */}
          <div style={{
            position: "absolute",
            top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "6px solid var(--navy)"
          }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{
              display: "inline-block", padding: "1px 6px", borderRadius: 3,
              fontSize: 9.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
              background: c.typeColor === "oro" ? "var(--oro-bg)" : "var(--azzurro-bg)",
              color: c.typeColor === "oro" ? "#8A6E1A" : "var(--azzurro)"
            }}>{c.typeShort}</span>
            <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{c.day} {c.month.slice(0,3)}</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: "white", marginBottom: 8, letterSpacing: "-0.005em", lineHeight: 1.3 }}>{c.shortTitle}</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", color: "rgba(255,255,255,0.85)" }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Iscritti</span>
            <span className="num" style={{ textAlign: "right", fontWeight: 600 }}>{c.enrolled}/{c.capacity}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Ricavi</span>
            <span className="num" style={{ textAlign: "right", fontWeight: 600 }}>{(c.revenue / 1000).toFixed(1)}k €</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Località</span>
            <span style={{ textAlign: "right" }}>{c.city}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Educator</span>
            <span style={{ textAlign: "right" }}>{c.educator?.name}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Stato</span>
            <span style={{ textAlign: "right", color: c.status === "in-traiettoria" ? "#62E5A1" : c.status === "rischio" || c.status === "critico" ? "#FFB366" : "rgba(255,255,255,0.7)", fontWeight: 600 }}>
              {c.status === "in-traiettoria" ? "In traiettoria" : c.status === "monitor" ? "Da monitorare" : c.status === "rischio" ? "A rischio" : "Critico"}
            </span>
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 10.5, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
            Clicca per aprire →
          </div>
        </div>
      )}
    </a>
  );
}

window.V2_PageDashboard = V2_PageDashboard;

// =============== Operational reminders ===============
// Promemoria operativi: spedizioni, stock libri, soglia sake esame, fatture, ecc.
function OperationalReminders({ active }) {
  // Build mock reminders from real course data, organized by priority.
  const monthIdx = (m) => ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].indexOf(m);
  const today = new Date(2026, 4, 25);
  const th = SSA.getDashThresholds();
  const [showSoglie, setShowSoglie] = useState(false);

  // Online courses → spedizione kit con anticipo (soglia giorni configurabile)
  const shipmentReminders = active
    .filter(c => c.mode === "online")
    .map(c => {
      const start = new Date(c.year, monthIdx(c.month), c.day);
      const days = Math.round((start - today) / 86400000);
      const shipBy = days - th.shipDays;
      return { course: c, daysToStart: days, shipBy };
    })
    .filter(r => r.daysToStart > 0 && r.daysToStart <= 25)
    .sort((a,b) => a.shipBy - b.shipBy)
    .slice(0, 3);

  // Stock libri — sotto la soglia minima configurabile
  const bookStock = [
    { sku: "Manuale SSA v3", qty: 12, days: 5 },
    { sku: "Booklet Introduttivo", qty: 38, days: 12 },
    { sku: "Manuale Shochu", qty: 4, days: 2 }
  ].filter(b => b.qty < th.bookMin);

  // Sake esame stock — soglia % per il prossimo esame
  const examCourses = active.filter(c => c.exam).slice(0, 1);
  const sakeExamAlert = examCourses.map(c => {
    const need = c.exam.totalQuestions || 30;
    const stock = Math.round(need * (th.sakeExamPct / 100));
    return { course: c, stock, need };
  });

  // Other ops
  const otherOps = [
    { id: "f1", icon: "mail", title: "3 fatture educator da chiudere", sub: "@Camilla @Lorenzo @Battini · scadenza ven 29 mag", tone: "warning" },
    { id: "f2", icon: "calendar", title: "Rinnovo accordo location Milano", sub: "Scade tra 18 giorni · contatto: Spazio Tomato", tone: "neutral" }
  ];

  const totalAlerts = shipmentReminders.length + bookStock.length + sakeExamAlert.length + otherOps.length;

  return (
    <section className="card" style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
      <div className="card-head" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 24, height: 24, borderRadius: 6, background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
              <D_Icon name="bell" size={13}/>
            </span>
            Promemoria operativi
            <D_Badge tone="warning" dot>{totalAlerts} aperti</D_Badge>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
            Spedizioni in scadenza, stock sotto soglia, sake disponibili per gli esami, fatture aperte.
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowSoglie(true)}>Imposta soglie<D_Icon name="settings" size={11}/></button>
      </div>
      {showSoglie && <DashThresholdsModal th={th} onClose={() => setShowSoglie(false)} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {/* Spedizioni */}
        <ReminderColumn title="Spedizioni kit" icon="download" tone="indigo" countText={`${shipmentReminders.length} corsi online`}>
          {shipmentReminders.length === 0 && <EmptyMsg>Nessuna spedizione imminente.</EmptyMsg>}
          {shipmentReminders.map(r => (
            <a key={r.course.id} href={`#/corsi/${r.course.id}`} className="reminder-row">
              <div className={`reminder-deadline ${r.shipBy <= 3 ? "urgent" : ""}`}>
                <span className="num">{r.shipBy}</span><span>gg</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="reminder-title">{r.course.shortTitle}</div>
                <div className="reminder-sub">{r.course.enrolled} kit · spedire entro {Math.max(0, r.shipBy)} giorni</div>
              </div>
            </a>
          ))}
        </ReminderColumn>

        {/* Stock libri */}
        <ReminderColumn title="Stock libri" icon="book" tone="warning" countText={`${bookStock.length} sotto soglia`}>
          {bookStock.length === 0 && <EmptyMsg>Tutto in regola.</EmptyMsg>}
          {bookStock.map((b, i) => (
            <div key={i} className="reminder-row">
              <div className={`reminder-deadline ${b.days <= 5 ? "urgent" : ""}`}>
                <span className="num">{b.qty}</span><span>pz</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="reminder-title">{b.sku}</div>
                <div className="reminder-sub">Soglia {th.bookMin} · servono entro {b.days}gg</div>
              </div>
            </div>
          ))}
        </ReminderColumn>

        {/* Sake esame */}
        <ReminderColumn title="Sake per esami" icon="exam" tone="oro" countText={sakeExamAlert.length > 0 ? "soglia da verificare" : "OK"}>
          {sakeExamAlert.length === 0 && <EmptyMsg>Nessun esame imminente.</EmptyMsg>}
          {sakeExamAlert.map(a => (
            <a key={a.course.id} href={`#/corsi/${a.course.id}`} className="reminder-row">
              <div className="reminder-deadline urgent">
                <span className="num">{a.stock}</span><span>/{a.need}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="reminder-title">{a.course.shortTitle}</div>
                <div className="reminder-sub">{a.need - a.stock} sake da reintegrare prima dell'esame</div>
              </div>
            </a>
          ))}
        </ReminderColumn>

        {/* Altri */}
        <ReminderColumn title="Altre attenzioni" icon="warn" tone="neutral" countText={`${otherOps.length} aperti`} last>
          {otherOps.map(o => (
            <div key={o.id} className="reminder-row">
              <div className="reminder-deadline" style={{ background: "var(--surface-2)" }}>
                <D_Icon name={o.icon} size={11}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="reminder-title">{o.title}</div>
                <div className="reminder-sub">{o.sub}</div>
              </div>
            </div>
          ))}
        </ReminderColumn>
      </div>
    </section>
  );
}

function ReminderColumn({ title, icon, tone, countText, last, children }) {
  const toneMap = {
    indigo: { bg: "var(--indigo-50)", fg: "var(--indigo-600)" },
    warning: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
    oro: { bg: "var(--oro-bg)", fg: "#8A6E1A" },
    neutral: { bg: "var(--surface-2)", fg: "var(--text-2)" }
  };
  const t = toneMap[tone] || toneMap.neutral;
  return (
    <div style={{ padding: "14px 16px", borderRight: last ? "none" : "1px solid var(--border-2)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ display: "inline-grid", placeItems: "center", width: 20, height: 20, borderRadius: 4, background: t.bg, color: t.fg }}>
          <D_Icon name={icon} size={11}/>
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", letterSpacing: "0.005em", textTransform: "uppercase" }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-4)", fontWeight: 500 }}>{countText}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyMsg({ children }) {
  return <div style={{ fontSize: 11.5, color: "var(--text-4)", padding: "8px 4px", fontStyle: "italic" }}>{children}</div>;
}

// =============== Modale "Report mese" ===============
function MonthlyReportModal({ onClose }) {
  const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const mIdx = (m) => MONTHS.indexOf(m);
  const periods = useMemo(() => {
    const map = new Map();
    SSA.COURSES.forEach(c => { const k = c.year + "-" + mIdx(c.month); if (!map.has(k)) map.set(k, { year: c.year, mIdx: mIdx(c.month) }); });
    return [...map.values()].sort((a, b) => b.year - a.year || b.mIdx - a.mIdx);
  }, []);
  const withPast = periods.find(p => SSA.COURSES.some(c => c.year === p.year && mIdx(c.month) === p.mIdx && c.lifecycle === "passato")) || periods[0];
  const [key, setKey] = useState(withPast.year + "-" + withPast.mIdx);
  const [yy, mm] = key.split("-").map(Number);

  const inMonth = SSA.COURSES.filter(c => c.year === yy && mIdx(c.month) === mm).sort((a, b) => (a.day || 0) - (b.day || 0));
  const svolti = inMonth.filter(c => c.lifecycle === "passato");
  const exam = svolti.reduce((a, c) => { if (c.examResults) { a.p += c.examResults.passed; a.t += c.examResults.passed + c.examResults.retrial + c.examResults.failed; } return a; }, { p: 0, t: 0 });
  const passPct = exam.t ? Math.round(exam.p / exam.t * 100) : null;
  const econ = svolti.reduce((s, c) => s + c.margin, 0);
  const ricaviSvolti = svolti.reduce((s, c) => s + c.revenue, 0);
  const educators = [...new Set(inMonth.map(c => c.educator && c.educator.name).filter(Boolean))];
  const iscritti = inMonth.reduce((s, c) => s + c.enrolled, 0);
  const cities = [...new Set(inMonth.map(c => c.city))];

  const lifeLabel = (lc) => lc === "passato" ? "Concluso" : lc === "pubblicato" ? "Attivo" : lc === "bozza" ? "Bozza" : lc === "archiviato" ? "Annullato" : lc;
  const lifeTone = (lc) => lc === "passato" ? "success" : lc === "bozza" ? "neutral" : lc === "archiviato" ? "danger" : "azzurro";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10, 37, 64, 0.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 12, boxShadow: "var(--sh-popover)", width: "100%", maxWidth: 860, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>Report mensile</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{MONTHS[mm]} {yy}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select className="select" value={key} onChange={e => setKey(e.target.value)} style={{ width: "auto", minWidth: 150 }}>
              {periods.map(p => <option key={p.year + "-" + p.mIdx} value={p.year + "-" + p.mIdx}>{MONTHS[p.mIdx]} {p.year}</option>)}
            </select>
            <button className="btn btn-icon btn-ghost" onClick={onClose}><D_Icon name="x" size={14}/></button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div className="kpi-grid cols-3" style={{ marginBottom: 16 }}>
            <D_KPI label="Nuovi corsi" value={inMonth.length} sub="a calendario nel mese" accent="indigo"/>
            <D_KPI label="Corsi svolti" value={svolti.length} sub={`${svolti.length === inMonth.length ? "tutti conclusi" : "conclusi nel mese"}`}/>
            <D_KPI label="% promossi" value={passPct === null ? "—" : passPct} unit={passPct === null ? "" : "%"} sub={exam.t ? `${exam.p}/${exam.t} esami` : "nessun esame"} accent="green"/>
            <D_KPI label="Economia corsi svolti" value={(econ >= 0 ? "+" : "") + Math.round(econ / 1000)} unit="k €" sub={econ >= 0 ? "guadagno netto" : "perdita netta"} accent={econ >= 0 ? "green" : "danger"}/>
            <D_KPI label="Educator coinvolti" value={educators.length} sub={educators.slice(0, 3).join(", ") || "—"} accent="oro"/>
            <D_KPI label="Iscritti totali" value={iscritti} sub={`${cities.length} citt${cities.length === 1 ? "à" : "à"} · ${(ricaviSvolti / 1000).toFixed(1)}k € ricavi`}/>
          </div>

          {inMonth.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 13 }}>Nessun corso in questo mese.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Data</th><th>Corso</th><th>Educator</th><th>Città</th><th style={{ textAlign: "center" }}>Iscritti</th><th>Esito</th><th>Stato</th><th style={{ textAlign: "right" }}>Margine</th></tr></thead>
                <tbody>
                  {inMonth.map(c => (
                    <tr key={c.id} className="clickable" onClick={() => { location.hash = `#/corsi/${c.id}`; onClose(); }}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}><strong>{c.day}</strong> {c.month.slice(0, 3)}</td>
                      <td><D_Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</D_Badge> <span style={{ marginLeft: 8, fontWeight: 500 }}>{c.shortTitle}</span></td>
                      <td className="text-3">{c.educator ? c.educator.name : "—"}</td>
                      <td className="text-3">{c.city}</td>
                      <td className="num" style={{ textAlign: "center" }}>{c.enrolled}/{c.capacity}</td>
                      <td>{c.examResults ? <span className="mono" style={{ fontSize: 11.5 }}><span style={{ color: "var(--success-fg)" }}>{c.examResults.passed}P</span>·{c.examResults.retrial}R·<span style={{ color: "var(--danger-fg)" }}>{c.examResults.failed}B</span></span> : <span className="text-mute">—</span>}</td>
                      <td><D_Badge tone={lifeTone(c.lifecycle)}>{lifeLabel(c.lifecycle)}</D_Badge></td>
                      <td className="num" style={{ textAlign: "right", color: c.margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)", fontWeight: 600 }}>{c.margin >= 0 ? "+" : ""}{c.margin.toLocaleString("it-IT")} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "var(--text-4)", display: "inline-flex", alignItems: "center", gap: 6 }}><D_Icon name="info" size={11}/>Dati corsi del periodo selezionato · economia calcolata sui corsi conclusi.</span>
          <button className="btn btn-sm" onClick={() => window.print()}><D_Icon name="download" size={12}/>Esporta PDF</button>
        </div>
      </div>
    </div>
  );
}
function DashThresholdsModal({ th, onClose }) {
  const [shipDays, setShipDays] = useState(th.shipDays);
  const [bookMin, setBookMin] = useState(th.bookMin);
  const [sakeExamPct, setSakeExamPct] = useState(th.sakeExamPct);
  const save = () => {
    SSA.setDashThresholds({ shipDays: Math.max(0, +shipDays || 0), bookMin: Math.max(0, +bookMin || 0), sakeExamPct: Math.min(100, Math.max(0, +sakeExamPct || 0)) });
    onClose();
  };
  const Row = ({ icon, title, sub, children }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-2)" }}>
      <span style={{ display: "inline-grid", placeItems: "center", width: 30, height: 30, borderRadius: 7, background: "var(--surface-2)", color: "var(--text-2)", flexShrink: 0 }}><D_Icon name={icon} size={14}/></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
  const numStyle = { width: 72, height: 32, padding: "0 8px", textAlign: "right" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10, 37, 64, 0.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 12, boxShadow: "var(--sh-popover)", width: "100%", maxWidth: 480 }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>Promemoria operativi</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Imposta soglie</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><D_Icon name="x" size={14}/></button>
        </div>
        <div style={{ padding: "6px 22px 14px" }}>
          <Row icon="download" title="Anticipo spedizione kit" sub="Giorni prima del corso online per spedire i kit">
            <input className="input num" type="number" min="0" value={shipDays} onChange={e => setShipDays(e.target.value)} style={numStyle}/>
          </Row>
          <Row icon="book" title="Soglia minima stock libri" sub="Avvisa quando un titolo scende sotto questa quantità">
            <input className="input num" type="number" min="0" value={bookMin} onChange={e => setBookMin(e.target.value)} style={numStyle}/>
          </Row>
          <Row icon="exam" title="Soglia sake per esami" sub="% minima di sake disponibili rispetto al fabbisogno">
            <input className="input num" type="number" min="0" max="100" value={sakeExamPct} onChange={e => setSakeExamPct(e.target.value)} style={numStyle}/>
          </Row>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--surface-2)" }}>
          <button className="btn" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={save}><D_Icon name="check" size={12}/>Salva soglie</button>
        </div>
      </div>
    </div>
  );
}
