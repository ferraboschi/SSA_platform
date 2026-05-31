// V2 Archivio — repository corsi passati/presenti/futuri
const { Icon: AR_Icon, Badge: AR_Badge, PageHeader: AR_PageHeader, KPI: AR_KPI } = window.V2;

function V2_PageArchivio() {
  const [year, setYear] = useState("tutti");
  const [groupBy, setGroupBy] = useState("anno");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

  const all = SSA.COURSES.filter(c => c.lifecycle !== "bozza" && c.lifecycle !== "archiviato");
  const years = Array.from(new Set(all.map(c => c.year))).sort((a,b) => b - a);

  const filtered = useMemo(() => {
    let l = all;
    if (year !== "tutti") l = l.filter(c => c.year === Number(year));
    if (filterType) l = l.filter(c => c.type === filterType);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(c => (c.shortTitle + " " + c.city + " " + (c.educator?.name || "")).toLowerCase().includes(q));
    }
    return l;
  }, [year, filterType, search]);

  const stats = {
    total: filtered.length,
    students: filtered.reduce((s,c) => s + c.enrolled, 0),
    revenue: filtered.reduce((s,c) => s + c.revenue, 0),
    cities: new Set(filtered.map(c => c.city)).size
  };

  return (
    <div className="page">
      <AR_PageHeader eyebrow="Repository" title="Archivio completo" sub="Tutti i corsi della SSA, passati, in corso e futuri. Esplora per anno, città o educator."
        actions={<button className="btn"><AR_Icon name="download" size={13}/>Esporta archivio</button>}
      />

      <div className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
        <AR_KPI anim label="Corsi" value={stats.total} sub={year === "tutti" ? "totali" : `nel ${year}`}/>
        <AR_KPI anim label="Iscritti formati" value={stats.students}/>
        <AR_KPI anim label="Ricavi cumulativi" value={Math.round(stats.revenue/1000)} unit="k €" accent="indigo"/>
        <AR_KPI anim label="Città" value={stats.cities} sub={`su ${SSA.CITIES.length} possibili`}/>
      </div>

      <YearStrip courses={all} selectedYear={year} onSelect={setYear}/>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 280px" }}>
          <AR_Icon name="search" size={14} className="topbar-search-icon"/>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Cerca corso, città, educator…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span style={{ width: 1, height: 22, background: "var(--border)" }}></span>
        <span className="eyebrow">Anno:</span>
        <div className="segmented">
          <button className={year === "tutti" ? "on" : ""} onClick={() => setYear("tutti")}>Tutti</button>
          {years.map(y => <button key={y} className={year === String(y) ? "on" : ""} onClick={() => setYear(String(y))}>{y}</button>)}
        </div>
        <span style={{ width: 1, height: 22, background: "var(--border)" }}></span>
        <span className="eyebrow">Tipo:</span>
        <select className="select" style={{ width: "auto" }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tutti</option>
          {Object.keys(SSA.COURSE_TYPES).map(k => <option key={k} value={k}>{SSA.COURSE_TYPES[k].label}</option>)}
        </select>
        <div style={{ flex: 1 }}></div>
        <span className="eyebrow">Raggruppa:</span>
        <div className="segmented">
          {[["anno","Anno"],["citta","Città"],["educator","Educator"],["tipo","Tipo"]].map(([k,l]) => (
            <button key={k} className={groupBy === k ? "on" : ""} onClick={() => setGroupBy(k)}>{l}</button>
          ))}
        </div>
      </div>

      <ArchivioGroups courses={filtered} groupBy={groupBy}/>
    </div>
  );
}

function YearStrip({ courses, selectedYear, onSelect }) {
  // Aggregate counts by year and by year+type for stacked bars
  const { byYear, byYearType, types } = useMemo(() => {
    const yMap = new Map();
    const ytMap = new Map();
    const tSet = new Set();
    courses.forEach(c => {
      yMap.set(c.year, (yMap.get(c.year) || 0) + 1);
      const k = c.year + ":" + c.type;
      ytMap.set(k, (ytMap.get(k) || 0) + 1);
      tSet.add(c.type);
    });
    // Order types for consistent stacking
    const TYPE_ORDER = ["certificato", "introduttivo", "shochu", "masterclass", "mixology"];
    const orderedTypes = TYPE_ORDER.filter(t => tSet.has(t));
    return { byYear: yMap, byYearType: ytMap, types: orderedTypes };
  }, [courses]);

  const ys = Array.from(byYear.keys()).sort((a,b) => a - b);
  if (!ys.length) return null;
  const min = ys[0], max = ys[ys.length - 1];
  const range = []; for (let y = min; y <= max; y++) range.push(y);

  const maxCount = Math.max(...range.map(y => byYear.get(y) || 0));
  // Round up the y-axis max to a nice number (next multiple of 5)
  const axisMax = Math.ceil(maxCount / 5) * 5 || 5;
  // Generate gridline ticks: 5 lines including 0 and axisMax
  const ticks = [0, axisMax * 0.25, axisMax * 0.5, axisMax * 0.75, axisMax];

  const total = courses.length;
  const avg = total / range.length;

  // Type colors (semantic)
  const TYPE_META = {
    certificato:  { color: "var(--indigo)",     soft: "var(--indigo-100)",  label: "Certificato" },
    introduttivo: { color: "var(--oro)",        soft: "var(--oro-bg)",      label: "Introduttivo" },
    shochu:       { color: "var(--azzurro)",    soft: "var(--azzurro-bg)",  label: "Shochu" },
    masterclass:  { color: "var(--success)",    soft: "var(--success-bg)",  label: "Masterclass" },
    mixology:     { color: "var(--navy-400)",   soft: "var(--surface-2)",   label: "Mixology" }
  };

  const CHART_H = 160;

  return (
    <section className="card card-pad-lg" style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Distribuzione storica</div>
          <div className="text-3" style={{ fontSize: 12 }}>
            <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>{total}</span> corsi totali ·
            media <span className="num" style={{ color: "var(--text-2)", fontWeight: 500 }}>{avg.toFixed(1)}</span>/anno ·
            picco <span className="num" style={{ color: "var(--text-2)", fontWeight: 500 }}>{maxCount}</span>
          </div>
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {types.map(t => (
            <div key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-2)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: TYPE_META[t]?.color || "var(--text-3)" }}></span>
              {TYPE_META[t]?.label || t}
            </div>
          ))}
        </div>
      </div>

      {/* Chart with Y-axis */}
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 12 }}>
        {/* Y-axis labels */}
        <div style={{ position: "relative", height: CHART_H, marginRight: 4 }}>
          {ticks.slice().reverse().map((t, i) => (
            <div key={i} style={{
              position: "absolute",
              top: ((i / (ticks.length - 1)) * 100) + "%",
              right: 0,
              transform: "translateY(-50%)",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--text-4)",
              fontVariantNumeric: "tabular-nums"
            }}>{Math.round(t)}</div>
          ))}
        </div>

        {/* Chart canvas */}
        <div style={{ position: "relative", height: CHART_H }}>
          {/* Gridlines */}
          {ticks.map((t, i) => (
            <div key={i} style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: ((1 - t / axisMax) * 100) + "%",
              borderTop: t === 0 ? "1px solid var(--border)" : "1px dashed var(--border-2)",
              pointerEvents: "none"
            }}></div>
          ))}

          {/* Average reference line */}
          <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: ((1 - avg / axisMax) * 100) + "%",
            borderTop: "1px dashed var(--indigo-400)",
            pointerEvents: "none",
            zIndex: 1
          }}>
            <span style={{
              position: "absolute",
              right: 0,
              top: -8,
              padding: "1px 6px",
              background: "var(--indigo-50)",
              color: "var(--indigo)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRadius: 3,
              border: "1px solid var(--indigo-100)",
              lineHeight: 1.4
            }}>media {avg.toFixed(1)}</span>
          </div>

          {/* Bars */}
          <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${range.length}, 1fr)`, gap: 4 }}>
            {range.map(y => {
              const count = byYear.get(y) || 0;
              const sel = String(y) === selectedYear;
              return (
                <div key={y} style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  {/* Hover background */}
                  <button onClick={() => onSelect(String(y))} style={{
                    position: "absolute", inset: "-8px -8px 0 -8px",
                    background: sel ? "var(--indigo-50)" : "transparent",
                    border: sel ? "1px solid var(--indigo-100)" : "1px solid transparent",
                    borderRadius: 6,
                    transition: "background var(--dur-fast), border-color var(--dur-fast)",
                    cursor: "pointer",
                    padding: 0
                  }} onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--surface-2)"; }} onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }} aria-label={`Filtra ${y}`}></button>

                  {/* Stacked bar */}
                  <div style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: 56,
                    height: (count / axisMax) * 100 + "%",
                    minHeight: count > 0 ? 4 : 0,
                    display: "flex",
                    flexDirection: "column-reverse",
                    borderRadius: "3px 3px 0 0",
                    overflow: "hidden",
                    pointerEvents: "none",
                    boxShadow: sel ? "0 0 0 1.5px var(--indigo)" : "none"
                  }}>
                    {types.map(t => {
                      const n = byYearType.get(y + ":" + t) || 0;
                      if (!n) return null;
                      return (
                        <div key={t} title={`${TYPE_META[t]?.label}: ${n}`} style={{
                          height: (n / count) * 100 + "%",
                          background: TYPE_META[t]?.color || "var(--text-3)",
                          transition: "all var(--dur)"
                        }}></div>
                      );
                    })}
                  </div>

                  {/* Total label above bar */}
                  {count > 0 && (
                    <div style={{
                      position: "absolute",
                      bottom: (count / axisMax) * 100 + "%",
                      left: "50%",
                      transform: "translateX(-50%) translateY(-6px)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: sel ? "var(--indigo)" : "var(--text)",
                      letterSpacing: "-0.005em",
                      pointerEvents: "none",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap"
                    }}>{count}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis (year labels) */}
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 12, marginTop: 10 }}>
        <div></div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${range.length}, 1fr)`, gap: 4 }}>
          {range.map(y => {
            const sel = String(y) === selectedYear;
            return (
              <div key={y} className="mono" style={{ textAlign: "center", fontSize: 11, color: sel ? "var(--indigo)" : "var(--text-3)", fontWeight: sel ? 600 : 500 }}>{y}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ArchivioGroups({ courses, groupBy }) {
  const monthOrder = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const groups = useMemo(() => {
    const map = new Map();
    courses.forEach(c => {
      let key;
      if (groupBy === "anno") key = c.year;
      else if (groupBy === "citta") key = c.city;
      else if (groupBy === "educator") key = c.educator?.name || "—";
      else if (groupBy === "tipo") key = SSA.COURSE_TYPES[c.type]?.label || c.type;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    const arr = Array.from(map.entries());
    if (groupBy === "anno") arr.sort((a,b) => b[0] - a[0]);
    else arr.sort((a,b) => b[1].length - a[1].length);
    return arr;
  }, [courses, groupBy]);

  if (!groups.length) return <div className="card card-pad-lg text-3" style={{ textAlign: "center" }}>Nessun corso.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {groups.map(([key, list]) => {
        const sorted = [...list].sort((a,b) => b.year - a.year || monthOrder.indexOf(b.month) - monthOrder.indexOf(a.month));
        const studs = list.reduce((s,c) => s + c.enrolled, 0);
        const rev = list.reduce((s,c) => s + c.revenue, 0);
        return (
          <section key={key}>
            <header style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 10, marginBottom: 14, borderBottom: "1px solid var(--border)" }}>
              <h2 className="h2" style={{ fontSize: 22 }}>{key}</h2>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase" }}>{list.length} corsi · {studs} iscritti · {(rev/1000).toFixed(1)}k €</span>
            </header>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {sorted.map(c => (
                <a key={c.id} href={`#/corsi/${c.id}`} className="card" style={{ padding: 14, transition: "transform var(--dur-fast), box-shadow var(--dur-fast)" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "var(--sh-3)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--sh-card)"; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <AR_Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</AR_Badge>
                    {c.lifecycle === "passato" && <span className="mono" style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: "var(--ls-caps)" }}>CONCLUSO</span>}
                    {c.lifecycle === "pubblicato" && <span className="mono" style={{ fontSize: 10, color: "var(--success-fg)", letterSpacing: "var(--ls-caps)" }}>● PROSSIMO</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{c.shortTitle}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>{c.day} {c.month} {c.year} · {c.city}</div>
                  <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-2)", display: "flex", justifyContent: "space-between" }}>
                    <span>{c.educator?.name}</span>
                    <span className="num">{c.enrolled} iscritti</span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

window.V2_PageArchivio = V2_PageArchivio;
