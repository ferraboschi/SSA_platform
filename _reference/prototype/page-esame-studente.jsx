// V2 Esame studente — anteprima vista mobile/tablet/desktop
const { Icon: ST_Icon, PageHeader: ST_PageHeader } = window.V2;

function V2_PageEsameStudente({ id }) {
  const course = SSA.COURSES.find(c => c.id === id);
  if (!course || !course.exam) return <div className="page">Esame non trovato</div>;
  const [device, setDevice] = useState("mobile");
  const [qIdx, setQIdx] = useState(0);
  const [lang, setLang] = useState("it");
  const questions = course.exam.questions.slice(0, 8);
  const q = questions[qIdx];

  const trans = {
    it: q.text,
    en: q.text,
    ja: "日本酒についての質問:"
  };

  return (
    <div className="page">
      <button className="btn btn-sm btn-ghost" style={{ marginBottom: 14 }} onClick={() => { if (window.history.length > 1) window.history.back(); else location.hash = `#/esami/${course.id}`; }}><ST_Icon name="arrow-l" size={12}/>Indietro</button>
      <ST_PageHeader eyebrow="Anteprima" title="Vista studente" sub="Così vede lo studente l'esame sul proprio device. UI responsive accessibile da smartphone, tablet o laptop senza app."/>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <div className="segmented">
          {[["mobile","Mobile","smartphone"],["tablet","Tablet","tablet"],["desktop","Laptop","monitor"]].map(([k,l,ic]) => (
            <button key={k} className={device === k ? "on" : ""} onClick={() => setDevice(k)}><ST_Icon name={ic} size={11}/>{l}</button>
          ))}
        </div>
        <div className="segmented">
          {["it","en","ja"].map(l => (
            <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn btn-icon btn-sm" onClick={() => setQIdx(Math.max(0, qIdx - 1))}><ST_Icon name="arrow-l" size={12}/></button>
          <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>Domanda {qIdx + 1} di {questions.length}</span>
          <button className="btn btn-icon btn-sm" onClick={() => setQIdx(Math.min(questions.length - 1, qIdx + 1))}><ST_Icon name="arrow" size={12}/></button>
        </div>
      </div>

      <div style={{ background: "linear-gradient(135deg, var(--indigo-50), var(--bg))", padding: device === "mobile" ? "40px" : "32px", borderRadius: 12, display: "flex", justifyContent: "center", border: "1px solid var(--border)" }}>
        <DeviceFrame device={device}>
          <StudentScreen course={course} q={q} qIdx={qIdx} total={questions.length} lang={lang} trans={trans}/>
        </DeviceFrame>
      </div>
    </div>
  );
}

function DeviceFrame({ device, children }) {
  if (device === "mobile") {
    return (
      <div style={{ width: 380, height: 760, borderRadius: 42, background: "var(--navy)", padding: 12, boxShadow: "var(--sh-4)", position: "relative" }}>
        <div style={{ width: 100, height: 22, background: "var(--navy)", borderRadius: "0 0 16px 16px", position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}></div>
        <div style={{ width: "100%", height: "100%", background: "var(--surface)", borderRadius: 32, overflow: "hidden" }}>{children}</div>
      </div>
    );
  }
  if (device === "tablet") {
    return (
      <div style={{ width: 720, height: 540, borderRadius: 22, background: "var(--navy)", padding: 14, boxShadow: "var(--sh-4)" }}>
        <div style={{ width: "100%", height: "100%", background: "var(--surface)", borderRadius: 12, overflow: "hidden" }}>{children}</div>
      </div>
    );
  }
  return (
    <div style={{ width: 940, height: 560, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--sh-4)" }}>
      <div style={{ height: 32, background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }}></span>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }}></span>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }}></span>
        <span className="mono" style={{ marginLeft: 16, fontSize: 11, color: "var(--text-4)" }}>esami.sakesommelierassociation.it</span>
      </div>
      <div style={{ height: "calc(100% - 32px)", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function StudentScreen({ course, q, qIdx, total, lang, trans }) {
  const [selected, setSelected] = useState([]);
  const minutes = 42;
  const pct = ((qIdx + 1) / total) * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-2)" }}>SSA · {course.month} {course.year}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="s-dot success pulse"></span>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600 }}>{String(minutes).padStart(2,"0")}:00</span>
        </div>
      </div>

      <div style={{ padding: "10px 20px 14px" }}>
        <div className="bar"><i style={{ width: pct + "%", background: "var(--indigo)" }}></i></div>
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--text-4)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", fontWeight: 600 }}>
          <span>Domanda {qIdx + 1} / {total}</span><span>{Math.round(pct)}%</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: "12px 20px", overflow: "auto" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{q.cat.toUpperCase()} · {q.points} {lang === "ja" ? "点" : "punti"}</div>
        <h2 style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3, margin: 0, marginBottom: 22, letterSpacing: "-0.005em" }}>
          {lang === "ja" ? trans.ja : trans.it}
        </h2>

        {q.type === "image" && <div className="ph-img" style={{ height: 150, marginBottom: 16, borderRadius: 6 }}>etichetta sake</div>}

        {(q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(q.options || ["Vero","Falso"]).map((opt, i) => {
              const isSel = selected.includes(i);
              return (
                <button key={i} onClick={() => {
                  if (q.type === "multi") setSelected(isSel ? selected.filter(x => x !== i) : [...selected, i]);
                  else setSelected(isSel ? [] : [i]);
                }} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
                  textAlign: "left", border: "1.5px solid " + (isSel ? "var(--indigo)" : "var(--border)"),
                  borderRadius: 8, background: isSel ? "var(--indigo-50)" : "var(--surface)",
                  fontSize: 14, fontWeight: 500, transition: "all var(--dur-fast)"
                }}>
                  <span style={{ width: 20, height: 20, borderRadius: q.type === "multi" ? 4 : "50%", border: "1.5px solid " + (isSel ? "var(--indigo)" : "var(--border-strong)"), background: isSel ? "var(--indigo)" : "transparent", color: "white", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {isSel && <ST_Icon name={q.type === "multi" ? "check" : "dot"} size={11}/>}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {q.type === "open" && (
          <textarea placeholder={lang === "ja" ? "ここに回答を書いてください..." : lang === "en" ? "Write your answer here..." : "Scrivi qui la tua risposta..."} style={{ width: "100%", padding: 12, fontSize: 14, border: "1.5px solid var(--border)", borderRadius: 8, minHeight: 140, fontFamily: "var(--font-sans)", lineHeight: 1.5, resize: "vertical" }}/>
        )}

        {q.type === "fill" && <input className="input" placeholder="___" style={{ width: "100%", fontSize: 15, height: 42 }}/>}

        {q.type === "match" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(q.pairs || []).map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
                <div style={{ padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontWeight: 500 }}>{p.l}</div>
                <ST_Icon name="arrow" size={14}/>
                <select className="select"><option value="">scegli…</option>{(q.pairs || []).map((pp,j) => <option key={j}>{pp.r}</option>)}</select>
              </div>
            ))}
          </div>
        )}

        {q.type === "order" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.items || []).map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1.5px solid var(--border)", borderRadius: 8 }}>
                <span style={{ width: 22, height: 22, display: "grid", placeItems: "center", background: "var(--surface-2)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>{i+1}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{it}</span>
                <ST_Icon name="more" size={13}/>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)" }}>
        <button className="btn btn-sm">← {lang === "ja" ? "前へ" : lang === "en" ? "Back" : "Indietro"}</button>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>{qIdx + 1} / {total}</span>
        <button className="btn btn-sm btn-primary">{lang === "ja" ? "次へ" : lang === "en" ? "Next" : "Avanti"} →</button>
      </div>
    </div>
  );
}

window.V2_PageEsameStudente = V2_PageEsameStudente;
