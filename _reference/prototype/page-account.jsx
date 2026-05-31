// V2 Account — profilo utente (nome, contatti, posizione, foto, password) + sessione
const { Icon: AC_Icon, Avatar: AC_Avatar, Badge: AC_Badge, PageHeader: AC_PageHeader } = window.V2;

function V2_PageAccount() {
  const userId = SSA.getCurrentUserId();
  return <AccountInner key={userId} userId={userId} />;
}

function AccountInner({ userId }) {
  const u = SSA.getProfile(userId);
  const [first, setFirst] = useState(u.first || "");
  const [last, setLast] = useState(u.last || "");
  const [email, setEmail] = useState(u.email || "");
  const [phone, setPhone] = useState(u.phone || "");
  const [position, setPosition] = useState(u.position || "");
  const [city, setCity] = useState(u.city || "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const onPhoto = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { SSA.setProfile(userId, { photo: r.result }); flash("Foto aggiornata"); };
    r.readAsDataURL(f);
  };
  const save = () => {
    SSA.setProfile(userId, { first, last, name: `${first} ${last}`.trim(), email, phone, position, city });
    flash("Profilo salvato");
  };
  const savePw = () => {
    if (!pw || pw !== pw2) { flash("Le password non coincidono"); return; }
    setPw(""); setPw2(""); flash("Password aggiornata");
  };

  const Field = ({ label, value, onChange, type, placeholder, mono }) => (
    <div className="field">
      <div className="field-label">{label}</div>
      <input className={`input ${mono ? "mono" : ""}`} type={type || "text"} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={{ width: "100%" }}/>
    </div>
  );

  return (
    <div className="page">
      <AC_PageHeader eyebrow="Account" title="Il tuo profilo" sub="Dati personali, contatti e accesso. Visibili solo a te e all'amministrazione SSA."/>

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--navy)", color: "white", padding: "10px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, boxShadow: "var(--sh-3)", zIndex: 100, display: "flex", alignItems: "center", gap: 8 }}>
          <AC_Icon name="check" size={13}/>{toast}
        </div>
      )}

      <section className="card card-pad" style={{ marginBottom: 24, display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: 150 }}>
          {u.photo
            ? <img src={u.photo} alt={u.name} style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }}/>
            : <AC_Avatar name={u.name} initials={u.initials} tone={u.tone} size="xl"/>}
          <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }}/>
          <button className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()}><AC_Icon name="download" size={12}/>Cambia foto</button>
          <AC_Badge tone={u.roleKey === "admin" ? "indigo" : "neutral"} dot>{u.roleKey === "admin" ? "Amministratore" : "Manager"}</AC_Badge>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Nome" value={first} onChange={setFirst}/>
            <Field label="Cognome" value={last} onChange={setLast}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Email" value={email} onChange={setEmail} type="email" mono/>
            <Field label="Telefono" value={phone} onChange={setPhone} mono/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Posizione" value={position} onChange={setPosition} placeholder="Es. Responsabile SSA Italiana"/>
            <div className="field">
              <div className="field-label">Città</div>
              <select className="select" value={city} onChange={e => setCity(e.target.value)}>
                {SSA.CITIES.filter(c => c !== "Online").map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-primary" onClick={save}><AC_Icon name="check" size={13}/>Salva modifiche</button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><AC_Icon name="lock" size={12}/>Sicurezza</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Nuova password" value={pw} onChange={setPw} type="password" placeholder="••••••••"/>
            <Field label="Conferma password" value={pw2} onChange={setPw2} type="password" placeholder="••••••••"/>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn" onClick={savePw}><AC_Icon name="check" size={12}/>Aggiorna password</button>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><AC_Icon name="user" size={12}/>Sessione</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.5 }}>Profili attivi sulla piattaforma. Cambia profilo per vedere i permessi corrispondenti.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SSA.USERS.map(uu => {
              const on = uu.id === userId;
              return (
                <button key={uu.id} onClick={() => SSA.setCurrentUserId(uu.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${on ? "var(--indigo)" : "var(--border-2)"}`, background: on ? "var(--indigo-50)" : "var(--surface)", borderRadius: 9, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <AC_Avatar name={uu.name} initials={uu.initials} tone={uu.tone} size="md"/>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{uu.name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text-3)" }}>{uu.role}</span>
                  </span>
                  {on ? <AC_Badge tone="indigo" dot>attivo</AC_Badge> : <span className="link" style={{ fontSize: 12 }}>Accedi</span>}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

window.V2_PageAccount = V2_PageAccount;
