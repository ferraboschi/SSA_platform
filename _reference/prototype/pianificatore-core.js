// SSA v2 — Pianificatore: shared core (plain JS, load before babel pages)
// Espone window.PL con costanti + helper puri per la pianificazione a 12 mesi mobili.
(function () {
  const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const MONTHS_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

  // "Oggi" coerente col resto dell'app (dashboard / dettaglio corso)
  const TODAY = new Date(2026, 4, 25);

  // Palette per tipo corso (5 tinte distinte e armoniche: 3 brand + 2 derivate)
  const TYPE_COLORS = {
    certificato:  { solid: "var(--azzurro)", soft: "var(--azzurro-bg)", ink: "var(--azzurro)" },
    introduttivo: { solid: "var(--oro)",     soft: "var(--oro-bg)",     ink: "#8A6E1A" },
    masterclass:  { solid: "var(--indigo)",  soft: "var(--indigo-50)",  ink: "var(--indigo-600)" },
    shochu:       { solid: "#2A9D8F",        soft: "#E2F3F0",           ink: "#1E7268" },
    mixology:     { solid: "#B5559B",        soft: "#F7E9F3",           ink: "#8E3F77" }
  };

  // Capienza / durata di default per i corsi pianificati (non ancora su Shopify)
  const DEFAULT_CAP  = { certificato: 20, introduttivo: 20, masterclass: 16, shochu: 18, mixology: 14 };
  const DEFAULT_DAYS = { certificato: 3,  introduttivo: 1,  masterclass: 1,  shochu: 2,  mixology: 1 };

  // Calendario delle sessioni per tipo + modalità di erogazione.
  // In presenza: giornate consecutive. Online: appuntamenti settimanali (1/N, 2/N, ...).
  const PRESENZA_DAYS   = { certificato: 3, introduttivo: 1, masterclass: 1, shochu: 2, mixology: 1 };
  const ONLINE_SESSIONS = { certificato: 9, introduttivo: 3, masterclass: 2, shochu: 4, mixology: 2 };
  const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

  // Città "principali" escluse dal conteggio copertura (KPI città diverse)
  const HUB_CITIES = ["Milano", "Roma"];
  // Città non fisiche da escludere dalla copertura geografica
  const NON_CITIES = ["Online"];

  const monthIdx = (name) => MONTHS.indexOf(name);
  const keyOf = (year, mIdx) => year + "-" + mIdx;

  // 12 mesi mobili a partire dal mese corrente
  function buildWindow() {
    const out = [];
    let y = TODAY.getFullYear();
    let m = TODAY.getMonth();
    for (let i = 0; i < 12; i++) {
      out.push({ key: keyOf(y, m), year: y, mIdx: m, name: MONTHS[m], short: MONTHS_SHORT[m], isCurrent: i === 0 });
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }

  // Normalizza un corso reale (Shopify) in un item del pianificatore
  function normalizeReal(c) {
    const mIdx = monthIdx(c.month);
    const mode = c.mode || (c.city === "Online" ? "online" : "presenza");
    const n = c.days || 1;
    const step = mode === "online" ? 7 : 1;
    const base = new Date(c.year, mIdx, c.day || 1);
    const dates = [];
    for (let i = 0; i < n; i++) { const d = new Date(base); d.setDate(base.getDate() + step * i); dates.push(ymd(d)); }
    return {
      id: c.id, kind: "real",
      type: c.type, typeLabel: c.typeLabel, typeShort: c.typeShort,
      city: c.city, educator: c.educator || null, educatorId: c.educator ? c.educator.id : null,
      mode, dates, sessions: dates.map((d, i) => ({ n: i + 1, total: n, date: d })),
      year: c.year, mIdx, day: c.day || 1, days: n,
      enrolled: c.enrolled, capacity: c.capacity,
      status: c.status, lifecycle: c.lifecycle, note: "",
      shortTitle: c.shortTitle
    };
  }

  // Normalizza un corso pianificato (in-app) in un item del pianificatore
  function normalizePlanned(p) {
    const t = (window.SSA && window.SSA.COURSE_TYPES[p.type]) || {};
    const edu = p.educatorId && window.SSA ? window.SSA.EDUCATORS.find(e => e.id === p.educatorId) : null;
    const mode = p.mode || "presenza";
    let dates = (p.dates && p.dates.length) ? p.dates.slice() : [];
    if (!dates.length && (p.mIdx !== null && p.mIdx !== undefined)) {
      dates = genDates(ymd(new Date(p.year || TODAY.getFullYear(), p.mIdx, p.day || 14)), p.type, mode);
    }
    const placed = dates.length > 0;
    const first = placed ? parseYmd(dates[0]) : null;
    return {
      id: p.id, kind: "planned",
      type: p.type, typeLabel: t.label || p.type, typeShort: t.short || p.type.toUpperCase().slice(0, 5),
      city: p.city || null, educator: edu, educatorId: p.educatorId || null,
      mode, dates, sessions: dates.map((d, i) => ({ n: i + 1, total: dates.length, date: d })),
      year: first ? first.getFullYear() : null, mIdx: first ? first.getMonth() : null, day: first ? first.getDate() : null,
      days: dates.length, enrolled: 0, capacity: p.capacity || DEFAULT_CAP[p.type] || 16,
      note: p.note || "",
      status: "pianificato", lifecycle: "pianificato", shortTitle: t.label || p.type, placed
    };
  }

  function shopifyUrl(query) {
    const base = "https://admin.shopify.com/store/sakesommelierassociation/products";
    return query ? base + "?query=" + encodeURIComponent(query) : base;
  }

  // settimana del mese (0..4) da un giorno 1..31
  const weekOfMonth = (day) => Math.min(4, Math.floor(((day || 1) - 1) / 7));

  // ---- Date / sessioni ----
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  const parseYmd = (s) => { const p = (s || "").split("-").map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const sessionCount = (type, mode) => mode === "online" ? (ONLINE_SESSIONS[type] || 1) : (PRESENZA_DAYS[type] || 1);

  // Genera le date delle sessioni a partire da una data di inizio (ISO yyyy-mm-dd)
  function genDates(startYmd, type, mode) {
    const n = sessionCount(type, mode);
    const step = mode === "online" ? 7 : 1; // online: settimanale · presenza: consecutivo
    const base = parseYmd(startYmd);
    const out = [];
    for (let i = 0; i < n; i++) { const d = new Date(base); d.setDate(base.getDate() + step * i); out.push(ymd(d)); }
    return out;
  }

  const fmtDay = (s) => { const d = parseYmd(s); return d.getDate() + " " + MONTHS_SHORT[d.getMonth()]; };          // "12 Set"
  const fmtDayFull = (s) => { const d = parseYmd(s); return WEEKDAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS_SHORT[d.getMonth()]; }; // "Ven 12 Set"

  // Riassunto compatto delle date di un corso
  function dateSummary(item) {
    const ds = item.dates || [];
    if (!ds.length) return "";
    if (ds.length === 1) return fmtDay(ds[0]);
    if (item.mode === "online") return ds.length + " appuntamenti · dal " + fmtDay(ds[0]);
    const a = parseYmd(ds[0]), b = parseYmd(ds[ds.length - 1]);
    if (a.getMonth() === b.getMonth()) return a.getDate() + "\u2013" + b.getDate() + " " + MONTHS_SHORT[a.getMonth()];
    return fmtDay(ds[0]) + " \u2013 " + fmtDay(ds[ds.length - 1]);
  }

  let _seq = 100;
  const nextId = () => "pl-" + (++_seq) + "-" + Math.random().toString(36).slice(2, 6);

  window.PL = {
    MONTHS, MONTHS_SHORT, WEEKDAYS, TODAY, TYPE_COLORS, DEFAULT_CAP, DEFAULT_DAYS,
    PRESENZA_DAYS, ONLINE_SESSIONS, HUB_CITIES, NON_CITIES,
    monthIdx, keyOf, buildWindow, normalizeReal, normalizePlanned,
    shopifyUrl, weekOfMonth, nextId,
    ymd, parseYmd, sessionCount, genDates, fmtDay, fmtDayFull, dateSummary
  };
})();
