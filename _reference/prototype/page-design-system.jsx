// V2 Design System page
const { Icon: DS_Icon, Avatar: DS_Avatar, Badge: DS_Badge, StatusBadge: DS_Status, KPI: DS_KPI, PageHeader: DS_PageHeader } = window.V2;

function V2_PageDesignSystem() {
  return (
    <div className="page">
      <DS_PageHeader eyebrow="Sistema" title="Design System v2" sub="Token, componenti, pattern e linee guida per la piattaforma SSA. Stile Stripe-tech con palette SSA: azzurro · oro · navy · indigo."/>

      {/* TOC */}
      <div className="card card-pad" style={{ marginBottom: 32, background: "var(--surface-2)", boxShadow: "none" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Indice</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          {[["palette","Palette"],["type","Tipografia"],["spacing","Spacing & Radius"],["shadow","Shadow"],["buttons","Buttons"],["inputs","Inputs"],["badges","Badges"],["cards","Cards"],["kpi","KPI"],["tabs","Tabs & Segmented"],["table","Tabella"],["misc","Pattern & Brand"]].map(([k,l]) => (
            <a key={k} href={`#${k}`} className="link">{l}</a>
          ))}
        </div>
      </div>

      {/* ===== Palette ===== */}
      <DSSection id="palette" title="Palette colori" desc="Indigo è il colore primario dell'azione. Navy per intestazioni e contenitori scuri. Azzurro/oro come accenti SSA. Verdi/gialli/rossi solo per stati.">
        <PaletteGroup label="Indigo · primario" swatches={[
          ["indigo", "var(--indigo)", "#635BFF"],
          ["indigo-600", "var(--indigo-600)", "#5547F0"],
          ["indigo-400", "var(--indigo-400)", "#8A82FF"],
          ["indigo-100", "var(--indigo-100)", "#EFEEFF"],
          ["indigo-50", "var(--indigo-50)", "#F7F6FF"]
        ]}/>
        <PaletteGroup label="Navy · text & contenitori scuri" swatches={[
          ["navy", "var(--navy)", "#0A2540"],
          ["navy-500", "var(--navy-500)", "#425466"],
          ["navy-400", "var(--navy-400)", "#6B7C93"],
          ["navy-300", "var(--navy-300)", "#8898AA"],
          ["navy-200", "var(--navy-200)", "#ADBDCC"]
        ]}/>
        <PaletteGroup label="SSA accenti" swatches={[
          ["azzurro", "var(--azzurro)", "#2A6FDB"],
          ["azzurro-bg", "var(--azzurro-bg)", "#E6EFFC"],
          ["oro", "var(--oro)", "#C9A24C"],
          ["oro-bg", "var(--oro-bg)", "#FBF4E4"]
        ]}/>
        <PaletteGroup label="Stati semantici" swatches={[
          ["success", "var(--success)", "#00875A"],
          ["success-bg", "var(--success-bg)", "#E3FCEF"],
          ["warning", "var(--warning)", "#C77700"],
          ["warning-bg", "var(--warning-bg)", "#FFF5E5"],
          ["danger", "var(--danger)", "#DE3618"],
          ["danger-bg", "var(--danger-bg)", "#FFEAE5"]
        ]}/>
        <PaletteGroup label="Surface & border" swatches={[
          ["bg", "var(--bg)", "#F6F9FC"],
          ["surface", "var(--surface)", "#FFFFFF"],
          ["surface-2", "var(--surface-2)", "#FAFBFC"],
          ["border", "var(--border)", "#E3E8EE"],
          ["border-2", "var(--border-2)", "#EDF1F5"]
        ]}/>
      </DSSection>

      {/* ===== Type ===== */}
      <DSSection id="type" title="Tipografia" desc="Inter come unico font UI. JetBrains Mono per numeri tabulari, codici e accenti micro. Letter-spacing tight, line-height contenuto.">
        <div className="card card-pad-lg" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <TypeRow label="Display · 44/52 · 600" sample={<span className="display">Lunedì 25 Maggio</span>}/>
          <TypeRow label="H1 · 28/34 · 600" sample={<h1 className="h1">Sake Sommelier Certificato</h1>}/>
          <TypeRow label="H2 · 20/26 · 600" sample={<h2 className="h2">Iscritti del corso</h2>}/>
          <TypeRow label="H3 · 16/22 · 600" sample={<h3 className="h3">Categoria domande</h3>}/>
          <TypeRow label="Body · 14/21 · 400" sample={<p style={{ margin: 0 }}>Tutti i corsi pubblicati, in bozza, archiviati e conclusi. Dati live da Shopify, configurazioni da Airtable.</p>}/>
          <TypeRow label="Small · 13/19 · 400" sample={<p style={{ margin: 0, fontSize: 13 }} className="text-3">Min 6 · soglia raggiunta · mancano 0</p>}/>
          <TypeRow label="Micro · 12/18 · 500" sample={<span style={{ fontSize: 12, fontWeight: 500 }} className="text-3">12 minuti fa</span>}/>
          <TypeRow label="Eyebrow · 11/14 · 600 · uppercase" sample={<span className="eyebrow">Cruscotto esame live</span>}/>
          <TypeRow label="Mono num · 12 tabular" sample={<span className="mono" style={{ fontSize: 13 }}>SSA3247 · +39 333 4521789</span>}/>
        </div>
      </DSSection>

      {/* ===== Spacing & Radius ===== */}
      <DSSection id="spacing" title="Spacing & Radius" desc="Scala 4px-base. Spacing prevalentemente 4/8/12/16/20/24/32. Radius 4-6-8 per UI, 12 per hero cards.">
        <div className="card card-pad-lg">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Spacing</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            {[["s-1",4],["s-2",8],["s-3",12],["s-4",16],["s-5",20],["s-6",24],["s-7",32],["s-8",40],["s-9",48],["s-10",64],["s-11",80],["s-12",96]].map(([k, n]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                <div style={{ width: n + "px", height: 14, background: "var(--indigo-100)", borderRadius: 2 }}></div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{k} · {n}px</div>
              </div>
            ))}
          </div>
          <div className="eyebrow" style={{ marginTop: 28, marginBottom: 14 }}>Radius</div>
          <div style={{ display: "flex", gap: 16 }}>
            {[["r-1", 4, "Tabella, badge"], ["r-2", 6, "Input, button"], ["r-3", 8, "Card"], ["r-4", 12, "Hero card"], ["r-5", 16, "Modal grande"]].map(([k, n, use]) => (
              <div key={k} style={{ textAlign: "center" }}>
                <div style={{ width: 64, height: 64, background: "var(--indigo-50)", border: "1px solid var(--indigo-100)", borderRadius: n }}></div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>{k} · {n}px</div>
                <div style={{ fontSize: 11, color: "var(--text-4)" }}>{use}</div>
              </div>
            ))}
          </div>
        </div>
      </DSSection>

      {/* ===== Shadows ===== */}
      <DSSection id="shadow" title="Shadow & Elevation" desc="Shadow leggere e composte: il pattern Stripe combina più livelli. Usato sparingly sui card, intenso solo per overlay.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
          {[["sh-1", "Hover"], ["sh-2", "Default card"], ["sh-3", "Hover card"], ["sh-card", "Card primario"], ["sh-4", "Overlay/modal"]].map(([k, use]) => (
            <div key={k} style={{ background: "var(--surface)", height: 120, borderRadius: 8, boxShadow: `var(--${k})`, display: "grid", placeItems: "center", textAlign: "center" }}>
              <div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{k}</div>
                <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 4 }}>{use}</div>
              </div>
            </div>
          ))}
        </div>
      </DSSection>

      {/* ===== Buttons ===== */}
      <DSSection id="buttons" title="Buttons" desc="Stack: ghost / outline / primary / dark / danger. Tre dimensioni: sm / default / lg.">
        <DSGrid cols={2}>
          <DSDemo label="Tipologie">
            <button className="btn btn-primary">Primary</button>
            <button className="btn">Default</button>
            <button className="btn btn-dark">Dark</button>
            <button className="btn btn-ghost">Ghost</button>
            <button className="btn btn-danger">Danger</button>
          </DSDemo>
          <DSDemo label="Con icona">
            <button className="btn btn-primary"><DS_Icon name="plus" size={13}/>Nuovo corso</button>
            <button className="btn"><DS_Icon name="download" size={13}/>Esporta</button>
            <button className="btn btn-ghost"><DS_Icon name="filter" size={13}/></button>
            <button className="btn btn-icon"><DS_Icon name="more" size={14}/></button>
          </DSDemo>
          <DSDemo label="Dimensioni">
            <button className="btn btn-sm btn-primary">Small</button>
            <button className="btn btn-primary">Default</button>
            <button className="btn btn-lg btn-primary">Large</button>
          </DSDemo>
          <DSDemo label="Stati">
            <button className="btn btn-primary">Default</button>
            <button className="btn btn-primary" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>Disabled</button>
          </DSDemo>
        </DSGrid>
      </DSSection>

      {/* ===== Inputs ===== */}
      <DSSection id="inputs" title="Inputs" desc="Field con label opzionale, hint sotto. Border-focus indigo + shadow halo.">
        <DSGrid cols={2}>
          <DSDemo label="Text input" stack>
            <div className="field" style={{ width: 280 }}>
              <div className="field-label">Email educator</div>
              <input className="input" placeholder="nome@ssa.it"/>
              <div className="field-hint">Verrà notificato quando attivi l'esame.</div>
            </div>
          </DSDemo>
          <DSDemo label="Select" stack>
            <div className="field" style={{ width: 280 }}>
              <div className="field-label">Tipo corso</div>
              <select className="select"><option>Certificato</option><option>Introduttivo</option></select>
            </div>
          </DSDemo>
          <DSDemo label="Textarea" stack>
            <div className="field" style={{ width: 280 }}>
              <div className="field-label">Note admin</div>
              <textarea className="textarea" rows={3} placeholder="Aggiungi una nota…"/>
            </div>
          </DSDemo>
          <DSDemo label="Search" stack>
            <div style={{ position: "relative", width: 280 }}>
              <DS_Icon name="search" size={14} className="topbar-search-icon"/>
              <input className="input" style={{ paddingLeft: 32 }} placeholder="Cerca corsi…"/>
            </div>
          </DSDemo>
        </DSGrid>
      </DSSection>

      {/* ===== Badges ===== */}
      <DSSection id="badges" title="Badges" desc="Per tag, stati e categorie. Versione neutral, success, warning, danger, indigo, azzurro, oro, navy.">
        <DSGrid cols={2}>
          <DSDemo label="Tone">
            <DS_Badge tone="indigo">Indigo</DS_Badge>
            <DS_Badge tone="success">Success</DS_Badge>
            <DS_Badge tone="warning">Warning</DS_Badge>
            <DS_Badge tone="danger">Danger</DS_Badge>
            <DS_Badge tone="neutral">Neutral</DS_Badge>
            <DS_Badge tone="azzurro">Azzurro</DS_Badge>
            <DS_Badge tone="oro">Oro</DS_Badge>
            <DS_Badge tone="navy">Navy</DS_Badge>
          </DSDemo>
          <DSDemo label="Con dot">
            <DS_Badge tone="success" dot>In traiettoria</DS_Badge>
            <DS_Badge tone="warning" dot>A rischio</DS_Badge>
            <DS_Badge tone="danger" dot>Critico</DS_Badge>
            <DS_Badge tone="neutral" dot>Da monitorare</DS_Badge>
          </DSDemo>
          <DSDemo label="Status corso (uso)">
            <DS_Status status="in-traiettoria"/>
            <DS_Status status="monitor"/>
            <DS_Status status="rischio"/>
            <DS_Status status="critico"/>
          </DSDemo>
          <DSDemo label="Avatar">
            <DS_Avatar name="Lorenzo Ferraboschi" size="sm"/>
            <DS_Avatar name="Camilla Bonnannini"/>
            <DS_Avatar name="Marco Rossi" size="lg" tone="indigo"/>
            <DS_Avatar name="Test User" size="xl" tone="navy"/>
          </DSDemo>
        </DSGrid>
      </DSSection>

      {/* ===== Cards ===== */}
      <DSSection id="cards" title="Cards" desc="Container primario. Padding configurabile, header opzionale con divider.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          <div className="card card-pad">
            <div className="h3" style={{ marginBottom: 6 }}>Card semplice</div>
            <p className="text-3" style={{ margin: 0, fontSize: 13 }}>Container neutro con padding 20px e shadow leggera.</p>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="h3">Card con header</div>
              <button className="btn btn-sm btn-ghost"><DS_Icon name="more" size={13}/></button>
            </div>
            <div className="card-body">
              <p className="text-3" style={{ margin: 0, fontSize: 13 }}>Pattern con titolo separato. Action a destra.</p>
            </div>
          </div>
        </div>
      </DSSection>

      {/* ===== KPI ===== */}
      <DSSection id="kpi" title="KPI" desc="Metrica con label, valore grande, delta opzionale, sotto-testo. Accent bar in cima per colore semantico.">
        <div className="kpi-grid cols-4">
          <DS_KPI label="Iscritti totali" value="248" delta="+18%" deltaDir="up" sub="vs settimana scorsa" accent="indigo"/>
          <DS_KPI label="Ricavi" value="48" unit="k €" delta="+12%" deltaDir="up" sub="mese in corso" accent="green"/>
          <DS_KPI label="Margine" value="-4" unit="k €" delta="-22%" deltaDir="dn" sub="sotto attesa" accent="danger"/>
          <DS_KPI label="% promossi" value="78" unit="%" sub="ultimi 12 mesi" accent="oro"/>
        </div>
      </DSSection>

      {/* ===== Tabs ===== */}
      <DSSection id="tabs" title="Tabs & Segmented" desc="Tabs orizzontali per sezioni principali. Segmented per switch piccoli e settings.">
        <div style={{ marginBottom: 24 }}>
          <div className="tabs">
            <button className="tab active">Iscritti<span className="tab-count">18</span></button>
            <button className="tab">Programma<span className="tab-count">20</span></button>
            <button className="tab">Esame<span className="tab-count">110</span></button>
            <button className="tab">Conto economico</button>
            <button className="tab">Notebook<span className="tab-count">2</span></button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <div className="segmented">
            <button className="on">Calendario</button>
            <button>Griglia</button>
            <button>Tabella</button>
          </div>
          <div className="segmented">
            <button className="on">IT</button>
            <button>EN</button>
            <button>JA</button>
          </div>
        </div>
      </DSSection>

      {/* ===== Table ===== */}
      <DSSection id="table" title="Tabelle" desc="Densità Stripe-dashboard. Hover row. Header in surface-2.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Studente</th><th>Email</th><th>Sconto</th><th>Stato</th><th style={{ textAlign: "right" }}>Importo</th></tr>
            </thead>
            <tbody>
              <tr className="clickable">
                <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><DS_Avatar name="Marco Rossi" size="sm"/><strong>Marco Rossi</strong></div></td>
                <td className="text-3">marco.rossi@gmail.com</td>
                <td><DS_Badge tone="oro">EARLY50</DS_Badge></td>
                <td><DS_Badge tone="success" dot>Pagato</DS_Badge></td>
                <td className="num" style={{ textAlign: "right" }}>540 €</td>
              </tr>
              <tr className="clickable">
                <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><DS_Avatar name="Giulia Bianchi" size="sm"/><strong>Giulia Bianchi</strong></div></td>
                <td className="text-3">giulia.b@libero.it</td>
                <td><span className="text-mute">—</span></td>
                <td><DS_Badge tone="success" dot>Pagato</DS_Badge></td>
                <td className="num" style={{ textAlign: "right" }}>590 €</td>
              </tr>
              <tr className="clickable">
                <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><DS_Avatar name="Andrea Esposito" size="sm"/><strong>Andrea Esposito</strong></div></td>
                <td className="text-3">andrea.e@outlook.com</td>
                <td><DS_Badge tone="oro">KITSUNE100</DS_Badge></td>
                <td><DS_Badge tone="warning" dot>Pending</DS_Badge></td>
                <td className="num" style={{ textAlign: "right" }}>490 €</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DSSection>

      {/* ===== Misc ===== */}
      <DSSection id="misc" title="Pattern & Brand" desc="Hero mesh gradient, brand mark, link, pill, kbd.">
        <DSGrid cols={2}>
          <DSDemo label="Hero mesh gradient" stack>
            <div className="hero hero-mesh" style={{ margin: 0, width: "100%", padding: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Hero block</div>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>Saluti, Sara. <span style={{ color: "var(--text-3)" }}>Hai</span> <span style={{ color: "var(--indigo)" }}>3 corsi</span> <span style={{ color: "var(--text-3)" }}>sotto soglia.</span></div>
            </div>
          </DSDemo>
          <DSDemo label="Brand mark" stack>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div className="sb-mark" style={{ width: 64, height: 64, borderRadius: 12, fontSize: 28 }}><span>S</span></div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>Sake Sommelier Association</div>
                <div className="text-3" style={{ fontSize: 12 }}>Gestione Corsi · Italia</div>
              </div>
            </div>
          </DSDemo>
          <DSDemo label="Pill & Link">
            <span className="pill on">Tipo: Certificato <DS_Icon name="x" size={9}/></span>
            <span className="pill">Città: Milano</span>
            <a className="link" href="#">Vedi tutti i corsi</a>
            <span className="kbd">⌘K</span>
          </DSDemo>
          <DSDemo label="Progress">
            <div style={{ flex: 1 }}>
              <div className="bar"><i style={{ width: "78%" }}></i></div>
              <div className="text-3" style={{ fontSize: 11, marginTop: 6 }}>78% · indigo (default)</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="bar success"><i style={{ width: "92%" }}></i></div>
              <div className="text-3" style={{ fontSize: 11, marginTop: 6 }}>92% · success</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="bar warning"><i style={{ width: "40%" }}></i></div>
              <div className="text-3" style={{ fontSize: 11, marginTop: 6 }}>40% · warning</div>
            </div>
          </DSDemo>
        </DSGrid>
      </DSSection>

      <DSSection id="icons" title="Iconografia" desc="Set ridotto stroke 1.5 a 16px. Solo icone effettivamente usate.">
        <div className="card card-pad-lg" style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 16 }}>
          {["home","book","users","user","graduation","calendar","archive","exam","settings","pin","mail","phone","whatsapp","share","download","plus","check","x","refresh","external","edit","trash","more","sparkle","globe","tag","warn","trending","filter","grid","list","timeline","bell","lightning","play","stop","pause","monitor","smartphone","tablet"].map(n => (
            <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 8, borderRadius: 6, transition: "background var(--dur-fast)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <DS_Icon name={n} size={18} className="text-2"/>
              <div className="mono" style={{ fontSize: 9.5, color: "var(--text-4)" }}>{n}</div>
            </div>
          ))}
        </div>
      </DSSection>
    </div>
  );
}

// ============ helpers ============
function DSSection({ id, title, desc, children }) {
  return (
    <section id={id} style={{ marginBottom: 56, scrollMarginTop: 80 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 className="h1" style={{ fontSize: 24, marginBottom: 6 }}>{title}</h2>
        {desc && <p className="text-3" style={{ margin: 0, maxWidth: 700, fontSize: 14 }}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function DSGrid({ cols = 2, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>{children}</div>;
}

function DSDemo({ label, children, stack }) {
  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 14 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: stack ? "column" : "row", gap: 10, alignItems: stack ? "stretch" : "center", flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function PaletteGroup({ label, swatches }) {
  return (
    <div className="card card-pad" style={{ marginBottom: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${swatches.length}, 1fr)`, gap: 8 }}>
        {swatches.map(([name, varName, hex]) => (
          <div key={name}>
            <div style={{ background: varName, height: 56, borderRadius: 6, border: "1px solid var(--border-2)" }}></div>
            <div style={{ fontSize: 11.5, marginTop: 6, fontWeight: 500 }}>{name}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{hex}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeRow({ label, sample }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, alignItems: "baseline", paddingBottom: 16, borderBottom: "1px solid var(--border-2)" }}>
      <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</div>
      <div>{sample}</div>
    </div>
  );
}

window.V2_PageDesignSystem = V2_PageDesignSystem;
