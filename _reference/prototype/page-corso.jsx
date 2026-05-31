// V2 Corso (detail) — Stripe-style
const { Icon: CD_Icon, Avatar: CD_Avatar, Badge: CD_Badge, StatusBadge: CD_Status, KPI: CD_KPI } = window.V2;
const { Fragment } = React;

function V2_PageCorso({ id }) {
  const course = SSA.COURSES.find(c => c.id === id);
  if (!course) return <div className="page"><div className="card card-pad-lg">Corso non trovato. <a className="link" href="#/corsi">Torna al catalogo</a></div></div>;

  const [section, setSection] = useState("iscritti");
  const monthIdx = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].indexOf(course.month);
  const startDate = new Date(course.year, monthIdx, course.day);
  const today = new Date(2026, 4, 25);
  const daysTo = Math.round((startDate - today) / 86400000);
  const pct = course.enrolled / course.capacity;

  return (
    <div className="page">
      {/* Hero */}
      <section className="card" style={{ marginBottom: 24, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <CD_Badge tone={course.typeColor === "oro" ? "oro" : "azzurro"} size="lg">{course.typeLabel}</CD_Badge>
            {course.lifecycle === "pubblicato" && <CD_Status status={course.status} size="lg"/>}
            {course.lifecycle === "passato" && <CD_Badge tone="success" size="lg">Concluso</CD_Badge>}
            {course.lifecycle === "bozza" && <CD_Badge tone="neutral" size="lg">Bozza</CD_Badge>}
            <span className="eyebrow">{course.mode === "online" ? "Online" : "In presenza"}{course.days > 1 ? ` · ${course.days} giorni` : ""}</span>
          </div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 18 }}>{course.shortTitle}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", fontSize: 13.5, color: "var(--text-2)", marginBottom: 20 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CD_Icon name="calendar" size={14} className="text-3"/><strong>{course.day} {course.month} {course.year}</strong></span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CD_Icon name="pin" size={14} className="text-3"/>{course.city}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <CD_Avatar name={course.educator?.name} initials={course.educator?.initials} size="sm"/>
              <a href={`#/educator/${course.educator?.id}`} className="link" style={{ fontWeight: 500 }}>{course.educator?.name}</a>
            </span>
            {course.lifecycle === "pubblicato" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: daysTo < 10 ? "var(--danger-fg)" : "var(--text-2)" }}>
                <CD_Icon name="trending" size={14}/>
                {daysTo > 0 ? `Tra ${daysTo} giorni` : daysTo === 0 ? "Oggi" : `${-daysTo} giorni fa`}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn"><CD_Icon name="whatsapp" size={13}/>Gruppo WhatsApp</button>
            <button className="btn"><CD_Icon name="share" size={13}/>Condividi con educator</button>
            <button className="btn"><CD_Icon name="download" size={13}/>Excel iscritti</button>
            <button className="btn"><CD_Icon name="download" size={13}/>Excel sake</button>
            <div style={{ flex: 1 }}></div>
            <button className="btn btn-primary"><CD_Icon name="check" size={13}/>Segna fatturato</button>
          </div>
        </div>

        {/* KPI inline */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--border)" }}>
          <CourseStat label="Iscritti" value={`${course.enrolled} / ${course.capacity}`} sub={`Min ${course.minStudents}${course.enrolled >= course.minStudents ? " · soglia raggiunta" : ` · mancano ${course.minStudents - course.enrolled}`}`} bar={pct} barTone={course.enrolled < course.minStudents ? (pct < 0.2 ? "danger" : "warning") : "azzurro"}/>
          <CourseStat label="Ricavi" value={`${course.revenue.toLocaleString("it-IT")} €`} sub={`Prezzo lista ${course.price}€`}/>
          <CourseStat label="Costi" value={`${course.totalCost.toLocaleString("it-IT")} €`} sub={`${Object.keys(course.costs).filter(k => course.costs[k]).length} voci`}/>
          <CourseStat label="Margine" value={`${course.margin >= 0 ? "+" : ""}${course.margin.toLocaleString("it-IT")} €`} sub={`${Math.round(course.margin / course.revenue * 100)}% sui ricavi`} tone={course.margin >= 0 ? "success" : "danger"} last/>
        </div>
      </section>

      {/* Reasoning */}
      <div className="card card-pad" style={{ marginBottom: 24, display: "flex", gap: 16, alignItems: "flex-start", background: "var(--indigo-50)", border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
        <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--indigo)", color: "white", display: "grid", placeItems: "center", flexShrink: 0 }}><CD_Icon name="sparkle" size={15}/></div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="eyebrow">Motore raccomandazioni</span>
            {course.lifecycle === "pubblicato" && <CD_Status status={course.status}/>}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text)", margin: 0 }}>{course.notebook.reasoning}</p>
          {course.notebook.plannedAction && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-2)" }}>
              <strong>Azione pianificata:</strong> {course.notebook.plannedAction}
            </div>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="tabs">
        {[
          { id: "iscritti", label: "Iscritti", n: course.enrolled },
          { id: "programma", label: "Programma & Economia", n: course.program.reduce((s,p) => s + p.sakes.length, 0) },
          ...(course.exam ? [{ id: "esame", label: "Esame", n: course.exam.totalQuestions, accent: true }] : [])
        ].map(t => (
          <button key={t.id} className={`tab ${section === t.id ? "active" : ""}`} onClick={() => setSection(t.id)}>
            {t.label}{t.n !== undefined && <span className="tab-count">{t.n}</span>}
          </button>
        ))}
      </div>

      {section === "iscritti" && <IscrittiSection course={course}/>}
      {section === "programma" && <ProgrammaEconomiaSection course={course}/>}
      {section === "esame" && <EsameTabSummary course={course}/>}

      {/* Danger zone — annullamento corso via Shopify */}
      <section className="card card-pad" style={{ marginTop: 28, border: "1px solid var(--danger)", boxShadow: "none" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--danger-bg)", color: "var(--danger-fg)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <CD_Icon name="warn" size={15}/>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="eyebrow" style={{ color: "var(--danger-fg)", marginBottom: 4 }}>Zona pericolosa</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Annulla corso</div>
            <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55, margin: 0, maxWidth: 620 }}>
              Per annullare un corso va prima messo in <strong>bozza su Shopify</strong>, così smette di essere acquistabile. L'operazione si gestisce direttamente su Shopify.
            </p>
          </div>
          <a
            className="btn btn-danger"
            href={`https://admin.shopify.com/store/sakesommelierassociation/products?query=${encodeURIComponent(course.shortTitle)}`}
            target="_blank"
            rel="noopener"
            style={{ alignSelf: "center" }}
          >
            <CD_Icon name="warn" size={13}/>Annulla corso<CD_Icon name="external" size={11}/>
          </a>
        </div>
      </section>
    </div>
  );
}

function EsameTabSummary({ course }) {
  const meta = course.examMeta;
  const exam = course.exam;
  const famLabel = course.type === "shochu" ? "Shochu" : "Nihonshu · Certificato";
  const miniDone = meta ? meta.miniTests.filter(m => m.status === "completato").length : 0;
  const results = course.examResults2 || [];
  const passed = results.filter(r => r.status === "passed").length;
  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 16, display: "flex", gap: 14, alignItems: "center", background: "var(--indigo-50)", border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--indigo)", color: "white", display: "grid", placeItems: "center", flexShrink: 0 }}><CD_Icon name="exam" size={19}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>La gestione esami è nella sezione <strong>Esami & test</strong></div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>Esame finale, mini-test giornalieri e feedback per la famiglia {famLabel}. Editor domande centralizzato.</div>
        </div>
        <a className="btn btn-primary" href={`#/esami/${course.id}`}><CD_Icon name="arrow" size={13}/>Apri esame del corso</a>
      </div>

      <div className="kpi-grid cols-4">
        <CourseStat label="Famiglia" value={course.type === "shochu" ? "Shochu" : "Nihonshu"} sub={course.type === "shochu" ? "Certificazione Shochu" : "Certificato"}/>
        <CourseStat label="Esame finale" value={meta ? `Giorno ${meta.examDayNo}` : "—"} sub={meta ? meta.examDateLabel : ""}/>
        <CourseStat label="Mini-test" value={meta ? `${miniDone}/${meta.miniTests.length}` : "—"} sub="uno per giornata"/>
        <CourseStat label={meta && meta.done ? "Promossi" : "Stato"} value={meta && meta.done ? `${passed}/${results.length}` : (meta && meta.live ? "In corso" : "Da svolgere")} sub={meta && meta.done ? `${results.length ? Math.round(passed/results.length*100) : 0}%` : `${exam.totalQuestions} domande`} last/>
      </div>
    </div>
  );
}

function CourseStat({ label, value, sub, bar, barTone, tone, last }) {
  return (
    <div style={{ padding: "16px 22px", borderRight: last ? "none" : "1px solid var(--border-2)" }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: tone === "success" ? "var(--success-fg)" : tone === "danger" ? "var(--danger-fg)" : "var(--text)" }} className="num">{value}</div>
      {bar !== undefined && (
        <div className={`bar ${barTone}`} style={{ marginTop: 10 }}><i style={{ width: Math.min(bar*100, 100) + "%" }}></i></div>
      )}
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function IscrittiSection({ course }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null); // null | "confermati" | "raccogliere" | "correggere"
  const [iscritti, setIscritti] = useState(() => buildIscrittiModel(course));
  const [expanded, setExpanded] = useState(new Set());

  const update = (iscrittoId, patch) => {
    setIscritti(arr => arr.map(i => i.id === iscrittoId ? { ...i, ...patch } : i));
  };
  const updateBuyer = (iscrittoId, patch) => {
    setIscritti(arr => arr.map(i => i.id === iscrittoId ? { ...i, buyer: { ...i.buyer, ...patch } } : i));
  };
  const updateAttendee = (iscrittoId, attendeeId, patch) => {
    setIscritti(arr => arr.map(i =>
      i.id === iscrittoId
        ? { ...i, attendees: i.attendees.map(a => a.id === attendeeId ? { ...a, ...patch } : a) }
        : i
    ));
  };
  const toggleExpand = (id) => setExpanded(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Filter predicates
  const matchStatus = (i, f) => {
    if (!f) return true;
    if (f === "confermati") return i.attendees.length > 0 && i.attendees.every(a => a.confirmed);
    if (f === "raccogliere") return i.attendees.some(a => a.pending);
    if (f === "correggere") return i.flags.typoName || i.flags.typoEmail;
    return true;
  };

  const list = iscritti.filter(i => {
    if (!matchStatus(i, statusFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return i.buyer.name.toLowerCase().includes(q)
      || i.buyer.email.toLowerCase().includes(q)
      || i.attendees.some(a => a.name.toLowerCase().includes(q));
  });

  // Stats
  const totalSeats = iscritti.reduce((s, i) => s + i.seats, 0);
  const confermatiCount = iscritti.filter(i => i.attendees.length > 0 && i.attendees.every(a => a.confirmed)).length;
  const raccogliereCount = iscritti.filter(i => i.attendees.some(a => a.pending)).length;
  const correggereCount = iscritti.filter(i => i.flags.typoName || i.flags.typoEmail).length;
  const conWA = iscritti.filter(i => i.buyer.hasWA).length;

  const statusFilterLabel = statusFilter === "confermati" ? "ordini con tutti confermati"
    : statusFilter === "raccogliere" ? "ordini con nominativi da raccogliere"
    : statusFilter === "correggere" ? "ordini con errori da correggere"
    : null;

  return (
    <div>
      {/* WhatsApp group bar */}
      <WhatsAppGroupBar course={course} totalIscritti={iscritti.length} conWA={conWA} />

      {/* Stats strip — CLICKABLE filters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginBottom: 16, background: "var(--surface)", borderRadius: "var(--r-3)", boxShadow: "var(--sh-card)", overflow: "hidden" }}>
        <MiniStat
          label="Posti totali"
          value={totalSeats}
          sub={`${iscritti.length} ordini`}
        />
        <MiniStat
          label="Confermati"
          value={confermatiCount}
          sub={`su ${iscritti.length} ordini`}
          tone="success"
          active={statusFilter === "confermati"}
          onClick={() => setStatusFilter(statusFilter === "confermati" ? null : "confermati")}
        />
        <MiniStat
          label="Da raccogliere"
          value={raccogliereCount}
          sub="nominativi mancanti"
          tone={raccogliereCount > 0 ? "warning" : null}
          active={statusFilter === "raccogliere"}
          onClick={() => setStatusFilter(statusFilter === "raccogliere" ? null : "raccogliere")}
        />
        <MiniStat
          label="Da correggere"
          value={correggereCount}
          sub="errori nome / email"
          tone={correggereCount > 0 ? "danger" : null}
          active={statusFilter === "correggere"}
          onClick={() => setStatusFilter(statusFilter === "correggere" ? null : "correggere")}
          last
        />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 360px" }}>
          <CD_Icon name="search" size={14} className="topbar-search-icon"/>
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Cerca per acquirente o partecipante…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {statusFilter && (
          <span className="pill on" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {statusFilterLabel}
            <button onClick={() => setStatusFilter(null)} style={{ display: "inline-grid", placeItems: "center", width: 14, height: 14, borderRadius: 3, background: "rgba(255,255,255,0.18)", color: "white", border: "none", padding: 0, cursor: "pointer" }}>
              <CD_Icon name="x" size={9}/>
            </button>
          </span>
        )}
        <div style={{ flex: 1 }}></div>
        <button className="btn btn-sm"><CD_Icon name="mail" size={12}/>Email a tutti</button>
        <button className="btn btn-sm"><CD_Icon name="download" size={12}/>Esporta CSV</button>
      </div>

      {/* List */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Acquirente</th>
              <th>Partecipanti</th>
              <th>Stato</th>
              <th>Ordine</th>
              <th style={{ textAlign: "right" }}>Pagato</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {list.flatMap(i => {
              const rows = [
                <IscrittoRow
                  key={i.id}
                  iscritto={i}
                  expanded={expanded.has(i.id)}
                  onToggle={() => toggleExpand(i.id)}
                />
              ];
              if (expanded.has(i.id)) {
                rows.push(
                  <IscrittoDetail
                    key={i.id + "-detail"}
                    iscritto={i}
                    onUpdateBuyer={(p) => updateBuyer(i.id, p)}
                    onUpdateAttendee={(aid, p) => updateAttendee(i.id, aid, p)}
                    onAddAttendee={() => update(i.id, {
                      seats: i.seats + 1,
                      attendees: [...i.attendees, { id: "att-" + i.id + "-" + (i.attendees.length + 1), name: "", email: "", phone: "", isBuyer: false, isGift: false, confirmed: false, pending: true }]
                    })}
                    onRemoveAttendee={(aid) => update(i.id, {
                      seats: Math.max(1, i.seats - 1),
                      attendees: i.attendees.filter(a => a.id !== aid)
                    })}
                  />
                );
              }
              return rows;
            })}
            {list.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Nessun iscritto corrisponde ai filtri.
                {statusFilter && <> <button className="link" onClick={() => setStatusFilter(null)}>Rimuovi filtro</button></>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Helpers + Sub-components ----------
function MiniStat({ label, value, sub, tone, last, onClick, active }) {
  const c = tone === "success" ? "var(--success-fg)" : tone === "warning" ? "var(--warning-fg)" : tone === "danger" ? "var(--danger-fg)" : "var(--text)";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      style={{
        padding: "14px 20px",
        borderRight: last ? "none" : "1px solid var(--border-2)",
        textAlign: "left",
        background: active ? "var(--indigo-50)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        border: "none",
        borderRadius: 0,
        position: "relative",
        transition: "background var(--dur-fast)",
        fontFamily: "inherit"
      }}
      onMouseEnter={e => { if (onClick && !active) e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseLeave={e => { if (onClick && !active) e.currentTarget.style.background = "transparent"; }}
    >
      {active && <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--indigo)" }}></span>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase" }}>{label}</span>
        {onClick && <CD_Icon name="filter" size={10} className={active ? "" : "text-mute"} style={{ color: active ? "var(--indigo)" : undefined }}/>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: c }} className="num">{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>{sub}</div>}
    </Tag>
  );
}

function WhatsAppGroupBar({ course, totalIscritti, conWA }) {
  const [created, setCreated] = useState(false);
  const stale = totalIscritti - conWA > 0;
  return (
    <div className="card card-pad" style={{
      display: "flex", alignItems: "center", gap: 16, marginBottom: 16,
      background: created ? "linear-gradient(135deg, #E8FCEC, var(--surface))" : "var(--surface)",
      border: "1px solid " + (created ? "rgba(0, 135, 90, 0.25)" : "var(--border)"),
      boxShadow: "var(--sh-card)"
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8,
        background: created ? "var(--success)" : "var(--surface-2)",
        color: created ? "white" : "var(--text-3)",
        display: "grid", placeItems: "center", flexShrink: 0,
        transition: "all var(--dur)"
      }}>
        <CD_Icon name="whatsapp" size={20}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{created ? "Gruppo WhatsApp attivo" : "Gruppo WhatsApp"}</div>
          {created
            ? <CD_Badge tone="success" dot>aggiornato 2 min fa</CD_Badge>
            : stale && <CD_Badge tone="warning" dot>{totalIscritti - conWA} senza numero WhatsApp</CD_Badge>
          }
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
          {created
            ? <>Membri: {conWA}/{totalIscritti} · <span className="mono">{course.whatsappLink}</span></>
            : <>{conWA}/{totalIscritti} iscritti hanno WhatsApp. Crea il gruppo per inviare materiali, promemoria e gestire la logistica.</>
          }
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {created ? (
          <>
            <button className="btn btn-sm"><CD_Icon name="refresh" size={11}/>Aggiorna invitati</button>
            <a className="btn btn-sm" href={course.whatsappLink} target="_blank" rel="noopener"><CD_Icon name="external" size={11}/>Apri gruppo</a>
          </>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => setCreated(true)}><CD_Icon name="whatsapp" size={11}/>Crea gruppo</button>
        )}
      </div>
    </div>
  );
}

function IscrittoRow({ iscritto, expanded, onToggle }) {
  const i = iscritto;
  const hasIssue = i.flags.typoName || i.flags.typoEmail;
  const pendingAtt = i.attendees.filter(a => a.pending).length;
  const confirmedAtt = i.attendees.filter(a => a.confirmed).length;

  let statusBadge;
  if (pendingAtt > 0) statusBadge = <CD_Badge tone="warning" dot>{pendingAtt} da raccogliere</CD_Badge>;
  else if (hasIssue) statusBadge = <CD_Badge tone="danger" dot>da correggere</CD_Badge>;
  else statusBadge = <CD_Badge tone="success" dot>tutti confermati</CD_Badge>;

  return (
    <tr onClick={onToggle} style={{ cursor: "pointer", background: expanded ? "var(--indigo-50)" : undefined }}>
      <td>
        <button className="btn btn-icon btn-sm btn-ghost" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform var(--dur-fast)" }}><CD_Icon name="chevron" size={13}/></button>
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <CD_Avatar name={i.buyer.name} size="sm"/>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {i.buyer.name}
              {i.flags.typoName && <span title="Nome contiene un possibile typo" style={{ fontSize: 11, color: "var(--danger-fg)" }}>⚠</span>}
              {i.isGift && <CD_Badge tone="indigo">Regalo</CD_Badge>}
              {i.isMulti && <CD_Badge tone="neutral">{i.seats} posti</CD_Badge>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
              <a
                href={`mailto:${i.buyer.email}`}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", maxWidth: "100%" }}
                title={`Invia email a ${i.buyer.email}`}
              >
                <CD_Icon name="mail" size={11} className="text-4"/>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.buyer.email}</span>
                {i.flags.typoEmail && <span title="Email contiene un dominio sospetto" style={{ color: "var(--danger-fg)" }}>⚠</span>}
              </a>
              <a
                href={`tel:${(i.buyer.phone || "").replace(/\s/g,"")}`}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)" }}
                title={`Chiama ${i.buyer.phone}`}
              >
                <CD_Icon name="phone" size={11} className="text-4"/>
                {i.buyer.phone}
                {i.buyer.hasWA && <span title="Ha WhatsApp" style={{ color: "var(--success-fg)", fontSize: 10, marginLeft: 2, display: "inline-flex", alignItems: "center", gap: 2 }}><CD_Icon name="whatsapp" size={10}/>WA</span>}
              </a>
            </div>
          </div>
        </div>
      </td>
      <td>
        {i.isGift && i.attendees[0]?.pending ? (
          <span className="text-3" style={{ fontSize: 12.5, fontStyle: "italic" }}>Nominativo regalo da raccogliere</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 500 }}>
              {i.attendees.filter(a => a.name).map(a => a.name).join(" · ") || "—"}
            </span>
            {confirmedAtt > 0 && confirmedAtt === i.attendees.length && (
              <span title="Tutti confermati" style={{ color: "var(--success-fg)" }}><CD_Icon name="check" size={12}/></span>
            )}
          </div>
        )}
      </td>
      <td>{statusBadge}</td>
      <td className="num text-3">{i.buyer.orderNumber}</td>
      <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>{i.totalAmount.toLocaleString("it-IT")} €</td>
      <td onClick={e => e.stopPropagation()}><button className="btn btn-icon btn-sm btn-ghost"><CD_Icon name="more" size={13}/></button></td>
    </tr>
  );
}

function IscrittoDetail({ iscritto: i, onUpdateBuyer, onUpdateAttendee, onAddAttendee, onRemoveAttendee }) {
  return (
    <tr style={{ background: "var(--surface-2)" }}>
      <td colSpan={7} style={{ padding: 0 }}>
        <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Acquirente block */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Acquirente · ordine {i.buyer.orderNumber}</div>
            <div className="card" style={{ padding: 14, boxShadow: "none", border: "1px solid var(--border)" }}>
              <PersonForm
                person={i.buyer}
                onChange={onUpdateBuyer}
                typoName={i.flags.typoName}
                typoEmail={i.flags.typoEmail}
                showWA
              />
              {i.isGift && (
                <div style={{ marginTop: 10, padding: 10, background: "var(--indigo-50)", borderRadius: 6, fontSize: 12, color: "var(--indigo-600)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <CD_Icon name="tag" size={13}/>
                  <span>L'acquirente <strong>non partecipa</strong>: il posto è stato regalato.</span>
                </div>
              )}
            </div>
          </div>

          {/* Partecipanti block */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>Partecipante{i.attendees.length > 1 ? "i" : ""} · {i.seats} {i.seats === 1 ? "posto" : "posti"}</span>
              <button className="link" onClick={onAddAttendee} style={{ fontSize: 11, background: "none", border: "none", padding: 0 }}>+ Aggiungi posto</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {i.attendees.map(a => (
                <AttendeeCard
                  key={a.id}
                  attendee={a}
                  onChange={(p) => onUpdateAttendee(a.id, p)}
                  onRemove={i.attendees.length > 1 ? () => onRemoveAttendee(a.id) : null}
                />
              ))}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function PersonForm({ person, onChange, typoName, typoEmail, showWA }) {
  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <EditableField
        label="Nome"
        value={person.name}
        editing={editingName}
        onEdit={() => setEditingName(true)}
        onSave={(v) => { onChange({ name: v }); setEditingName(false); }}
        onCancel={() => setEditingName(false)}
        warn={typoName && !editingName ? "Possibile errore di battitura" : null}
      />
      <EditableField
        label="Email"
        value={person.email}
        editing={editingEmail}
        type="email"
        mono
        onEdit={() => setEditingEmail(true)}
        onSave={(v) => { onChange({ email: v }); setEditingEmail(false); }}
        onCancel={() => setEditingEmail(false)}
        warn={typoEmail && !editingEmail ? "Email contiene un dominio sospetto" : null}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ color: "var(--text-3)", fontWeight: 500 }}>Tel:</span>
        <span className="mono">{person.phone}</span>
        {showWA && person.hasWA && <CD_Badge tone="success" dot>WhatsApp</CD_Badge>}
        {showWA && !person.hasWA && <CD_Badge tone="neutral">no WhatsApp</CD_Badge>}
      </div>
    </div>
  );
}

function EditableField({ label, value, editing, onEdit, onSave, onCancel, warn, type, mono }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value, editing]);
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500, marginBottom: 4 }}>{label}</div>
      {editing ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input className="input" type={type || "text"} value={v} onChange={e => setV(e.target.value)} autoFocus style={{ fontFamily: mono ? "var(--font-mono)" : undefined }}/>
          <button className="btn btn-sm btn-primary" onClick={() => onSave(v)}><CD_Icon name="check" size={11}/></button>
          <button className="btn btn-sm btn-ghost" onClick={onCancel}><CD_Icon name="x" size={11}/></button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, fontFamily: mono ? "var(--font-mono)" : undefined }}>{value || <span className="text-mute" style={{ fontWeight: 400 }}>vuoto</span>}</span>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onEdit}><CD_Icon name="edit" size={11}/></button>
          {warn && <span style={{ fontSize: 11, color: "var(--danger-fg)", marginLeft: 4 }}>⚠ {warn}</span>}
        </div>
      )}
    </div>
  );
}

function AttendeeCard({ attendee: a, onChange, onRemove }) {
  if (a.pending && !a.name) {
    // Empty slot — needs data
    return (
      <div className="card" style={{ padding: 12, boxShadow: "none", border: "1px dashed var(--warning)", background: "var(--warning-bg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--warning-fg)" }}>Nominativo da raccogliere</span>
          {onRemove && <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove}><CD_Icon name="trash" size={11}/></button>}
        </div>
        <input className="input" placeholder="Nome partecipante" value={a.name} onChange={e => onChange({ name: e.target.value })} style={{ marginBottom: 6 }}/>
        <input className="input" type="email" placeholder="Email (opzionale)" value={a.email} onChange={e => onChange({ email: e.target.value })} style={{ marginBottom: 6 }}/>
        <input className="input" placeholder="Telefono / WhatsApp" value={a.phone} onChange={e => onChange({ phone: e.target.value })} style={{ marginBottom: 8 }}/>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-sm btn-primary" onClick={() => onChange({ pending: false, confirmed: true })} disabled={!a.name}><CD_Icon name="check" size={11}/>Conferma partecipante</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 12, boxShadow: "none", border: "1px solid " + (a.confirmed ? "var(--border)" : "var(--warning)") }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {a.isBuyer && <CD_Badge tone="indigo">L'acquirente</CD_Badge>}
          {!a.isBuyer && <CD_Badge tone="neutral">Partecipante</CD_Badge>}
          {a.confirmed ? <CD_Badge tone="success" dot>confermato</CD_Badge> : <CD_Badge tone="warning" dot>da confermare</CD_Badge>}
        </div>
        {onRemove && !a.isBuyer && <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove}><CD_Icon name="trash" size={11}/></button>}
      </div>
      <PersonForm
        person={{ name: a.name, email: a.email, phone: a.phone, hasWA: a.hasWA }}
        onChange={onChange}
        typoName={a.typoName}
        typoEmail={a.typoEmail}
      />
      {!a.confirmed && a.name && (
        <button className="btn btn-sm btn-primary" style={{ marginTop: 10, width: "100%" }} onClick={() => onChange({ confirmed: true })}>
          <CD_Icon name="check" size={11}/>Marca come confermato
        </button>
      )}
    </div>
  );
}

// ---- Mock data builder ----
const GIFT_NAMES_BANK = ["Luca Verdi", "Emma Conti", "Filippo Marini", "Sara Romano", "Davide Greco", "Alice Costa", "Matteo Galli", "Anna Bruni", "Riccardo Sala", "Beatrice Caruso"];
function buildIscrittiModel(course) {
  const seed = (k) => { let s = 0; for (const ch of k) s = (s*31 + ch.charCodeAt(0)) | 0; return Math.abs(s); };
  return course.students.map((s, i) => {
    const k = seed(s.email + i);
    const isMulti = i > 0 && k % 11 === 0;
    const isGift = !isMulti && i > 0 && k % 14 === 0;
    const typoName = !isGift && k % 17 === 0;
    const typoEmail = !isGift && !typoName && k % 19 === 0;
    const seats = isMulti ? 2 : 1;
    const attendees = [];
    if (isGift) {
      attendees.push({
        id: "att-" + i + "-gift", name: "", email: "", phone: "",
        isBuyer: false, isGift: true, confirmed: false, pending: true
      });
    } else {
      attendees.push({
        id: "att-" + i + "-self", name: s.name, email: s.email, phone: s.phone,
        isBuyer: true, confirmed: !typoName && !typoEmail,
        typoName, typoEmail, hasWA: s.hasWhatsApp
      });
      if (isMulti) {
        attendees.push({
          id: "att-" + i + "-plus",
          name: GIFT_NAMES_BANK[k % GIFT_NAMES_BANK.length],
          email: "", phone: "",
          isBuyer: false, confirmed: false, pending: true
        });
      }
    }
    return {
      id: "isc-" + i,
      buyer: {
        name: s.name, email: s.email, phone: s.phone, hasWA: s.hasWhatsApp,
        orderNumber: s.orderNumber, amount: s.amount, discountCode: s.discountCode
      },
      seats, isGift, isMulti, attendees,
      totalAmount: s.amount * seats,
      flags: { typoName, typoEmail }
    };
  });
}

function ProgrammaEconomiaSection({ course }) {
  // ===== Stateful program (sortable + comments + template-able) =====
  const [days, setDays] = useState(() =>
    course.program.map((sec, di) => ({
      id: `day-${di+1}`,
      day: sec.day,
      name: sec.name,
      sakes: sec.sakes.map((sk, si) => ({ ...sk, id: `sake-${di+1}-${si}`, note: "" }))
    }))
  );
  const [openNote, setOpenNote] = useState(null);
  const [templateModal, setTemplateModal] = useState(false);
  const [templates, setTemplates] = useState(() =>
    (SSA.MATERIAL_TEMPLATES || []).map(t => ({
      ...t,
      days: t.days.map(d => ({ day: d.day, name: d.name, sakes: d.sakes.map(s => ({ ...s })) }))
    }))
  );
  const [savedToast, setSavedToast] = useState(null);

  // Drag state
  const dragRef = useRef(null); // { dayId, sakeId }
  const handleDragStart = (dayId, sakeId) => { dragRef.current = { dayId, sakeId }; };
  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDrop = (targetDayId, targetSakeId) => {
    if (!dragRef.current) return;
    const { dayId: srcDay, sakeId: srcSake } = dragRef.current;
    if (srcDay === targetDayId && srcSake === targetSakeId) return;
    setDays(arr => {
      const next = arr.map(d => ({ ...d, sakes: [...d.sakes] }));
      const srcDayObj = next.find(d => d.id === srcDay);
      const tgtDayObj = next.find(d => d.id === targetDayId);
      const srcIdx = srcDayObj.sakes.findIndex(s => s.id === srcSake);
      const [moved] = srcDayObj.sakes.splice(srcIdx, 1);
      const tgtIdx = tgtDayObj.sakes.findIndex(s => s.id === targetSakeId);
      tgtDayObj.sakes.splice(tgtIdx === -1 ? tgtDayObj.sakes.length : tgtIdx, 0, moved);
      return next;
    });
    dragRef.current = null;
  };

  const updateSake = (dayId, sakeId, patch) => {
    setDays(arr => arr.map(d => d.id === dayId
      ? { ...d, sakes: d.sakes.map(s => s.id === sakeId ? { ...s, ...patch } : s) }
      : d
    ));
  };
  const removeSake = (dayId, sakeId) => {
    setDays(arr => arr.map(d => d.id === dayId
      ? { ...d, sakes: d.sakes.filter(s => s.id !== sakeId) }
      : d
    ));
  };

  // ===== Add / remove days and sakes directly on the course =====
  const newSake = () => {
    const k = SSA.seed(course.handle + Date.now() + Math.random());
    return { id: "sake-new-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      code: "SAK" + (k % 900 + 100), name: "Nuovo sake", type: "Junmai", sakagura: "—",
      size: 720, cost: 35, qty: 1, note: "" };
  };
  const addSakeToDay = (dayId) => {
    setDays(arr => arr.map(d => d.id === dayId ? { ...d, sakes: [...d.sakes, newSake()] } : d));
  };
  const addDay = () => {
    setDays(arr => {
      const n = arr.length + 1;
      return [...arr, { id: "day-new-" + Date.now(), day: n, name: `Giornata ${n}`, sakes: [] }];
    });
  };
  const removeDay = (dayId) => {
    setDays(arr => arr.filter(d => d.id !== dayId).map((d, i) => ({ ...d, day: i + 1 })));
  };
  const renameDay = (dayId, name) => setDays(arr => arr.map(d => d.id === dayId ? { ...d, name } : d));

  // Drop a sake onto a day (append to end) — used for empty days / move-to-day
  const [dragOverDay, setDragOverDay] = useState(null);
  const handleDayDrop = (targetDayId) => {
    setDragOverDay(null);
    if (!dragRef.current) return;
    const { dayId: srcDay, sakeId: srcSake } = dragRef.current;
    setDays(arr => {
      const next = arr.map(d => ({ ...d, sakes: [...d.sakes] }));
      const srcDayObj = next.find(d => d.id === srcDay);
      const tgtDayObj = next.find(d => d.id === targetDayId);
      if (!srcDayObj || !tgtDayObj) return arr;
      const srcIdx = srcDayObj.sakes.findIndex(s => s.id === srcSake);
      if (srcIdx === -1) return arr;
      const [moved] = srcDayObj.sakes.splice(srcIdx, 1);
      tgtDayObj.sakes.push(moved);
      return next;
    });
    dragRef.current = null;
  };

  // Cost calc from current days state
  const sakeCost = useMemo(
    () => days.reduce((s,p) => s + p.sakes.reduce((ss,sk) => ss + sk.cost * sk.qty, 0), 0),
    [days]
  );
  const totalSakes = days.reduce((s,p) => s + p.sakes.length, 0);

  // Materiali (educator/giornata, diplomi, libri) e durata sono ora definiti nel Template materiali.
  // Qui resta solo il costo sake calcolato dal programma del corso.
  const autoLines = [
    { id: "sake", label: "Sake (programma)", value: sakeCost, source: `Calcolato dal programma · ${totalSakes} sake` }
  ];

  const [customLines, setCustomLines] = useState(() => [
    { id: "ssa_fee", label: "Gestione SSA", value: course.costs.gestione || 900 },
    { id: "location", label: "Location", value: course.costs.location || 0 },
    { id: "food", label: "Catering / food", value: course.costs.food || 0 },
    { id: "adv", label: "Pubblicità", value: course.costs.adv || 0 }
  ]);

  const totalAuto = autoLines.reduce((s,l) => s + l.value, 0);
  const totalCustom = customLines.reduce((s,l) => s + l.value, 0);
  const totalCost = totalAuto + totalCustom;
  const margin = course.revenue - totalCost;
  const marginPct = course.revenue ? Math.round(margin / course.revenue * 100) : 0;
  const marginPerIscritto = course.enrolled ? Math.round(margin / course.enrolled) : 0;

  const updateCustom = (id, patch) => setCustomLines(arr => arr.map(l => l.id === id ? { ...l, ...patch } : l));
  const addCustom = () => setCustomLines(arr => [...arr, { id: "custom-" + Date.now(), label: "Voce personalizzata", value: 0, custom: true }]);
  const removeCustom = (id) => setCustomLines(arr => arr.filter(l => l.id !== id));

  // Template apply / save — alignment rules between template length and course length
  const applyTemplate = (template) => {
    const tplDays = template.days.length;
    setDays(prev => {
      const courseDays = prev.length;
      // Template più lungo del corso: non si può, va esteso prima
      if (tplDays > courseDays) {
        const extend = window.confirm(
          `Il template "${template.name}" ha ${tplDays} giorni, ma il corso ne ha ${courseDays}.\n\n` +
          `Non si può comprimere un template in meno giorni.\n\n` +
          `OK = estendi il corso a ${tplDays} giorni e applica il template\n` +
          `Annulla = non fare nulla`
        );
        if (!extend) return prev;
        const built = template.days.map((sec, di) => ({
          id: `day-tpl-${di+1}-${Date.now()}`, day: di + 1, name: sec.name,
          sakes: sec.sakes.map((sk, si) => ({ ...sk, id: `sake-t-${di+1}-${si}-${Date.now()}` }))
        }));
        setTemplateModal(false);
        setSavedToast(`Corso esteso a ${tplDays} giorni · template "${template.name}" applicato`);
        setTimeout(() => setSavedToast(null), 3500);
        return built;
      }
      // Template ≤ corso: riempi i primi N giorni, lascia invariati gli altri
      const next = prev.map((d, di) => {
        if (di < tplDays) {
          const sec = template.days[di];
          return { id: d.id, day: di + 1, name: sec.name,
            sakes: sec.sakes.map((sk, si) => ({ ...sk, id: `sake-t-${di+1}-${si}-${Date.now()}` })) };
        }
        return { ...d, day: di + 1 };
      });
      setTemplateModal(false);
      const extra = courseDays - tplDays;
      setSavedToast(extra > 0
        ? `Template "${template.name}" applicato ai primi ${tplDays} giorni · ${extra} giorn${extra === 1 ? "o" : "i"} da completare`
        : `Template "${template.name}" applicato`);
      setTimeout(() => setSavedToast(null), 3500);
      return next;
    });
  };
  return (
    <div>
      {/* Toast */}
      {savedToast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "var(--navy)", color: "white", padding: "10px 16px", borderRadius: 6,
          fontSize: 13, fontWeight: 500, boxShadow: "var(--sh-3)", zIndex: 100,
          display: "flex", alignItems: "center", gap: 8
        }}>
          <CD_Icon name="check" size={13}/>{savedToast}
        </div>
      )}

      {/* Financial KPI strip */}
      <div className="kpi-grid cols-4" style={{ marginBottom: 20 }}>
        <CD_KPI label="Ricavi" value={course.revenue.toLocaleString("it-IT")} unit="€" sub={`${course.enrolled} iscritti × €${course.price} medio`} accent="indigo"/>
        <CD_KPI label="Costi totali" value={totalCost.toLocaleString("it-IT")} unit="€" sub={`Sake ${sakeCost.toLocaleString("it-IT")} € · Variabili ${totalCustom.toLocaleString("it-IT")} €`}/>
        <CD_KPI label="Margine netto" value={(margin >= 0 ? "+" : "") + margin.toLocaleString("it-IT")} unit="€" sub={`${marginPct}% sui ricavi`} accent={margin >= 0 ? "green" : "danger"}/>
        <CD_KPI label="Margine per iscritto" value={(marginPerIscritto >= 0 ? "+" : "") + marginPerIscritto} unit="€" sub={`break-even a ${Math.ceil(totalCost / course.price)} iscritti`}/>
      </div>

      {/* Two columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        {/* LEFT: Programma sake */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div>
              <div className="eyebrow">Programma & sake</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
                {totalSakes} sake totali · costo <strong className="num">{sakeCost.toLocaleString("it-IT")} €</strong>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setTemplateModal(true)}>
                <CD_Icon name="copy" size={12}/>Template materiali
              </button>
              <button className="btn btn-sm btn-primary" onClick={addDay}><CD_Icon name="plus" size={12}/>Aggiungi giorno</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {days.map(sec => (
              <div
                key={sec.id}
                className="card"
                onDragOver={(e) => { e.preventDefault(); setDragOverDay(sec.id); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverDay(null); }}
                onDrop={() => handleDayDrop(sec.id)}
                style={{ outline: dragOverDay === sec.id ? "2px solid var(--indigo)" : "none", outlineOffset: -1, transition: "outline-color var(--dur-fast)" }}
              >
                <div className="card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 7, background: "var(--indigo-50)", color: "var(--indigo-600)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 12, flexShrink: 0 }}>G{sec.day}</span>
                    <div style={{ minWidth: 0 }}>
                      <span className="eyebrow">Giorno {sec.day}</span>
                      <input
                        value={sec.name}
                        onChange={(e) => renameDay(sec.id, e.target.value)}
                        className="h3"
                        style={{ marginTop: 1, border: "1px solid transparent", background: "transparent", borderRadius: 4, padding: "1px 4px", marginLeft: -4, width: "100%", fontFamily: "inherit" }}
                        onFocus={(e) => { e.target.style.border = "1px solid var(--border)"; e.target.style.background = "var(--surface)"; }}
                        onBlur={(e) => { e.target.style.border = "1px solid transparent"; e.target.style.background = "transparent"; }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      {sec.sakes.length} sake · {sec.sakes.reduce((s,k) => s + k.cost * k.qty, 0).toLocaleString("it-IT")} €
                    </span>
                    {days.length > 1 && (
                      <button className="btn btn-icon btn-sm btn-ghost" title="Rimuovi giorno" onClick={() => { if (sec.sakes.length === 0 || window.confirm(`Rimuovere ${sec.name} e i suoi ${sec.sakes.length} sake?`)) removeDay(sec.id); }}><CD_Icon name="trash" size={12}/></button>
                    )}
                  </div>
                </div>
                <div>
                  {sec.sakes.map((s, i) => (
                    <SakeRow
                      key={s.id}
                      sake={s}
                      dayId={sec.id}
                      dayNo={sec.day}
                      isLast={i === sec.sakes.length - 1}
                      noteOpen={openNote === s.id}
                      onToggleNote={() => setOpenNote(openNote === s.id ? null : s.id)}
                      onUpdate={(p) => updateSake(sec.id, s.id, p)}
                      onRemove={() => removeSake(sec.id, s.id)}
                      onDragStart={() => handleDragStart(sec.id, s.id)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(sec.id, s.id)}
                    />
                  ))}
                  {sec.sakes.length === 0 && (
                    <div style={{ padding: "18px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>
                      Nessun sake. Trascina qui un sake da un altro giorno, o aggiungine uno.
                    </div>
                  )}
                </div>
                <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
                  <button className="btn btn-sm" style={{ width: "100%" }} onClick={() => addSakeToDay(sec.id)}><CD_Icon name="plus" size={12}/>Aggiungi sake</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Conto economico */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Conto economico</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>Costi e margini del corso</div>
            </div>
            <button className="btn btn-sm" onClick={addCustom}><CD_Icon name="plus" size={12}/>Voce custom</button>
          </div>

          <div className="card">
            <div style={{ padding: "10px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-4)" }}>Automatici</div>
              <span className="num" style={{ fontSize: 12, color: "var(--text-3)" }}>{totalAuto.toLocaleString("it-IT")} €</span>
            </div>
            {autoLines.map(line => <CostLineRow key={line.id} line={line} locked/>)}

            <div style={{ padding: "10px 16px", background: "var(--surface-2)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-4)" }}>Editabili</div>
              <span className="num" style={{ fontSize: 12, color: "var(--text-3)" }}>{totalCustom.toLocaleString("it-IT")} €</span>
            </div>
            {customLines.map(line => (
              <CostLineRow key={line.id} line={line} onChange={(p) => updateCustom(line.id, p)} onRemove={() => removeCustom(line.id)}/>
            ))}

            <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "var(--surface-2)" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Totale costi</span>
              <span className="num" style={{ fontWeight: 600, fontSize: 18, letterSpacing: "-0.01em" }}>{totalCost.toLocaleString("it-IT")} €</span>
            </div>
          </div>

          <div className="card card-pad" style={{ marginTop: 12, background: margin >= 0 ? "var(--success-bg)" : "var(--danger-bg)", border: `1px solid ${margin >= 0 ? "var(--success)" : "var(--danger)"}`, boxShadow: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}>Margine netto</div>
                <div className="num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)", lineHeight: 1 }}>{margin >= 0 ? "+" : ""}{margin.toLocaleString("it-IT")} €</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="eyebrow" style={{ marginBottom: 4, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}>%</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 600, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}>{marginPct}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template Library Modal */}
      {templateModal && (
        <TemplateLibraryModal
          templates={templates}
          courseType={course.type}
          courseTypeLabel={course.typeLabel}
          onClose={() => setTemplateModal(false)}
          onApply={applyTemplate}
          onDelete={(id) => setTemplates(t => t.filter(x => x.id !== id))}
          currentDays={days}
        />
      )}
    </div>
  );
}

// ============ Single sake item — sortable + comment + scheda tecnica ============
function SakeRow({ sake: s, dayId, dayNo, isLast, noteOpen, onToggleNote, onUpdate, onRemove, onDragStart, onDragOver, onDrop }) {
  const [dragging, setDragging] = useState(false);
  const schedaUrl = `https://www.sakecompany.com/sake/${s.code.toLowerCase()}`;
  const hasNote = !!s.note && s.note.trim().length > 0;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-2)",
        opacity: dragging ? 0.4 : 1,
        background: dragging ? "var(--indigo-50)" : "transparent",
        transition: "background var(--dur-fast)"
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "22px 40px 1fr auto auto", gap: 10, alignItems: "center", padding: "10px 16px" }}>
        {/* Drag handle */}
        <div
          draggable
          onDragStart={(e) => { setDragging(true); onDragStart(); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => setDragging(false)}
          title="Trascina per riordinare"
          style={{
            cursor: "grab",
            color: "var(--text-mute)",
            display: "grid", placeItems: "center",
            width: 22, height: 28, borderRadius: 4,
            transition: "all var(--dur-fast)"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-3)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-mute)"; }}
        >
          <CD_Icon name="grip" size={14}/>
        </div>

        {/* Thumb */}
        <div className="ph-img" style={{ width: 40, height: 50, borderRadius: 3, fontSize: 9 }}>{s.code}</div>

        {/* Info */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
            <a
              href={schedaUrl}
              target="_blank"
              rel="noopener"
              title="Apri scheda tecnica su Sake Company"
              style={{
                display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 3,
                fontSize: 10.5, color: "var(--indigo)", background: "var(--indigo-50)", fontWeight: 500
              }}
            >
              <CD_Icon name="external" size={9}/>Sake Company
            </a>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-4)" }} className="mono">{s.code} · {s.size}ML{dayNo ? ` · Giorno ${dayNo}` : ""}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{s.type} · {s.sakagura}</div>
        </div>

        {/* Cost */}
        <div style={{ textAlign: "right", minWidth: 56 }}>
          <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>{s.cost}€</div>
          <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>×{s.qty}</div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 2 }}>
          <button
            className="btn btn-icon btn-sm btn-ghost"
            onClick={onToggleNote}
            title={hasNote ? "Modifica nota" : "Aggiungi nota"}
            style={{
              color: hasNote ? "var(--indigo)" : undefined,
              background: hasNote ? "var(--indigo-50)" : undefined,
              position: "relative"
            }}
          >
            <CD_Icon name="note" size={13}/>
            {hasNote && <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "var(--indigo)" }}></span>}
          </button>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove} title="Rimuovi sake"><CD_Icon name="trash" size={12}/></button>
        </div>
      </div>

      {/* Note panel */}
      {noteOpen && (
        <div style={{ padding: "0 16px 14px 60px", animation: "expandIn 160ms var(--ease-out)" }}>
          <textarea
            className="textarea"
            placeholder="Nota per l'educator · es. ordine di servizio, temperatura, abbinamento, aneddoto…"
            value={s.note || ""}
            onChange={e => onUpdate({ note: e.target.value })}
            autoFocus
            rows={2}
            style={{ width: "100%", fontSize: 12.5 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, gap: 6 }}>
            {s.note && <button className="btn btn-sm btn-ghost" onClick={() => onUpdate({ note: "" })}>Cancella</button>}
            <button className="btn btn-sm" onClick={onToggleNote}>Chiudi</button>
          </div>
        </div>
      )}
      {!noteOpen && hasNote && (
        <div
          onClick={onToggleNote}
          style={{
            margin: "0 16px 12px 60px", padding: "8px 10px",
            background: "var(--indigo-50)", border: "1px solid var(--indigo-100)",
            borderRadius: 4, fontSize: 11.5, color: "var(--text-2)",
            cursor: "pointer", display: "flex", gap: 6, alignItems: "flex-start", lineHeight: 1.4
          }}
        >
          <CD_Icon name="note" size={11} className="text-3"/>
          <span style={{ flex: 1 }}>{s.note}</span>
          <CD_Icon name="edit" size={11} className="text-4"/>
        </div>
      )}
    </div>
  );
}

// ============ Template Library Modal ============
function TemplateLibraryModal({ templates, courseType, courseTypeLabel, onClose, onApply, onDelete, currentDays }) {
  const [filter, setFilter] = useState(courseType || "");
  const [editing, setEditing] = useState(null);

  const filtered = filter ? templates.filter(t => t.type === filter) : templates;

  return (
    <div className="modal-overlay" style={{
      position: "fixed", inset: 0, background: "rgba(10, 37, 64, 0.5)",
      display: "grid", placeItems: "center", zIndex: 200,
      padding: 20
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-dialog" style={{
        background: "var(--surface)", borderRadius: 12,
        boxShadow: "var(--sh-popover)",
        width: "100%", maxWidth: 920, maxHeight: "85vh",
        display: "flex", flexDirection: "column"
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Template materiali</div>
            <h2 className="h1" style={{ fontSize: 20 }}>Libreria template</h2>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><CD_Icon name="x" size={15}/></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
            <span className="eyebrow">Filtra per tipo:</span>
            <button className={`pill ${!filter ? "on" : ""}`} onClick={() => setFilter("")}>Tutti</button>
            {["certificato","introduttivo","masterclass","shochu","mixology"].map(t => (
              <button key={t} className={`pill ${filter === t ? "on" : ""}`} onClick={() => setFilter(t)}>
                {t === courseType && "● "}
                {SSA.COURSE_TYPES[t]?.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-3)" }}>
              Nessun template per questo tipo. <a className="link" href="#/template-materiali">Crea un template in Template materiali →</a>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {filtered.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                matchType={t.type === courseType}
                expanded={editing === t.id}
                onToggle={() => setEditing(editing === t.id ? null : t.id)}
                onApply={() => onApply(t)}
                onDelete={() => { if (confirm(`Eliminare il template "${t.name}"?`)) onDelete(t.id); }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template: t, matchType, expanded, onToggle, onApply, onDelete }) {
  return (
    <div className="card" style={{ border: matchType ? "1px solid var(--indigo)" : "1px solid var(--border)", boxShadow: matchType ? "var(--sh-2)" : "var(--sh-card)" }}>
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <CD_Badge tone={SSA.COURSE_TYPES[t.type]?.color === "oro" ? "oro" : "azzurro"}>{SSA.COURSE_TYPES[t.type]?.label}</CD_Badge>
              {matchType && <CD_Badge tone="indigo" dot>consigliato</CD_Badge>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
            {t.description && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.4 }}>{t.description}</div>}
          </div>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onDelete} title="Elimina template"><CD_Icon name="trash" size={12}/></button>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-3)", marginTop: 10 }}>
          <span><strong className="num" style={{ color: "var(--text)" }}>{t.days.length}</strong> {t.days.length === 1 ? "giorno" : "giorni"}</span>
          <span><strong className="num" style={{ color: "var(--text)" }}>{t.days.reduce((s,d) => s + d.sakes.length, 0)}</strong> sake</span>
          <span><strong className="num" style={{ color: "var(--text)" }}>{t.days.reduce((s,d) => s + d.sakes.reduce((ss,sk) => ss + sk.cost * sk.qty, 0), 0).toLocaleString("it-IT")}</strong>€ costo</span>
        </div>

        {t.lastUsed && (
          <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 8 }}>
            Ultimo uso: {t.lastUsed} · {t.uses} corsi · creato da {t.createdBy}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)", display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={onToggle} style={{ flex: 1 }}>{expanded ? "Nascondi" : "Anteprima"}</button>
        <button className="btn btn-sm btn-primary" onClick={onApply} style={{ flex: 1 }}>Applica al corso</button>
      </div>

      {expanded && (
        <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface)", animation: "expandIn 160ms var(--ease-out)" }}>
          {t.days.map((d, di) => (
            <div key={di} style={{ marginBottom: di < t.days.length - 1 ? 10 : 0 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Giorno {d.day} · {d.name}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {d.sakes.map((s, si) => (
                  <div key={si} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-2)", padding: "3px 0" }}>
                    <span>{s.name} <span className="text-4 mono" style={{ fontSize: 10 }}>· {s.code}</span></span>
                    <span className="num" style={{ color: "var(--text-3)" }}>{s.cost}€×{s.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CostLineRow({ line, locked, onChange, onRemove }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 28px", gap: 10, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--border-2)" }}>
      <div style={{ minWidth: 0 }}>
        {locked ? (
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{line.label}</div>
        ) : (
          <input
            className="input"
            value={line.label}
            onChange={e => onChange({ label: e.target.value })}
            style={{ height: 26, fontSize: 13, fontWeight: 500, border: "1px solid transparent", background: "transparent", padding: "0 6px", marginLeft: -6 }}
            onFocus={e => { e.target.style.border = "1px solid var(--border)"; e.target.style.background = "var(--surface)"; }}
            onBlur={e => { e.target.style.border = "1px solid transparent"; e.target.style.background = "transparent"; }}
          />
        )}
        {line.source && <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{line.source}</div>}
      </div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", fontSize: 12, pointerEvents: "none" }}>€</span>
        <input
          type="number"
          className="input"
          style={{ paddingLeft: 22, height: 28, fontSize: 13, fontFamily: "var(--font-mono)", textAlign: "right", background: locked ? "var(--surface-2)" : "var(--surface)", cursor: locked ? "default" : "text", fontWeight: 600 }}
          value={line.value}
          readOnly={locked}
          onChange={e => onChange && onChange({ value: Number(e.target.value) || 0 })}
        />
      </div>
      <div style={{ display: "grid", placeItems: "center" }}>
        {locked
          ? <span title="Calcolato automaticamente" style={{ color: "var(--text-mute)", display: "grid", placeItems: "center", width: 18, height: 18 }}><CD_Icon name="check" size={11}/></span>
          : <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove} title="Rimuovi"><CD_Icon name="trash" size={11}/></button>
        }
      </div>
    </div>
  );
}

function NotebookSection({ course }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
      <div>
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <textarea className="textarea" rows={3} placeholder="Aggiungi una nota…"/>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-sm btn-primary">Pubblica nota</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {course.notebook.adminNotes.length === 0 && (
            <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>Nessuna nota su questo corso.</div>
          )}
          {course.notebook.adminNotes.map(n => (
            <div key={n.id} className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="eyebrow">{new Date(n.at).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <button className="btn btn-icon btn-sm btn-ghost"><CD_Icon name="trash" size={12}/></button>
              </div>
              <p style={{ fontSize: 13.5, color: "var(--text)", margin: 0 }}>{n.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="field">
            <div className="field-label">Azione pianificata</div>
            <select className="select" defaultValue={course.notebook.plannedAction || ""}>
              <option value="">Nessuna</option>
              <option>Campagna ADV</option>
              <option>Spinta WhatsApp ai contatti</option>
              <option>Contatto educator</option>
              <option>Spostamento data</option>
            </select>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <div className="field-label">Tags</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {course.notebook.tags.map(t => <CD_Badge key={t} tone="neutral">{t}</CD_Badge>)}
              <button className="pill">+ Aggiungi</button>
            </div>
          </div>
        </div>
        <div className="card card-pad" style={{ background: "var(--indigo-50)", border: "1px solid var(--indigo-100)" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}><CD_Icon name="share" size={11}/> Link condivisione educator</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-2)", padding: 8, background: "var(--surface)", borderRadius: 4, marginBottom: 10, wordBreak: "break-all" }}>{course.shareLink}</div>
          <button className="btn btn-sm" style={{ width: "100%" }}><CD_Icon name="external" size={12}/>Copia link</button>
        </div>
      </div>
    </div>
  );
}

window.V2_PageCorso = V2_PageCorso;
