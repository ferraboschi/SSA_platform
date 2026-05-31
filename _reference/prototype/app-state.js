// SSA v2 — App state (plain JS, load AFTER data.js, BEFORE babel pages)
// Augmenta window.SSA con: utente loggato, abilitazioni educator, soglie dashboard,
// notifiche (educator non abilitato). Persistenza in localStorage; eventi "ssa-state".
(function () {
  const SSA = window.SSA;
  if (!SSA) return;

  const ls = {
    get(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  };
  const emit = () => { try { window.dispatchEvent(new CustomEvent("ssa-state")); } catch (e) {} };

  // ============ Utenti / login (al momento 2 profili) ============
  const USERS = [
    { id: "lorenzo", first: "Lorenzo", last: "Ferraboschi", name: "Lorenzo Ferraboschi", role: "Fondatore · Admin SSA", roleKey: "admin", email: "lorenzo@sakesommelier.it", phone: "+39 348 220 1180", city: "Milano", position: "Founder & Senior Educator", initials: "LF", tone: "navy" },
    { id: "camilla", first: "Camilla", last: "Bonnannini", name: "Camilla Bonnannini", role: "Resp. SSA Italiana", roleKey: "manager", email: "camilla@sakesommelier.it", phone: "+39 333 905 4471", city: "Roma", position: "Responsabile SSA Italiana", initials: "CB", tone: "oro" }
  ];
  const getCurrentUserId = () => ls.get("ssa_user", "lorenzo");
  const setCurrentUserId = (id) => { ls.set("ssa_user", id); emit(); };
  const getProfile = (id) => { const base = USERS.find(u => u.id === id) || USERS[0]; return { ...base, ...ls.get("ssa_profile_" + id, {}) }; };
  const setProfile = (id, patch) => { ls.set("ssa_profile_" + id, { ...ls.get("ssa_profile_" + id, {}), ...patch }); emit(); };
  const getCurrentUser = () => getProfile(getCurrentUserId());

  // ============ Abilitazioni educator (tipologie di corso assegnabili) ============
  const ALL_TYPES = Object.keys(SSA.COURSE_TYPES);
  // Etichette brevi per liste compatte (sidebar, badge)
  const SHORT_LABEL = { certificato: "Cert.", introduttivo: "Intro.", shochu: "Shochu", masterclass: "Master.", mixology: "Mix." };
  const shortLabel = (type) => SHORT_LABEL[type] || (SSA.COURSE_TYPES[type] && SSA.COURSE_TYPES[type].label) || type;
  // Default sensati: chi ha già insegnato un tipo è abilitato; founder abilitato a tutto.
  const DEFAULT_QUALS = {
    e1: ["certificato", "introduttivo", "masterclass", "shochu", "mixology"], // Lorenzo (founder)
    e2: ["certificato", "introduttivo", "masterclass"],                        // Camilla — NON shochu
    e3: ["introduttivo", "masterclass"],
    e4: ["introduttivo", "certificato", "shochu"],
    e5: ["introduttivo"],
    e6: ["introduttivo", "mixology"],
    e7: ["introduttivo", "certificato"],
    e8: ["introduttivo"],
    e9: ["introduttivo"],
    e10: ["introduttivo"]
  };
  const getQuals = (id) => { const ov = ls.get("ssa_quals", {}); return ov[id] || DEFAULT_QUALS[id] || ["introduttivo"]; };
  const setQuals = (id, arr) => { const ov = ls.get("ssa_quals", {}); ov[id] = arr; ls.set("ssa_quals", ov); emit(); };
  const isQualified = (eduId, type) => getQuals(eduId).includes(type);
  // Educator abilitati per un tipo di corso (per la lista assegnabile nel pianificatore)
  const educatorsForType = (type) => SSA.EDUCATORS.filter(e => isQualified(e.id, type));

  // ============ Soglie operative (dashboard) ============
  const DEFAULT_THRESHOLDS = { shipDays: 5, bookMin: 30, sakeExamPct: 70 };
  const getDashThresholds = () => ({ ...DEFAULT_THRESHOLDS, ...ls.get("ssa_dash_thresholds", {}) });
  const setDashThresholds = (patch) => { ls.set("ssa_dash_thresholds", { ...getDashThresholds(), ...patch }); emit(); };

  // ============ Notifiche ============
  // Corsi (Shopify) con educator NON abilitato al tipo → alert campanella + (futura) mail Resend.
  function computeNotifications() {
    const out = [];
    SSA.COURSES
      .filter(c => c.lifecycle === "pubblicato" || c.lifecycle === "bozza")
      .forEach(c => {
        if (c.educator && !isQualified(c.educator.id, c.type)) {
          out.push({
            id: "qual-" + c.id,
            kind: "educator-mismatch",
            tone: "danger",
            icon: "warn",
            title: "Educator non abilitato",
            body: `${c.educator.name} è assegnato a “${c.shortTitle}” (${c.typeLabel}) ma non è abilitato a questa tipologia.`,
            meta: `${c.city} · ${c.month} ${c.year} · da Shopify`,
            email: c.educator.email,
            href: `#/corsi/${c.id}`,
            courseId: c.id
          });
        }
      });
    return out;
  }

  Object.assign(SSA, {
    USERS, getCurrentUserId, setCurrentUserId, getProfile, setProfile, getCurrentUser,
    ALL_TYPES, DEFAULT_QUALS, getQuals, setQuals, isQualified, educatorsForType, shortLabel, SHORT_LABEL,
    getDashThresholds, setDashThresholds, computeNotifications
  });
})();
