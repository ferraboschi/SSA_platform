// V2 Template materiali — libreria di template di programma
// Ogni template definisce dei GIORNI; dentro ogni giorno i SAKE (+ materiali: educator/giorno, diplomi, libri).
// Scegliendo un template alla creazione di un corso, il corso eredita il numero di giorni e i materiali.
const { Icon: TM_Icon, Badge: TM_Badge, PageHeader: TM_PageHeader } = window.V2;
const { useState: TM_useState, useMemo: TM_useMemo, useRef: TM_useRef } = React;

const SAKE_NAME_BANK = ["Niwa no Uguisu","Ginga Shizuku","Yuki no Bosha","Hakutsuru Sayuri","Born Gold","Hakkaisan Tokubetsu","Tedorigawa Yamahai","Kikusui Funaguchi","Tengumai Yamahai","Kamoizumi Shusen","Dewazakura Oka","Kubota Manju"];
const SAKE_TYPE_BANK = ["Junmai Daiginjo","Junmai Ginjo","Junmai","Honjozo","Daiginjo","Nigori","Kimoto","Yamahai"];
const SAKE_KURA_BANK = ["Asahi Shuzo","Dassai","Tatenokawa","Born Brewery","Hakkaisan","Tedorigawa","Kikusui","Kamoizumi"];

function tmTypeTone(type) {
  return SSA.COURSE_TYPES[type]?.color === "oro" ? "oro" : "azzurro";
}
function tmDeepClone(t) {
  return {
    ...t,
    materiali: { ...t.materiali, extra: (t.materiali.extra || []).map(c => ({ ...c })) },
    days: t.days.map(d => ({ ...d, sakes: d.sakes.map(s => ({ ...s })) }))
  };
}
function tmTemplateStats(t) {
  const totalSakes = t.days.reduce((s, d) => s + d.sakes.length, 0);
  const sakeCost = t.days.reduce((s, d) => s + d.sakes.reduce((ss, sk) => ss + sk.cost * sk.qty, 0), 0);
  return { totalSakes, sakeCost };
}

// ============================================================== //
function V2_PageTemplateMateriali() {
  const [templates, setTemplates] = TM_useState(() => SSA.MATERIAL_TEMPLATES.map(tmDeepClone));
  const [openId, setOpenId] = TM_useState(null);
  const [filter, setFilter] = TM_useState("");
  const [toast, setToast] = TM_useState(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const open = openId ? templates.find(t => t.id === openId) : null;

  const updateTemplate = (id, next) => setTemplates(arr => arr.map(t => t.id === id ? next : t));
  const addTemplate = () => {
    const id = "mtpl-" + Date.now();
    const t = {
      id, name: "Nuovo template", type: "certificato",
      days: [{ day: 1, name: "Giornata 1", sakes: [] }],
      materiali: { educatorPerDay: 200, diplomaPerStudent: 0, libroPerStudent: 0, extra: [] },
      description: "", lastUsed: "—", uses: 0, createdBy: "Sara Manager"
    };
    setTemplates(arr => [t, ...arr]);
    setOpenId(id);
  };
  const duplicateTemplate = (t) => {
    const id = "mtpl-" + Date.now();
    const copy = { ...tmDeepClone(t), id, name: t.name + " (copia)", lastUsed: "—", uses: 0, createdBy: "Sara Manager" };
    setTemplates(arr => [copy, ...arr]);
    flash(`Template duplicato: "${copy.name}"`);
  };
  const deleteTemplate = (t) => {
    if (!confirm(`Eliminare il template "${t.name}"?`)) return;
    setTemplates(arr => arr.filter(x => x.id !== t.id));
    if (openId === t.id) setOpenId(null);
    flash(`Template "${t.name}" eliminato`);
  };

  return (
    <div className="page">
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "var(--navy)", color: "white", padding: "10px 16px", borderRadius: 6,
          fontSize: 13, fontWeight: 500, boxShadow: "var(--sh-3)", zIndex: 200,
          display: "flex", alignItems: "center", gap: 8
        }}>
          <TM_Icon name="check" size={13}/>{toast}
        </div>
      )}

      {open ? (
        <TemplateEditor
          template={open}
          onChange={(next) => updateTemplate(open.id, next)}
          onBack={() => setOpenId(null)}
          onFlash={flash}
        />
      ) : (
        <TemplateLibrary
          templates={templates}
          filter={filter}
          setFilter={setFilter}
          onOpen={setOpenId}
          onCreate={addTemplate}
          onDuplicate={duplicateTemplate}
          onDelete={deleteTemplate}
        />
      )}
    </div>
  );
}

// ============================================================== //
function TemplateLibrary({ templates, filter, setFilter, onOpen, onCreate, onDuplicate, onDelete }) {
  const list = filter ? templates.filter(t => t.type === filter) : templates;
  const types = Object.keys(SSA.COURSE_TYPES);

  return (
    <>
      <TM_PageHeader
        eyebrow="Catalogo"
        title="Template materiali"
        sub="Template di programma riutilizzabili. Ogni template definisce le giornate del corso e, dentro ogni giornata, i sake da servire. Qui vivono anche i materiali: educator a giornata, diplomi e libri di testo."
        actions={<button className="btn btn-primary" onClick={onCreate}><TM_Icon name="plus" size={13}/>Nuovo template</button>}
      />

      {/* How it works strip */}
      <div className="card" style={{ marginBottom: 24, padding: "14px 20px", background: "linear-gradient(180deg, var(--indigo-50), var(--surface))", border: "1px solid var(--indigo-100)", boxShadow: "none", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TM_Icon name="sparkle" size={14} className="text-2"/>
          <span className="eyebrow">Come funziona</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--text-2)", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><TM_Icon name="calendar" size={13} className="text-3"/>Aggiungi <strong>giorni</strong></span>
          <TM_Icon name="arrow" size={12} className="text-4"/>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><TM_Icon name="grid" size={13} className="text-3"/>dentro i giorni i <strong>sake</strong></span>
          <TM_Icon name="arrow" size={12} className="text-4"/>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><TM_Icon name="book" size={13} className="text-3"/>scegli il template in un <strong>nuovo corso</strong> → il corso eredita i giorni</span>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span className="eyebrow">Filtra per tipo:</span>
        <button className={`pill ${!filter ? "on" : ""}`} onClick={() => setFilter("")}>Tutti</button>
        {types.map(t => (
          <button key={t} className={`pill ${filter === t ? "on" : ""}`} onClick={() => setFilter(filter === t ? "" : t)}>
            {SSA.COURSE_TYPES[t]?.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {list.map(t => (
          <LibraryCard key={t.id} template={t} onOpen={() => onOpen(t.id)} onDuplicate={() => onDuplicate(t)} onDelete={() => onDelete(t)} />
        ))}
        {list.length === 0 && (
          <div className="card card-pad" style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--text-3)", padding: 40 }}>
            Nessun template per questo tipo. <button className="link" onClick={onCreate}>Crea il primo</button>
          </div>
        )}
      </div>
    </>
  );
}

function LibraryCard({ template: t, onOpen, onDuplicate, onDelete }) {
  const { totalSakes, sakeCost } = tmTemplateStats(t);
  const materialiPerStudent = (t.materiali.diplomaPerStudent || 0) + (t.materiali.libroPerStudent || 0);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 16, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <TM_Badge tone={tmTypeTone(t.type)}>{SSA.COURSE_TYPES[t.type]?.label}</TM_Badge>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>{t.days.length} {t.days.length === 1 ? "giorno" : "giorni"}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{t.name}</div>
        {t.description && <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.45 }}>{t.description}</div>}

        <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-2)" }}>
          <Stat3 value={t.days.length} label={t.days.length === 1 ? "giorno" : "giorni"} icon="calendar"/>
          <Stat3 value={totalSakes} label="sake" icon="grid"/>
          <Stat3 value={`${sakeCost.toLocaleString("it-IT")}€`} label="costo sake" icon="trending"/>
        </div>

        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 3 }}>
          <span><TM_Icon name="graduation" size={11} className="text-4"/> Educator <strong className="num">{t.materiali.educatorPerDay}€</strong>/giorno · materiali <strong className="num">{materialiPerStudent}€</strong>/iscritto</span>
          <span className="text-4" style={{ fontSize: 10.5 }}>Ultimo uso: {t.lastUsed} · {t.uses} corsi · creato da {t.createdBy}</span>
        </div>
      </div>
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)", display: "flex", gap: 6 }}>
        <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={onOpen}><TM_Icon name="edit" size={11}/>Apri & modifica</button>
        <button className="btn btn-sm btn-icon" title="Duplica" onClick={onDuplicate}><TM_Icon name="copy" size={12}/></button>
        <button className="btn btn-sm btn-icon" title="Elimina" onClick={onDelete}><TM_Icon name="trash" size={12}/></button>
      </div>
    </div>
  );
}

function Stat3({ value, label, icon }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 1 }}>{label}</div>
    </div>
  );
}

// ============================================================== //
function TemplateEditor({ template: t, onChange, onBack, onFlash }) {
  const { totalSakes, sakeCost } = tmTemplateStats(t);

  const setField = (patch) => onChange({ ...t, ...patch });
  const setDays = (days) => onChange({ ...t, days });

  const addDay = () => {
    const n = t.days.length + 1;
    setDays([...t.days, { day: n, name: `Giornata ${n}`, sakes: [] }]);
  };
  const removeDay = (idx) => {
    if (t.days.length === 1) { onFlash("Un template deve avere almeno un giorno"); return; }
    const days = t.days.filter((_, i) => i !== idx).map((d, i) => ({ ...d, day: i + 1 }));
    setDays(days);
  };
  const renameDay = (idx, name) => setDays(t.days.map((d, i) => i === idx ? { ...d, name } : d));

  const addSake = (idx) => {
    const k = (SSA.seed(t.id + idx + t.days[idx].sakes.length)) ;
    const sake = {
      code: `SAK${(k % 900 + 100)}`,
      name: SAKE_NAME_BANK[k % SAKE_NAME_BANK.length],
      type: SAKE_TYPE_BANK[k % SAKE_TYPE_BANK.length],
      sakagura: SAKE_KURA_BANK[k % SAKE_KURA_BANK.length],
      size: 720, cost: 35, qty: 1, note: ""
    };
    setDays(t.days.map((d, i) => i === idx ? { ...d, sakes: [...d.sakes, sake] } : d));
  };
  const updateSake = (idx, si, patch) => setDays(t.days.map((d, i) => i === idx
    ? { ...d, sakes: d.sakes.map((s, j) => j === si ? { ...s, ...patch } : s) } : d));
  const removeSake = (idx, si) => setDays(t.days.map((d, i) => i === idx
    ? { ...d, sakes: d.sakes.filter((_, j) => j !== si) } : d));

  const setMateriali = (patch) => onChange({ ...t, materiali: { ...t.materiali, ...patch } });

  const extra = t.materiali.extra || [];
  const setExtra = (next) => onChange({ ...t, materiali: { ...t.materiali, extra: next } });
  const addExtraCost = () => setExtra([...extra, { id: "x-" + Date.now(), label: "Nuovo costo", value: 0, per: "iscritto" }]);
  const updateExtraCost = (id, patch) => setExtra(extra.map(c => c.id === id ? { ...c, ...patch } : c));
  const removeExtraCost = (id) => setExtra(extra.filter(c => c.id !== id));

  const extraPerStudent = extra.filter(c => c.per === "iscritto").reduce((s, c) => s + (c.value || 0), 0);
  const extraPerCourse = extra.filter(c => c.per === "corso").reduce((s, c) => s + (c.value || 0), 0);
  const materialiPerStudent = (t.materiali.diplomaPerStudent || 0) + (t.materiali.libroPerStudent || 0) + extraPerStudent;

  // Riordino sake (drag su/giù) all'interno di una giornata
  const reorderSake = (idx, from, to) => setDays(t.days.map((d, i) => {
    if (i !== idx) return d;
    if (to < 0 || to >= d.sakes.length || from === to) return d;
    const sakes = [...d.sakes];
    const [moved] = sakes.splice(from, 1);
    sakes.splice(to, 0, moved);
    return { ...d, sakes };
  }));

  return (
    <>
      {/* Editor header */}
      <button className="btn btn-sm btn-ghost" style={{ marginBottom: 14 }} onClick={onBack}><TM_Icon name="arrow-l" size={12}/>Tutti i template</button>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Template</div>
            <input
              className="input"
              value={t.name}
              onChange={e => setField({ name: e.target.value })}
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", height: 44, padding: "0 10px", marginLeft: -10, marginBottom: 10 }}
            />
            <textarea
              className="textarea"
              rows={2}
              placeholder="Descrizione: quando usare questo template…"
              value={t.description}
              onChange={e => setField({ description: e.target.value })}
              style={{ fontSize: 12.5 }}
            />
          </div>
          <div style={{ width: 200 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <div className="field-label">Tipo corso</div>
              <select className="select" value={t.type} onChange={e => setField({ type: e.target.value })}>
                {Object.keys(SSA.COURSE_TYPES).map(k => <option key={k} value={k}>{SSA.COURSE_TYPES[k].label}</option>)}
              </select>
            </div>
            <div className="card" style={{ padding: "10px 14px", boxShadow: "none", border: "1px solid var(--indigo-100)", background: "var(--indigo-50)" }}>
              <div style={{ fontSize: 11, color: "var(--indigo-600)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase" }}>Durata corso</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 600, color: "var(--indigo-600)", lineHeight: 1.1 }}>{t.days.length} {t.days.length === 1 ? "giorno" : "giorni"}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>I corsi che usano questo template saranno di {t.days.length} {t.days.length === 1 ? "giornata" : "giornate"}.</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20, alignItems: "start" }}>
        {/* LEFT — Giorni & sake */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
            <div>
              <div className="eyebrow">Giorni & sake</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{t.days.length} {t.days.length === 1 ? "giorno" : "giorni"} · {totalSakes} sake · costo <strong className="num">{sakeCost.toLocaleString("it-IT")} €</strong></div>
            </div>
            <button className="btn btn-sm btn-primary" onClick={addDay}><TM_Icon name="plus" size={12}/>Aggiungi giorno</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {t.days.map((d, idx) => (
              <DayCard
                key={idx}
                day={d}
                index={idx}
                canRemove={t.days.length > 1}
                onRename={(name) => renameDay(idx, name)}
                onRemoveDay={() => removeDay(idx)}
                onAddSake={() => addSake(idx)}
                onUpdateSake={(si, patch) => updateSake(idx, si, patch)}
                onRemoveSake={(si) => removeSake(idx, si)}
                onReorderSake={(from, to) => reorderSake(idx, from, to)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — Materiali */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Materiali</div>
          <div className="card card-pad">
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>
              Costi gestiti dal template — non più impostati corso per corso. Vengono applicati ai corsi che adottano questo template.
            </div>
            <MaterialeRow
              icon="graduation"
              label="Educator · a giornata"
              hint={`${t.days.length} ${t.days.length === 1 ? "giorno" : "giorni"} → ${(t.materiali.educatorPerDay * t.days.length).toLocaleString("it-IT")} € per corso`}
              value={t.materiali.educatorPerDay}
              suffix="/giorno"
              onChange={(v) => setMateriali({ educatorPerDay: v })}
            />
            <MaterialeRow
              icon="tag"
              label="Diplomi"
              hint="per iscritto"
              value={t.materiali.diplomaPerStudent}
              suffix="/iscritto"
              onChange={(v) => setMateriali({ diplomaPerStudent: v })}
            />
            <MaterialeRow
              icon="book"
              label="Libri di testo"
              hint="per iscritto"
              value={t.materiali.libroPerStudent}
              suffix="/iscritto"
              last={extra.length === 0}
              onChange={(v) => setMateriali({ libroPerStudent: v })}
            />
            {extra.map((c, i) => (
              <ExtraCostRow
                key={c.id}
                cost={c}
                last={i === extra.length - 1}
                onChange={(patch) => updateExtraCost(c.id, patch)}
                onRemove={() => removeExtraCost(c.id)}
              />
            ))}
            <button className="btn btn-sm" style={{ width: "100%", marginTop: 14 }} onClick={addExtraCost}><TM_Icon name="plus" size={12}/>Aggiungi costo</button>
          </div>

          <div className="card card-pad" style={{ marginTop: 12, background: "var(--surface-2)", boxShadow: "none", border: "1px solid var(--border-2)" }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Riepilogo template</div>
            <SummaryLine label="Giornate" value={`${t.days.length}`}/>
            <SummaryLine label="Sake totali" value={`${totalSakes}`}/>
            <SummaryLine label="Costo sake" value={`${sakeCost.toLocaleString("it-IT")} €`}/>
            <SummaryLine label="Educator" value={`${(t.materiali.educatorPerDay * t.days.length).toLocaleString("it-IT")} €`}/>
            <SummaryLine label="Materiali / iscritto" value={`${materialiPerStudent.toLocaleString("it-IT")} €`} last={extraPerCourse === 0}/>
            {extraPerCourse > 0 && <SummaryLine label="Altri costi / corso" value={`${extraPerCourse.toLocaleString("it-IT")} €`} last/>}
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryLine({ label, value, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: last ? "none" : "1px dashed var(--border-2)" }}>
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{label}</span>
      <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function MaterialeRow({ icon, label, hint, value, suffix, onChange, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--border-2)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 6, background: "var(--surface-2)", color: "var(--text-3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <TM_Icon name={icon} size={15}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{hint}</div>
      </div>
      <div style={{ position: "relative", width: 96 }}>
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", fontSize: 12, pointerEvents: "none" }}>€</span>
        <input
          type="number"
          className="input"
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          style={{ paddingLeft: 20, height: 30, fontSize: 13, fontFamily: "var(--font-mono)", textAlign: "right", fontWeight: 600 }}
        />
      </div>
    </div>
  );
}

// Riga costo personalizzato — etichetta, base (per iscritto / per corso), valore, rimuovi
function ExtraCostRow({ cost: c, last, onChange, onRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--border-2)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 6, background: "var(--indigo-50)", color: "var(--indigo-600)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <TM_Icon name="tag" size={14}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          className="input"
          value={c.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Nome costo"
          style={{ height: 28, fontSize: 13, fontWeight: 500, marginBottom: 5 }}
        />
        <div style={{ display: "inline-flex", gap: 4 }}>
          {["iscritto", "corso"].map(p => (
            <button
              key={p}
              onClick={() => onChange({ per: p })}
              className={`pill ${c.per === p ? "on" : ""}`}
              style={{ fontSize: 10, padding: "2px 8px" }}
            >per {p}</button>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", width: 84 }}>
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", fontSize: 12, pointerEvents: "none" }}>€</span>
        <input
          type="number"
          className="input"
          value={c.value}
          onChange={e => onChange({ value: Number(e.target.value) || 0 })}
          style={{ paddingLeft: 20, height: 30, fontSize: 13, fontFamily: "var(--font-mono)", textAlign: "right", fontWeight: 600 }}
        />
      </div>
      <button className="btn btn-icon btn-sm btn-ghost" title="Rimuovi costo" onClick={onRemove}><TM_Icon name="trash" size={12}/></button>
    </div>
  );
}

// ============================================================== //
function DayCard({ day: d, index, canRemove, onRename, onRemoveDay, onAddSake, onUpdateSake, onRemoveSake, onReorderSake }) {
  const [editingName, setEditingName] = TM_useState(false);
  const dragIndex = TM_useRef(null);
  const [overIdx, setOverIdx] = TM_useState(null);
  const cost = d.sakes.reduce((s, sk) => s + sk.cost * sk.qty, 0);

  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="eyebrow">Giorno {d.day}</span>
          {editingName ? (
            <input
              className="input"
              autoFocus
              value={d.name}
              onChange={e => onRename(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => { if (e.key === "Enter") setEditingName(false); }}
              style={{ marginTop: 4, height: 30, fontSize: 15, fontWeight: 600 }}
            />
          ) : (
            <div className="h3" style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setEditingName(true)}>
              {d.name}<TM_Icon name="edit" size={12} className="text-4"/>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{d.sakes.length} sake · {cost.toLocaleString("it-IT")} €</span>
          {canRemove && <button className="btn btn-icon btn-sm btn-ghost" title="Rimuovi giorno" onClick={onRemoveDay}><TM_Icon name="trash" size={12}/></button>}
        </div>
      </div>

      <div>
        {d.sakes.map((s, si) => (
          <TemplateSakeRow
            key={si}
            index={si}
            sake={s}
            isLast={si === d.sakes.length - 1}
            isOver={overIdx === si}
            canMoveUp={si > 0}
            canMoveDown={si < d.sakes.length - 1}
            onUpdate={(patch) => onUpdateSake(si, patch)}
            onRemove={() => onRemoveSake(si)}
            onMoveUp={() => onReorderSake(si, si - 1)}
            onMoveDown={() => onReorderSake(si, si + 1)}
            onDragStartRow={() => { dragIndex.current = si; }}
            onDragEnterRow={() => { if (dragIndex.current !== null && dragIndex.current !== si) setOverIdx(si); }}
            onDropRow={() => { if (dragIndex.current !== null) onReorderSake(dragIndex.current, si); dragIndex.current = null; setOverIdx(null); }}
            onDragEndRow={() => { dragIndex.current = null; setOverIdx(null); }}
          />
        ))}
        {d.sakes.length === 0 && (
          <div style={{ padding: "18px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>Nessun sake in questa giornata.</div>
        )}
      </div>

      <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
        <button className="btn btn-sm" style={{ width: "100%" }} onClick={onAddSake}><TM_Icon name="plus" size={12}/>Aggiungi sake</button>
      </div>
    </div>
  );
}

function TemplateSakeRow({ sake: s, index, isLast, isOver, onUpdate, onRemove, onDragStartRow, onDragEnterRow, onDropRow, onDragEndRow }) {
  const [open, setOpen] = TM_useState(false);
  const [dragging, setDragging] = TM_useState(false);
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnterRow}
      onDrop={(e) => { e.preventDefault(); onDropRow(); }}
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-2)",
        borderTop: isOver ? "2px solid var(--indigo)" : "2px solid transparent",
        opacity: dragging ? 0.4 : 1,
        background: isOver ? "var(--indigo-50)" : "transparent",
        transition: "background var(--dur-fast)"
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "22px 40px 1fr auto auto auto", gap: 10, alignItems: "center", padding: "10px 16px" }}>
        <div
          draggable
          onDragStart={(e) => { setDragging(true); onDragStartRow(); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { setDragging(false); onDragEndRow(); }}
          title="Trascina su o giù per riordinare"
          style={{ cursor: "grab", color: "var(--text-mute)", display: "grid", placeItems: "center", width: 22, height: 28, borderRadius: 4 }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-3)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-mute)"; }}
        >
          <TM_Icon name="grip" size={14}/>
        </div>
        <div className="ph-img" style={{ width: 40, height: 50, borderRadius: 3, fontSize: 9 }}>{s.code}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>{s.code} · {s.size}ML</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{s.type} · {s.sakagura}</div>
        </div>
        <div style={{ textAlign: "right", minWidth: 50 }}>
          <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>{s.cost}€</div>
          <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>×{s.qty}</div>
        </div>
        <button className="btn btn-icon btn-sm btn-ghost" title="Modifica sake" onClick={() => setOpen(o => !o)} style={{ color: open ? "var(--indigo)" : undefined, background: open ? "var(--indigo-50)" : undefined }}><TM_Icon name="edit" size={12}/></button>
        <button className="btn btn-icon btn-sm btn-ghost" title="Rimuovi sake" onClick={onRemove}><TM_Icon name="trash" size={12}/></button>
      </div>

      {open && (
        <div style={{ padding: "0 16px 14px 16px", animation: "expandIn 160ms var(--ease-out)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
            <SakeField label="Nome" value={s.name} onChange={v => onUpdate({ name: v })}/>
            <SakeField label="Codice" value={s.code} mono onChange={v => onUpdate({ code: v })}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <SakeField label="Tipo" value={s.type} onChange={v => onUpdate({ type: v })}/>
            <SakeField label="Sakagura" value={s.sakagura} onChange={v => onUpdate({ sakagura: v })}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <SakeField label="Formato (ML)" value={s.size} type="number" onChange={v => onUpdate({ size: Number(v) || 0 })}/>
            <SakeField label="Costo (€)" value={s.cost} type="number" onChange={v => onUpdate({ cost: Number(v) || 0 })}/>
            <SakeField label="Quantità" value={s.qty} type="number" onChange={v => onUpdate({ qty: Number(v) || 1 })}/>
          </div>
        </div>
      )}
    </div>
  );
}

function SakeField({ label, value, onChange, type, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 500, marginBottom: 3 }}>{label}</div>
      <input
        className="input"
        type={type || "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ height: 30, fontSize: 12.5, fontFamily: mono ? "var(--font-mono)" : undefined }}
      />
    </div>
  );
}

window.V2_PageTemplateMateriali = V2_PageTemplateMateriali;
