// V2 Educator — lista + dettaglio
const { Icon: ED_Icon, Avatar: ED_Avatar, Badge: ED_Badge, PageHeader: ED_PageHeader, KPI: ED_KPI } = window.V2;

function V2_PageEducator() {
  const [filterType, setFilterType] = useState("");
  const enriched = SSA.EDUCATORS.map(e => {
    const courses = SSA.COURSES.filter(c => c.educator?.id === e.id);
    const active = courses.filter(c => c.lifecycle === "pubblicato");
    const past = courses.filter(c => c.lifecycle === "passato");
    const totalStudents = courses.reduce((s,c) => s + c.enrolled, 0);
    const passed = past.reduce((s,c) => s + (c.examResults?.passed || 0), 0);
    const totalExam = past.reduce((s,c) => s + ((c.examResults?.passed || 0) + (c.examResults?.retrial || 0) + (c.examResults?.failed || 0)), 0);
    return { ...e, courses, active, past, totalStudents, passRate: totalExam ? passed / totalExam : null, quals: SSA.getQuals(e.id) };
  }).sort((a,b) => b.totalStudents - a.totalStudents);

  const list = filterType ? enriched.filter(e => e.quals.includes(filterType)) : enriched;

  return (
    <div className="page">
      <ED_PageHeader eyebrow="Team" title="Educator" sub="I formatori della SSA, base, abilitazioni e statistiche complessive."/>

      {/* Filtro abilitazioni */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, marginRight: 2 }}>Abilitati a:</span>
        <button className={`pill ${filterType === "" ? "on" : ""}`} onClick={() => setFilterType("")}>Tutti<span style={{ marginLeft: 5, opacity: 0.7 }} className="num">{enriched.length}</span></button>
        {SSA.ALL_TYPES.map(t => {
          const n = enriched.filter(e => e.quals.includes(t)).length;
          return (
            <button key={t} className={`pill ${filterType === t ? "on" : ""}`} onClick={() => setFilterType(filterType === t ? "" : t)}>
              {SSA.COURSE_TYPES[t].label}<span style={{ marginLeft: 5, opacity: 0.7 }} className="num">{n}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {list.map(e => (
          <a key={e.id} href={`#/educator/${e.id}`} className="card" style={{ padding: 22, display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, transition: "transform var(--dur-fast), box-shadow var(--dur-fast)" }} onMouseEnter={ev => { ev.currentTarget.style.transform = "translateY(-1px)"; ev.currentTarget.style.boxShadow = "var(--sh-3)"; }} onMouseLeave={ev => { ev.currentTarget.style.transform = "none"; ev.currentTarget.style.boxShadow = "var(--sh-card)"; }}>
            <ED_Avatar name={e.name} initials={e.initials} size="xl"/>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{e.role} · {e.city}</div>
              <div className="h2" style={{ fontSize: 18 }}>{e.name}</div>
              <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "6px 0 12px", lineHeight: 1.5 }}>{e.bio}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                <span style={{ fontSize: 10.5, color: "var(--text-4)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginRight: 2 }}>Abilitato a</span>
                {e.quals.length === 0 && <span style={{ fontSize: 11.5, color: "var(--text-mute)", fontStyle: "italic" }}>nessuna abilitazione</span>}
                {e.quals.map(q => <ED_Badge key={q} tone={q === filterType ? "indigo" : "neutral"}>{SSA.shortLabel(q)}</ED_Badge>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, paddingTop: 12, borderTop: "1px solid var(--border-2)" }}>
                <SmallNum label="corsi" value={e.courses.length}/>
                <SmallNum label="attivi" value={e.active.length} accent={e.active.length > 0 ? "indigo" : ""}/>
                <SmallNum label="iscritti" value={e.totalStudents}/>
                <SmallNum label="% promossi" value={e.passRate !== null ? Math.round(e.passRate * 100) + "%" : "—"} accent={e.passRate >= 0.8 ? "success" : ""}/>
              </div>
            </div>
          </a>
        ))}
      </div>
      {list.length === 0 && (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-3)", border: "1px dashed var(--border)", borderRadius: 8, marginTop: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Nessun educator abilitato a {SSA.COURSE_TYPES[filterType]?.label}</div>
          <div style={{ fontSize: 13 }}>Assegna l'abilitazione dal profilo di un educator.</div>
        </div>
      )}
    </div>
  );
}

function SmallNum({ label, value, accent }) {
  const color = accent === "indigo" ? "var(--indigo)" : accent === "success" ? "var(--success-fg)" : "var(--text)";
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, color }} className="num">{value}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function V2_PageEducatorDetail({ id }) {
  const e = SSA.EDUCATORS.find(x => x.id === id);
  if (!e) return <div className="page"><a className="link" href="#/educator">Torna</a></div>;
  const courses = SSA.COURSES.filter(c => c.educator?.id === id);
  const active = courses.filter(c => c.lifecycle === "pubblicato");
  const past = courses.filter(c => c.lifecycle === "passato");
  const totalStudents = courses.reduce((s,c) => s + c.enrolled, 0);
  const totalRevenue = courses.reduce((s,c) => s + c.revenue, 0);
  const passed = past.reduce((s,c) => s + (c.examResults?.passed || 0), 0);
  const totalExam = past.reduce((s,c) => s + ((c.examResults?.passed || 0) + (c.examResults?.retrial || 0) + (c.examResults?.failed || 0)), 0);
  const cities = Array.from(new Set(courses.map(c => c.city)));

  return (
    <div className="page">
      <section className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, padding: "28px 32px", alignItems: "center" }}>
          <ED_Avatar name={e.name} initials={e.initials} size="xl"/>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{e.role} · {e.years} anni · {e.lang.join(" / ")}</div>
            <h1 className="display" style={{ fontSize: 32 }}>{e.name}</h1>
            <p style={{ fontSize: 14, color: "var(--text-2)", margin: "12px 0", lineHeight: 1.55, maxWidth: 640 }}>{e.bio}</p>
            <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--text-2)", flexWrap: "wrap" }}>
              <span><ED_Icon name="pin" size={12} className="text-3"/> Base: <strong>{e.city}</strong></span>
              {cities.filter(c => c !== e.city).length > 0 && <span><ED_Icon name="globe" size={12} className="text-3"/> Insegna anche in {cities.filter(c => c !== e.city).join(", ")}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn"><ED_Icon name="share" size={13}/>Link condivisi</button>
          </div>
        </div>
      </section>

      <EducatorQuals educator={e}/>

      <div className="kpi-grid cols-5" style={{ marginBottom: 24 }}>
        <ED_KPI anim label="Corsi totali" value={courses.length} sub={`${active.length} attivi · ${past.length} passati`}/>
        <ED_KPI anim label="Iscritti formati" value={totalStudents} sub="lifetime"/>
        <ED_KPI anim label="Ricavi generati" value={Math.round(totalRevenue/1000)} unit="k €" sub="lifetime" accent="indigo"/>
        <ED_KPI anim label="% promossi" value={totalExam ? Math.round(passed/totalExam * 100) : "—"} unit={totalExam ? "%" : ""} sub={`${passed}/${totalExam} esami`} accent="green"/>
        <ED_KPI anim label="Città" value={cities.length} sub={cities.slice(0,3).join(", ")} accent="oro"/>
      </div>

      {active.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 className="h2" style={{ marginBottom: 14 }}>Prossimi corsi</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {active.map(c => (
              <a key={c.id} href={`#/corsi/${c.id}`} className="card card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <ED_Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</ED_Badge>
                  <window.V2.StatusBadge status={c.status}/>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.shortTitle}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{c.day} {c.month} {c.year} · {c.city}</div>
                <div className={`bar ${c.enrolled < c.minStudents ? "warning" : "azzurro"}`} style={{ marginTop: 12 }}><i style={{ width: c.enrolled/c.capacity*100 + "%" }}></i></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, color: "var(--text-3)" }}>
                  <span>{c.enrolled}/{c.capacity}</span>
                  <span className="num">{(c.revenue/1000).toFixed(1)}k€</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="h2" style={{ marginBottom: 14 }}>Storico corsi</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Data</th><th>Corso</th><th>Città</th><th>Iscritti</th><th>Esami</th><th style={{ textAlign: "right" }}>Ricavi</th></tr></thead>
              <tbody>
                {past.map(c => (
                  <tr key={c.id} className="clickable" onClick={() => location.hash = `#/corsi/${c.id}`}>
                    <td className="num">{c.month.slice(0,3)} {c.year}</td>
                    <td><ED_Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</ED_Badge> <span style={{ marginLeft: 8, fontWeight: 500 }}>{c.shortTitle}</span></td>
                    <td className="text-3">{c.city}</td>
                    <td className="num">{c.enrolled}/{c.capacity}</td>
                    <td>
                      {c.examResults ? (
                        <span className="mono" style={{ fontSize: 11.5 }}>
                          <span style={{ color: "var(--success-fg)" }}>{c.examResults.passed}P</span> · {c.examResults.retrial}R · <span style={{ color: "var(--danger-fg)" }}>{c.examResults.failed}B</span>
                        </span>
                      ) : <span className="text-mute">—</span>}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>{c.revenue.toLocaleString("it-IT")}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function EducatorQuals({ educator }) {
  const quals = SSA.getQuals(educator.id);
  const types = SSA.ALL_TYPES;
  const toggle = (t) => {
    const next = quals.includes(t) ? quals.filter(x => x !== t) : [...quals, t];
    SSA.setQuals(educator.id, next);
  };
  return (
    <section className="card card-pad" style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><ED_Icon name="check" size={12}/>Abilitazioni</div>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, maxWidth: 620 }}>
            Tipologie di corso a cui <strong>{educator.name}</strong> è assegnabile. Nel Pianificatore comparirà solo nelle liste dei corsi per cui è abilitato.
          </div>
        </div>
        <ED_Badge tone={quals.length ? "indigo" : "warning"} dot>{quals.length} abilitazion{quals.length === 1 ? "e" : "i"}</ED_Badge>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {types.map(t => {
          const on = quals.includes(t);
          const meta = SSA.COURSE_TYPES[t];
          return (
            <button key={t} onClick={() => toggle(t)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", border: `1px solid ${on ? "var(--indigo)" : "var(--border)"}`, background: on ? "var(--indigo-50)" : "var(--surface)", color: on ? "var(--indigo-600)" : "var(--text-3)" }}>
              <span style={{ display: "inline-grid", placeItems: "center", width: 16, height: 16, borderRadius: 4, border: `1px solid ${on ? "var(--indigo)" : "var(--border)"}`, background: on ? "var(--indigo)" : "transparent", color: "white" }}>{on && <ED_Icon name="check" size={11}/>}</span>
              {meta.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

window.V2_PageEducator = V2_PageEducator;
window.V2_PageEducatorDetail = V2_PageEducatorDetail;
