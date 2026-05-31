// SSA v2 — Pianificatore: viste frequenza (heatmap, timeline, barre, griglie)
// Espone window.PL_Views. Tutte le viste sono drop-target per i corsi pianificati.
const PLV = window.PL;
const { Icon: PV_Icon, Avatar: PV_Avatar } = window.V2;

// ---------- Drop helper ----------
function plDrop(onDropMonth, year, mIdx, extra) {
  return {
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; },
    onDrop: (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) onDropMonth(id, year, mIdx, extra || {});
    }
  };
}

// ---------- Course chip (shared) ----------
function PL_Chip({ item, onDragStart, onClick, dense }) {
  const tc = PLV.TYPE_COLORS[item.type] || PLV.TYPE_COLORS.introduttivo;
  const planned = item.kind === "planned";
  return (
    <div
      draggable={planned}
      onDragStart={planned ? (e) => { e.dataTransfer.setData("text/plain", item.id); e.dataTransfer.effectAllowed = "move"; onDragStart && onDragStart(item); } : undefined}
      onClick={onClick}
      title={`${item.typeLabel}${item.city ? " · " + item.city : ""}${item.educator ? " · " + item.educator.name : ""}${planned ? " · pianificato" : ` · ${item.enrolled}/${item.capacity}`}`}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: dense ? "2px 6px" : "4px 8px",
        borderRadius: 5, cursor: planned ? "grab" : (onClick ? "pointer" : "default"),
        background: planned ? "transparent" : tc.soft,
        border: planned ? `1px dashed ${tc.solid}` : `1px solid transparent`,
        fontSize: 11, lineHeight: 1.2, minWidth: 0, position: "relative"
      }}
    >
      <span style={{ width: 4, alignSelf: "stretch", borderRadius: 3, background: tc.solid, flexShrink: 0, minHeight: 14 }}></span>
      {planned && <PV_Icon name="grip" size={10} className="text-4"/>}
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: tc.ink }}>
        {item.typeShort}{item.city ? <span style={{ color: "var(--text-3)", fontWeight: 500 }}> · {item.city}</span> : ""}
      </span>
    </div>
  );
}

// ---------- Empty / count helpers ----------
function plMonthCourses(courses, year, mIdx) {
  return courses.filter(c => c.placed !== false && c.year === year && c.mIdx === mIdx);
}

// ============================================================
// 1) HEATMAP — densità corsi per mese (calendario annuale)
// ============================================================
function PL_HeatmapView({ win, courses, onDropMonth, onRequestAdd, onChipClick }) {
  const [over, setOver] = useState(null);
  const counts = win.map(w => plMonthCourses(courses, w.year, w.mIdx).length);
  const max = Math.max(3, ...counts);
  const shade = (n) => {
    if (n === 0) return { bg: "var(--surface)", border: "1px dashed var(--border)" };
    const t = 0.12 + 0.7 * (n / max);
    return { bg: `color-mix(in oklab, var(--indigo) ${Math.round(t * 100)}%, var(--surface))`, border: "1px solid transparent" };
  };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {win.map((w, i) => {
          const cs = plMonthCourses(courses, w.year, w.mIdx);
          const seats = cs.reduce((s, c) => s + c.enrolled, 0);
          const sh = shade(cs.length);
          const isOver = over === w.key;
          return (
            <div
              key={w.key}
              {...plDrop(onDropMonth, w.year, w.mIdx)}
              onDragEnter={() => setOver(w.key)}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }}
              onDrop={(e) => { setOver(null); plDrop(onDropMonth, w.year, w.mIdx).onDrop(e); }}
              style={{
                borderRadius: 10, padding: 12, minHeight: 104,
                background: isOver ? "var(--indigo-50)" : sh.bg,
                border: isOver ? "2px solid var(--indigo)" : sh.border,
                transition: "background var(--dur-fast), border-color var(--dur-fast)"
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: cs.length > max * 0.55 ? "white" : "var(--text)" }}>{w.name}</span>
                  <span style={{ fontSize: 10.5, color: cs.length > max * 0.55 ? "rgba(255,255,255,0.7)" : "var(--text-4)", marginLeft: 5 }}>{w.year}</span>
                  {w.isCurrent && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: "var(--indigo-600)", background: "var(--surface)", padding: "1px 5px", borderRadius: 4 }}>OGGI</span>}
                </div>
                <span className="num" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: cs.length === 0 ? "var(--text-mute)" : cs.length > max * 0.55 ? "white" : "var(--text)" }}>{cs.length}</span>
              </div>
              {cs.length === 0 ? (
                <button onClick={() => onRequestAdd(w.year, w.mIdx)} title={`Aggiungi un corso a ${w.name} ${w.year}`} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", borderRadius: 6, border: "1px dashed var(--border)", background: "transparent", color: "var(--text-mute)", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--indigo)"; e.currentTarget.style.color = "var(--indigo-600)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-mute)"; }}>
                  <PV_Icon name="plus" size={12}/>buco · aggiungi
                </button>
              ) : (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {cs.map(c => {
                      const tc = PLV.TYPE_COLORS[c.type];
                      return <span key={c.id} title={`${c.typeLabel}${c.city ? " · " + c.city : ""} · ${PLV.dateSummary(c)}${c.educator ? " · " + c.educator.name : ""}`} onClick={() => onChipClick && onChipClick(c)} style={{ width: 12, height: 12, borderRadius: 3, background: tc.solid, border: c.kind === "planned" ? `1.5px dashed ${cs.length > max * 0.55 ? "white" : tc.ink}` : "none", cursor: "pointer" }}></span>;
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <div style={{ fontSize: 10.5, color: cs.length > max * 0.55 ? "rgba(255,255,255,0.85)" : "var(--text-3)" }} className="num">{seats} iscritti</div>
                    <button onClick={() => onRequestAdd(w.year, w.mIdx)} title={`Aggiungi un corso a ${w.name} ${w.year}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 5, border: "none", background: cs.length > max * 0.55 ? "rgba(255,255,255,0.22)" : "var(--surface)", color: cs.length > max * 0.55 ? "white" : "var(--indigo-600)", cursor: "pointer", fontSize: 10.5, fontFamily: "inherit", fontWeight: 600 }}>
                      <PV_Icon name="plus" size={11}/>corso
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 2) MENSILE — agenda verticale per mese (chiara, compatta, drag&drop)
// ============================================================
function PL_AgendaCard({ c, onChipClick }) {
  const tc = PLV.TYPE_COLORS[c.type];
  const planned = c.kind === "planned";
  return (
    <div
      draggable={planned}
      onDragStart={planned ? (e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
      onClick={() => onChipClick && onChipClick(c)}
      title={`${c.typeLabel}${c.city ? " · " + c.city : ""} · ${PLV.dateSummary(c)}${c.educator ? " · " + c.educator.name : ""}${planned ? " · pianificato (trascina per spostare)" : ""}`}
      style={{ width: "100%", background: planned ? "transparent" : tc.soft, backgroundImage: planned ? "repeating-linear-gradient(45deg, rgba(20,40,80,0.045) 0 5px, transparent 5px 11px)" : "none", border: planned ? `1.5px dashed ${tc.solid}` : "1px solid transparent", borderLeft: `3px solid ${tc.solid}`, borderRadius: 7, padding: "8px 10px", cursor: planned ? "grab" : "pointer", display: "flex", flexDirection: "column", gap: 4, opacity: planned ? 0.9 : 1 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: tc.ink, background: planned ? tc.soft : "var(--surface)", padding: "2px 6px", borderRadius: 4 }}>{c.typeShort}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.city || "città da definire"}</span>
        {planned && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}><span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.03em", color: tc.ink, border: `1px dashed ${tc.solid}`, borderRadius: 4, padding: "1px 4px" }}>PIANIF.</span><PV_Icon name="grip" size={11} className="text-4"/></span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)" }}>
        <PV_Icon name="calendar" size={11} className="text-4"/>
        <span className="num" style={{ flex: "1 1 auto", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{PLV.dateSummary(c)}</span>
        <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em", color: c.mode === "online" ? "var(--indigo-600)" : "var(--text-4)", display: "inline-flex", alignItems: "center", gap: 3 }}>
          <PV_Icon name={c.mode === "online" ? "globe" : "pin"} size={10}/>{c.mode === "online" ? "Online" : "Pres."}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {c.educator
          ? <><PV_Avatar name={c.educator.name} initials={c.educator.initials} size="sm"/><span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.educator.name}</span></>
          : <span style={{ fontSize: 10.5, color: "var(--text-mute)", fontStyle: "italic" }}>educator da definire</span>}
      </div>
    </div>
  );
}

function PL_TimelineView({ win, courses, onDropMonth, onRequestAdd, onChipClick }) {
  const [over, setOver] = useState(null);
  return (
    <div style={{ display: "flex", gap: 0, overflowX: "auto", border: "1px solid var(--border-2)", borderRadius: 8 }}>
      {win.map((w, i) => {
        const cs = plMonthCourses(courses, w.year, w.mIdx).sort((a, b) => a.day - b.day);
        const seats = cs.reduce((s, c) => s + c.enrolled, 0);
        const isOver = over === w.key;
        return (
          <div
            key={w.key}
            {...plDrop(onDropMonth, w.year, w.mIdx)}
            onDragEnter={() => setOver(w.key)}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }}
            onDrop={(e) => { setOver(null); plDrop(onDropMonth, w.year, w.mIdx).onDrop(e); }}
            style={{ flex: "0 0 226px", width: 226, borderRight: i < 11 ? "1px solid var(--border-2)" : "none", background: isOver ? "var(--indigo-50)" : w.isCurrent ? "var(--surface-2)" : "var(--surface)", display: "flex", flexDirection: "column", transition: "background var(--dur-fast)" }}
          >
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-2)", position: "sticky", top: 0, background: "inherit", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: w.isCurrent ? "var(--indigo-600)" : "var(--text)" }}>{w.name}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>{w.year}</span>
                {w.isCurrent && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: "var(--indigo-600)", background: "var(--indigo-50)", padding: "1px 5px", borderRadius: 4 }}>OGGI</span>}
              </div>
              <span style={{ fontSize: 10.5, color: cs.length ? "var(--text-3)" : "var(--text-mute)" }} className="num">{cs.length ? `${cs.length} cors${cs.length === 1 ? "o" : "i"} · ${seats} iscr.` : "nessun corso"}</span>
            </div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 210, flex: 1 }}>
              {cs.map(c => <PL_AgendaCard key={c.id} c={c} onChipClick={onChipClick}/>)}
              <button
                onClick={() => onRequestAdd(w.year, w.mIdx)}
                title={`Aggiungi un corso a ${w.name} ${w.year}`}
                style={{ marginTop: "auto", minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 7, border: "1px dashed var(--border)", background: "transparent", color: "var(--text-4)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--indigo)"; e.currentTarget.style.color = "var(--indigo-600)"; e.currentTarget.style.background = "var(--surface)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-4)"; e.currentTarget.style.background = "transparent"; }}
              >
                <PV_Icon name="plus" size={13}/>Aggiungi corso
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 3) BARRE per mese divise per tipo (stacked)
// ============================================================
function PL_BarsByTypeView({ win, courses, onDropMonth, onRequestAdd, types }) {
  const [over, setOver] = useState(null);
  const data = win.map(w => {
    const cs = plMonthCourses(courses, w.year, w.mIdx);
    const byType = {};
    types.forEach(t => byType[t] = cs.filter(c => c.type === t).length);
    return { w, total: cs.length, byType };
  });
  const max = Math.max(3, ...data.map(d => d.total));
  const H = 168;
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        {types.map(t => {
          const tc = PLV.TYPE_COLORS[t];
          const lbl = (window.SSA.COURSE_TYPES[t] || {}).label || t;
          return (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-2)" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: tc.solid }}></span>{lbl}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: H + 26, paddingTop: 4 }}>
        {data.map(d => {
          const isOver = over === d.w.key;
          return (
            <div key={d.w.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}
              {...plDrop(onDropMonth, d.w.year, d.w.mIdx)}
              onDragEnter={() => setOver(d.w.key)}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }}
              onDrop={(e) => { setOver(null); plDrop(onDropMonth, d.w.year, d.w.mIdx).onDrop(e); }}
            >
              <span className="num" style={{ fontSize: 12, fontWeight: 700, color: d.total === 0 ? "var(--text-mute)" : "var(--text-2)" }}>{d.total || ""}</span>
              <div style={{ width: "100%", maxWidth: 46, height: H, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2, borderRadius: 6, background: isOver ? "var(--indigo-50)" : "transparent", outline: isOver ? "2px solid var(--indigo)" : "none", padding: isOver ? 2 : 0 }}>
                {d.total === 0 ? (
                  <div style={{ height: 4, borderRadius: 2, background: "var(--border-2)" }}></div>
                ) : types.map(t => {
                  const n = d.byType[t];
                  if (!n) return null;
                  const tc = PLV.TYPE_COLORS[t];
                  return <div key={t} title={`${(window.SSA.COURSE_TYPES[t] || {}).label}: ${n}`} style={{ height: (n / max) * H, background: tc.solid, borderRadius: 3, minHeight: 6 }}></div>;
                })}
              </div>
              <div style={{ fontSize: 10, color: d.w.isCurrent ? "var(--indigo-600)" : "var(--text-4)", fontWeight: d.w.isCurrent ? 700 : 500, textTransform: "uppercase" }}>{d.w.short}</div>
              <button onClick={() => onRequestAdd(d.w.year, d.w.mIdx)} title={`Aggiungi un corso a ${d.w.name} ${d.w.year}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 5, border: "1px dashed var(--border)", background: "transparent", color: "var(--text-4)", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--indigo)"; e.currentTarget.style.color = "var(--indigo-600)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-4)"; }}><PV_Icon name="plus" size={12}/></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 4) GRIGLIA Città × Mese
// ============================================================
function PL_CityMonthGridView({ win, courses, onDropMonth, onRequestAdd, cities, onChipClick }) {
  const [over, setOver] = useState(null);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `132px repeat(12, minmax(58px, 1fr))`, minWidth: 760 }}>
        <div style={cellHead}></div>
        {win.map(w => <div key={w.key} style={{ ...cellHead, textAlign: "center" }}><span style={{ color: w.isCurrent ? "var(--indigo-600)" : undefined, fontWeight: w.isCurrent ? 700 : 600 }}>{w.short}</span><div style={{ fontSize: 8.5, color: "var(--text-4)", fontWeight: 400 }}>{String(w.year).slice(2)}</div></div>)}
        {cities.map(city => {
          const isHub = PLV.HUB_CITIES.includes(city);
          const rowTot = courses.filter(c => c.placed !== false && c.city === city && c.mIdx !== null).length;
          return (
            <React.Fragment key={city}>
              <div style={{ ...cellLabel, color: rowTot === 0 ? "var(--text-4)" : "var(--text)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <PV_Icon name={city === "Online" ? "globe" : "pin"} size={11} className="text-4"/>{city}
                  {isHub && <span title="Hub principale" style={{ fontSize: 8.5, color: "var(--text-mute)", fontWeight: 600 }}>HUB</span>}
                </span>
                <span className="num" style={{ fontSize: 11, color: rowTot === 0 ? "var(--text-mute)" : "var(--text-2)", fontWeight: 600 }}>{rowTot}</span>
              </div>
              {win.map(w => {
                const cs = courses.filter(c => c.placed !== false && c.city === city && c.year === w.year && c.mIdx === w.mIdx);
                const key = city + "|" + w.key;
                const isOver = over === key;
                return (
                  <div key={key}
                    {...plDrop(onDropMonth, w.year, w.mIdx, { city })}
                    onDragEnter={() => setOver(key)}
                    onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }}
                    onDrop={(e) => { setOver(null); plDrop(onDropMonth, w.year, w.mIdx, { city }).onDrop(e); }}
                    onClick={() => onRequestAdd(w.year, w.mIdx, { city })}
                    title={`Aggiungi un corso a ${city} · ${w.name} ${w.year}`}
                    style={{ borderBottom: "1px solid var(--border-2)", borderRight: "1px solid var(--border-2)", minHeight: 34, padding: 4, display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", justifyContent: "center", cursor: "pointer", background: isOver ? "var(--indigo-50)" : cs.length ? "transparent" : "var(--surface)" }}>
                    {cs.map(c => {
                      const tc = PLV.TYPE_COLORS[c.type];
                      return <span key={c.id} title={`${c.typeLabel} · ${PLV.dateSummary(c)}${c.educator ? " · " + c.educator.name : ""}`} onClick={(ev) => { ev.stopPropagation(); onChipClick && onChipClick(c); }} style={{ width: 14, height: 14, borderRadius: 3, background: tc.solid, border: c.kind === "planned" ? `1.5px dashed ${tc.ink}` : "none", cursor: "pointer" }}></span>;
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 5) GRIGLIA Educator × Mese
// ============================================================
function PL_EducatorMonthGridView({ win, courses, onDropMonth, onRequestAdd, educators, onChipClick }) {
  const [over, setOver] = useState(null);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `168px repeat(12, minmax(54px, 1fr))`, minWidth: 800 }}>
        <div style={cellHead}></div>
        {win.map(w => <div key={w.key} style={{ ...cellHead, textAlign: "center" }}><span style={{ color: w.isCurrent ? "var(--indigo-600)" : undefined, fontWeight: w.isCurrent ? 700 : 600 }}>{w.short}</span></div>)}
        {educators.map(e => {
          const eCourses = courses.filter(c => c.placed !== false && c.educatorId === e.id && c.mIdx !== null);
          const giornate = eCourses.reduce((s, c) => s + (c.days || 1), 0);
          return (
            <React.Fragment key={e.id}>
              <div style={{ ...cellLabel, gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <PV_Avatar name={e.name} initials={e.initials} size="sm"/>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                </span>
                <span className="num" style={{ fontSize: 10, color: "var(--text-4)", whiteSpace: "nowrap" }}>{eCourses.length}c · {giornate}g</span>
              </div>
              {win.map(w => {
                const cs = courses.filter(c => c.placed !== false && c.educatorId === e.id && c.year === w.year && c.mIdx === w.mIdx);
                const key = e.id + "|" + w.key;
                const isOver = over === key;
                const conflict = cs.length > 1;
                return (
                  <div key={key}
                    {...plDrop(onDropMonth, w.year, w.mIdx, { educatorId: e.id })}
                    onDragEnter={() => setOver(key)}
                    onDragLeave={(ev) => { if (ev.currentTarget === ev.target) setOver(null); }}
                    onDrop={(ev) => { setOver(null); plDrop(onDropMonth, w.year, w.mIdx, { educatorId: e.id }).onDrop(ev); }}
                    onClick={() => onRequestAdd(w.year, w.mIdx, { educatorId: e.id })}
                    title={conflict ? "Possibile sovrapposizione" : `Aggiungi un corso · ${e.name} · ${w.name} ${w.year}`}
                    style={{ borderBottom: "1px solid var(--border-2)", borderRight: "1px solid var(--border-2)", minHeight: 32, padding: 3, display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", justifyContent: "center", cursor: "pointer", background: isOver ? "var(--indigo-50)" : conflict ? "var(--danger-bg)" : "var(--surface)" }}>
                    {cs.map(c => {
                      const tc = PLV.TYPE_COLORS[c.type];
                      return <span key={c.id} title={`${c.typeLabel}${c.city ? " · " + c.city : ""} · ${PLV.dateSummary(c)}`} onClick={(ev) => { ev.stopPropagation(); onChipClick && onChipClick(c); }} style={{ width: 13, height: 13, borderRadius: 3, background: tc.solid, border: c.kind === "planned" ? `1.5px dashed ${tc.ink}` : "none", cursor: "pointer" }}></span>;
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

const cellHead = { padding: "8px 6px", fontSize: 10.5, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", position: "sticky", top: 0 };
const cellLabel = { padding: "6px 10px", fontSize: 12, fontWeight: 500, color: "var(--text)", borderBottom: "1px solid var(--border-2)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between" };

window.PL_Views = {
  Chip: PL_Chip,
  Heatmap: PL_HeatmapView,
  Timeline: PL_TimelineView,
  BarsByType: PL_BarsByTypeView,
  CityMonthGrid: PL_CityMonthGridView,
  EducatorMonthGrid: PL_EducatorMonthGridView
};
