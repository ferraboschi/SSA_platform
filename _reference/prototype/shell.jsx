// SSA v2 — Shell: Sidebar + Topbar + Router

const { Icon: SH_Icon, Avatar: SH_Avatar, Badge: SH_Badge, useRoute: SH_useRoute, Crumbs: SH_Crumbs, useAppState: SH_useAppState } = window.V2;
const { useState: SH_useState, useEffect: SH_useEffect, useMemo: SH_useMemo, useRef: SH_useRef } = React;

// =============== Sidebar ===============
function Sidebar({ active, activeCourse }) {
  const [corsiOpen, setCorsiOpen] = SH_useState(true);
  const SB_TODAY = new Date(2026, 4, 25);
  const SB_MIDX = (m) => ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].indexOf(m);
  // Corsi da Shopify (pubblicati) come sotto-menu, con iscritti e giorni mancanti
  const corsiChildren = SSA.COURSES
    .filter(c => c.lifecycle === "pubblicato")
    .map(c => { const start = new Date(c.year, SB_MIDX(c.month), c.day || 1); return { c, start, d: Math.max(0, Math.round((start - SB_TODAY) / 86400000)) }; })
    .sort((a, b) => a.start - b.start)
    .map(({ c, d }) => ({
      id: "corso-" + c.id,
      label: `${SSA.shortLabel(c.type)} · ${c.city}`,
      href: `#/corsi/${c.id}`,
      meta: `i:${String(c.enrolled).padStart(2, "0")} / d:${String(d).padStart(2, "0")}`,
      current: activeCourse && activeCourse.id === c.id
    }));
  const groups = [
    {
      label: null,
      items: [
        { id: "dashboard", label: "Dashboard", icon: "home", href: "#/dashboard" }
      ]
    },
    {
      label: "Catalogo",
      items: [
        { id: "corsi", label: "Corsi", icon: "book", href: "#/corsi", count: SSA.COURSES.filter(c => c.lifecycle === "pubblicato").length, children: corsiChildren },
        { id: "pianificatore", label: "Pianificatore", icon: "calendar", href: "#/pianificatore" },
        { id: "esami", label: "Esami & test", icon: "exam", href: "#/esami", count: SSA.COURSES.filter(c => c.exam).length, children: [
          { id: "esami-editor", label: "Libreria esami & test", href: "#/esami/editor" }
        ] },
        { id: "template-materiali", label: "Template materiali", icon: "copy", href: "#/template-materiali", count: SSA.MATERIAL_TEMPLATES.length },
        { id: "archivio", label: "Archivio", icon: "archive", href: "#/archivio" }
      ]
    },
    {
      label: "Persone",
      items: [
        { id: "corsisti", label: "Corsisti", icon: "users", href: "#/corsisti", count: SSA.STUDENTS.length },
        { id: "educator", label: "Educator", icon: "graduation", href: "#/educator", count: SSA.EDUCATORS.length }
      ]
    },
    {
      label: "Sistema",
      items: [
        { id: "design-system", label: "Design system", icon: "tag", href: "#/design-system" }
      ]
    }
  ];

  return (
    <aside className="sidebar">
      <a className="sb-brand" href="#/dashboard">
        <div className="sb-mark"><span>S</span></div>
        <div>
          <div className="sb-brand-name">Sake Sommelier</div>
          <div className="sb-brand-sub">Association · IT</div>
        </div>
      </a>

      {groups.map((g, i) => (
        <div key={i} className="sb-group">
          {g.label && <div className="sb-group-label">{g.label}</div>}
          {g.items.map(it => {
            const baseShow = it.children && (active === it.id || it.children.some(ch => ch.id === active || ch.current));
            const collapsible = it.id === "corsi";
            const showChildren = collapsible ? (baseShow && corsiOpen) : baseShow;
            return (
              <React.Fragment key={it.id}>
                <a href={it.href} className={`sb-link ${active === it.id ? "active" : ""}`} onClick={collapsible ? () => { if (active === "corsi") setCorsiOpen(o => !o); else setCorsiOpen(true); } : undefined}>
                  <SH_Icon name={it.icon} size={15}/>
                  <span>{it.label}</span>
                  {it.count !== undefined && <span className="sb-link-count">{it.count}</span>}
                  {collapsible && baseShow && <SH_Icon name="chevron" size={12} className="text-4" style={{ marginLeft: 4, flexShrink: 0, transition: "transform var(--dur-fast)", transform: corsiOpen ? "rotate(90deg)" : "none" }}/>}
                </a>
                {showChildren && it.children.map(ch => (
                  <a key={ch.id} href={ch.href} className={`sb-sublink ${(active === ch.id || ch.current) ? "active" : ""}`} title={ch.meta ? `${ch.label} · ${ch.meta}` : ch.label}>
                    <span className="sb-sublink-tick"></span>
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 1, flex: 1 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.label}</span>
                      {ch.meta && <span className="num" style={{ fontSize: 9.5, color: "var(--text-4)", letterSpacing: "0.01em" }}>{ch.meta}</span>}
                    </span>
                  </a>
                ))}
              </React.Fragment>
            );
          })}
        </div>
      ))}

      <SidebarFoot/>
    </aside>
  );
}

// =============== Sidebar footer (utente loggato + switch) ===============
function SidebarFoot() {
  const [open, setOpen] = SH_useState(false);
  const u = SSA.getCurrentUser();
  const curId = SSA.getCurrentUserId();
  return (
    <div className="sb-foot" style={{ position: "relative" }}>
      <SH_Avatar name={u.name} initials={u.initials} tone={u.tone} size="md"/>
      <div className="sb-foot-info">
        <div className="sb-foot-name">{u.name}</div>
        <div className="sb-foot-role">{u.role}</div>
      </div>
      <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setOpen(o => !o)} title="Account"><SH_Icon name="settings" size={14}/></button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOpen(false)}></div>
          <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--sh-popover)", zIndex: 70, padding: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-4)", padding: "6px 8px 4px" }}>Accedi come</div>
            {SSA.USERS.map(uu => {
              const on = uu.id === curId;
              return (
                <button key={uu.id} onClick={() => { SSA.setCurrentUserId(uu.id); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", border: "none", background: on ? "var(--indigo-50)" : "transparent", borderRadius: 7, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <SH_Avatar name={uu.name} initials={uu.initials} tone={uu.tone} size="sm"/>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{uu.name}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: "var(--text-3)" }}>{uu.role}</span>
                  </span>
                  {on && <SH_Icon name="check" size={13} className="text-2"/>}
                </button>
              );
            })}
            <div style={{ height: 1, background: "var(--border-2)", margin: "4px 0" }}></div>
            <button onClick={() => { location.hash = "#/account"; setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "8px", border: "none", background: "transparent", borderRadius: 7, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 12.5, color: "var(--text)" }}>
              <SH_Icon name="user" size={14} className="text-3"/>Profilo e impostazioni
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// =============== Topbar ===============
function Topbar({ crumbs }) {
  const [q, setQ] = SH_useState("");
  const [open, setOpen] = SH_useState(false);
  const [activeIdx, setActiveIdx] = SH_useState(0);
  const inputRef = SH_useRef(null);
  const boxRef = SH_useRef(null);

  // Cmd+K
  SH_useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // outside click
  SH_useEffect(() => {
    const onClick = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = SH_useMemo(() => buildSearchResults(q), [q]);
  const flatResults = SH_useMemo(() => results.flatMap(g => g.items), [results]);

  SH_useEffect(() => { setActiveIdx(0); }, [q]);

  const go = (r) => {
    location.hash = r.href;
    setOpen(false);
    setQ("");
  };

  return (
    <header className="topbar">
      {crumbs && <SH_Crumbs items={crumbs} />}
      <div style={{ flex: 1 }}></div>

      <div ref={boxRef} className="topbar-search" style={{ position: "relative" }}>
        <SH_Icon name="search" size={14} className="topbar-search-icon"/>
        <input
          ref={inputRef}
          placeholder="Cerca corsi, corsisti, educator…"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatResults.length - 1)); }
            if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
            if (e.key === "Enter" && flatResults[activeIdx]) { e.preventDefault(); go(flatResults[activeIdx]); }
          }}
        />
        <span className="topbar-search-kbd">⌘K</span>

        {open && (
          <SearchDropdown
            q={q}
            groups={results}
            flat={flatResults}
            activeIdx={activeIdx}
            setActiveIdx={setActiveIdx}
            onPick={go}
          />
        )}
      </div>

      <div className="topbar-right">
        <span className="tb-status"><span className="dot"></span>Shopify</span>
        <span className="tb-status"><span className="dot"></span>Airtable</span>
        <NotificationsBell/>
        <button className="btn btn-icon btn-ghost"><SH_Icon name="refresh" size={15}/></button>
      </div>
    </header>
  );
}

// =============== Notifiche (campanella) ===============
function NotificationsBell() {
  const [open, setOpen] = SH_useState(false);
  const notifs = SSA.computeNotifications();
  const n = notifs.length;
  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-icon btn-ghost" title="Notifiche" onClick={() => setOpen(o => !o)} style={{ position: "relative" }}>
        <SH_Icon name="bell" size={15}/>
        {n > 0 && <span style={{ position: "absolute", top: 1, right: 1, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 8, background: "var(--danger)", color: "white", fontSize: 9.5, fontWeight: 700, display: "grid", placeItems: "center", lineHeight: 1 }} className="num">{n}</span>}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOpen(false)}></div>
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 380, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--sh-popover)", zIndex: 70, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>Notifiche</span>
              {n > 0 && <SH_Badge tone="danger" dot>{n} da gestire</SH_Badge>}
            </div>
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              {n === 0 && <div style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: 12.5 }}>Nessuna notifica. Tutto in regola.</div>}
              {notifs.map(nt => (
                <a key={nt.id} href={nt.href} onClick={() => setOpen(false)} style={{ display: "flex", gap: 11, padding: "12px 16px", borderBottom: "1px solid var(--border-2)", textDecoration: "none" }}>
                  <span style={{ display: "inline-grid", placeItems: "center", width: 28, height: 28, borderRadius: 7, background: "var(--danger-bg)", color: "var(--danger-fg)", flexShrink: 0 }}><SH_Icon name={nt.icon} size={14}/></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{nt.title}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text-2)", marginTop: 2, lineHeight: 1.45 }}>{nt.body}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: "var(--text-4)", marginTop: 4 }}>{nt.meta}</span>
                    {nt.email && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--indigo-600)", marginTop: 5, background: "var(--indigo-50)", padding: "2px 7px", borderRadius: 5 }}><SH_Icon name="mail" size={10}/>Mail a {nt.email} · via Resend</span>}
                  </span>
                </a>
              ))}
            </div>
            {n > 0 && <div style={{ padding: "9px 16px", fontSize: 10.5, color: "var(--text-4)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 6 }}><SH_Icon name="info" size={11}/>L'invio email automatico sarà collegato a Resend in fase di implementazione.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// =============== Search dropdown (multi-result, multi-category) ===============
function SearchDropdown({ q, groups, flat, activeIdx, setActiveIdx, onPick }) {
  if (!q && flat.length === 0) {
    return (
      <div className="topbar-search-pop">
        <div className="search-section-label">Suggerimenti</div>
        <SearchShortcut icon="book" label="Vai ai Corsi" hint="g + c" href="#/corsi"/>
        <SearchShortcut icon="users" label="Vai ai Corsisti" hint="g + s" href="#/corsisti"/>
        <SearchShortcut icon="graduation" label="Vai a Educator" hint="g + e" href="#/educator"/>
        <SearchShortcut icon="copy" label="Vai a Template materiali" hint="g + t" href="#/template-materiali"/>
        <div className="search-section-label" style={{ marginTop: 10 }}>Ricerca aperta</div>
        <div style={{ padding: "6px 12px 10px", fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
          Cerca su <strong>tutto</strong>: nomi corsi, città, iscritti, email, educator, ID ordine.
          La ricerca restituisce <strong>più risultati per categoria</strong>.
        </div>
      </div>
    );
  }
  if (q && flat.length === 0) {
    return (
      <div className="topbar-search-pop">
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
          Nessun risultato per <strong>"{q}"</strong>
        </div>
      </div>
    );
  }
  let counter = 0;
  return (
    <div className="topbar-search-pop">
      {groups.map(g => g.items.length > 0 && (
        <div key={g.key}>
          <div className="search-section-label">
            <span>{g.label}</span>
            <span style={{ color: "var(--text-4)", fontWeight: 500 }} className="num">{g.items.length}</span>
          </div>
          {g.items.map((r) => {
            const idx = counter++;
            const active = idx === activeIdx;
            return (
              <button
                key={`${g.key}-${r.id}`}
                className={`search-result ${active ? "active" : ""}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => onPick(r)}
              >
                <span className="search-result-icon"><SH_Icon name={r.icon} size={13}/></span>
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div className="search-result-title">{highlight(r.title, q)}</div>
                  {r.sub && <div className="search-result-sub">{r.sub}</div>}
                </span>
                {r.badge && <SH_Badge tone={r.badgeTone || "neutral"}>{r.badge}</SH_Badge>}
                <span style={{ color: "var(--text-4)" }}><SH_Icon name="arrow" size={11}/></span>
              </button>
            );
          })}
        </div>
      ))}
      <div className="search-foot">
        <span><kbd>↑↓</kbd> naviga</span>
        <span><kbd>⏎</kbd> apri</span>
        <span><kbd>esc</kbd> chiudi</span>
        <span style={{ flex: 1 }}></span>
        <span className="num">{flat.length} risultati</span>
      </div>
    </div>
  );
}

function SearchShortcut({ icon, label, hint, href }) {
  return (
    <button className="search-result" onClick={() => location.hash = href}>
      <span className="search-result-icon"><SH_Icon name={icon} size={13}/></span>
      <span style={{ flex: 1, textAlign: "left", fontSize: 13 }}>{label}</span>
      <span className="search-result-hint">{hint}</span>
    </button>
  );
}

function highlight(text, q) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const idx = lower.indexOf(ql);
  if (idx < 0) return text;
  return <>{text.slice(0, idx)}<mark style={{ background: "var(--indigo-50)", color: "var(--indigo-600)", padding: "0 1px", borderRadius: 2, fontWeight: 600 }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
}

// =============== Search builder ===============
function buildSearchResults(q) {
  const groups = [
    { key: "corsi",     label: "Corsi", items: [] },
    { key: "corsisti",  label: "Corsisti", items: [] },
    { key: "educator",  label: "Educator", items: [] },
    { key: "pages",     label: "Pagine", items: [] }
  ];
  if (!q) return groups;
  const lq = q.toLowerCase().trim();

  // Corsi
  SSA.COURSES.forEach(c => {
    const hay = [c.shortTitle, c.title, c.city, c.educator?.name, c.id, c.month + " " + c.year].join(" ").toLowerCase();
    if (hay.includes(lq)) {
      groups[0].items.push({
        id: c.id,
        title: c.shortTitle,
        sub: `${c.day} ${c.month} ${c.year} · ${c.city} · ${c.educator?.name}`,
        icon: "book",
        href: `#/corsi/${c.id}`,
        badge: c.typeShort,
        badgeTone: c.typeColor === "oro" ? "oro" : "azzurro"
      });
    }
  });

  // Corsisti
  (SSA.STUDENTS || []).forEach(s => {
    const hay = [s.name, s.email, s.orderNumber || "", s.city || ""].join(" ").toLowerCase();
    if (hay.includes(lq)) {
      groups[1].items.push({
        id: s.email,
        title: s.name,
        sub: `${s.email}${s.orderNumber ? ` · ord. ${s.orderNumber}` : ""}`,
        icon: "user",
        href: `#/corsisti/${encodeURIComponent(s.email)}`
      });
    }
  });

  // Educator
  SSA.EDUCATORS.forEach(e => {
    const hay = [e.name, e.role, e.city, e.bio].join(" ").toLowerCase();
    if (hay.includes(lq)) {
      groups[2].items.push({
        id: e.id,
        title: e.name,
        sub: `${e.role} · ${e.city}`,
        icon: "graduation",
        href: `#/educator/${e.id}`
      });
    }
  });

  // Tipologie corso → pagina rimossa, i tipi corso restano solo come dato (badge)

  // Pagine
  [
    { id: "dashboard", title: "Dashboard", sub: "Panoramica", icon: "home", href: "#/dashboard" },
    { id: "corsi", title: "Corsi", sub: "Catalogo completo", icon: "book", href: "#/corsi" },
    { id: "esami", title: "Esami & test", sub: "Esami, mini-test, feedback", icon: "exam", href: "#/esami" },
    { id: "template-materiali", title: "Template materiali", sub: "Giorni & sake riutilizzabili", icon: "copy", href: "#/template-materiali" },
    { id: "archivio", title: "Archivio", sub: "Storico corsi", icon: "archive", href: "#/archivio" },
    { id: "corsisti", title: "Corsisti", sub: "Comunità", icon: "users", href: "#/corsisti" },
    { id: "educator", title: "Educator", sub: "Team docenti", icon: "graduation", href: "#/educator" },
    { id: "design-system", title: "Design system", sub: "Token & componenti", icon: "tag", href: "#/design-system" }
  ].forEach(p => {
    if ((p.title + " " + p.sub).toLowerCase().includes(lq)) groups[3].items.push(p);
  });

  // Cap each at 6
  groups.forEach(g => g.items = g.items.slice(0, 6));
  return groups;
}

// =============== App router ===============
function App() {
  const route = SH_useRoute();
  SH_useAppState();
  const top = route.path[0] || "dashboard";

  let body = null, activeNav = top, fullscreen = false, crumbs = null, activeCourse = null;

  if (top === "dashboard") {
    body = window.V2_PageDashboard ? <window.V2_PageDashboard /> : null;
    crumbs = [{ label: "Dashboard" }];
  }
  else if (top === "corsi") {
    if (route.path[1]) {
      const id = route.path[1];
      const course = SSA.COURSES.find(c => c.id === id);
      body = window.V2_PageCorso ? <window.V2_PageCorso id={id} /> : null;
      crumbs = [{ label: "Corsi", href: "#/corsi" }, { label: course?.shortTitle || id }];
      if (course) activeCourse = { id: course.id, title: course.shortTitle };
    } else {
      body = window.V2_PageCorsi ? <window.V2_PageCorsi /> : null;
      crumbs = [{ label: "Corsi" }];
    }
    activeNav = "corsi";
  }
  else if (top === "pianificatore") {
    body = window.V2_PagePianificatore ? <window.V2_PagePianificatore /> : null;
    crumbs = [{ label: "Pianificatore" }];
    activeNav = "pianificatore";
  }
  else if (top === "esami") {
    const seg = route.path[1];
    if (seg === "editor") {
      body = window.V2_PageEsami ? <window.V2_PageEsami view="editor" /> : null;
      crumbs = [{ label: "Esami & test", href: "#/esami" }, { label: "Libreria esami & test" }];
      activeNav = "esami-editor";
    } else if (seg) {
      const course = SSA.COURSES.find(c => c.id === seg);
      body = window.V2_PageEsami ? <window.V2_PageEsami view="course" courseId={seg} /> : null;
      crumbs = [{ label: "Esami & test", href: "#/esami" }, { label: course?.shortTitle || seg }];
      activeNav = "esami";
    } else {
      body = window.V2_PageEsami ? <window.V2_PageEsami view="list" /> : null;
      crumbs = [{ label: "Esami & test" }];
      activeNav = "esami";
    }
  }
  else if (top === "template-materiali") {
    body = window.V2_PageTemplateMateriali ? <window.V2_PageTemplateMateriali templateId={route.path[1]} /> : null;
    crumbs = [{ label: "Template materiali" }];
    activeNav = "template-materiali";
  }
  else if (top === "corsisti") {
    if (route.path[1]) {
      body = window.V2_PageCorsista ? <window.V2_PageCorsista email={decodeURIComponent(route.path[1])} /> : null;
      crumbs = [{ label: "Corsisti", href: "#/corsisti" }, { label: "Profilo" }];
    } else {
      body = window.V2_PageCorsisti ? <window.V2_PageCorsisti /> : null;
      crumbs = [{ label: "Corsisti" }];
    }
    activeNav = "corsisti";
  }
  else if (top === "educator") {
    if (route.path[1]) {
      body = window.V2_PageEducatorDetail ? <window.V2_PageEducatorDetail id={route.path[1]} /> : null;
      crumbs = [{ label: "Educator", href: "#/educator" }, { label: "Profilo" }];
    } else {
      body = window.V2_PageEducator ? <window.V2_PageEducator /> : null;
      crumbs = [{ label: "Educator" }];
    }
    activeNav = "educator";
  }
  else if (top === "archivio") {
    body = window.V2_PageArchivio ? <window.V2_PageArchivio /> : null;
    crumbs = [{ label: "Archivio" }];
    activeNav = "archivio";
  }
  else if (top === "esame-live") {
    body = window.V2_PageEsameLive ? <window.V2_PageEsameLive id={route.path[1]} /> : null;
    fullscreen = true;
  }
  else if (top === "esame-report") {
    body = window.V2_PageEsameReport ? <window.V2_PageEsameReport id={route.path[1]} email={route.path[2]} /> : null;
    activeNav = "corsi";
    crumbs = [{ label: "Corsi", href: "#/corsi" }, { label: "Report PDF" }];
  }
  else if (top === "design-system") {
    body = window.V2_PageDesignSystem ? <window.V2_PageDesignSystem /> : null;
    crumbs = [{ label: "Design system" }];
    activeNav = "design-system";
  }
  else if (top === "account") {
    body = window.V2_PageAccount ? <window.V2_PageAccount /> : null;
    crumbs = [{ label: "Account" }];
    activeNav = "account";
  }
  else {
    body = window.V2_PageDashboard ? <window.V2_PageDashboard /> : null;
  }

  if (fullscreen) {
    return <div className="app no-sidebar">{body}</div>;
  }

  return (
    <div className="app">
      <Sidebar active={activeNav} activeCourse={activeCourse} />
      <main style={{ minWidth: 0 }}>
        <Topbar crumbs={crumbs} />
        {body}
      </main>
    </div>
  );
}

window.V2_App = App;
