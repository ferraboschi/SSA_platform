// V2 Corsi — Lista con tabs, filtri, viste timeline/griglia/tabella
const { Icon: C_Icon, Avatar: C_Avatar, Badge: C_Badge, StatusBadge: C_Status, PageHeader: C_PageHeader } = window.V2;

// ============ Status rule (centralized definition) ============
// Esplicita la regola usata per assegnare lo stato salute corso.
// Fonte: discussione Lore & Maiko (29 mag 2026).
const STATUS_RULES = [
  { key: "in-traiettoria", title: "In traiettoria",
    rule: "≥ 20% del max a ≥ 1 mese dal corso",
    detail: "Iscrizioni almeno al 20% della capienza con un mese o più di anticipo. Curva in linea con la mediana storica."
  },
  { key: "monitor", title: "Da monitorare",
    rule: "> 2 mesi dal corso, dati ancora deboli",
    detail: "Più di due mesi al corso. Iscrizioni basse ma è ancora presto per allarmarsi."
  },
  { key: "rischio", title: "A rischio",
    rule: "Tra «In traiettoria» e «Critico»: 20–40% del max a 2–4 settimane, OPPURE meno del 50% del minimo a 1 mese",
    detail: "Né in linea né disastroso. Servono azioni di spinta: campagna ADV, newsletter, telefonate ai contatti caldi."
  },
  { key: "critico", title: "Critico",
    rule: "< 20% del max a 2 settimane dal corso",
    detail: "Sotto la soglia minima a due settimane dall'inizio. Decisione entro 7 giorni: spostare data, online o annullare."
  }
];

function V2_PageCorsi() {
  const [tab, setTab] = useState("attivi");
  const [view, setView] = useState("timeline");
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterEdu, setFilterEdu] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("asc");
  const [showStatusLegend, setShowStatusLegend] = useState(false);

  const lifeMap = { attivi: "pubblicato", bozze: "bozza", archiviati: "archiviato", passati: "passato" };
  const counts = {
    attivi: SSA.COURSES.filter(c => c.lifecycle === "pubblicato").length,
    bozze: SSA.COURSES.filter(c => c.lifecycle === "bozza").length,
    archiviati: SSA.COURSES.filter(c => c.lifecycle === "archiviato").length,
    passati: SSA.COURSES.filter(c => c.lifecycle === "passato").length
  };

  const monthIdxOf = (m) => ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].indexOf(m);

  const list = useMemo(() => {
    let l = SSA.COURSES.filter(c => c.lifecycle === lifeMap[tab]);
    if (search) l = l.filter(c => (c.title + c.city + c.educator?.name).toLowerCase().includes(search.toLowerCase()));
    if (filterCity) l = l.filter(c => c.city === filterCity);
    if (filterType) l = l.filter(c => c.type === filterType);
    if (filterEdu) l = l.filter(c => c.educator?.id === filterEdu);

    // Sort
    const sorters = {
      date:    (a,b) => (a.year - b.year) || (monthIdxOf(a.month) - monthIdxOf(b.month)) || (a.day - b.day),
      type:    (a,b) => a.typeLabel.localeCompare(b.typeLabel),
      title:   (a,b) => a.shortTitle.localeCompare(b.shortTitle),
      city:    (a,b) => a.city.localeCompare(b.city),
      educator:(a,b) => (a.educator?.name || "").localeCompare(b.educator?.name || ""),
      enrolled:(a,b) => (a.enrolled / a.capacity) - (b.enrolled / b.capacity),
      status:  (a,b) => {
        const order = ["in-traiettoria", "monitor", "rischio", "critico"];
        return order.indexOf(a.status) - order.indexOf(b.status);
      },
      revenue: (a,b) => a.revenue - b.revenue,
      margin:  (a,b) => a.margin - b.margin
    };
    const fn = sorters[sortKey] || sorters.date;
    l = [...l].sort((a,b) => sortDir === "asc" ? fn(a,b) : fn(b,a));
    return l;
  }, [tab, search, filterCity, filterType, filterEdu, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  return (
    <div className="page">
      <C_PageHeader
        eyebrow="Catalogo"
        title="Corsi"
        sub="Tutti i corsi pubblicati, in bozza, archiviati e conclusi. Dati live da Shopify, configurazioni da Airtable."
        actions={
          <>
            <button className="btn"><C_Icon name="download" size={13}/>Esporta</button>
            <a className="btn btn-primary" href="https://admin.shopify.com/store/sakesommelierassociation/products" target="_blank" rel="noopener" title="Apri Shopify per creare un nuovo prodotto/corso"><C_Icon name="plus" size={13}/>Nuovo corso<C_Icon name="external" size={11}/></a>
          </>
        }
      />

      <div className="tabs">
        {[
          { id: "attivi", label: "Pubblicati", n: counts.attivi },
          { id: "bozze", label: "Bozze", n: counts.bozze },
          { id: "archiviati", label: "Archiviati", n: counts.archiviati },
          { id: "passati", label: "Passati", n: counts.passati }
        ].map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}<span className="tab-count">{t.n}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 300px" }}>
          <C_Icon name="search" size={14} className="topbar-search-icon"/>
          <input className="input" placeholder="Cerca…" style={{ paddingLeft: 32 }} value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="select" style={{ width: "auto", minWidth: 130 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tutti i tipi</option>
          {Object.keys(SSA.COURSE_TYPES).map(k => <option key={k} value={k}>{SSA.COURSE_TYPES[k].label}</option>)}
        </select>
        <select className="select" style={{ width: "auto", minWidth: 130 }} value={filterCity} onChange={e => setFilterCity(e.target.value)}>
          <option value="">Tutte le città</option>
          {SSA.CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" style={{ width: "auto", minWidth: 150 }} value={filterEdu} onChange={e => setFilterEdu(e.target.value)}>
          <option value="">Tutti gli educator</option>
          {SSA.EDUCATORS.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className="select" style={{ width: "auto", minWidth: 170 }} value={`${sortKey}:${sortDir}`} onChange={e => { const [k, d] = e.target.value.split(":"); setSortKey(k); setSortDir(d); }}>
          <option value="date:asc">Ordina · Data ↑</option>
          <option value="date:desc">Ordina · Data ↓</option>
          <option value="enrolled:desc">Ordina · % iscritti ↓</option>
          <option value="enrolled:asc">Ordina · % iscritti ↑</option>
          <option value="status:desc">Ordina · Stato (peggiore prima)</option>
          <option value="revenue:desc">Ordina · Ricavi ↓</option>
          <option value="margin:desc">Ordina · Margine ↓</option>
          <option value="margin:asc">Ordina · Margine ↑</option>
          <option value="city:asc">Ordina · Città A→Z</option>
          <option value="educator:asc">Ordina · Educator A→Z</option>
        </select>
        <button
          className={`btn ${showStatusLegend ? "btn-primary" : ""}`}
          onClick={() => setShowStatusLegend(s => !s)}
          title="Regola di assegnazione stato salute"
        >
          <C_Icon name="warn" size={12}/>Regola stato
        </button>
        <div style={{ flex: 1 }}></div>
        <div className="segmented">
          <button className={view === "timeline" ? "on" : ""} onClick={() => setView("timeline")}><C_Icon name="timeline" size={11}/>Timeline</button>
          <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}><C_Icon name="grid" size={11}/>Griglia</button>
          <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}><C_Icon name="list" size={11}/>Tabella</button>
        </div>
      </div>

      {showStatusLegend && <StatusRuleLegend onClose={() => setShowStatusLegend(false)} />}

      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
        <span>{list.length} {list.length === 1 ? "corso" : "corsi"}</span>
        <span style={{ color: "var(--text-mute)" }}>·</span>
        <span style={{ color: "var(--text-4)" }}>
          ordinati per <strong style={{ color: "var(--text-3)" }}>{sortLabel(sortKey)}</strong> {sortDir === "asc" ? "↑" : "↓"}
        </span>
      </div>

      {view === "timeline" && <TimelineView courses={list}/>}
      {view === "grid" && <GridView courses={list}/>}
      {view === "table" && <TableView courses={list} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/>}

      {list.length === 0 && (
        <div style={{ padding: 80, textAlign: "center", color: "var(--text-3)", border: "1px dashed var(--border)", borderRadius: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Nessun corso</div>
          <div style={{ fontSize: 13 }}>Prova a cambiare filtri.</div>
        </div>
      )}
    </div>
  );
}

function sortLabel(k) {
  return ({
    date: "data", type: "tipo", title: "titolo", city: "città", educator: "educator",
    enrolled: "% iscritti", status: "stato", revenue: "ricavi", margin: "margine"
  })[k] || k;
}

// ============ Status rule legend ============
function StatusRuleLegend({ onClose }) {
  const toneFor = (k) => ({
    "in-traiettoria": { bg: "var(--success-bg)", fg: "var(--success-fg)", dot: "var(--success)" },
    "monitor":        { bg: "#EEF2F6", fg: "var(--text-2)", dot: "var(--text-mute)" },
    "rischio":        { bg: "var(--warning-bg)", fg: "var(--warning-fg)", dot: "var(--warning)" },
    "critico":        { bg: "var(--danger-bg)", fg: "var(--danger-fg)", dot: "var(--danger)" }
  })[k];

  return (
    <div className="card" style={{ marginBottom: 16, border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border-2)", background: "var(--indigo-50)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <C_Icon name="warn" size={14} className="text-2"/>
          <span className="eyebrow">Regola assegnazione stato salute corso</span>
        </div>
        <button className="btn btn-icon btn-sm btn-ghost" onClick={onClose}><C_Icon name="x" size={12}/></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {STATUS_RULES.map((r, i) => {
          const t = toneFor(r.key);
          return (
            <div key={r.key} style={{ padding: "14px 16px", borderRight: i < 3 ? "1px solid var(--border-2)" : "none" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 10, background: t.bg, color: t.fg, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }}></span>
                {r.title}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 4, lineHeight: 1.35 }}>{r.rule}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.4 }}>{r.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ Views ============
function TimelineView({ courses }) {
  const monthIdx = (m) => ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].indexOf(m);
  // group by month preserving the order of `courses` (already sorted globally)
  const groups = useMemo(() => {
    const map = new Map();
    courses.forEach(c => {
      const k = `${c.year}-${c.month}`;
      if (!map.has(k)) map.set(k, { year: c.year, month: c.month, courses: [] });
      map.get(k).courses.push(c);
    });
    return Array.from(map.values()).sort((a,b) => a.year - b.year || monthIdx(a.month) - monthIdx(b.month));
  }, [courses]);

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {groups.map((g, gi) => (
        <div key={gi}>
          <div style={{ padding: "14px 20px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{g.month}</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{g.year}</span>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-4)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase" }}>
              {g.courses.length} corsi · {g.courses.reduce((s,c) => s + c.enrolled, 0)} iscritti · {(g.courses.reduce((s,c) => s + c.revenue, 0) / 1000).toFixed(1)}k €
            </span>
          </div>
          {g.courses.map((c, ci) => (
            <CourseRow key={c.id} course={c} last={ci === g.courses.length - 1 && gi === groups.length - 1}/>
          ))}
        </div>
      ))}
    </div>
  );
}

function CourseRow({ course: c, last }) {
  const pct = c.enrolled / c.capacity;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "52px 1fr 180px 110px 110px 30px",
      gap: 16,
      alignItems: "center",
      padding: "14px 20px",
      borderBottom: last ? "none" : "1px solid var(--border-2)",
      transition: "background var(--dur-fast)",
      cursor: "pointer",
      position: "relative"
    }}
      onClick={() => location.hash = `#/corsi/${c.id}`}
      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-hover)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }} className="num">{c.day}</div>
        <div style={{ fontSize: 10, color: "var(--text-4)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginTop: 2 }}>{c.month.slice(0,3)}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <C_Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</C_Badge>
          <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 500 }}>{c.mode === "online" ? "Online" : "In presenza"}{c.days > 1 ? ` · ${c.days} giorni` : ""}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.shortTitle}</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><C_Icon name="pin" size={11}/>{c.city}</span>
          <span style={{ color: "var(--text-mute)" }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><C_Avatar name={c.educator?.name} initials={c.educator?.initials} size="sm"/>{c.educator?.name}</span>
        </div>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="num" style={{ fontWeight: 600 }}>{c.enrolled}<span style={{ color: "var(--text-4)", fontWeight: 400 }}>/{c.capacity}</span></span>
          <div className={`bar ${c.enrolled < c.minStudents ? (pct < 0.2 ? "danger" : "warning") : "azzurro"}`} style={{ flex: 1 }}><i style={{ width: pct * 100 + "%" }}></i></div>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 4, fontFamily: "var(--font-mono)" }}>min {c.minStudents}{c.minStudents - c.enrolled > 0 ? ` · mancano ${c.minStudents - c.enrolled}` : ""}</div>
      </div>
      <div>
        {c.lifecycle === "pubblicato" && <C_Status status={c.status}/>}
        {c.lifecycle === "passato" && c.examResults && <C_Badge tone="success">{c.examResults.passed}/{c.enrolled} promossi</C_Badge>}
        {c.lifecycle === "bozza" && <C_Badge tone="neutral">Bozza</C_Badge>}
        {c.lifecycle === "archiviato" && <C_Badge tone="danger">Archiviato</C_Badge>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{(c.revenue / 1000).toFixed(1)}k €</div>
        <div style={{ fontSize: 10.5, color: c.margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)", marginTop: 2, fontWeight: 500 }}>{c.margin >= 0 ? "+" : ""}{(c.margin / 1000).toFixed(1)}k margine</div>
      </div>
      <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
        <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setMenuOpen(o => !o)}><C_Icon name="more" size={13}/></button>
        {menuOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setMenuOpen(false)}></div>
            <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, boxShadow: "var(--sh-popover)", minWidth: 200, zIndex: 40, padding: 4 }}>
              <button onClick={() => { setMenuOpen(false); location.hash = `#/corsi/${c.id}`; }} style={menuItemStyle}><C_Icon name="arrow" size={11}/>Apri dettaglio</button>
              <button onClick={() => { setMenuOpen(false); }} style={menuItemStyle}><C_Icon name="copy" size={11}/>Duplica</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const menuItemStyle = {
  width: "100%", display: "flex", alignItems: "center", gap: 8,
  padding: "6px 10px", border: "none", background: "transparent",
  cursor: "pointer", borderRadius: 4, textAlign: "left",
  fontSize: 12.5, fontFamily: "inherit", color: "var(--text)"
};

function GridView({ courses }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {courses.map(c => <CourseCard key={c.id} course={c}/>)}
    </div>
  );
}

function CourseCard({ course: c }) {
  const pct = c.enrolled / c.capacity;
  return (
    <a href={`#/corsi/${c.id}`} className="card" style={{ overflow: "hidden", transition: "transform var(--dur-fast), box-shadow var(--dur-fast)" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "var(--sh-3)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--sh-card)"; }}>
      <div style={{ padding: "18px 18px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <C_Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</C_Badge>
          {c.lifecycle === "pubblicato" && <C_Status status={c.status}/>}
          {c.lifecycle === "passato" && <C_Badge tone="success">Concluso</C_Badge>}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginBottom: 8 }}>{c.day} {c.month} · {c.city}</div>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25, marginBottom: 6 }}>{c.shortTitle}</div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{c.educator?.name}</div>
      </div>
      <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{c.enrolled}<span style={{ color: "var(--text-4)", fontWeight: 400 }}>/{c.capacity}</span></span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>iscritti</span>
        </div>
        <div className={`bar ${c.enrolled < c.minStudents ? (pct < 0.2 ? "danger" : "warning") : "azzurro"}`}><i style={{ width: pct*100 + "%" }}></i></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>
          <span>min {c.minStudents}</span>
          <span className="num">{(c.revenue/1000).toFixed(1)}k € · {c.margin >= 0 ? "+" : ""}{(c.margin/1000).toFixed(1)}k</span>
        </div>
      </div>
    </a>
  );
}

function TableView({ courses, sortKey, sortDir, onSort }) {
  const COLS = [
    { key: "date", label: "Data", w: 96, sort: "date" },
    { key: "type", label: "Tipo", w: 84, sort: "type" },
    { key: "title", label: "Corso", w: 220, sort: "title" },
    { key: "city", label: "Città", w: 120, sort: "city" },
    { key: "educator", label: "Educator", w: 160, sort: "educator" },
    { key: "enrolled", label: "Iscritti", w: 160, sort: "enrolled" },
    { key: "status", label: "Stato", w: 130, sort: "status" },
    { key: "revenue", label: "Ricavi", w: 116, sort: "revenue", align: "right" },
    { key: "margin", label: "Margine", w: 124, sort: "margin", align: "right" },
    { key: "actions", label: "", w: 44 }
  ];
  const [widths, setWidths] = useState(() => {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem("ssa_corsi_colw")) || {}; } catch (e) {}
    const o = {}; COLS.forEach(c => o[c.key] = saved[c.key] || c.w); return o;
  });
  useEffect(() => { try { localStorage.setItem("ssa_corsi_colw", JSON.stringify(widths)); } catch (e) {} }, [widths]);
  const total = COLS.reduce((s, c) => s + (widths[c.key] || c.w), 0);

  const startResize = (key, e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    const onMove = (ev) => setWidths(prev => ({ ...prev, [key]: Math.max(56, startW + (ev.clientX - startX)) }));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = ""; document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  };

  return (
    <div className="table-wrap" style={{ overflowX: "auto" }}>
      <table className="table" style={{ tableLayout: "fixed", width: total }}>
        <colgroup>{COLS.map(c => <col key={c.key} style={{ width: widths[c.key] }}/>)}</colgroup>
        <thead>
          <tr>
            {COLS.map(c => {
              const active = c.sort && sortKey === c.sort;
              return (
                <th key={c.key} onClick={c.sort ? () => onSort(c.sort) : undefined} style={{ position: "relative", textAlign: c.align || "left", cursor: c.sort ? "pointer" : "default", userSelect: "none", color: active ? "var(--text)" : undefined, overflow: "hidden" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                    {c.label}
                    {c.sort && <span style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>{active && sortDir === "asc" ? "▲" : active && sortDir === "desc" ? "▼" : "⇅"}</span>}
                  </span>
                  {c.key !== "actions" && (
                    <span onMouseDown={(e) => startResize(c.key, e)} onClick={(e) => e.stopPropagation()} title="Trascina per allargare o restringere la colonna"
                      className="col-resize-handle"
                      style={{ position: "absolute", top: 0, right: 0, height: "100%", width: 9, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ width: 2, height: 13, borderRadius: 2, background: "var(--border)" }}></span>
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {courses.map(c => (
            <CourseTableRow key={c.id} course={c}/>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CourseTableRow({ course: c }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <tr className="clickable" onClick={() => location.hash = `#/corsi/${c.id}`}>
      <td className="num" style={{ whiteSpace: "nowrap" }}><strong>{c.day}</strong> <span className="text-3">{c.month.slice(0,3)} {c.year}</span></td>
      <td><C_Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</C_Badge></td>
      <td style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.shortTitle}</td>
      <td className="text-3" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.city}</td>
      <td className="text-3" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.educator?.name}</td>
      <td style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="num" style={{ minWidth: 36 }}>{c.enrolled}/{c.capacity}</span>
          <div className={`bar ${c.enrolled < c.minStudents ? "warning" : "azzurro"}`} style={{ flex: 1 }}><i style={{ width: c.enrolled/c.capacity*100 + "%" }}></i></div>
        </div>
      </td>
      <td>{c.lifecycle === "pubblicato" ? <C_Status status={c.status}/> : c.lifecycle === "passato" ? <C_Badge tone="success">Concluso</C_Badge> : c.lifecycle === "bozza" ? <C_Badge tone="neutral">Bozza</C_Badge> : <C_Badge tone="danger">Archiviato</C_Badge>}</td>
      <td className="num" style={{ textAlign: "right" }}>{c.revenue.toLocaleString("it-IT")} €</td>
      <td className="num" style={{ textAlign: "right", color: c.margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}>{c.margin >= 0 ? "+" : ""}{c.margin.toLocaleString("it-IT")} €</td>
      <td onClick={e => e.stopPropagation()} style={{ position: "relative" }}>
        <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setMenuOpen(o => !o)}><C_Icon name="more" size={13}/></button>
        {menuOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setMenuOpen(false)}></div>
            <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, boxShadow: "var(--sh-popover)", minWidth: 200, zIndex: 40, padding: 4 }}>
              <button onClick={() => { setMenuOpen(false); location.hash = `#/corsi/${c.id}`; }} style={menuItemStyle}><C_Icon name="arrow" size={11}/>Apri dettaglio</button>
              <button onClick={() => { setMenuOpen(false); }} style={menuItemStyle}><C_Icon name="copy" size={11}/>Duplica</button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

window.V2_PageCorsi = V2_PageCorsi;
