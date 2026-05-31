// SSA mock data — realistic shapes mirroring production payload

(function(){
  const EDUCATORS = [
    { id: "e1", name: "Lorenzo Ferraboschi", role: "Founder & Senior Educator", city: "Milano", initials: "LF",  bio: "Sake Educator certificato WSET Level 3 e SSI. Fondatore della SSA.", years: 11, lang: ["IT","EN"] },
    { id: "e2", name: "Camilla Bonnannini",  role: "Senior Educator",         city: "Roma",    initials: "CB",  bio: "Sommelier AIS e Sake Sommelier dal 2019.", years: 6, lang: ["IT","EN","FR"] },
    { id: "e3", name: "Melissa Corazza",     role: "Educator",                 city: "Firenze", initials: "MC", bio: "Specialista in food pairing e cucina giapponese.", years: 4, lang: ["IT","EN"] },
    { id: "e4", name: "Stefano Battini",     role: "Educator",                 city: "Piacenza",initials: "SB", bio: "Esperto in fermentazioni e koji.", years: 5, lang: ["IT","EN"] },
    { id: "e5", name: "Gabriele Merlo",      role: "Educator Online",          city: "Online",  initials: "GM", bio: "Conduce i corsi in remoto, format ridotto.", years: 3, lang: ["IT","EN"] },
    { id: "e6", name: "Luca Eula",           role: "Educator",                 city: "Torino",  initials: "LE", bio: "Bartender e cocktail-with-sake.", years: 4, lang: ["IT","EN"] },
    { id: "e7", name: "Brunella Bettati",    role: "Educator",                 city: "Vercelli",initials: "BB", bio: "Riso, terroir, tradizione.", years: 7, lang: ["IT"] },
    { id: "e8", name: "Alessandro Izzo",     role: "Educator",                 city: "Pescara", initials: "AI", bio: "Si occupa di mid e South Italy.", years: 3, lang: ["IT","EN"] },
    { id: "e9", name: "Jacopo Tiezzi",       role: "Educator",                 city: "Udine",   initials: "JT", bio: "Nord-est, formati intensivi.", years: 2, lang: ["IT"] },
    { id: "e10",name: "Sebastiano Gambacorta",role: "Educator",                city: "Bari",    initials: "SG", bio: "Sud, focus introduttivi.", years: 2, lang: ["IT","EN"] }
  ];

  const CITIES = ["Milano","Roma","Firenze","Torino","Piacenza","Vercelli","Bari","Pescara","Udine","Genova","Bolzano","Napoli","Verona","Online"];

  const FIRST = ["Marco","Giulia","Andrea","Sofia","Luca","Chiara","Matteo","Francesca","Davide","Elena","Tommaso","Alessia","Federico","Martina","Stefano","Beatrice","Riccardo","Giorgia","Edoardo","Valentina","Pietro","Caterina","Lorenzo","Anna","Filippo","Eleonora","Simone","Camilla","Niccolò","Greta"];
  const LAST = ["Rossi","Bianchi","Esposito","Romano","Colombo","Ricci","Marino","Greco","Bruno","Gallo","Conti","De Luca","Costa","Giordano","Mancini","Rizzo","Lombardi","Moretti","Barbieri","Fontana","Caruso","Mariani","Ferrari","Galli","Martini","Leone","Longo","Santoro","Sala","Vitale"];

  const seed = (k) => {
    let x = 0; for (let i=0;i<k.length;i++) x = (x*31 + k.charCodeAt(i)) | 0; return Math.abs(x);
  };
  const pick = (arr, k) => arr[seed(k) % arr.length];

  function makeStudents(courseHandle, n, registered = -1) {
    const out = [];
    const reg = registered === -1 ? n : registered;
    for (let i = 0; i < reg; i++) {
      const f = pick(FIRST, courseHandle + "f" + i);
      const l = pick(LAST, courseHandle + "l" + i);
      const codes = ["", "", "", "KITSUNE100", "EARLY50", "FRIENDS20"];
      const code = pick(codes, courseHandle + "c" + i);
      const gross = pick([490, 590, 150, 280, 380], courseHandle + "g" + i);
      const disc = code ? (code === "KITSUNE100" ? 100 : code === "EARLY50" ? 50 : 20) : 0;
      const wa = (seed(courseHandle + "w" + i) % 100) > 18;
      const mism = (seed(courseHandle + "m" + i) % 100) > 92;
      out.push({
        name: `${f} ${l}`,
        email: `${f.toLowerCase()}.${l.toLowerCase().replace(/\s/g, '')}@${pick(["gmail.com","libero.it","outlook.com","hotmail.it","fastwebnet.it","icloud.com"], f+l)}`,
        phone: `+39 3${(seed(f+l) % 10)}${(seed(l+f) % 100).toString().padStart(2,'0')} ${(seed(f) % 1000).toString().padStart(3,'0')}${(seed(l) % 1000).toString().padStart(3,'0')}`,
        orderNumber: `SSA${3200 + seed(courseHandle + i) % 800}`,
        amount: gross - disc,
        grossAmount: gross,
        discountCode: code || null,
        hasWhatsApp: wa,
        nameMismatch: mism,
        registrationName: mism ? `${f} ${pick(LAST, "mm"+i)}` : null,
        orderDate: new Date(Date.now() - (seed(courseHandle + i) % 60) * 86400000).toISOString()
      });
    }
    return out;
  }

  // Sake list for programma
  const SAKE_TYPES = ["Junmai Daiginjo","Junmai Ginjo","Junmai","Honjozo","Daiginjo","Nigori","Sparkling","Aged","Kimoto","Yamahai"];
  const SAKE_SAKAGURA = ["Asahi Shuzo","Dassai","Tatenokawa","Born Brewery","Hakkaisan","Tedorigawa","Kikusui","Suehiro","Tengumai","Kamoizumi"];
  const SAKE_NAMES = ["Niwa no Uguisu","Ginga Shizuku","Yuki no Bosha","Hakutsuru Sayuri","Born Gold","Hakkaisan Tokubetsu","Tedorigawa Yamahai","Kikusui Funaguchi","Tengumai Yamahai","Kamoizumi Shusen"];

  function makeProgram(courseHandle, days = 2) {
    const out = [];
    for (let d = 1; d <= days; d++) {
      const sections = ["Assaggi", "Pairing", "Approfondimento"];
      for (const sec of sections.slice(0, 1 + (d % 2))) {
        const sakes = [];
        const n = 3 + (seed(courseHandle + d + sec) % 3);
        for (let i = 0; i < n; i++) {
          const k = seed(courseHandle + d + sec + i);
          sakes.push({
            code: `SAK${(k % 999).toString().padStart(3,'0')}`,
            name: SAKE_NAMES[k % SAKE_NAMES.length],
            type: SAKE_TYPES[k % SAKE_TYPES.length],
            sakagura: SAKE_SAKAGURA[k % SAKE_SAKAGURA.length],
            size: pick([300, 720, 1800], courseHandle + d + i),
            cost: 25 + (k % 70),
            qty: 1 + (k % 3)
          });
        }
        out.push({ day: d, name: sec, sakes });
      }
    }
    return out;
  }

  const COURSE_TYPES = {
    certificato: { label: "Certificato", short: "CERT", color: "azzurro", minStud: 6, price: 590 },
    introduttivo: { label: "Introduttivo", short: "INTRO", color: "oro", minStud: 6, price: 150 },
    masterclass: { label: "Masterclass", short: "MASTER", color: "neutral", minStud: 4, price: 280 },
    shochu: { label: "Shochu", short: "SHOCHU", color: "azzurro", minStud: 6, price: 380 },
    mixology: { label: "Mixology", short: "MIX", color: "oro", minStud: 5, price: 260 }
  };

  const STATUSES = ["in-traiettoria","monitor","rischio","critico"];
  const STATUS_META = {
    "in-traiettoria": { label: "In traiettoria", tone: "good" },
    "monitor":        { label: "Da monitorare",  tone: "neutral" },
    "rischio":        { label: "A rischio",      tone: "warn" },
    "critico":        { label: "Critico",        tone: "bad" }
  };

  function buildCourse({ id, type, city, month, year, day, days, educatorId, capacity, enrolled, status, mode, examResults, lifecycle, costsOverride }) {
    const t = COURSE_TYPES[type];
    const handle = `corso-${type}-${city.toLowerCase()}-${month.toLowerCase()}-${year}-${id}`;
    const educator = EDUCATORS.find(e => e.id === educatorId);
    const minStud = t.minStud;
    const price = t.price;
    const revenue = enrolled * (price * 0.85); // some discounts
    const costsBase = { educator: 600, gestione: 900, diplomi: 460, libri: 36, location: city === "Milano" ? 0 : 250, food: type === "certificato" ? 0 : 80, adv: 0 };
    const costs = costsOverride || costsBase;
    const totalCost = Object.values(costs).reduce((s, n) => s + n, 0);
    const margin = revenue - totalCost;
    return {
      id, handle, type, typeLabel: t.label, typeShort: t.short, typeColor: t.color,
      title: `Corso ${t.label === "Certificato" ? "di Sake Sommelier Certificato" : "Introduttivo al Sake"} — ${month} ${year}, ${city}`,
      shortTitle: type === "certificato" ? "Sake Sommelier Certificato" : (type === "introduttivo" ? "Introduttivo al Sake" : t.label),
      city, mode: mode || (city === "Online" ? "online" : "presenza"),
      month, year, day, days: days || (type === "certificato" ? 3 : 1),
      educator,
      capacity, enrolled,
      minStudents: minStud, price,
      revenue: Math.round(revenue),
      costs,
      totalCost,
      margin: Math.round(margin),
      status, statusLabel: STATUS_META[status]?.label, statusTone: STATUS_META[status]?.tone,
      lifecycle: lifecycle || "pubblicato", // pubblicato | bozza | archiviato | passato
      students: makeStudents(handle, capacity, enrolled),
      program: makeProgram(handle, days || (type === "certificato" ? 3 : 1)),
      whatsappLink: `https://chat.whatsapp.com/SSAGroup${id}`,
      shareLink: `https://corsi.sakesommelierassociation.it/share/${id}abc123`,
      notebook: {
        adminNotes: id === "c01" ? [
          { id: "n1", text: "Lorenzo conferma la sede di Via Tortona. 18 confermati su 20.", author: "admin", at: "2026-05-20T10:15:00Z" },
          { id: "n2", text: "Diplomi pronti, ritiro lunedì.", author: "admin", at: "2026-05-23T08:00:00Z" }
        ] : id === "c03" ? [
          { id: "n3", text: "Pescara sotto la mediana storica. Lanciare pubblicità Facebook.", author: "admin", at: "2026-05-15T18:00:00Z" }
        ] : [],
        plannedAction: id === "c03" ? "Campagna ADV" : null,
        tags: id === "c01" ? ["sede-confermata","catering-ok"] : (id === "c03" ? ["bassa-iscrizione"] : []),
        reasoning: status === "in-traiettoria"
          ? "Velocità iscrizioni in linea con la mediana storica (4 corsi simili). Margine positivo previsto."
          : status === "rischio"
          ? "Velocità sotto la mediana del segmento (-43%). 4 corsi simili negli ultimi 18 mesi sono stati chiusi sotto la soglia minima."
          : status === "monitor"
          ? "Dati storici limitati per questo segmento. Attualmente in soglia, monitorare nelle prossime 2 settimane."
          : "Dati insufficienti per una valutazione affidabile."
      },
      examResults: examResults || null
    };
  }

  // Active courses (futuri, prossimi mesi)
  const COURSES = [
    buildCourse({ id: "c01", type: "certificato", city: "Milano", month: "Maggio", year: 2026, day: 11, days: 3, educatorId: "e1", capacity: 20, enrolled: 18, status: "in-traiettoria" }),
    buildCourse({ id: "c02", type: "introduttivo", city: "Firenze", month: "Maggio", year: 2026, day: 18, educatorId: "e3", capacity: 20, enrolled: 0,  status: "critico" }),
    buildCourse({ id: "c03", type: "introduttivo", city: "Pescara", month: "Maggio", year: 2026, day: 22, educatorId: "e8", capacity: 20, enrolled: 2,  status: "rischio" }),
    buildCourse({ id: "c04", type: "introduttivo", city: "Online", month: "Maggio", year: 2026, day: 25, educatorId: "e5", capacity: 50, enrolled: 14, status: "in-traiettoria", mode: "online" }),
    buildCourse({ id: "c05", type: "introduttivo", city: "Piacenza", month: "Maggio", year: 2026, day: 28, educatorId: "e4", capacity: 20, enrolled: 12, status: "in-traiettoria" }),
    buildCourse({ id: "c06", type: "introduttivo", city: "Torino", month: "Giugno", year: 2026, day: 4,  educatorId: "e6", capacity: 20, enrolled: 6,  status: "monitor" }),
    buildCourse({ id: "c07", type: "certificato", city: "Roma", month: "Giugno", year: 2026, day: 12, days: 3, educatorId: "e2", capacity: 20, enrolled: 8,  status: "monitor" }),
    buildCourse({ id: "c08", type: "certificato", city: "Vercelli", month: "Giugno", year: 2026, day: 19, days: 3, educatorId: "e7", capacity: 20, enrolled: 3,  status: "rischio" }),
    buildCourse({ id: "c09", type: "introduttivo", city: "Online", month: "Luglio", year: 2026, day: 9, educatorId: "e5", capacity: 50, enrolled: 4, status: "monitor", mode: "online" }),
    buildCourse({ id: "c10", type: "introduttivo", city: "Genova", month: "Settembre", year: 2026, day: 14, educatorId: "e3", capacity: 20, enrolled: 0, status: "rischio" }),
    buildCourse({ id: "c11", type: "introduttivo", city: "Udine", month: "Ottobre", year: 2026, day: 6, educatorId: "e9", capacity: 20, enrolled: 0, status: "monitor" }),
    buildCourse({ id: "c12", type: "introduttivo", city: "Bari", month: "Ottobre", year: 2026, day: 20, educatorId: "e10", capacity: 20, enrolled: 0, status: "monitor" }),
    buildCourse({ id: "c13", type: "shochu", city: "Roma", month: "Settembre", year: 2026, day: 25, days: 2, educatorId: "e2", capacity: 18, enrolled: 5, status: "monitor" }),
    // Bozze
    buildCourse({ id: "b01", type: "masterclass", city: "Milano", month: "Novembre", year: 2026, day: 7, days: 1, educatorId: "e1", capacity: 16, enrolled: 0, status: "monitor", lifecycle: "bozza" }),
    buildCourse({ id: "b02", type: "mixology",   city: "Milano", month: "Novembre", year: 2026, day: 28, days: 1, educatorId: "e6", capacity: 14, enrolled: 0, status: "monitor", lifecycle: "bozza" }),
    // Archiviato (cancellato)
    buildCourse({ id: "a01", type: "introduttivo", city: "Napoli", month: "Aprile", year: 2026, day: 18, educatorId: "e10", capacity: 20, enrolled: 8, status: "critico", lifecycle: "archiviato" }),
    // Passati (concluso, con esami)
    buildCourse({ id: "p01", type: "certificato", city: "Milano", month: "Marzo", year: 2026, day: 13, days: 3, educatorId: "e1", capacity: 20, enrolled: 17, status: "in-traiettoria", lifecycle: "passato", examResults: { passed: 14, retrial: 2, failed: 1 } }),
    buildCourse({ id: "p02", type: "introduttivo", city: "Bolzano", month: "Marzo", year: 2026, day: 22, educatorId: "e4", capacity: 20, enrolled: 11, status: "in-traiettoria", lifecycle: "passato" }),
    buildCourse({ id: "p03", type: "certificato", city: "Roma", month: "Febbraio", year: 2026, day: 7, days: 3, educatorId: "e2", capacity: 20, enrolled: 19, status: "in-traiettoria", lifecycle: "passato", examResults: { passed: 16, retrial: 3, failed: 0 } }),
    buildCourse({ id: "p04", type: "introduttivo", city: "Online", month: "Febbraio", year: 2026, day: 27, educatorId: "e5", capacity: 50, enrolled: 32, status: "in-traiettoria", lifecycle: "passato", mode: "online" }),
    buildCourse({ id: "p05", type: "masterclass", city: "Milano", month: "Gennaio", year: 2026, day: 18, days: 1, educatorId: "e1", capacity: 16, enrolled: 16, status: "in-traiettoria", lifecycle: "passato" }),
    buildCourse({ id: "p06", type: "certificato", city: "Firenze", month: "Gennaio", year: 2026, day: 24, days: 3, educatorId: "e3", capacity: 20, enrolled: 13, status: "in-traiettoria", lifecycle: "passato", examResults: { passed: 11, retrial: 2, failed: 0 } }),
    buildCourse({ id: "p07", type: "shochu", city: "Milano", month: "Dicembre", year: 2025, day: 5, days: 2, educatorId: "e1", capacity: 18, enrolled: 18, status: "in-traiettoria", lifecycle: "passato" }),
    buildCourse({ id: "p08", type: "certificato", city: "Torino", month: "Novembre", year: 2025, day: 14, days: 3, educatorId: "e6", capacity: 20, enrolled: 18, status: "in-traiettoria", lifecycle: "passato", examResults: { passed: 15, retrial: 2, failed: 1 } }),
    buildCourse({ id: "p09", type: "introduttivo", city: "Verona", month: "Novembre", year: 2025, day: 27, educatorId: "e7", capacity: 20, enrolled: 9, status: "in-traiettoria", lifecycle: "passato" }),
    buildCourse({ id: "p10", type: "introduttivo", city: "Online", month: "Ottobre", year: 2025, day: 19, educatorId: "e5", capacity: 50, enrolled: 41, status: "in-traiettoria", lifecycle: "passato", mode: "online" })
  ];

  // ============ Corsisti aggregati ============
  // Build from course students, marking ripartecipanti.
  function aggregateStudents() {
    const map = new Map();
    COURSES.forEach(c => {
      c.students.forEach(s => {
        const key = s.email.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            email: key,
            name: s.name,
            phone: s.phone,
            hasWhatsApp: s.hasWhatsApp,
            city: pick(CITIES, key),
            firstSeen: c.year + "-" + c.month,
            courses: [],
            totalSpent: 0
          });
        }
        const rec = map.get(key);
        rec.courses.push({
          courseId: c.id,
          courseTitle: c.shortTitle,
          courseType: c.type,
          city: c.city,
          month: c.month,
          year: c.year,
          status: c.lifecycle,
          amount: s.amount,
          examResult: c.examResults && c.lifecycle === "passato"
            ? (seed(key + c.id) % 10 < 7 ? "passed" : (seed(key + c.id) % 10 < 9 ? "retrial" : "failed"))
            : null
        });
        rec.totalSpent += s.amount;
      });
    });
    // Add historical pre-2024
    const HIST_CITIES = ["Milano","Roma","Firenze","Bologna","Verona","Torino"];
    for (let i = 0; i < 80; i++) {
      const f = FIRST[i % FIRST.length];
      const l = LAST[(i*7) % LAST.length];
      const email = `${f.toLowerCase()}.${l.toLowerCase()}${i}@storico.it`;
      const year = 2016 + (i % 7);
      const result = i % 10 < 7 ? "passed" : (i % 10 < 9 ? "retrial" : "failed");
      const repart = i % 13 === 0; // qualche ripartecipante
      map.set(email, {
        email,
        name: `${f} ${l}`,
        phone: `+39 33${i % 10} ${(i*13) % 1000}`,
        hasWhatsApp: i % 4 !== 0,
        city: HIST_CITIES[i % HIST_CITIES.length],
        firstSeen: year + "-Marzo",
        historical: true,
        courses: [
          {
            courseId: `h${i}`,
            courseTitle: "Sake Sommelier Certificato",
            courseType: "certificato",
            city: HIST_CITIES[i % HIST_CITIES.length],
            month: ["Gennaio","Marzo","Maggio","Ottobre"][i % 4],
            year,
            status: "passato",
            amount: 490,
            examResult: result,
            historical: true
          },
          ...(repart ? [{
            courseId: `h${i}b`,
            courseTitle: "Masterclass Approfondimento",
            courseType: "masterclass",
            city: HIST_CITIES[i % HIST_CITIES.length],
            month: "Settembre",
            year: year + 1,
            status: "passato",
            amount: 280,
            historical: true
          }] : [])
        ],
        totalSpent: 490 + (repart ? 280 : 0)
      });
    }
    return Array.from(map.values()).map(s => ({ ...s, isReturning: s.courses.length > 1 }));
  }

  const STUDENTS = aggregateStudents();

  // ============ Dashboard KPI ============
  const active = COURSES.filter(c => c.lifecycle === "pubblicato");
  const totalEnrolledActive = active.reduce((s,c) => s + c.enrolled, 0);
  const totalRevenueActive = active.reduce((s,c) => s + c.revenue, 0);
  const totalMarginActive = active.reduce((s,c) => s + c.margin, 0);
  const atRisk = active.filter(c => c.status === "rischio" || c.status === "critico").length;

  const KPI = {
    coursesActive: active.length,
    coursesAtRisk: atRisk,
    enrolledActive: totalEnrolledActive,
    revenueActive: totalRevenueActive,
    marginActive: totalMarginActive,
    studentsTotal: STUDENTS.length,
    returningStudents: STUDENTS.filter(s => s.isReturning).length,
    examPassRate: 0.78
  };

  // ============ Template materiali ============
  // Template di programma: ogni template definisce dei GIORNI; dentro ogni giorno i SAKE.
  // Scegliendo un template alla creazione di un corso, il corso eredita il numero di giorni.
  // Le voci "materiali" (diplomi, libri, educator/giornata) vivono qui, non più nel singolo corso.
  function buildMaterialTemplates() {
    const mk = (i, name, type, dayCount, perDay, description, materiali, lastUsed, uses, createdBy) => {
      const days = [];
      const dayNames = ["Fondamenti & assaggi guidati", "Produzione & pairing", "Approfondimento & masterclass", "Regioni & stili", "Degustazione finale"];
      for (let d = 1; d <= dayCount; d++) {
        const sakes = [];
        for (let j = 0; j < perDay; j++) {
          const k = seed(name + d + j + i);
          sakes.push({
            code: `SAK${(k % 900 + 100)}`,
            name: SAKE_NAMES[k % SAKE_NAMES.length],
            type: SAKE_TYPES[k % SAKE_TYPES.length],
            sakagura: SAKE_SAKAGURA[k % SAKE_SAKAGURA.length],
            size: pick([300, 720, 1800], name + d + j),
            cost: 25 + (k % 70),
            qty: 1 + (k % 3),
            note: ""
          });
        }
        days.push({ day: d, name: dayNames[(d - 1) % dayNames.length], sakes });
      }
      return { id: `mtpl-${i}`, name, type, days, materiali, description, lastUsed, uses, createdBy };
    };
    return [
      mk(1, "Certificato classico", "certificato", 3, 6,
        "Programma standard del Sake Sommelier Certificato. Bilanciato tra stili e regioni.",
        { educatorPerDay: 200, diplomaPerStudent: 115, libroPerStudent: 9, extra: [
          { id: "x-kit", label: "Kit degustazione", value: 18, per: "iscritto" },
          { id: "x-logistica", label: "Logistica & allestimento", value: 150, per: "corso" }
        ] }, "12 Mar 2026", 8, "Lorenzo F."),
      mk(2, "Certificato premium · Milano", "certificato", 3, 7,
        "Versione con etichette premium per location top tier.",
        { educatorPerDay: 250, diplomaPerStudent: 115, libroPerStudent: 12, extra: [
          { id: "x-calici", label: "Calici premium ISO", value: 12, per: "iscritto" }
        ] }, "5 Feb 2026", 4, "Sara Manager"),
      mk(3, "Introduttivo · serata singola", "introduttivo", 1, 6,
        "Format introduttivo da 4 ore. Storia, produzione, degustazione.",
        { educatorPerDay: 200, diplomaPerStudent: 60, libroPerStudent: 8 }, "18 Apr 2026", 14, "Lorenzo F."),
      mk(4, "Introduttivo · pairing food", "introduttivo", 1, 7,
        "Focus su abbinamenti gastronomici. Catering richiesto.",
        { educatorPerDay: 200, diplomaPerStudent: 60, libroPerStudent: 8 }, "22 Mar 2026", 6, "Maiko T."),
      mk(5, "Masterclass · sake aged", "masterclass", 1, 8,
        "Approfondimento su koshu e sake invecchiati.",
        { educatorPerDay: 300, diplomaPerStudent: 0, libroPerStudent: 0 }, "15 Gen 2026", 3, "Lorenzo F."),
      mk(6, "Shochu sommelier · base", "shochu", 2, 5,
        "Programma per certificazione Shochu, due giornate.",
        { educatorPerDay: 220, diplomaPerStudent: 90, libroPerStudent: 10 }, "5 Dic 2025", 2, "Sara Manager")
    ];
  }

  const MATERIAL_TEMPLATES = buildMaterialTemplates();

  window.SSA = {
    EDUCATORS,
    COURSES,
    STUDENTS,
    CITIES,
    COURSE_TYPES,
    STATUS_META,
    MATERIAL_TEMPLATES,
    KPI,
    seed
  };
})();
