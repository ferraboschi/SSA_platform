// SSA Exam — mock data for the exam system
// Loaded AFTER data.js. Extends window.SSA with EXAMS, QUESTIONS_BANK, etc.

(function(){
  if (!window.SSA) return;
  const { COURSES, seed, STUDENTS } = window.SSA;

  // ============ Question bank (templates per course type) ============
  // 5 macro categories for nihonshu certificato
  const NIHONSHU_CATS = [
    { id: "storia", label: "Storia & Cultura", short: "Storia" },
    { id: "produzione", label: "Produzione & Tecnica", short: "Produzione" },
    { id: "varieta", label: "Varietà & Stili", short: "Varietà" },
    { id: "degustazione", label: "Degustazione & Sensoriale", short: "Degustazione" },
    { id: "servizio", label: "Servizio & Pairing", short: "Servizio" }
  ];

  const SHOCHU_CATS = [
    { id: "storia-s", label: "Storia & Tradizione", short: "Storia" },
    { id: "produzione-s", label: "Produzione & Distillazione", short: "Produzione" },
    { id: "ingredienti", label: "Ingredienti & Koji", short: "Ingredienti" },
    { id: "degustazione-s", label: "Degustazione", short: "Degustazione" },
    { id: "servizio-s", label: "Servizio & Cocktail", short: "Servizio" }
  ];

  // Question templates — realistic content
  const Q_BANK = [
    // Storia
    { id: "q01", cat: "storia", type: "single", important: true, lang: "it", text: "In che secolo arriva il sake in Giappone secondo le fonti più accreditate?", options: ["III a.C.", "III d.C.", "VII d.C.", "X d.C."], correct: [1], points: 1 },
    { id: "q02", cat: "storia", type: "multi", important: true, lang: "it", text: "Quali di queste epoche sono associate a un'evoluzione significativa nella produzione del sake?", options: ["Periodo Nara (710-794)", "Periodo Heian (794-1185)", "Periodo Edo (1603-1868)", "Periodo Meiji (1868-1912)", "Periodo Reiwa (2019-)"], correct: [0, 2, 3], points: 2 },
    { id: "q03", cat: "storia", type: "truefalse", important: false, lang: "it", text: "Il primo trattato scritto sulla produzione del sake risale al periodo Edo.", options: ["Vero", "Falso"], correct: [1], points: 1, explanation: "Risale al periodo Heian (Engishiki, X secolo)." },

    // Produzione
    { id: "q10", cat: "produzione", type: "single", important: true, lang: "it", text: "Quale microorganismo è responsabile della saccarificazione dell'amido del riso?", options: ["Saccharomyces cerevisiae", "Aspergillus oryzae (koji)", "Lactobacillus", "Acetobacter"], correct: [1], points: 1 },
    { id: "q11", cat: "produzione", type: "fill", important: true, lang: "it", text: "Il rapporto di lucidatura del riso si chiama in giapponese ___.", correct: ["seimaibuai", "seimai-buai", "seimai buai"], points: 1 },
    { id: "q12", cat: "produzione", type: "match", important: true, lang: "it", text: "Abbina ogni stile al suo rapporto di lucidatura minimo:", pairs: [
      { l: "Daiginjo", r: "≤ 50%" },
      { l: "Ginjo", r: "≤ 60%" },
      { l: "Honjozo", r: "≤ 70%" },
      { l: "Futsushu", r: "nessun minimo" }
    ], points: 2 },
    { id: "q13", cat: "produzione", type: "order", important: false, lang: "it", text: "Ordina le fasi del processo produttivo del sake:", items: ["Lavaggio del riso", "Cottura a vapore", "Preparazione del koji", "Shubo (starter)", "Fermentazione moromi", "Pressatura"], points: 2 },

    // Varietà
    { id: "q20", cat: "varieta", type: "image", important: true, lang: "it", text: "Identifica lo stile di sake di questa etichetta:", imageId: "sake-label-01", options: ["Junmai", "Junmai Daiginjo", "Honjozo", "Nigori"], correct: [1], points: 1 },
    { id: "q21", cat: "varieta", type: "multi", important: true, lang: "it", text: "Quali sono le varietà di riso da sake (sakamai) più coltivate?", options: ["Yamada Nishiki", "Gohyakumangoku", "Koshihikari", "Omachi", "Akita Komachi"], correct: [0, 1, 3], points: 2 },
    { id: "q22", cat: "varieta", type: "open", important: false, lang: "it", text: "Spiega in 2-3 frasi la differenza tra Kimoto e Yamahai.", points: 3, aiKey: "kimoto-yamahai" },

    // Degustazione
    { id: "q30", cat: "degustazione", type: "single", important: true, lang: "it", text: "Il termine 'umami' nel sake è principalmente associato a:", options: ["Acido lattico", "Aminoacidi liberi", "Anidride carbonica", "Tannini"], correct: [1], points: 1 },
    { id: "q31", cat: "degustazione", type: "open", important: true, lang: "it", text: "Descrivi il profilo organolettico tipico di un Junmai Daiginjo.", points: 3, aiKey: "junmai-daiginjo-profile" },
    { id: "q32", cat: "degustazione", type: "single", important: false, lang: "it", text: "A che temperatura si serve generalmente un Junmai Ginjo?", options: ["3-5°C", "8-12°C", "15-18°C", "40°C+"], correct: [1], points: 1 },

    // Servizio
    { id: "q40", cat: "servizio", type: "match", important: false, lang: "it", text: "Abbina il sake al piatto consigliato:", pairs: [
      { l: "Junmai stagionato", r: "Anatra alla griglia" },
      { l: "Nigori dolce", r: "Tiramisù" },
      { l: "Daiginjo fresco", r: "Sashimi" },
      { l: "Honjozo caldo", r: "Yakitori invernale" }
    ], points: 2 },
    { id: "q41", cat: "servizio", type: "truefalse", important: true, lang: "it", text: "Il sake si serve sempre caldo nella tradizione giapponese.", options: ["Vero", "Falso"], correct: [1], points: 1 }
  ];

  // ============ Exams attached to courses ============
  function buildExam(course) {
    if (!course) return null;
    const isShochu = course.type === "shochu";
    const cats = isShochu ? SHOCHU_CATS : NIHONSHU_CATS;
    const totalQ = isShochu ? 80 : 110;
    // pull subset from Q_BANK + synthesize the rest as filler with similar shape
    const sampled = [];
    for (let i = 0; i < totalQ; i++) {
      const base = Q_BANK[i % Q_BANK.length];
      sampled.push({ ...base, id: `${course.id}-q${i+1}`, n: i+1 });
    }
    const totalPoints = sampled.reduce((s, q) => s + (q.points || 1), 0);
    return {
      courseId: course.id,
      family: isShochu ? "shochu" : "nihonshu",
      cats,
      totalQuestions: totalQ,
      totalPoints,
      duration: 60, // minutes
      mockDuration: 30,
      feedbackDuration: 15,
      thresholds: { pass: 0.80, retrial: 0.70 }, // ≥80 promosso, 70-79 riserva, <70 bocciato
      questions: sampled,
      phases: {
        mockTest:  { id: "mock", label: "Mock test", scheduled: "Giorno 3 · 14:00", duration: 30, status: course.lifecycle === "passato" ? "completed" : "scheduled", n: 30 },
        feedback:  { id: "feedback", label: "Feedback sessione", scheduled: "Giorno 3 · 14:45", duration: 15, status: course.lifecycle === "passato" ? "completed" : "scheduled", n: 12 },
        exam:      { id: "exam", label: "Esame finale", scheduled: "Settimana +1 · sabato 14:00", duration: 60, status: course.id === "c01" ? "ready" : (course.lifecycle === "passato" ? "completed" : "draft"), n: totalQ }
      }
    };
  }

  // Generate sessions/results for past courses
  function buildResults(course, exam) {
    if (!exam) return null;
    if (course.lifecycle !== "passato" && course.id !== "c01") return null;

    const studs = course.students.slice(0, course.enrolled);
    const items = studs.map((s, i) => {
      const k = seed(course.handle + s.email);
      // Score distribution: 60% pass (>80), 25% retrial (70-79), 15% fail (<70)
      const bucket = k % 100;
      let pct;
      if (bucket < 60) pct = 80 + (k % 20);
      else if (bucket < 85) pct = 70 + (k % 10);
      else pct = 40 + (k % 30);
      const status = pct >= 80 ? "passed" : pct >= 70 ? "retrial" : "failed";
      // Section breakdowns
      const sections = exam.cats.map((c, ci) => ({
        cat: c.id,
        label: c.label,
        short: c.short,
        pct: Math.max(20, Math.min(100, pct + ((seed(s.email + c.id) % 40) - 20)))
      }));
      // Wrong answers (important)
      const wrongImportant = exam.questions
        .filter(q => q.important && (seed(s.email + q.id) % 100) > pct - 10)
        .slice(0, 3)
        .map(q => ({
          questionId: q.id,
          cat: q.cat,
          text: q.text,
          wrongAnswer: q.type === "single" || q.type === "multi" ? q.options?.[((seed(s.email + q.id)) % q.options.length)] : "—",
          correctAnswer: q.type === "single" || q.type === "multi" ? q.options?.[q.correct[0]] : (q.correct?.[0] || "Risposta corretta")
        }));
      return {
        email: s.email,
        name: s.name,
        score: Math.round(pct),
        status,
        completedAt: new Date(2026, 2, 14, 15, (k % 60)).toISOString(),
        durationMin: 35 + (k % 25),
        sections,
        wrongImportant
      };
    });
    return items;
  }

  // Generate "live" exam state (in-progress) for c01 (the active exam)
  function buildLiveExam(course, exam) {
    if (!exam) return null;
    const studs = course.students.slice(0, course.enrolled);
    return studs.map((s, i) => {
      const k = seed(course.handle + s.email + "live");
      // Random progress: not-started, in-progress (with %), submitted
      const bucket = k % 100;
      let status, progress, score, durationMin;
      if (bucket < 8) { status = "not-started"; progress = 0; score = null; durationMin = null; }
      else if (bucket < 25) { status = "submitted"; progress = 100; score = 70 + (k % 25); durationMin = 35 + (k % 20); }
      else { status = "in-progress"; progress = 20 + (k % 70); score = null; durationMin = Math.round(progress * 0.5); }
      return {
        email: s.email,
        name: s.name,
        status,
        progress,
        score,
        durationMin,
        checkedIn: bucket > 5
      };
    });
  }

  // ============ Shochu final-exam questions (separate bank) ============
  const SHOCHU_Q = [
    { id: "s01", cat: "storia-s", type: "single", important: true, lang: "it", text: "In quale isola del Giappone nasce la tradizione dello shochu?", options: ["Hokkaido", "Kyushu", "Shikoku", "Honshu"], correct: [1], points: 1 },
    { id: "s02", cat: "produzione-s", type: "single", important: true, lang: "it", text: "Quale tecnica distingue lo shochu honkaku?", options: ["Distillazione continua", "Distillazione singola (pot still)", "Macerazione a freddo", "Rifermentazione"], correct: [1], points: 1 },
    { id: "s03", cat: "ingredienti", type: "multi", important: true, lang: "it", text: "Quali sono materie prime tipiche dello shochu?", options: ["Imo (patata dolce)", "Mugi (orzo)", "Kome (riso)", "Kokuto (zucchero di canna)", "Uva"], correct: [0,1,2,3], points: 2 },
    { id: "s04", cat: "ingredienti", type: "match", important: true, lang: "it", text: "Abbina il koji al suo colore:", pairs: [
      { l: "Koji bianco", r: "Dolce, morbido" },
      { l: "Koji nero", r: "Ricco, corposo" },
      { l: "Koji giallo", r: "Aromatico, fruttato" }
    ], points: 2 },
    { id: "s05", cat: "degustazione-s", type: "open", important: true, lang: "it", text: "Descrivi le differenze sensoriali tra imo-jochu e mugi-jochu.", points: 3, aiKey: "imo-mugi" },
    { id: "s06", cat: "servizio-s", type: "single", important: false, lang: "it", text: "Cosa indica 'oyuwari' nel servizio dello shochu?", options: ["Con ghiaccio", "Allungato con acqua calda", "Liscio", "Con soda"], correct: [1], points: 1 }
  ];

  // ============ Mini-test templates (per famiglia, per giorno) ============
  // Domande costruite ad hoc per ogni giornata; i mini-test giornalieri pescano da qui.
  const MINI_NIHONSHU = [
    { day: 1, name: "Nihonshu · Day 1 test", topic: "Storia & basi di produzione", duration: 10, questions: [
      { id: "n1q1", type: "single", lang: "it", text: "Il koji nel sake è prodotto da quale muffa?", options: ["Aspergillus oryzae", "Penicillium", "Botrytis", "Rhizopus"], correct: [0], points: 1 },
      { id: "n1q2", type: "truefalse", lang: "it", text: "Il sake è tecnicamente una birra di riso (fermentazione, non distillazione).", options: ["Vero", "Falso"], correct: [0], points: 1 },
      { id: "n1q3", type: "single", lang: "it", text: "Cosa misura il seimaibuai?", options: ["Gradazione alcolica", "Rapporto di lucidatura del riso", "Acidità", "Temperatura di servizio"], correct: [1], points: 1 }
    ] },
    { day: 2, name: "Nihonshu · Day 2 test", topic: "Varietà, stili & degustazione", duration: 10, questions: [
      { id: "n2q1", type: "single", lang: "it", text: "Un Daiginjo ha un seimaibuai di almeno:", options: ["≤ 70%", "≤ 60%", "≤ 50%", "nessun minimo"], correct: [2], points: 1 },
      { id: "n2q2", type: "multi", lang: "it", text: "Quali sono varietà di riso da sake?", options: ["Yamada Nishiki", "Omachi", "Koshihikari", "Gohyakumangoku"], correct: [0,1,3], points: 2 },
      { id: "n2q3", type: "single", lang: "it", text: "L'umami nel sake è associato a:", options: ["Tannini", "Aminoacidi", "CO₂", "Acido citrico"], correct: [1], points: 1 }
    ] },
    { day: 3, name: "Nihonshu · Day 3 test", topic: "Servizio & pairing", duration: 10, questions: [
      { id: "n3q1", type: "single", lang: "it", text: "A che temperatura si serve in genere un Junmai Ginjo?", options: ["3-5°C", "8-12°C", "15-18°C", "40°C+"], correct: [1], points: 1 },
      { id: "n3q2", type: "truefalse", lang: "it", text: "Tutti i sake vanno serviti caldi.", options: ["Vero", "Falso"], correct: [1], points: 1 },
      { id: "n3q3", type: "match", lang: "it", text: "Abbina sake e piatto:", pairs: [{ l: "Daiginjo fresco", r: "Sashimi" }, { l: "Honjozo caldo", r: "Yakitori" }], points: 2 }
    ] }
  ];
  const MINI_SHOCHU = [
    { day: 1, name: "Shochu · Day 1 test", topic: "Storia & distillazione", duration: 10, questions: [
      { id: "sh1q1", type: "single", lang: "it", text: "Lo shochu honkaku usa quale distillazione?", options: ["Continua", "Singola (pot still)", "Sottovuoto doppia", "Nessuna"], correct: [1], points: 1 },
      { id: "sh1q2", type: "truefalse", lang: "it", text: "Lo shochu è un distillato.", options: ["Vero", "Falso"], correct: [0], points: 1 },
      { id: "sh1q3", type: "single", lang: "it", text: "Regione d'origine dello shochu:", options: ["Kyushu", "Hokkaido", "Kansai", "Tohoku"], correct: [0], points: 1 }
    ] },
    { day: 2, name: "Shochu · Day 2 test", topic: "Ingredienti, degustazione & servizio", duration: 10, questions: [
      { id: "sh2q1", type: "multi", lang: "it", text: "Materie prime tipiche:", options: ["Imo", "Mugi", "Kome", "Uva"], correct: [0,1,2], points: 2 },
      { id: "sh2q2", type: "single", lang: "it", text: "'Oyuwari' significa servire:", options: ["Liscio", "Con acqua calda", "Con ghiaccio", "Con soda"], correct: [1], points: 1 },
      { id: "sh2q3", type: "single", lang: "it", text: "Il koji nero conferisce un profilo:", options: ["Leggero e dolce", "Ricco e corposo", "Acido", "Neutro"], correct: [1], points: 1 }
    ] }
  ];

  // ============ Feedback templates (per famiglia) ============
  const FEEDBACK_NIHONSHU = {
    name: "Feedback Nihonshu", questions: [
      { id: "fn1", type: "rating", lang: "it", text: "Valuta il corso nel complesso (1-5)" },
      { id: "fn2", type: "rating", lang: "it", text: "Valuta l'educator (1-5)" },
      { id: "fn3", type: "single", lang: "it", text: "Quale capitolo è stato più difficile?", options: ["Storia", "Produzione", "Varietà", "Degustazione", "Servizio"] },
      { id: "fn4", type: "open", lang: "it", text: "Il programma sake era bilanciato? Cosa cambieresti?" },
      { id: "fn5", type: "open", lang: "it", text: "Cosa ti è piaciuto di più?" }
    ]
  };
  const FEEDBACK_SHOCHU = {
    name: "Feedback Shochu", questions: [
      { id: "fs1", type: "rating", lang: "it", text: "Valuta il corso nel complesso (1-5)" },
      { id: "fs2", type: "rating", lang: "it", text: "Valuta l'educator (1-5)" },
      { id: "fs3", type: "single", lang: "it", text: "Argomento più interessante?", options: ["Storia", "Distillazione", "Ingredienti & koji", "Degustazione", "Servizio & cocktail"] },
      { id: "fs4", type: "open", lang: "it", text: "Cosa miglioreresti del corso shochu?" }
    ]
  };

  // ============ Central exam templates (uno per famiglia, separati per tipo) ============
  const TEMPLATES = {
    nihonshu: {
      family: "nihonshu",
      label: "Nihonshu · Certificato",
      finalExam: {
        name: "Esame finale Nihonshu",
        cats: NIHONSHU_CATS,
        questions: Q_BANK,
        totalQuestions: 110,
        duration: 60,
        thresholds: { pass: 0.80, retrial: 0.70 }
      },
      miniTests: MINI_NIHONSHU,
      feedback: FEEDBACK_NIHONSHU
    },
    shochu: {
      family: "shochu",
      label: "Shochu",
      finalExam: {
        name: "Esame finale Shochu",
        cats: SHOCHU_CATS,
        questions: SHOCHU_Q,
        totalQuestions: 80,
        duration: 50,
        thresholds: { pass: 0.80, retrial: 0.70 }
      },
      miniTests: MINI_SHOCHU,
      feedback: FEEDBACK_SHOCHU
    }
  };

  // ============ Helpers for per-course exam meta ============
  const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const DOW = ["dom","lun","mar","mer","gio","ven","sab"];
  function familyOf(course) { return course.type === "shochu" ? "shochu" : "nihonshu"; }
  function buildExamMeta(course) {
    const fam = familyOf(course);
    const tpl = TEMPLATES[fam];
    const mIdx = MONTHS.indexOf(course.month);
    const days = course.days || (fam === "shochu" ? 2 : 3);
    // Esame finale ~1 settimana dopo l'ultimo giorno
    const examDate = new Date(course.year, mIdx, course.day + days + 7);
    const examDateLabel = `${DOW[examDate.getDay()]} ${examDate.getDate()} ${MONTHS[examDate.getMonth()].slice(0,3)} ${examDate.getFullYear()}`;
    const examDayNo = days + 8; // "Giorno N" relativo (es. Nihonshu 3gg → 11, Shochu 2gg → 10)
    const done = course.lifecycle === "passato";
    const live = course.id === "c01";
    // Mini-test per giorno (numero giorni = numero mini-test, dal template materiali)
    const miniTests = Array.from({ length: days }, (_, i) => {
      const d = i + 1;
      const tplDay = tpl.miniTests[i] || tpl.miniTests[tpl.miniTests.length - 1];
      const k = seed(course.handle + "mini" + d);
      return {
        day: d,
        name: tplDay?.name || `${tpl.label} · Day ${d} test`,
        topic: tplDay?.topic || "",
        nQuestions: tplDay?.questions.length || 3,
        status: done ? "completato" : (live && d <= Math.ceil(days/2) ? "completato" : "pianificato"),
        avgScore: done || (live && d <= Math.ceil(days/2)) ? 70 + (k % 26) : null,
        completion: done ? 100 : (live && d <= Math.ceil(days/2) ? 100 : 0)
      };
    });
    const fb = {
      name: tpl.feedback.name,
      total: course.enrolled,
      sent: done,
      responses: done ? Math.max(0, course.enrolled - (seed(course.handle + "fb") % 4)) : 0,
      status: done ? "inviato" : "pronto"
    };
    return { family: fam, familyLabel: tpl.label, examDate: examDate.toISOString(), examDateLabel, examDayNo, done, live, miniTests, feedback: fb };
  }

  // ============ Attach exam state to each course ============
  COURSES.forEach(c => {
    // Only certificato and shochu have full exams
    if (c.type !== "certificato" && c.type !== "shochu") return;
    const exam = buildExam(c);
    const results = buildResults(c, exam);
    const liveState = c.id === "c01" ? buildLiveExam(c, exam) : null;
    c.exam = exam;
    c.examResults2 = results; // detailed results
    c.examLive = liveState;
    c.examMeta = buildExamMeta(c);
  });

  window.SSA_EXAM = {
    NIHONSHU_CATS,
    SHOCHU_CATS,
    Q_BANK,
    TEMPLATES
  };
})();
