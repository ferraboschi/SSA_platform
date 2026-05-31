// SSA v2 — Pianificatore: pannelli analitici (engagement educator, segnali, YoY)
// Espone window.PL_Panels.
const PLP = window.PL;
const { Icon: PP_Icon, Avatar: PP_Avatar, Badge: PP_Badge } = window.V2;

const plDate = (c) => new Date(c.year, c.mIdx, c.day || 1);
const plDayGap = (a, b) => Math.abs(Math.round((plDate(a) - plDate(b)) / 86400000));

// ============================================================
// ENGAGEMENT EDUCATOR
// ============================================================
function PL_EngagementPanel({ courses, educators }) {
  const rows = educators.map(e => {
    const cs = courses.filter(c => c.placed !== false && c.educatorId === e.id && c.mIdx !== null);
    const giornate = cs.reduce((s, c) => s + (c.days || 1), 0);
    const cities = Array.from(new Set(cs.map(c => c.city).filter(Boolean)));
    const real = cs.filter(c => c.kind === "real" && c.capacity > 0);
    const occ = real.length ? Math.round(real.reduce((s, c) => s + c.enrolled / c.capacity, 0) / real.length * 100) : null;
    return { e, n: cs.length, giornate, cities, occ, planned: cs.filter(c => c.kind === "planned").length };
  }).sort((a, b) => b.giornate - a.giornate);

  const maxG = Math.max(1, ...rows.map(r => r.giornate));

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="h3">Coinvolgimento educator</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Carico di lavoro nei prossimi 12 mesi · reali + pianificati</div>
        </div>
        <a href="#/educator" className="btn btn-sm btn-ghost">Team<PP_Icon name="arrow" size={11}/></a>
      </div>
      <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Educator</th>
              <th style={{ width: 70, textAlign: "center" }}>Corsi</th>
              <th style={{ width: 180 }}>Giornate di docenza</th>
              <th style={{ width: 150 }}>Città coperte</th>
              <th style={{ width: 130 }}>Occupazione media</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const over = r.giornate >= 12;
              const idle = r.n === 0;
              return (
                <tr key={r.e.id} className="clickable" onClick={() => location.hash = `#/educator/${r.e.id}`}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <PP_Avatar name={r.e.name} initials={r.e.initials} size="sm"/>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.e.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{r.e.city}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className="num" style={{ fontWeight: 600 }}>{r.n}</span>
                    {r.planned > 0 && <span style={{ fontSize: 10, color: "var(--indigo-600)", marginLeft: 3 }} className="num">+{r.planned}</span>}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="num" style={{ minWidth: 26, fontWeight: 600 }}>{r.giornate}</span>
                      <div className={`bar ${over ? "warning" : "azzurro"}`} style={{ flex: 1 }}><i style={{ width: (r.giornate / maxG * 100) + "%" }}></i></div>
                    </div>
                  </td>
                  <td>
                    {r.cities.length === 0 ? <span style={{ fontSize: 11.5, color: "var(--text-mute)" }}>—</span> : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>{r.cities.length}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 96 }}>{r.cities.join(", ")}</span>
                      </span>
                    )}
                  </td>
                  <td>
                    {r.occ === null ? <span style={{ fontSize: 11.5, color: "var(--text-mute)" }}>n/d</span> : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="num" style={{ minWidth: 32, fontWeight: 600 }}>{r.occ}%</span>
                        <div className={`bar ${r.occ < 50 ? "warning" : "success"}`} style={{ flex: 1 }}><i style={{ width: r.occ + "%" }}></i></div>
                      </div>
                    )}
                  </td>
                  <td>
                    {over && <PP_Badge tone="warning" dot>carico alto</PP_Badge>}
                    {idle && <PP_Badge tone="neutral">libero</PP_Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// SEGNALI DI PIANIFICAZIONE
// ============================================================
function PL_SignalsPanel({ win, courses, cities, onAdd, conflictDays, canniDays, onThresholds }) {
  const [editSoglie, setEditSoglie] = useState(false);
  const cd = conflictDays || 10;
  const nd = canniDays || 30;
  // Buchi: mesi senza corsi
  const placed = courses.filter(c => c.placed !== false && c.mIdx !== null);
  const gapsMonths = win.filter(w => !placed.some(c => c.year === w.year && c.mIdx === w.mIdx));

  // Città scoperte (non hub, non online, 0 corsi in finestra)
  const targetCities = cities.filter(c => !PLP.HUB_CITIES.includes(c) && !PLP.NON_CITIES.includes(c));
  const coveredCities = new Set(placed.map(c => c.city).filter(Boolean));
  const uncoveredCities = targetCities.filter(c => !coveredCities.has(c));

  // Conflitti educator: stesso educator entro 10 giorni
  const conflicts = [];
  const byEdu = {};
  placed.filter(c => c.educatorId).forEach(c => { (byEdu[c.educatorId] = byEdu[c.educatorId] || []).push(c); });
  Object.values(byEdu).forEach(list => {
    const s = [...list].sort((a, b) => plDate(a) - plDate(b));
    for (let i = 1; i < s.length; i++) {
      if (plDayGap(s[i], s[i - 1]) <= cd) conflicts.push({ a: s[i - 1], b: s[i], gap: plDayGap(s[i], s[i - 1]) });
    }
  });

  // Cannibalizzazione: stesso tipo + stessa città entro 30 giorni
  const canni = [];
  const byTC = {};
  placed.filter(c => c.city).forEach(c => { const k = c.type + "|" + c.city; (byTC[k] = byTC[k] || []).push(c); });
  Object.values(byTC).forEach(list => {
    const s = [...list].sort((a, b) => plDate(a) - plDate(b));
    for (let i = 1; i < s.length; i++) {
      if (plDayGap(s[i], s[i - 1]) <= nd) canni.push({ a: s[i - 1], b: s[i], gap: plDayGap(s[i], s[i - 1]) });
    }
  });

  const Section = ({ icon, tone, title, count, children }) => {
    const tones = { warning: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" }, danger: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" }, indigo: { bg: "var(--indigo-50)", fg: "var(--indigo-600)" }, oro: { bg: "var(--oro-bg)", fg: "#8A6E1A" } };
    const t = tones[tone] || tones.indigo;
    return (
      <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 22, height: 22, borderRadius: 5, background: t.bg, color: t.fg }}><PP_Icon name={icon} size={12}/></span>
          <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em" }}>{title}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: count ? t.fg : "var(--text-mute)" }} className="num">{count}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      </div>
    );
  };

  const tag = (txt, tone) => <span style={{ fontSize: 11, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 5, padding: "3px 7px" }}>{txt}</span>;
  const empty = <span style={{ fontSize: 11.5, color: "var(--text-mute)", fontStyle: "italic" }}>Nessuna segnalazione.</span>;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-head" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 24, height: 24, borderRadius: 6, background: "var(--indigo-50)", color: "var(--indigo-600)" }}><PP_Icon name="lightning" size={13}/></span>
            Segnali di pianificazione
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Buchi a calendario, conflitti, cannibalizzazione e suggerimenti automatici</div>
        </div>
        <button className={`btn btn-sm ${editSoglie ? "btn-primary" : ""}`} onClick={() => setEditSoglie(s => !s)}><PP_Icon name="settings" size={12}/>Imposta soglie</button>
      </div>
      {editSoglie && (
        <div style={{ padding: "12px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 6 }}><PP_Icon name="info" size={12}/>Soglie che governano i segnali automatici:</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
            Conflitto educator entro
            <input className="input" type="number" min="1" value={cd} onChange={e => onThresholds && onThresholds({ conflictDays: Math.max(1, parseInt(e.target.value || "1", 10)), canniDays: nd })} style={{ width: 56, height: 28, padding: "0 6px" }}/>
            giorni
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
            Cannibalizzazione entro
            <input className="input" type="number" min="1" value={nd} onChange={e => onThresholds && onThresholds({ conflictDays: cd, canniDays: Math.max(1, parseInt(e.target.value || "1", 10)) })} style={{ width: 56, height: 28, padding: "0 6px" }}/>
            giorni
          </label>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Section icon="calendar" tone="indigo" title="Buchi a calendario" count={gapsMonths.length}>
          {gapsMonths.length === 0 ? empty : gapsMonths.slice(0, 6).map(w => (
            <button key={w.key} onClick={() => onAdd(null, null, w.mIdx, w.year)} title="Pianifica un corso qui" style={sigRow}>
              <span>{w.name} <span style={{ color: "var(--text-4)" }} className="num">{w.year}</span></span>
              <PP_Icon name="plus" size={12} className="text-3"/>
            </button>
          ))}
        </Section>

        <Section icon="pin" tone="oro" title="Città scoperte" count={uncoveredCities.length}>
          {uncoveredCities.length === 0 ? empty : uncoveredCities.slice(0, 6).map(c => (
            <button key={c} onClick={() => onAdd("introduttivo", c, null, null)} title="Pianifica un introduttivo qui" style={sigRow}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><PP_Icon name="pin" size={11} className="text-4"/>{c}</span>
              <PP_Icon name="plus" size={12} className="text-3"/>
            </button>
          ))}
        </Section>

        <Section icon="users" tone="danger" title="Conflitti educator" count={conflicts.length}>
          {conflicts.length === 0 ? empty : conflicts.slice(0, 5).map((cf, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.4 }}>
              <strong>{cf.a.educator ? cf.a.educator.name.split(" ")[0] : "—"}</strong> · {cf.a.typeShort} {PLP.MONTHS_SHORT[cf.a.mIdx]} e {cf.b.typeShort} {PLP.MONTHS_SHORT[cf.b.mIdx]} <span style={{ color: "var(--danger-fg)" }} className="num">({cf.gap}g)</span>
            </div>
          ))}
        </Section>

        <Section icon="warn" tone="warning" title="Cannibalizzazione" count={canni.length}>
          {canni.length === 0 ? empty : canni.slice(0, 5).map((cf, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.4 }}>
              <strong>{cf.a.typeShort}</strong> a {cf.a.city}: {PLP.MONTHS_SHORT[cf.a.mIdx]} + {PLP.MONTHS_SHORT[cf.b.mIdx]} <span style={{ color: "var(--warning-fg)" }} className="num">({cf.gap}g)</span>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

const sigRow = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", textAlign: "left", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 11.5, color: "var(--text)", fontFamily: "inherit" };

// ============================================================
// CONFRONTO ANNO PRECEDENTE (YoY)
// ============================================================
function PL_YoYPanel({ win, courses, types }) {
  const nowCount = courses.filter(c => c.placed !== false && c.mIdx !== null).length;

  // Periodo precedente: stessa finestra spostata di -1 anno
  const prevKeys = new Set(win.map(w => PLP.keyOf(w.year - 1, w.mIdx)));
  const prev = window.SSA.COURSES.filter(c => prevKeys.has(PLP.keyOf(c.year, PLP.monthIdx(c.month))));
  const prevCount = prev.length;

  const delta = nowCount - prevCount;
  const pct = prevCount ? Math.round(delta / prevCount * 100) : null;

  const byTypeNow = {}, byTypePrev = {};
  types.forEach(t => {
    byTypeNow[t] = courses.filter(c => c.placed !== false && c.mIdx !== null && c.type === t).length;
    byTypePrev[t] = prev.filter(c => c.type === t).length;
  });

  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><PP_Icon name="trending" size={12}/> Confronto anno precedente</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 6 }}>
        <span className="num" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{nowCount}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 5 }}>corsi a calendario (12 mesi)</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 14 }}>
        Periodo precedente: <strong className="num">{prevCount}</strong>
        {pct !== null && (
          <span style={{ marginLeft: 8, fontWeight: 600, color: delta >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(pct)}%
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {types.map(t => {
          const tc = PLP.TYPE_COLORS[t];
          const n = byTypeNow[t], p = byTypePrev[t];
          const lbl = (window.SSA.COURSE_TYPES[t] || {}).label || t;
          const mx = Math.max(1, n, p);
          return (
            <div key={t} style={{ display: "grid", gridTemplateColumns: "92px 1fr 44px", alignItems: "center", gap: 8, fontSize: 11.5 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-2)" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: tc.solid }}></span>{lbl}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ height: 7, borderRadius: 3, background: tc.solid, width: `${n / mx * 100}%`, minWidth: n ? 6 : 0 }}></div>
                <div style={{ height: 7, borderRadius: 3, background: "var(--border)", width: `${p / mx * 100}%`, minWidth: p ? 6 : 0 }}></div>
              </div>
              <span className="num" style={{ textAlign: "right", color: "var(--text-3)" }}>{n}<span style={{ color: "var(--text-mute)" }}> / {p}</span></span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, fontSize: 10.5, color: "var(--text-4)", display: "flex", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 4, borderRadius: 2, background: "var(--text-2)" }}></span>questo periodo</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 4, borderRadius: 2, background: "var(--border)" }}></span>precedente</span>
      </div>
    </div>
  );
}

window.PL_Panels = {
  Engagement: PL_EngagementPanel,
  Signals: PL_SignalsPanel,
  YoY: PL_YoYPanel
};
