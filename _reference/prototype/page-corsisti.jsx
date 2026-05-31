// V2 Corsisti — lista + profilo
const { Icon: CS_Icon, Avatar: CS_Avatar, Badge: CS_Badge, PageHeader: CS_PageHeader } = window.V2;

function V2_PageCorsisti() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("tutti");
  const [examFilter, setExamFilter] = useState("");

  const list = useMemo(() => {
    let l = SSA.STUDENTS.slice();
    if (source === "attuali") l = l.filter(s => !s.historical);
    if (source === "storici") l = l.filter(s => s.historical);
    if (source === "ripartecipanti") l = l.filter(s => s.isReturning);
    if (search) l = l.filter(s => (s.name + s.email + s.city).toLowerCase().includes(search.toLowerCase()));
    if (examFilter) l = l.filter(s => s.courses.some(c => c.examResult === examFilter));
    return l.sort((a,b) => b.totalSpent - a.totalSpent);
  }, [search, source, examFilter]);

  const stats = {
    total: SSA.STUDENTS.length,
    returning: SSA.STUDENTS.filter(s => s.isReturning).length,
    historical: SSA.STUDENTS.filter(s => s.historical).length,
    passed: SSA.STUDENTS.filter(s => s.courses.some(c => c.examResult === "passed")).length
  };

  return (
    <div className="page">
      <CS_PageHeader
        eyebrow="Comunità"
        title="Corsisti"
        sub={`${stats.total} corsisti totali dal 2016. ${stats.returning} hanno fatto più di un corso, ${stats.passed} sono Sake Sommelier certificati.`}
        actions={<button className="btn"><CS_Icon name="download" size={13}/>Esporta CSV</button>}
      />

      <div className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
        <window.V2.KPI anim label="Totale corsisti" value={stats.total} sub="dal 2016"/>
        <window.V2.KPI anim label="Attuali (post-2024)" value={stats.total - stats.historical} sub="da Shopify"/>
        <window.V2.KPI anim label="Ripartecipanti" value={stats.returning} sub={`${Math.round(stats.returning/stats.total*100)}%`} accent="oro"/>
        <window.V2.KPI anim label="Certificati" value={stats.passed} sub="esame superato" accent="green"/>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 320px" }}>
          <CS_Icon name="search" size={14} className="topbar-search-icon"/>
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Cerca per nome, email, città…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="segmented">
          {[["tutti","Tutti"],["attuali","Attuali"],["storici","Storici"],["ripartecipanti","Ripartecip."]].map(([k,l]) => (
            <button key={k} className={source === k ? "on" : ""} onClick={() => setSource(k)}>{l}</button>
          ))}
        </div>
        <select className="select" style={{ width: "auto" }} value={examFilter} onChange={e => setExamFilter(e.target.value)}>
          <option value="">Tutti gli esiti</option>
          <option value="passed">Promossi</option>
          <option value="retrial">Recupero</option>
          <option value="failed">Bocciati</option>
        </select>
        <div style={{ flex: 1 }}></div>
        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>{list.length} corsisti</div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Corsista</th><th>Città</th><th>Storia</th><th>Esito esame</th><th style={{ textAlign: "right" }}>Speso</th><th></th></tr>
          </thead>
          <tbody>
            {list.slice(0, 60).map(s => {
              const lastCourse = s.courses[s.courses.length - 1];
              const certificate = s.courses.find(c => c.examResult === "passed");
              return (
                <tr key={s.email} className="clickable" onClick={() => location.hash = `#/corsisti/${encodeURIComponent(s.email)}`}>
                  <td>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <CS_Avatar name={s.name} tone={s.historical ? "navy" : undefined}/>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          {s.historical && <CS_Badge tone="neutral">Storico</CS_Badge>}
                          {s.isReturning && !s.historical && <CS_Badge tone="oro">Ripart.</CS_Badge>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                          <a
                            href={`mailto:${s.email}`}
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)" }}
                          >
                            <CS_Icon name="mail" size={11} className="text-4"/>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.email}</span>
                          </a>
                          <a
                            href={`tel:${(s.phone || "").replace(/\s/g,"")}`}
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)" }}
                            title={`Chiama ${s.phone}`}
                          >
                            <CS_Icon name="phone" size={11} className="text-4"/>
                            {s.phone}
                            {s.hasWhatsApp && <span title="Ha WhatsApp" style={{ color: "var(--success-fg)", fontSize: 10, marginLeft: 2, display: "inline-flex", alignItems: "center", gap: 2 }}><CS_Icon name="whatsapp" size={10}/>WA</span>}
                          </a>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="text-3">{s.city}</td>
                  <td>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      <strong style={{ color: "var(--text)" }}>{s.courses.length}</strong> corsi · dal {s.firstSeen.split("-")[0]}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 2 }}>
                      ultimo: {lastCourse?.courseTitle} ({lastCourse?.month} {lastCourse?.year})
                    </div>
                  </td>
                  <td>
                    {certificate ? <CS_Badge tone="success">Promosso</CS_Badge> :
                      s.courses.some(c => c.examResult === "retrial") ? <CS_Badge tone="warning">Recupero</CS_Badge> :
                      s.courses.some(c => c.examResult === "failed") ? <CS_Badge tone="danger">Bocciato</CS_Badge> :
                      <span className="text-mute">—</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>{s.totalSpent.toLocaleString("it-IT")}€</td>
                  <td><CS_Icon name="chevron" size={13} className="text-4"/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > 60 && <div style={{ padding: 14, textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>Mostro 60 di {list.length} · <button className="link">carica altri</button></div>}
    </div>
  );
}

// =========== Profilo ===========
function V2_PageCorsista({ email }) {
  const s = SSA.STUDENTS.find(x => x.email === email.toLowerCase());
  if (!s) return <div className="page"><div className="card card-pad">Non trovato. <a href="#/corsisti" className="link">Torna</a></div></div>;

  const certificate = s.courses.find(c => c.examResult === "passed");
  const monthOrder = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const sorted = [...s.courses].sort((a,b) => a.year - b.year || monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
  const firstYear = sorted[0]?.year;
  const lastYear = sorted[sorted.length - 1]?.year;

  return (
    <div className="page">
      {/* Hero */}
      <section className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, padding: "28px 32px", alignItems: "center" }}>
          <CS_Avatar name={s.name} size="xl" tone={s.historical ? "navy" : undefined}/>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Dossier corsista
              {s.historical && <span> · Storico pre-2024</span>}
              {s.isReturning && !s.historical && <span style={{ color: "var(--oro)" }}> · Ripartecipante</span>}
            </div>
            <h1 className="display" style={{ fontSize: 32 }}>{s.name}</h1>
            <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 13, color: "var(--text-2)", flexWrap: "wrap" }}>
              <span><CS_Icon name="mail" size={12} className="text-3"/> {s.email}</span>
              <span>{s.hasWhatsApp && <span style={{ color: "var(--success)" }}>● </span>}<CS_Icon name="phone" size={12} className="text-3"/> {s.phone}</span>
              <span><CS_Icon name="pin" size={12} className="text-3"/> {s.city}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-icon"><CS_Icon name="mail" size={13}/></button>
            <button className="btn btn-icon"><CS_Icon name="whatsapp" size={13}/></button>
            <button className="btn">Esporta scheda</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--border)" }}>
          <ProfStat label="Corsi" value={s.courses.length} sub={`dal ${firstYear} al ${lastYear}`}/>
          <ProfStat label="Esami" value={s.courses.filter(c => c.examResult).length} sub={certificate ? "1 promosso" : "—"}/>
          <ProfStat label="Speso totale" value={`${s.totalSpent}`} unit="€"/>
          <ProfStat label="Status" value={certificate ? "Certificato" : s.courses.length > 1 ? "Returning" : "Attivo"} last/>
        </div>
      </section>

      {/* Journey timeline */}
      <section style={{ marginBottom: 28 }}>
        <h2 className="h2" style={{ marginBottom: 6 }}>La sua journey nella SSA</h2>
        <p className="text-3" style={{ fontSize: 13, marginTop: 4, marginBottom: 18 }}>
          {s.courses.length === 1
            ? "Ha frequentato un solo corso. Candidato per Masterclass o livello successivo."
            : `Ha frequentato ${s.courses.length} corsi nell'arco di ${lastYear - firstYear + 1} anni.`}
        </p>
        <JourneyTimeline courses={sorted}/>
      </section>

      <section>
        <h3 className="eyebrow" style={{ marginBottom: 12 }}>Dettaglio corsi</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Data</th><th>Corso</th><th>Città</th><th>Esito</th><th style={{ textAlign: "right" }}>Importo</th></tr></thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr key={i} className={c.historical ? "" : "clickable"} onClick={() => !c.historical && (location.hash = `#/corsi/${c.courseId}`)}>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{c.month.slice(0,3)} {c.year}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CS_Badge tone={c.courseType === "certificato" ? "azzurro" : c.courseType === "introduttivo" ? "oro" : "neutral"}>{(c.courseType || "").toUpperCase()}</CS_Badge>
                      <span style={{ fontWeight: 500 }}>{c.courseTitle}</span>
                      {c.historical && <CS_Badge tone="neutral">Storico</CS_Badge>}
                    </div>
                  </td>
                  <td className="text-3">{c.city}</td>
                  <td>
                    {c.examResult === "passed" && <CS_Badge tone="success">Promosso</CS_Badge>}
                    {c.examResult === "retrial" && <CS_Badge tone="warning">Recupero</CS_Badge>}
                    {c.examResult === "failed" && <CS_Badge tone="danger">Bocciato</CS_Badge>}
                    {!c.examResult && <span className="text-mute">—</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>{c.amount}€</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ProfStat({ label, value, unit, sub, last }) {
  return (
    <div style={{ padding: "18px 24px", borderRight: last ? "none" : "1px solid var(--border-2)" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }} className="num">{value}{unit && <span style={{ fontSize: "0.6em", color: "var(--text-3)", marginLeft: 2 }}>{unit}</span>}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function JourneyTimeline({ courses }) {
  if (!courses.length) return null;
  const firstYear = courses[0].year;
  const lastYear = Math.max(courses[courses.length - 1].year, 2026);
  const years = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);
  return (
    <div className="card" style={{ padding: "24px 20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${years.length}, 1fr)`, gap: 0 }}>
        {years.map((y, i) => (
          <div key={y} style={{ borderLeft: i === 0 ? "none" : "1px dashed var(--border)", paddingLeft: 12, paddingRight: 12, minHeight: 120 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{y}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {courses.filter(c => c.year === y).map((c, ci) => {
                const palette = c.courseType === "certificato" ? { bg: "var(--azzurro-bg)", fg: "var(--azzurro)" } : c.courseType === "introduttivo" ? { bg: "var(--oro-bg)", fg: "#8A6E1A" } : { bg: "var(--surface-2)", fg: "var(--text-2)" };
                return (
                  <div key={ci} style={{ padding: 8, borderRadius: 4, background: palette.bg, color: palette.fg, fontSize: 11 }}>
                    <div style={{ fontWeight: 600, fontSize: 9.5, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginBottom: 2 }}>{c.month.slice(0,3)}</div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>{c.courseTitle.split(" ").slice(0,3).join(" ")}</div>
                    <div style={{ marginTop: 2, color: "var(--text-3)", fontSize: 10.5 }}>{c.city}</div>
                    {c.examResult === "passed" && <div style={{ marginTop: 4, fontSize: 10, color: "var(--success-fg)", fontWeight: 600 }}>✓ Promosso</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.V2_PageCorsisti = V2_PageCorsisti;
window.V2_PageCorsista = V2_PageCorsista;
