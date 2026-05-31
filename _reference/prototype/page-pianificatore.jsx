// SSA v2 — Pagina Pianificatore
// Pianificazione corsi a 12 mesi mobili: obiettivi, calendario multi-vista.
// I corsi pianificati si aggiungono/rimuovono DIRETTAMENTE dal calendario.
const { Icon: PG_Icon, Avatar: PG_Avatar, Badge: PG_Badge, PageHeader: PG_PageHeader } = window.V2;
const PLC = window.PL;

const PL_LS = "ssa_pian_v3";
const PL_DEFAULT_TARGETS = { intro: 10, cert: 6, citta: 6, pass: 75, somm: 60 };

function plLoad() {
  try { return JSON.parse(localStorage.getItem(PL_LS)) || {}; } catch (e) { return {}; }
}
function plSave(patch) {
  const cur = plLoad();
  localStorage.setItem(PL_LS, JSON.stringify({ ...cur, ...patch }));
}

// Esempi pianificati già a calendario (mostrano la feature; modificabili dall'utente)
function plSeedPlanned() {
  return [
    { id: PLC.nextId(), type: "introduttivo", mode: "online", city: "Bologna", educatorId: "e7", dates: PLC.genDates("2027-01-13", "introduttivo", "online") },
    { id: PLC.nextId(), type: "certificato", mode: "presenza", city: "Torino", educatorId: "e6", dates: PLC.genDates("2027-02-10", "certificato", "presenza") }
  ];
}

const plOverlay = { position: "fixed", inset: 0, background: "rgba(10, 37, 64, 0.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 };
const plDialog = { background: "var(--surface)", borderRadius: 12, boxShadow: "var(--sh-popover)", width: "100%", display: "flex", flexDirection: "column" };

function V2_PagePianificatore() {
  const saved = plLoad();
  const me = SSA.getCurrentUser();
  const [view, setView] = useState(saved.view || "timeline");
  const [scenario, setScenario] = useState(saved.scenario !== undefined ? saved.scenario : true);
  const [targets, setTargets] = useState({ ...PL_DEFAULT_TARGETS, ...(saved.targets || {}) });
  const [planned, setPlanned] = useState(saved.planned || plSeedPlanned());
  const [thresholds, setThresholds] = useState({ conflictDays: 10, canniDays: 30, ...(saved.thresholds || {}) });
  const [editTargets, setEditTargets] = useState(false);
  const [addAt, setAddAt] = useState(null);     // { year?, mIdx?, city?, educatorId?, type? }
  const [actItem, setActItem] = useState(null);  // corso pianificato su cui agire
  const [share, setShare] = useState(false);

  useEffect(() => { plSave({ view, scenario, targets, planned, thresholds }); }, [view, scenario, targets, planned, thresholds]);

  const win = useMemo(() => PLC.buildWindow(), []);
  const winKeys = useMemo(() => new Set(win.map(w => w.key)), [win]);
  const types = Object.keys(SSA.COURSE_TYPES);

  const realItems = useMemo(() =>
    SSA.COURSES
      .filter(c => winKeys.has(PLC.keyOf(c.year, PLC.monthIdx(c.month))))
      .filter(c => c.lifecycle === "pubblicato" || c.lifecycle === "bozza")
      .map(PLC.normalizeReal),
    [winKeys]);

  const plannedItems = useMemo(() => planned.map(PLC.normalizePlanned), [planned]);
  const combined = useMemo(() => [...realItems, ...plannedItems], [realItems, plannedItems]);

  // ---- KPI ----
  const kpiItems = scenario ? combined : realItems;
  const countType = (t) => kpiItems.filter(i => i.type === t).length;
  const introN = countType("introduttivo");
  const certN = countType("certificato");
  const cittaCovered = new Set(kpiItems.filter(i => i.city && !PLC.HUB_CITIES.includes(i.city) && !PLC.NON_CITIES.includes(i.city)).map(i => i.city));
  const cittaN = cittaCovered.size;
  const passRate = Math.round((SSA.KPI.examPassRate || 0.78) * 100);
  const certSeats = kpiItems.filter(i => i.type === "certificato").reduce((s, i) => s + (i.enrolled > 0 ? i.enrolled : i.capacity), 0);
  const sommN = Math.round(certSeats * (SSA.KPI.examPassRate || 0.78));
  const returning = SSA.STUDENTS.filter(s => s.isReturning).length;
  const returningPct = Math.round(returning / SSA.STUDENTS.length * 100);

  const plannedDelta = {
    intro: plannedItems.filter(i => i.type === "introduttivo").length,
    cert: plannedItems.filter(i => i.type === "certificato").length,
    citta: (() => { const r = new Set(realItems.filter(i => i.city && !PLC.HUB_CITIES.includes(i.city) && !PLC.NON_CITIES.includes(i.city)).map(i => i.city)); let n = 0; cittaCovered.forEach(c => { if (!r.has(c)) n++; }); return scenario ? n : 0; })()
  };

  // ---- Handlers ----
  const requestAdd = (year, mIdx, extra) => setAddAt({ year, mIdx, ...(extra || {}) });
  const confirmAdd = (f) => {
    setPlanned(arr => [...arr, { id: PLC.nextId(), type: f.type, mode: f.mode, dates: f.dates, city: f.city, educatorId: f.educatorId, note: f.note }]);
    setAddAt(null);
  };
  const dropMonth = (id, year, mIdx, extra) => {
    setPlanned(arr => arr.map(p => {
      if (p.id !== id) return p;
      const norm = PLC.normalizePlanned(p);
      const day = Math.min(norm.day || 14, 28);
      const yr = year || win.find(w => w.mIdx === mIdx)?.year || norm.year;
      const start = PLC.ymd(new Date(yr, mIdx, day));
      const dates = PLC.genDates(start, p.type, p.mode || norm.mode || "presenza");
      return { ...p, dates, mIdx: undefined, year: undefined, city: extra.city !== undefined ? extra.city : p.city, educatorId: extra.educatorId !== undefined ? extra.educatorId : p.educatorId };
    }));
  };
  const patchPlanned = (id, patch) => setPlanned(arr => arr.map(p => p.id === id ? { ...p, ...patch } : p));
  const removePlanned = (id) => { setPlanned(arr => arr.filter(p => p.id !== id)); setActItem(null); };
  const onChipClick = (item) => {
    if (item.kind === "real") location.hash = `#/corsi/${item.id}`;
    else setActItem(item);
  };

  const Views = window.PL_Views, Panels = window.PL_Panels;
  const isAdmin = me.roleKey === "admin";
  const placedCount = combined.filter(c => c.placed !== false && c.mIdx !== null).length;

  const viewProps = { win, courses: combined, onDropMonth: dropMonth, onRequestAdd: requestAdd, onChipClick };

  const targetCards = [
    { key: "intro", label: "Corsi introduttivi", cur: introN, tgt: targets.intro, suffix: "", delta: plannedDelta.intro },
    { key: "cert", label: "Corsi certificati", cur: certN, tgt: targets.cert, suffix: "", delta: plannedDelta.cert },
    { key: "citta", label: "Città coperte", cur: cittaN, tgt: targets.citta, suffix: "", hint: "oltre Milano e Roma", delta: plannedDelta.citta },
    { key: "pass", label: "Tasso promozione esame", cur: passRate, tgt: targets.pass, suffix: "%", hint: "ultimi 12 mesi" },
    { key: "somm", label: "Nuovi sommelier", cur: sommN, tgt: targets.somm, suffix: "", hint: "proiezione su certificati" }
  ];

  return (
    <div className="page">
      <PG_PageHeader
        eyebrow="Pianificazione"
        title="Pianificatore"
        sub="Quali corsi mettere a calendario, quando e in quali città — sui prossimi 12 mesi. Aggiungi i corsi direttamente sul calendario; diventano reali solo dopo la creazione su Shopify."
        actions={
          <>
            <a href="#/account" title="Stai usando questo profilo · cambia dal menu in basso a sinistra" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 6px", border: "1px solid var(--border)", borderRadius: 20, textDecoration: "none", background: "var(--surface)" }}>
              <PG_Avatar name={me.name} initials={me.initials} tone={me.tone} size="sm"/>
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>{me.first} · <strong style={{ color: isAdmin ? "var(--indigo-600)" : "var(--text-3)" }}>{isAdmin ? "Admin" : "Manager"}</strong></span>
            </a>
            <button className="btn" onClick={() => setShare(true)}><PG_Icon name="share" size={13}/>Condividi</button>
          </>
        }
      />

      {/* ===== Obiettivi annuali ===== */}
      <section className="card" style={{ marginBottom: 24, overflow: "hidden" }}>
        <div className="card-head" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Obiettivi annuali
              {!isAdmin && <span title="Solo l'amministratore può modificare gli obiettivi" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-3)", fontWeight: 500, background: "var(--surface-2)", border: "1px solid var(--border-2)", padding: "2px 7px", borderRadius: 10 }}><PG_Icon name="lock" size={11}/>bloccato</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Avanzamento sui 12 mesi mobili · {scenario ? "reali + pianificati" : "solo corsi reali"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className={`pill ${scenario ? "on" : ""}`} onClick={() => setScenario(s => !s)} title="Simula l'impatto dei corsi pianificati (what-if)">
              <PG_Icon name="sparkle" size={11}/>Includi pianificati
            </button>
            {isAdmin ? (
              <button className={`btn btn-sm ${editTargets ? "btn-primary" : ""}`} onClick={() => setEditTargets(e => !e)}>
                <PG_Icon name={editTargets ? "check" : "edit"} size={12}/>{editTargets ? "Fatto" : "Modifica obiettivi"}
              </button>
            ) : (
              <button className="btn btn-sm" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}><PG_Icon name="lock" size={12}/>Obiettivi</button>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {targetCards.map((c, i) => <PL_TargetCard key={c.key} card={c} edit={editTargets && isAdmin} last={i === 4} onChange={(v) => setTargets(t => ({ ...t, [c.key]: v }))}/>)}
        </div>
        <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-3)" }}>
          <PG_Icon name="info" size={12}/>
          Comunità: <strong className="num" style={{ color: "var(--text-2)" }}>{SSA.STUDENTS.length}</strong> corsisti totali · <strong className="num" style={{ color: "var(--text-2)" }}>{returningPct}%</strong> ripartecipanti ({returning} persone).
        </div>
      </section>

      {/* ===== Calendario multi-vista ===== */}
      <section className="card" style={{ marginBottom: 24 }}>
        <div className="card-head">
          <div>
            <div className="h3">Calendario di pianificazione</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, display: "inline-flex", alignItems: "center", gap: 6 }}>
              Clicca <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--indigo-600)", fontWeight: 600 }}><PG_Icon name="plus" size={11}/>su un mese</span> per aggiungere un corso · {placedCount} a calendario
            </div>
          </div>
          <div className="segmented">
            <button className={view === "heatmap" ? "on" : ""} onClick={() => setView("heatmap")}><PG_Icon name="grid" size={11}/>Heatmap</button>
            <button className={view === "timeline" ? "on" : ""} onClick={() => setView("timeline")}><PG_Icon name="calendar" size={11}/>Mensile</button>
            <button className={view === "bars" ? "on" : ""} onClick={() => setView("bars")}><PG_Icon name="trending" size={11}/>Per tipo</button>
            <button className={view === "city" ? "on" : ""} onClick={() => setView("city")}><PG_Icon name="pin" size={11}/>Città</button>
            <button className={view === "edu" ? "on" : ""} onClick={() => setView("edu")}><PG_Icon name="users" size={11}/>Educator</button>
          </div>
        </div>

        <div className="card-pad" style={{ paddingTop: 18 }}>
          {view === "heatmap" && <Views.Heatmap {...viewProps}/>}
          {view === "timeline" && <Views.Timeline {...viewProps}/>}
          {view === "bars" && <Views.BarsByType {...viewProps} types={types}/>}
          {view === "city" && <Views.CityMonthGrid {...viewProps} cities={SSA.CITIES}/>}
          {view === "edu" && <Views.EducatorMonthGrid {...viewProps} educators={SSA.EDUCATORS}/>}
        </div>
      </section>

      {/* ===== Segnali ===== */}
      <div style={{ marginBottom: 24 }}>
        <Panels.Signals win={win} courses={combined} cities={SSA.CITIES} conflictDays={thresholds.conflictDays} canniDays={thresholds.canniDays} onThresholds={setThresholds} onAdd={(type, city, mIdx, year) => setAddAt({ type: type || undefined, city: city || undefined, mIdx: (mIdx === null || mIdx === undefined) ? undefined : mIdx, year: year || undefined })}/>
      </div>

      {/* ===== Engagement + YoY ===== */}
      <section style={{ display: "grid", gridTemplateColumns: "1.62fr 1fr", gap: 24 }}>
        <Panels.Engagement courses={combined} educators={SSA.EDUCATORS}/>
        <Panels.YoY win={win} courses={combined} types={types}/>
      </section>

      {addAt && <PL_AddModal at={addAt} win={win} types={types} onConfirm={confirmAdd} onClose={() => setAddAt(null)}/>}
      {actItem && <PL_ActionModal item={actItem} onNote={(note) => patchPlanned(actItem.id, { note })} onRemove={() => removePlanned(actItem.id)} onClose={() => setActItem(null)}/>}
      {share && <PL_ShareModal onClose={() => setShare(false)}/>}
    </div>
  );
}

// ---------- Target card ----------
function PL_TargetCard({ card, edit, last, onChange }) {
  const pct = card.tgt ? Math.min(100, Math.round(card.cur / card.tgt * 100)) : 0;
  const reached = card.cur >= card.tgt;
  const barCls = reached ? "success" : pct >= 60 ? "azzurro" : "warning";
  return (
    <div style={{ padding: "16px 18px", borderRight: last ? "none" : "1px solid var(--border-2)" }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginBottom: 8, minHeight: 26 }}>{card.label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", color: reached ? "var(--success-fg)" : "var(--text)" }}>{card.cur}{card.suffix}</span>
        <span style={{ fontSize: 13, color: "var(--text-4)" }}>/</span>
        {edit ? (
          <input className="input" type="number" value={card.tgt} onChange={e => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))} style={{ width: 58, height: 28, padding: "0 6px", fontSize: 14 }}/>
        ) : (
          <span className="num" style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)" }}>{card.tgt}{card.suffix}</span>
        )}
      </div>
      <div className={`bar ${barCls}`} style={{ marginTop: 8 }}><i style={{ width: pct + "%" }}></i></div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, minHeight: 16 }}>
        <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>{card.hint || (reached ? "obiettivo raggiunto" : `mancano ${Math.max(0, card.tgt - card.cur)}`)}</span>
        {card.delta > 0 && <span style={{ fontSize: 10, color: "var(--indigo-600)", fontWeight: 600 }} className="num">+{card.delta} pian.</span>}
      </div>
    </div>
  );
}

// ---------- Add modal (aggiunta diretta dal calendario, con date e sessioni) ----------
function PL_AddModal({ at, win, types, onConfirm, onClose }) {
  const y0 = (at.mIdx !== null && at.mIdx !== undefined) ? (at.year || win.find(w => w.mIdx === at.mIdx)?.year || win[0].year) : win[0].year;
  const m0 = (at.mIdx !== null && at.mIdx !== undefined) ? at.mIdx : win[0].mIdx;
  const defStart = PLC.ymd(new Date(y0, m0, 14));

  const [type, setType] = useState(at.type || "introduttivo");
  const [mode, setMode] = useState("presenza");
  const [start, setStart] = useState(defStart);
  const [dates, setDates] = useState(() => PLC.genDates(defStart, at.type || "introduttivo", "presenza"));
  const [city, setCity] = useState(at.city || "");
  const [educatorId, setEducatorId] = useState(at.educatorId || "");
  const [note, setNote] = useState("");

  // Rigenera le sessioni quando cambiano tipo / modalità / data di inizio
  useEffect(() => { setDates(PLC.genDates(start, type, mode)); }, [type, mode, start]);
  // Se l'educator selezionato non è abilitato al nuovo tipo, deselezionalo
  useEffect(() => { if (educatorId && !SSA.isQualified(educatorId, type)) setEducatorId(""); }, [type]);
  const eligibleEdu = SSA.educatorsForType(type);
  const todayYmd = PLC.ymd(PLC.TODAY);

  const tc = PLC.TYPE_COLORS[type] || PLC.TYPE_COLORS.introduttivo;
  const total = dates.length;
  const unitLabel = mode === "online" ? "appuntamenti" : "giornate";
  const sorted = [...dates].filter(Boolean).sort();
  const firstD = sorted.length ? PLC.parseYmd(sorted[0]) : null;
  const placeLabel = firstD ? `${PLC.MONTHS[firstD.getMonth()]} ${firstD.getFullYear()}` : "—";
  const valid = dates.length > 0 && dates.every(Boolean);

  const setSessionDate = (i, val) => setDates(ds => ds.map((d, j) => {
    if (j !== i) return d;
    const min = i === 0 ? todayYmd : ds[i - 1];
    return (val && val < min) ? min : val;
  }));
  const addSession = () => setDates(ds => { const last = ds.length ? PLC.parseYmd(ds[ds.length - 1]) : PLC.parseYmd(start); const step = mode === "online" ? 7 : 1; const d = new Date(last); d.setDate(last.getDate() + step); return [...ds, PLC.ymd(d)]; });
  const removeSession = (i) => setDates(ds => ds.filter((_, j) => j !== i));

  return (
    <div style={plOverlay} onClick={onClose}>
      <div style={{ ...plDialog, maxWidth: 540, maxHeight: "88vh" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>Aggiungi al calendario</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Nuovo corso pianificato</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><PG_Icon name="x" size={14}/></button>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
          <div className="field">
            <div className="field-label">Tipo corso</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {types.map(t => {
                const c = PLC.TYPE_COLORS[t];
                const on = type === t;
                return (
                  <button key={t} onClick={() => setType(t)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", border: `1px solid ${on ? c.solid : "var(--border)"}`, background: on ? c.soft : "var(--surface)", color: on ? c.ink : "var(--text-2)" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: c.solid }}></span>{SSA.COURSE_TYPES[t].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "end" }}>
            <div className="field">
              <div className="field-label">Modalità</div>
              <div className="segmented" style={{ width: "100%" }}>
                <button className={mode === "presenza" ? "on" : ""} onClick={() => setMode("presenza")} style={{ flex: 1 }}><PG_Icon name="pin" size={11}/>In presenza</button>
                <button className={mode === "online" ? "on" : ""} onClick={() => setMode("online")} style={{ flex: 1 }}><PG_Icon name="globe" size={11}/>Online</button>
              </div>
            </div>
            <div className="field">
              <div className="field-label">Data di inizio</div>
              <input className="input" type="date" value={start} min={todayYmd} onChange={e => setStart(e.target.value && e.target.value < todayYmd ? todayYmd : e.target.value)} style={{ width: "100%" }}/>
            </div>
          </div>

          <div className="field" style={{ background: "var(--surface-2)", borderRadius: 8, padding: "12px 14px" }}>
            <div className="field-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span>Date del corso</span>
              <span className="num" style={{ color: "var(--text-4)", fontWeight: 500 }}>{total} {unitLabel}{mode === "online" ? " · settimanali" : " · consecutive"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dates.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="num" style={{ width: 34, fontSize: 11.5, fontWeight: 700, color: tc.ink, flexShrink: 0 }}>{i + 1}/{total}</span>
                  <input className="input" type="date" value={d} min={i === 0 ? todayYmd : dates[i - 1]} onChange={e => setSessionDate(i, e.target.value)} style={{ flex: 1, height: 32 }}/>
                  <span style={{ fontSize: 11, color: "var(--text-3)", width: 92, flexShrink: 0 }}>{d ? PLC.fmtDayFull(d) : ""}</span>
                  {total > 1 && <button className="btn btn-icon btn-sm btn-ghost" onClick={() => removeSession(i)} title="Rimuovi sessione"><PG_Icon name="x" size={11}/></button>}
                </div>
              ))}
            </div>
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={addSession}><PG_Icon name="plus" size={11}/>Aggiungi sessione</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mode === "online" ? "1fr" : "1fr 1fr", gap: 12 }}>
            {mode !== "online" && (
              <div className="field">
                <div className="field-label">Città</div>
                <select className="select" value={city} onChange={e => setCity(e.target.value)}>
                  <option value="">— da definire —</option>
                  {SSA.CITIES.filter(c => c !== "Online").map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <div className="field-label">Educator <span style={{ color: "var(--text-4)", fontWeight: 400 }}>· solo abilitati a {SSA.COURSE_TYPES[type].label}</span></div>
              <select className="select" value={educatorId} onChange={e => setEducatorId(e.target.value)}>
                <option value="">— da definire —</option>
                {eligibleEdu.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          {mode === "online" && <div style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 6, marginTop: -6 }}><PG_Icon name="globe" size={12}/>Corso online · nessuna città in presenza.</div>}

          <div className="field">
            <div className="field-label">Appunti <span style={{ color: "var(--text-4)", fontWeight: 400 }}>(opz.)</span></div>
            <textarea className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Note di pianificazione: location da confermare, vincoli educator, idee…" style={{ width: "100%", minHeight: 56, padding: "8px 10px", resize: "vertical", fontFamily: "inherit" }}/>
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--surface-2)", flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 6 }}><PG_Icon name="calendar" size={12}/>Si posiziona in <strong style={{ color: "var(--text-2)" }}>{placeLabel}</strong></span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>Annulla</button>
            <button className="btn btn-primary" disabled={!valid} style={!valid ? { opacity: 0.5, cursor: "not-allowed" } : undefined} onClick={() => valid && onConfirm({ type, mode, dates: sorted, city: mode === "online" ? "Online" : (city || null), educatorId: educatorId || null, note: note.trim() })}><PG_Icon name="plus" size={12}/>Aggiungi al calendario</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Action modal (corso pianificato) ----------
function PL_ActionModal({ item, onNote, onRemove, onClose }) {
  const tc = PLC.TYPE_COLORS[item.type] || PLC.TYPE_COLORS.introduttivo;
  const [note, setNote] = useState(item.note || "");
  const monthLabel = (item.mIdx !== null && item.mIdx !== undefined) ? `${PLC.MONTHS[item.mIdx]} ${item.year || ""}`.trim() : "non posizionato";
  const sessions = item.sessions || [];
  return (
    <div style={plOverlay} onClick={onClose}>
      <div style={{ ...plDialog, maxWidth: 460, maxHeight: "86vh" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: tc.solid, minHeight: 40 }}></span>
            <div>
              <div className="eyebrow" style={{ marginBottom: 3 }}>Corso pianificato</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{item.typeLabel}{item.city ? ` · ${item.city}` : ""}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <PG_Icon name={item.mode === "online" ? "globe" : "pin"} size={11}/>{item.mode === "online" ? "Online" : "In presenza"} · {monthLabel}{item.educator ? ` · ${item.educator.name}` : " · educator da definire"}
              </div>
            </div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><PG_Icon name="x" size={14}/></button>
        </div>
        <div style={{ padding: 22, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{sessions.length} {item.mode === "online" ? "appuntamenti" : "giornate"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {sessions.map(s => (
                <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border-2)" }}>
                  <span className="num" style={{ width: 32, fontSize: 11.5, fontWeight: 700, color: tc.ink }}>{s.n}/{s.total}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>{PLC.fmtDayFull(s.date)}</span>
                  <span className="num" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-4)" }}>{s.date}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="field">
            <div className="field-label">Appunti</div>
            <textarea className="input" value={note} onChange={e => { setNote(e.target.value); onNote && onNote(e.target.value); }} placeholder="Aggiungi un appunto su questo corso pianificato…" style={{ width: "100%", minHeight: 60, padding: "8px 10px", resize: "vertical", fontFamily: "inherit" }}/>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start", background: "var(--surface-2)", borderRadius: 6, padding: "10px 12px" }}>
            <PG_Icon name="info" size={13} className="text-4"/>
            <span>Crea il prodotto su Shopify, poi <strong>rimuovilo dal calendario</strong> per evitare doppioni tra “pianificato” e “reale”. Trascinalo su un altro mese per spostarlo.</span>
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 8, background: "var(--surface-2)", flexShrink: 0 }}>
          <button className="btn btn-danger" onClick={onRemove}><PG_Icon name="trash" size={12}/>Rimuovi dal calendario</button>
          <a className="btn btn-primary" href={PLC.shopifyUrl((SSA.COURSE_TYPES[item.type]?.label || "") + (item.city ? " " + item.city : ""))} target="_blank" rel="noopener"><PG_Icon name="external" size={12}/>Crea su Shopify</a>
        </div>
      </div>
    </div>
  );
}

// ---------- Share modal (link sola visualizzazione) ----------
function PL_ShareModal({ onClose }) {
  const [admin, setAdmin] = useState(true);
  const [eduSel, setEduSel] = useState([]);
  const [copied, setCopied] = useState(false);
  const token = useMemo(() => "plan-" + Math.random().toString(36).slice(2, 9), []);
  const link = `https://corsi.sakesommelierassociation.it/share/${token}?view=pianificatore`;
  const recipients = (admin ? 1 : 0) + eduSel.length;
  const toggleEdu = (id) => setEduSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const copy = () => { try { navigator.clipboard.writeText(link); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1800); };

  return (
    <div style={plOverlay} onClick={onClose}>
      <div style={{ ...plDialog, maxWidth: 540, maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>Condividi pianificazione</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Link di sola visualizzazione</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Mostra questa pagina in lettura. Nessun accesso al resto del sistema.</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><PG_Icon name="x" size={14}/></button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Con chi condividere</div>
          <label style={shareRow}>
            <input type="checkbox" checked={admin} onChange={e => setAdmin(e.target.checked)}/>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1 }}>
              <span style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, borderRadius: 6, background: "var(--indigo-50)", color: "var(--indigo-600)" }}><PG_Icon name="user" size={13}/></span>
              <span><span style={{ fontWeight: 600, fontSize: 13 }}>Amministratore</span><span style={{ display: "block", fontSize: 11, color: "var(--text-3)" }}>{(SSA.USERS.find(u => u.roleKey === "admin") || {}).name || "Admin SSA"} · accesso in lettura</span></span>
            </span>
          </label>
          <div className="eyebrow" style={{ margin: "16px 0 8px" }}>Educator</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto" }}>
            {SSA.EDUCATORS.map(e => (
              <label key={e.id} style={shareRow}>
                <input type="checkbox" checked={eduSel.includes(e.id)} onChange={() => toggleEdu(e.id)}/>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <PG_Avatar name={e.name} initials={e.initials} size="sm"/>
                  <span><span style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</span><span style={{ display: "block", fontSize: 11, color: "var(--text-3)" }}>{e.role} · {e.city}</span></span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <div className="field-label" style={{ marginBottom: 6 }}>Link di sola visualizzazione {recipients > 0 && <span style={{ color: "var(--text-4)", fontWeight: 400 }}>· {recipients} destinatari</span>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input mono" readOnly value={link} onFocus={e => e.target.select()} style={{ flex: 1, fontSize: 11.5 }}/>
            <button className={`btn ${copied ? "" : "btn-primary"}`} onClick={copy} style={{ whiteSpace: "nowrap" }}>
              <PG_Icon name={copied ? "check" : "copy"} size={12}/>{copied ? "Copiato" : "Copia"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <PG_Icon name="lock" size={11}/>Chi apre il link vede solo questa pagina, in lettura: non può modificare obiettivi né corsi.
          </div>
        </div>
      </div>
    </div>
  );
}

const shareRow = { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: 8, cursor: "pointer", background: "var(--surface)" };

window.V2_PagePianificatore = V2_PagePianificatore;
