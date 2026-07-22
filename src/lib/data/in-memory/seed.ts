// In-memory seed — deterministic port of the prototype's mock-data generators
// (_reference/prototype/data.js, data-exam.js, app-state.js) into one typed module.
// buildSeed() returns identical data on every call: no Math.random, no Date.now().

import {
  CITIES,
  COURSE_TYPES,
  defaultMaterialCosts,
  STATUS_META,
  NIHONSHU_CATS,
  SHOCHU_CATS,
} from "@/lib/domain";
import { MONTH_NAMES_IT } from "@/lib/dates/italian-months";
import { scoreToOutcome } from "@/lib/exam-links/grading";
import type {
  Course,
  CourseCosts,
  Corsista,
  CorsistaEnrollment,
  Educator,
  Student,
  ProgramDay,
  Sake,
  Notebook,
  AdminNote,
  Exam,
  ExamPhases,
  ExamQuestion,
  ExamResult,
  ExamResultSection,
  WrongImportant,
  ExamLiveSession,
  ExamMeta,
  MiniTestMeta,
  ExamFeedbackMeta,
  ExamTemplate,
  ExamTemplateMiniTest,
  ExamTemplateFeedback,
  MaterialTemplate,
  MaterialDay,
  MaterialCosts,
  User,
} from "@/lib/domain";
import type {
  CourseLifecycle,
  CourseStatus,
  CourseTypeKey,
  DeliveryMode,
  ExamFamily,
  ExamQuestionType,
  ExamResultStatus,
  LiveSessionStatus,
} from "@/lib/domain";
import type { ExamCategory } from "@/lib/domain";

export interface SeedData {
  courses: Course[];
  corsisti: Corsista[];
  educators: Educator[];
  materialTemplates: MaterialTemplate[];
  examTemplates: ExamTemplate[];
  users: User[];
}

// ============ Deterministic clock ============
// The prototype derived order dates from Date.now(). To keep buildSeed()
// reproducible we anchor to a fixed reference instant instead.
const NOW_MS = Date.parse("2026-05-30T00:00:00Z");
const DAY_MS = 86400000;

// ============ Educators ============

const EDUCATORS: Educator[] = [
  { id: "e1", name: "Lorenzo Ferraboschi", role: "Founder & Senior Educator", city: "Milano", initials: "LF", bio: "Sake Educator certificato WSET Level 3 e SSI. Fondatore della SSA.", years: 11, lang: ["IT", "EN"] },
  { id: "e2", name: "Camilla Bonnannini", role: "Senior Educator", city: "Roma", initials: "CB", bio: "Sommelier AIS e Sake Sommelier dal 2019.", years: 6, lang: ["IT", "EN", "FR"] },
  { id: "e3", name: "Melissa Corazza", role: "Educator", city: "Firenze", initials: "MC", bio: "Specialista in food pairing e cucina giapponese.", years: 4, lang: ["IT", "EN"] },
  { id: "e4", name: "Stefano Battini", role: "Educator", city: "Piacenza", initials: "SB", bio: "Esperto in fermentazioni e koji.", years: 5, lang: ["IT", "EN"] },
  { id: "e5", name: "Gabriele Merlo", role: "Educator Online", city: "Online", initials: "GM", bio: "Conduce i corsi in remoto, format ridotto.", years: 3, lang: ["IT", "EN"] },
  { id: "e6", name: "Luca Eula", role: "Educator", city: "Torino", initials: "LE", bio: "Bartender e cocktail-with-sake.", years: 4, lang: ["IT", "EN"] },
  { id: "e7", name: "Brunella Bettati", role: "Educator", city: "Vercelli", initials: "BB", bio: "Riso, terroir, tradizione.", years: 7, lang: ["IT"] },
  { id: "e8", name: "Alessandro Izzo", role: "Educator", city: "Pescara", initials: "AI", bio: "Si occupa di mid e South Italy.", years: 3, lang: ["IT", "EN"] },
  { id: "e9", name: "Jacopo Tiezzi", role: "Educator", city: "Udine", initials: "JT", bio: "Nord-est, formati intensivi.", years: 2, lang: ["IT"] },
  { id: "e10", name: "Sebastiano Gambacorta", role: "Educator", city: "Bari", initials: "SG", bio: "Sud, focus introduttivi.", years: 2, lang: ["IT", "EN"] },
];

const FIRST = ["Marco", "Giulia", "Andrea", "Sofia", "Luca", "Chiara", "Matteo", "Francesca", "Davide", "Elena", "Tommaso", "Alessia", "Federico", "Martina", "Stefano", "Beatrice", "Riccardo", "Giorgia", "Edoardo", "Valentina", "Pietro", "Caterina", "Lorenzo", "Anna", "Filippo", "Eleonora", "Simone", "Camilla", "Niccolò", "Greta"];
const LAST = ["Rossi", "Bianchi", "Esposito", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Costa", "Giordano", "Mancini", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Caruso", "Mariani", "Ferrari", "Galli", "Martini", "Leone", "Longo", "Santoro", "Sala", "Vitale"];

// ============ Deterministic RNG (ported verbatim) ============

function seed(k: string): number {
  let x = 0;
  for (let i = 0; i < k.length; i++) x = (x * 31 + k.charCodeAt(i)) | 0;
  return Math.abs(x);
}
function pick<T>(arr: readonly T[], k: string): T {
  return arr[seed(k) % arr.length];
}

// ============ Students ============

function makeStudents(courseHandle: string, n: number, registered = -1): Student[] {
  const out: Student[] = [];
  const reg = registered === -1 ? n : registered;
  for (let i = 0; i < reg; i++) {
    const f = pick(FIRST, courseHandle + "f" + i);
    const l = pick(LAST, courseHandle + "l" + i);
    const codes = ["", "", "", "KITSUNE100", "EARLY50", "FRIENDS20"];
    const code = pick(codes, courseHandle + "c" + i);
    const gross = pick([490, 590, 150, 280, 380], courseHandle + "g" + i);
    const disc = code ? (code === "KITSUNE100" ? 100 : code === "EARLY50" ? 50 : 20) : 0;
    const wa = seed(courseHandle + "w" + i) % 100 > 18;
    const mism = seed(courseHandle + "m" + i) % 100 > 92;
    out.push({
      name: `${f} ${l}`,
      email: `${f.toLowerCase()}.${l.toLowerCase().replace(/\s/g, "")}@${pick(["gmail.com", "libero.it", "outlook.com", "hotmail.it", "fastwebnet.it", "icloud.com"], f + l)}`,
      phone: `+39 3${seed(f + l) % 10}${(seed(l + f) % 100).toString().padStart(2, "0")} ${(seed(f) % 1000).toString().padStart(3, "0")}${(seed(l) % 1000).toString().padStart(3, "0")}`,
      orderNumber: `SSA${3200 + (seed(courseHandle + i) % 800)}`,
      amount: gross - disc,
      grossAmount: gross,
      discountCode: code || null,
      hasWhatsApp: wa,
      nameMismatch: mism,
      registrationName: mism ? `${f} ${pick(LAST, "mm" + i)}` : null,
      orderDate: new Date(NOW_MS - (seed(courseHandle + i) % 60) * DAY_MS).toISOString(),
    });
  }
  return out;
}

// ============ Program (sake per day) ============

const SAKE_TYPES = ["Junmai Daiginjo", "Junmai Ginjo", "Junmai", "Honjozo", "Daiginjo", "Nigori", "Sparkling", "Aged", "Kimoto", "Yamahai"];
const SAKE_SAKAGURA = ["Asahi Shuzo", "Dassai", "Tatenokawa", "Born Brewery", "Hakkaisan", "Tedorigawa", "Kikusui", "Suehiro", "Tengumai", "Kamoizumi"];
const SAKE_NAMES = ["Niwa no Uguisu", "Ginga Shizuku", "Yuki no Bosha", "Hakutsuru Sayuri", "Born Gold", "Hakkaisan Tokubetsu", "Tedorigawa Yamahai", "Kikusui Funaguchi", "Tengumai Yamahai", "Kamoizumi Shusen"];

function makeProgram(courseHandle: string, days = 2): ProgramDay[] {
  const out: ProgramDay[] = [];
  for (let d = 1; d <= days; d++) {
    const sections = ["Assaggi", "Pairing", "Approfondimento"];
    for (const sec of sections.slice(0, 1 + (d % 2))) {
      const sakes: Sake[] = [];
      const n = 3 + (seed(courseHandle + d + sec) % 3);
      for (let i = 0; i < n; i++) {
        const k = seed(courseHandle + d + sec + i);
        sakes.push({
          code: `SAK${(k % 999).toString().padStart(3, "0")}`,
          name: SAKE_NAMES[k % SAKE_NAMES.length],
          type: SAKE_TYPES[k % SAKE_TYPES.length],
          sakagura: SAKE_SAKAGURA[k % SAKE_SAKAGURA.length],
          size: pick([300, 720, 1800], courseHandle + d + i),
          cost: 25 + (k % 70),
          qty: 1 + (k % 3),
        });
      }
      out.push({ day: d, name: sec, sakes });
    }
  }
  return out;
}

// ============ Course builder ============

interface BuildCourseArgs {
  id: string;
  type: CourseTypeKey;
  city: string;
  month: string;
  year: number;
  day: number;
  days?: number;
  educatorId: string;
  capacity: number;
  enrolled: number;
  status: CourseStatus;
  mode?: DeliveryMode;
  examResults?: { passed: number; retrial: number; failed: number };
  lifecycle?: CourseLifecycle;
  costsOverride?: CourseCosts;
}

function buildCourse(args: BuildCourseArgs): Course {
  const { id, type, city, month, year, day, days, educatorId, capacity, enrolled, status, mode, examResults, lifecycle, costsOverride } = args;
  const t = COURSE_TYPES[type];
  const handle = `corso-${type}-${city.toLowerCase()}-${month.toLowerCase()}-${year}-${id}`;
  const educator = EDUCATORS.find((e) => e.id === educatorId) as Educator;
  const minStud = t.minStud;
  const price = t.price;
  const revenue = enrolled * (price * 0.85); // some discounts
  const costsBase: CourseCosts = {
    educator: 600,
    gestione: 900,
    diplomi: 460,
    libri: 36,
    location: city === "Milano" ? 0 : 250,
    food: type === "certificato" ? 0 : 80,
    adv: 0,
  };
  const costs = costsOverride || costsBase;
  const totalCost = Object.values(costs).reduce((s, n) => s + n, 0);
  const margin = revenue - totalCost;
  const resolvedDays = days || (type === "certificato" ? 3 : 1);

  const adminNotes: AdminNote[] =
    id === "c01"
      ? [
          { id: "n1", text: "Lorenzo conferma la sede di Via Tortona. 18 confermati su 20.", author: "admin", at: "2026-05-20T10:15:00Z" },
          { id: "n2", text: "Diplomi pronti, ritiro lunedì.", author: "admin", at: "2026-05-23T08:00:00Z" },
        ]
      : id === "c03"
      ? [{ id: "n3", text: "Pescara sotto la mediana storica. Lanciare pubblicità Facebook.", author: "admin", at: "2026-05-15T18:00:00Z" }]
      : [];
  const notebook: Notebook = {
    adminNotes,
    plannedAction: id === "c03" ? "Campagna ADV" : null,
    tags: id === "c01" ? ["sede-confermata", "catering-ok"] : id === "c03" ? ["bassa-iscrizione"] : [],
    reasoning:
      status === "in-traiettoria"
        ? "Velocità iscrizioni in linea con la mediana storica (4 corsi simili). Margine positivo previsto."
        : status === "rischio"
        ? "Velocità sotto la mediana del segmento (-43%). 4 corsi simili negli ultimi 18 mesi sono stati chiusi sotto la soglia minima."
        : status === "monitor"
        ? "Dati storici limitati per questo segmento. Attualmente in soglia, monitorare nelle prossime 2 settimane."
        : "Dati insufficienti per una valutazione affidabile.",
  };

  return {
    id,
    handle,
    type,
    typeLabel: t.label,
    typeShort: t.short,
    typeColor: t.color,
    title: `Corso ${t.label === "Certificato" ? "di Sake Sommelier Certificato" : "Introduttivo al Sake"} — ${month} ${year}, ${city}`,
    shortTitle: type === "certificato" ? "Sake Sommelier Certificato" : type === "introduttivo" ? "Introduttivo al Sake" : t.label,
    city,
    mode: mode || (city === "Online" ? "online" : "presenza"),
    month,
    year,
    day,
    days: resolvedDays,
    educator,
    capacity,
    enrolled,
    minStudents: minStud,
    price,
    revenue: Math.round(revenue),
    costs,
    totalCost,
    margin: Math.round(margin),
    status,
    statusLabel: STATUS_META[status].label,
    statusTone: STATUS_META[status].tone,
    lifecycle: lifecycle || "pubblicato",
    students: makeStudents(handle, capacity, enrolled),
    program: makeProgram(handle, resolvedDays),
    whatsappLink: `https://chat.whatsapp.com/SSAGroup${id}`,
    shareLink: `https://corsi.sakesommelierassociation.it/share/${id}abc123`,
    enrolUrl: `https://www.sakesommelierassociation.it/products/${handle}`,
    notebook,
    examResults: examResults || undefined,
  };
}

function buildCourses(): Course[] {
  return [
    // Active courses (futuri, prossimi mesi)
    buildCourse({ id: "c01", type: "certificato", city: "Milano", month: "Maggio", year: 2026, day: 11, days: 3, educatorId: "e1", capacity: 20, enrolled: 18, status: "in-traiettoria" }),
    buildCourse({ id: "c02", type: "introduttivo", city: "Firenze", month: "Maggio", year: 2026, day: 18, educatorId: "e3", capacity: 20, enrolled: 0, status: "critico" }),
    buildCourse({ id: "c03", type: "introduttivo", city: "Pescara", month: "Maggio", year: 2026, day: 22, educatorId: "e8", capacity: 20, enrolled: 2, status: "rischio" }),
    buildCourse({ id: "c04", type: "introduttivo", city: "Online", month: "Maggio", year: 2026, day: 25, educatorId: "e5", capacity: 50, enrolled: 14, status: "in-traiettoria", mode: "online" }),
    buildCourse({ id: "c05", type: "introduttivo", city: "Piacenza", month: "Maggio", year: 2026, day: 28, educatorId: "e4", capacity: 20, enrolled: 12, status: "in-traiettoria" }),
    buildCourse({ id: "c06", type: "introduttivo", city: "Torino", month: "Giugno", year: 2026, day: 4, educatorId: "e6", capacity: 20, enrolled: 6, status: "monitor" }),
    buildCourse({ id: "c07", type: "certificato", city: "Roma", month: "Giugno", year: 2026, day: 12, days: 3, educatorId: "e2", capacity: 20, enrolled: 8, status: "monitor" }),
    buildCourse({ id: "c08", type: "certificato", city: "Vercelli", month: "Giugno", year: 2026, day: 19, days: 3, educatorId: "e7", capacity: 20, enrolled: 3, status: "rischio" }),
    buildCourse({ id: "c09", type: "introduttivo", city: "Online", month: "Luglio", year: 2026, day: 9, educatorId: "e5", capacity: 50, enrolled: 4, status: "monitor", mode: "online" }),
    buildCourse({ id: "c10", type: "introduttivo", city: "Genova", month: "Settembre", year: 2026, day: 14, educatorId: "e3", capacity: 20, enrolled: 0, status: "rischio" }),
    buildCourse({ id: "c11", type: "introduttivo", city: "Udine", month: "Ottobre", year: 2026, day: 6, educatorId: "e9", capacity: 20, enrolled: 0, status: "monitor" }),
    buildCourse({ id: "c12", type: "introduttivo", city: "Bari", month: "Ottobre", year: 2026, day: 20, educatorId: "e10", capacity: 20, enrolled: 0, status: "monitor" }),
    buildCourse({ id: "c13", type: "shochu", city: "Roma", month: "Settembre", year: 2026, day: 25, days: 2, educatorId: "e2", capacity: 18, enrolled: 5, status: "monitor" }),
    // Bozze
    buildCourse({ id: "b01", type: "masterclass", city: "Milano", month: "Novembre", year: 2026, day: 7, days: 1, educatorId: "e1", capacity: 16, enrolled: 0, status: "monitor", lifecycle: "bozza" }),
    buildCourse({ id: "b02", type: "mixology", city: "Milano", month: "Novembre", year: 2026, day: 28, days: 1, educatorId: "e6", capacity: 14, enrolled: 0, status: "monitor", lifecycle: "bozza" }),
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
    buildCourse({ id: "p10", type: "introduttivo", city: "Online", month: "Ottobre", year: 2025, day: 19, educatorId: "e5", capacity: 50, enrolled: 41, status: "in-traiettoria", lifecycle: "passato", mode: "online" }),
  ];
}

// ============ Corsisti aggregati ============

function aggregateStudents(courses: Course[]): Corsista[] {
  interface Acc {
    email: string;
    name: string;
    phone: string;
    hasWhatsApp: boolean;
    city: string;
    firstSeen: string;
    courses: CorsistaEnrollment[];
    totalSpent: number;
    historical?: boolean;
  }
  const map = new Map<string, Acc>();
  courses.forEach((c) => {
    c.students.forEach((s) => {
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
          totalSpent: 0,
        });
      }
      const rec = map.get(key) as Acc;
      const examResult: ExamResultStatus | null =
        c.examResults && c.lifecycle === "passato"
          ? seed(key + c.id) % 10 < 7
            ? "passed"
            : seed(key + c.id) % 10 < 9
            ? "retrial"
            : "failed"
          : null;
      rec.courses.push({
        courseId: c.id,
        courseTitle: c.shortTitle,
        courseType: c.type,
        city: c.city,
        month: c.month,
        year: c.year,
        status: c.lifecycle,
        amount: s.amount,
        examResult,
      });
      rec.totalSpent += s.amount;
    });
  });

  // Add historical pre-2024
  const HIST_CITIES = ["Milano", "Roma", "Firenze", "Bologna", "Verona", "Torino"];
  for (let i = 0; i < 80; i++) {
    const f = FIRST[i % FIRST.length];
    const l = LAST[(i * 7) % LAST.length];
    const email = `${f.toLowerCase()}.${l.toLowerCase()}${i}@storico.it`;
    const year = 2016 + (i % 7);
    const result: ExamResultStatus = i % 10 < 7 ? "passed" : i % 10 < 9 ? "retrial" : "failed";
    const repart = i % 13 === 0; // qualche ripartecipante
    const histCourses: CorsistaEnrollment[] = [
      {
        courseId: `h${i}`,
        courseTitle: "Sake Sommelier Certificato",
        courseType: "certificato",
        city: HIST_CITIES[i % HIST_CITIES.length],
        month: ["Gennaio", "Marzo", "Maggio", "Ottobre"][i % 4],
        year,
        status: "passato",
        amount: 490,
        examResult: result,
        historical: true,
      },
    ];
    if (repart) {
      histCourses.push({
        courseId: `h${i}b`,
        courseTitle: "Masterclass Approfondimento",
        courseType: "masterclass",
        city: HIST_CITIES[i % HIST_CITIES.length],
        month: "Settembre",
        year: year + 1,
        status: "passato",
        amount: 280,
        examResult: null,
        historical: true,
      });
    }
    map.set(email, {
      email,
      name: `${f} ${l}`,
      phone: `+39 33${i % 10} ${(i * 13) % 1000}`,
      hasWhatsApp: i % 4 !== 0,
      city: HIST_CITIES[i % HIST_CITIES.length],
      firstSeen: year + "-Marzo",
      historical: true,
      courses: histCourses,
      totalSpent: 490 + (repart ? 280 : 0),
    });
  }

  return Array.from(map.values()).map((s) => ({ ...s, isReturning: s.courses.length > 1 }));
}

// ============ Question bank (exam) ============

const Q_BANK: ExamQuestion[] = [
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
    { l: "Futsushu", r: "nessun minimo" },
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
    { l: "Honjozo caldo", r: "Yakitori invernale" },
  ], points: 2 },
  { id: "q41", cat: "servizio", type: "truefalse", important: true, lang: "it", text: "Il sake si serve sempre caldo nella tradizione giapponese.", options: ["Vero", "Falso"], correct: [1], points: 1 },
];

// ============ Exam attached to courses ============

function buildExam(course: Course): Exam {
  const isShochu = course.type === "shochu";
  const cats: ExamCategory[] = isShochu ? SHOCHU_CATS : NIHONSHU_CATS;
  const totalQ = isShochu ? 80 : 110;
  const sampled: ExamQuestion[] = [];
  for (let i = 0; i < totalQ; i++) {
    const base = Q_BANK[i % Q_BANK.length];
    sampled.push({ ...base, id: `${course.id}-q${i + 1}`, n: i + 1 });
  }
  const totalPoints = sampled.reduce((s, q) => s + (q.points || 1), 0);
  const phases: ExamPhases = {
    mockTest: { id: "mock", label: "Mock test", scheduled: "Giorno 3 · 14:00", duration: 30, status: course.lifecycle === "passato" ? "completed" : "scheduled", n: 30 },
    feedback: { id: "feedback", label: "Feedback sessione", scheduled: "Giorno 3 · 14:45", duration: 15, status: course.lifecycle === "passato" ? "completed" : "scheduled", n: 12 },
    exam: { id: "exam", label: "Esame finale", scheduled: "Settimana +1 · sabato 14:00", duration: 60, status: course.id === "c01" ? "ready" : course.lifecycle === "passato" ? "completed" : "draft", n: totalQ },
  };
  return {
    courseId: course.id,
    family: isShochu ? "shochu" : "nihonshu",
    cats,
    totalQuestions: totalQ,
    totalPoints,
    duration: 60,
    mockDuration: 30,
    feedbackDuration: 15,
    thresholds: { pass: 0.8, retrial: 0.7 },
    questions: sampled,
    phases,
  };
}

function buildResults(course: Course, exam: Exam): ExamResult[] | undefined {
  if (course.lifecycle !== "passato" && course.id !== "c01") return undefined;

  const studs = course.students.slice(0, course.enrolled);
  return studs.map((s) => {
    const k = seed(course.handle + s.email);
    // Score distribution: 60% pass (>80), 25% retrial (70-79), 15% fail (<70)
    const bucket = k % 100;
    let pct: number;
    if (bucket < 60) pct = 80 + (k % 20);
    else if (bucket < 85) pct = 70 + (k % 10);
    else pct = 40 + (k % 30);
    const status: ExamResultStatus = scoreToOutcome(pct);
    const sections: ExamResultSection[] = exam.cats.map((c) => ({
      cat: c.id,
      label: c.label,
      short: c.short,
      pct: Math.max(20, Math.min(100, pct + ((seed(s.email + c.id) % 40) - 20))),
    }));
    const wrongImportant: WrongImportant[] = exam.questions
      .filter((q) => q.important && seed(s.email + q.id) % 100 > pct - 10)
      .slice(0, 3)
      .map((q) => {
        const correct = q.correct;
        const correctIdx = correct && correct.length > 0 ? correct[0] : undefined;
        const wrongAnswer =
          q.type === "single" || q.type === "multi"
            ? q.options?.[seed(s.email + q.id) % (q.options.length || 1)] ?? "—"
            : "—";
        const correctAnswer =
          q.type === "single" || q.type === "multi"
            ? q.options?.[typeof correctIdx === "number" ? correctIdx : 0] ?? "Risposta corretta"
            : (typeof correctIdx === "string" ? correctIdx : "Risposta corretta");
        return {
          questionId: q.id,
          cat: q.cat,
          text: q.text,
          wrongAnswer,
          correctAnswer,
        };
      });
    return {
      email: s.email,
      name: s.name,
      score: Math.round(pct),
      status,
      completedAt: new Date(2026, 2, 14, 15, k % 60).toISOString(),
      durationMin: 35 + (k % 25),
      sections,
      wrongImportant,
    };
  });
}

function buildLiveExam(course: Course): ExamLiveSession[] {
  const studs = course.students.slice(0, course.enrolled);
  return studs.map((s) => {
    const k = seed(course.handle + s.email + "live");
    const bucket = k % 100;
    let status: LiveSessionStatus;
    let progress: number;
    let score: number | null;
    let durationMin: number | null;
    if (bucket < 8) {
      status = "not-started";
      progress = 0;
      score = null;
      durationMin = null;
    } else if (bucket < 25) {
      status = "submitted";
      progress = 100;
      score = 70 + (k % 25);
      durationMin = 35 + (k % 20);
    } else {
      status = "in-progress";
      progress = 20 + (k % 70);
      score = null;
      durationMin = Math.round(progress * 0.5);
    }
    return {
      email: s.email,
      name: s.name,
      status,
      progress,
      score,
      durationMin,
      checkedIn: bucket > 5,
    };
  });
}

// ============ Central exam templates (one per family) ============
// The official question bank: final exam, daily mini-tests and feedback module.
// Mini-test / feedback questions carry no category or importance in the
// prototype; normQ() fills the strict ExamQuestion shape with neutral defaults.

function normQ(q: Partial<ExamQuestion> & { id: string; type: ExamQuestionType; text: string }, cat = ""): ExamQuestion {
  return {
    cat,
    important: false,
    lang: "it",
    points: 0,
    ...q,
  };
}

// Shochu final-exam questions (separate bank).
const SHOCHU_Q: ExamQuestion[] = [
  { id: "s01", cat: "storia-s", type: "single", important: true, lang: "it", text: "In quale isola del Giappone nasce la tradizione dello shochu?", options: ["Hokkaido", "Kyushu", "Shikoku", "Honshu"], correct: [1], points: 1 },
  { id: "s02", cat: "produzione-s", type: "single", important: true, lang: "it", text: "Quale tecnica distingue lo shochu honkaku?", options: ["Distillazione continua", "Distillazione singola (pot still)", "Macerazione a freddo", "Rifermentazione"], correct: [1], points: 1 },
  { id: "s03", cat: "ingredienti", type: "multi", important: true, lang: "it", text: "Quali sono materie prime tipiche dello shochu?", options: ["Imo (patata dolce)", "Mugi (orzo)", "Kome (riso)", "Kokuto (zucchero di canna)", "Uva"], correct: [0, 1, 2, 3], points: 2 },
  { id: "s04", cat: "ingredienti", type: "match", important: true, lang: "it", text: "Abbina il koji al suo colore:", pairs: [
    { l: "Koji bianco", r: "Dolce, morbido" },
    { l: "Koji nero", r: "Ricco, corposo" },
    { l: "Koji giallo", r: "Aromatico, fruttato" },
  ], points: 2 },
  { id: "s05", cat: "degustazione-s", type: "open", important: true, lang: "it", text: "Descrivi le differenze sensoriali tra imo-jochu e mugi-jochu.", points: 3, aiKey: "imo-mugi" },
  { id: "s06", cat: "servizio-s", type: "single", important: false, lang: "it", text: "Cosa indica 'oyuwari' nel servizio dello shochu?", options: ["Con ghiaccio", "Allungato con acqua calda", "Liscio", "Con soda"], correct: [1], points: 1 },
];

const MINI_NIHONSHU: ExamTemplateMiniTest[] = [
  { day: 1, name: "Nihonshu · Day 1 test", topic: "Storia & basi di produzione", duration: 10, questions: [
    normQ({ id: "n1q1", type: "single", text: "Il koji nel sake è prodotto da quale muffa?", options: ["Aspergillus oryzae", "Penicillium", "Botrytis", "Rhizopus"], correct: [0], points: 1 }),
    normQ({ id: "n1q2", type: "truefalse", text: "Il sake è tecnicamente una birra di riso (fermentazione, non distillazione).", options: ["Vero", "Falso"], correct: [0], points: 1 }),
    normQ({ id: "n1q3", type: "single", text: "Cosa misura il seimaibuai?", options: ["Gradazione alcolica", "Rapporto di lucidatura del riso", "Acidità", "Temperatura di servizio"], correct: [1], points: 1 }),
  ] },
  { day: 2, name: "Nihonshu · Day 2 test", topic: "Varietà, stili & degustazione", duration: 10, questions: [
    normQ({ id: "n2q1", type: "single", text: "Un Daiginjo ha un seimaibuai di almeno:", options: ["≤ 70%", "≤ 60%", "≤ 50%", "nessun minimo"], correct: [2], points: 1 }),
    normQ({ id: "n2q2", type: "multi", text: "Quali sono varietà di riso da sake?", options: ["Yamada Nishiki", "Omachi", "Koshihikari", "Gohyakumangoku"], correct: [0, 1, 3], points: 2 }),
    normQ({ id: "n2q3", type: "single", text: "L'umami nel sake è associato a:", options: ["Tannini", "Aminoacidi", "CO₂", "Acido citrico"], correct: [1], points: 1 }),
  ] },
  { day: 3, name: "Nihonshu · Day 3 test", topic: "Servizio & pairing", duration: 10, questions: [
    normQ({ id: "n3q1", type: "single", text: "A che temperatura si serve in genere un Junmai Ginjo?", options: ["3-5°C", "8-12°C", "15-18°C", "40°C+"], correct: [1], points: 1 }),
    normQ({ id: "n3q2", type: "truefalse", text: "Tutti i sake vanno serviti caldi.", options: ["Vero", "Falso"], correct: [1], points: 1 }),
    normQ({ id: "n3q3", type: "match", text: "Abbina sake e piatto:", pairs: [{ l: "Daiginjo fresco", r: "Sashimi" }, { l: "Honjozo caldo", r: "Yakitori" }], points: 2 }),
  ] },
];
const MINI_SHOCHU: ExamTemplateMiniTest[] = [
  { day: 1, name: "Shochu · Day 1 test", topic: "Storia & distillazione", duration: 10, questions: [
    normQ({ id: "sh1q1", type: "single", text: "Lo shochu honkaku usa quale distillazione?", options: ["Continua", "Singola (pot still)", "Sottovuoto doppia", "Nessuna"], correct: [1], points: 1 }),
    normQ({ id: "sh1q2", type: "truefalse", text: "Lo shochu è un distillato.", options: ["Vero", "Falso"], correct: [0], points: 1 }),
    normQ({ id: "sh1q3", type: "single", text: "Regione d'origine dello shochu:", options: ["Kyushu", "Hokkaido", "Kansai", "Tohoku"], correct: [0], points: 1 }),
  ] },
  { day: 2, name: "Shochu · Day 2 test", topic: "Ingredienti, degustazione & servizio", duration: 10, questions: [
    normQ({ id: "sh2q1", type: "multi", text: "Materie prime tipiche:", options: ["Imo", "Mugi", "Kome", "Uva"], correct: [0, 1, 2], points: 2 }),
    normQ({ id: "sh2q2", type: "single", text: "'Oyuwari' significa servire:", options: ["Liscio", "Con acqua calda", "Con ghiaccio", "Con soda"], correct: [1], points: 1 }),
    normQ({ id: "sh2q3", type: "single", text: "Il koji nero conferisce un profilo:", options: ["Leggero e dolce", "Ricco e corposo", "Acido", "Neutro"], correct: [1], points: 1 }),
  ] },
];

const FEEDBACK_NIHONSHU: ExamTemplateFeedback = {
  name: "Feedback Nihonshu",
  questions: [
    normQ({ id: "fn1", type: "rating", text: "Valuta il corso nel complesso (1-5)" }),
    normQ({ id: "fn2", type: "rating", text: "Valuta l'educator (1-5)" }),
    normQ({ id: "fn3", type: "single", text: "Quale capitolo è stato più difficile?", options: ["Storia", "Produzione", "Varietà", "Degustazione", "Servizio"] }),
    normQ({ id: "fn4", type: "open", text: "Il programma sake era bilanciato? Cosa cambieresti?" }),
    normQ({ id: "fn5", type: "open", text: "Cosa ti è piaciuto di più?" }),
  ],
};
const FEEDBACK_SHOCHU: ExamTemplateFeedback = {
  name: "Feedback Shochu",
  questions: [
    normQ({ id: "fs1", type: "rating", text: "Valuta il corso nel complesso (1-5)" }),
    normQ({ id: "fs2", type: "rating", text: "Valuta l'educator (1-5)" }),
    normQ({ id: "fs3", type: "single", text: "Argomento più interessante?", options: ["Storia", "Distillazione", "Ingredienti & koji", "Degustazione", "Servizio & cocktail"] }),
    normQ({ id: "fs4", type: "open", text: "Cosa miglioreresti del corso shochu?" }),
  ],
};

const EXAM_TEMPLATES: Record<ExamFamily, ExamTemplate> = {
  nihonshu: {
    family: "nihonshu",
    label: "Nihonshu · Certificato",
    finalExam: { name: "Esame finale Nihonshu", cats: NIHONSHU_CATS, questions: Q_BANK, totalQuestions: 110, duration: 60, thresholds: { pass: 0.8, retrial: 0.7 } },
    miniTests: MINI_NIHONSHU,
    feedback: FEEDBACK_NIHONSHU,
  },
  shochu: {
    family: "shochu",
    label: "Shochu",
    finalExam: { name: "Esame finale Shochu", cats: SHOCHU_CATS, questions: SHOCHU_Q, totalQuestions: 80, duration: 50, thresholds: { pass: 0.8, retrial: 0.7 } },
    miniTests: MINI_SHOCHU,
    feedback: FEEDBACK_SHOCHU,
  },
};

// ============ Per-course exam meta ============

const MONTHS = MONTH_NAMES_IT;
const DOW = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

function familyOf(course: Course): ExamFamily {
  return course.type === "shochu" ? "shochu" : "nihonshu";
}

function buildExamMeta(course: Course): ExamMeta {
  const fam = familyOf(course);
  const tpl = EXAM_TEMPLATES[fam];
  const mIdx = MONTHS.indexOf(course.month);
  const days = course.days || (fam === "shochu" ? 2 : 3);
  const examDate = new Date(course.year, mIdx, course.day + days + 7);
  const examDateLabel = `${DOW[examDate.getDay()]} ${examDate.getDate()} ${MONTHS[examDate.getMonth()].slice(0, 3)} ${examDate.getFullYear()}`;
  const examDayNo = days + 8;
  const done = course.lifecycle === "passato";
  const live = course.id === "c01";
  const miniTests: MiniTestMeta[] = Array.from({ length: days }, (_, i) => {
    const d = i + 1;
    const tplDay = tpl.miniTests[i] || tpl.miniTests[tpl.miniTests.length - 1];
    const k = seed(course.handle + "mini" + d);
    return {
      day: d,
      name: tplDay?.name || `${tpl.label} · Day ${d} test`,
      topic: tplDay?.topic || "",
      nQuestions: tplDay?.questions.length || 3,
      status: done ? "completato" : live && d <= Math.ceil(days / 2) ? "completato" : "pianificato",
      avgScore: done || (live && d <= Math.ceil(days / 2)) ? 70 + (k % 26) : null,
      completion: done ? 100 : live && d <= Math.ceil(days / 2) ? 100 : 0,
    };
  });
  const feedback: ExamFeedbackMeta = {
    name: tpl.feedback.name,
    total: course.enrolled,
    sent: done,
    responses: done ? Math.max(0, course.enrolled - (seed(course.handle + "fb") % 4)) : 0,
    status: done ? "inviato" : "pronto",
  };
  return { family: fam, familyLabel: tpl.label, examDate: examDate.toISOString(), examDateLabel, examDayNo, done, live, miniTests, feedback };
}

function attachExams(courses: Course[]): void {
  courses.forEach((c) => {
    if (c.type !== "certificato" && c.type !== "shochu") return;
    const exam = buildExam(c);
    c.exam = exam;
    c.examResults2 = buildResults(c, exam);
    c.examLive = c.id === "c01" ? buildLiveExam(c) : undefined;
    c.examMeta = buildExamMeta(c);
  });
}

// ============ Material templates ============

function buildMaterialTemplates(): MaterialTemplate[] {
  const dayNames = ["Fondamenti & assaggi guidati", "Produzione & pairing", "Approfondimento & masterclass", "Regioni & stili", "Degustazione finale"];
  const mk = (
    i: number,
    name: string,
    type: CourseTypeKey,
    dayCount: number,
    perDay: number,
    description: string,
    materialiPartial: Partial<MaterialCosts>,
    lastUsed: string,
    uses: number,
    createdBy: string
  ): MaterialTemplate => {
    const materiali: MaterialCosts = { ...defaultMaterialCosts(type), ...materialiPartial };
    const days: MaterialDay[] = [];
    for (let d = 1; d <= dayCount; d++) {
      const sakes: Sake[] = [];
      for (let j = 0; j < perDay; j++) {
        const k = seed(name + d + j + i);
        sakes.push({
          code: `SAK${(k % 900) + 100}`,
          name: SAKE_NAMES[k % SAKE_NAMES.length],
          type: SAKE_TYPES[k % SAKE_TYPES.length],
          sakagura: SAKE_SAKAGURA[k % SAKE_SAKAGURA.length],
          size: pick([300, 720, 1800], name + d + j),
          cost: 25 + (k % 70),
          qty: 1 + (k % 3),
          note: "",
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
        { id: "x-logistica", label: "Logistica & allestimento", value: 150, per: "corso" },
      ] }, "12 Mar 2026", 8, "Lorenzo F."),
    mk(2, "Certificato premium · Milano", "certificato", 3, 7,
      "Versione con etichette premium per location top tier.",
      { educatorPerDay: 250, diplomaPerStudent: 115, libroPerStudent: 12, extra: [
        { id: "x-calici", label: "Calici premium ISO", value: 12, per: "iscritto" },
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
      { educatorPerDay: 220, diplomaPerStudent: 90, libroPerStudent: 10 }, "5 Dic 2025", 2, "Sara Manager"),
  ];
}

// ============ Users ============

const USERS: User[] = [
  { id: "lorenzo", first: "Lorenzo", last: "Ferraboschi", name: "Lorenzo Ferraboschi", role: "Fondatore · Admin SSA", roleKey: "admin", email: "lorenzo@sakesommelier.it", phone: "+39 348 220 1180", city: "Milano", position: "Founder & Senior Educator", initials: "LF", tone: "navy" },
  { id: "camilla", first: "Camilla", last: "Bonnannini", name: "Camilla Bonnannini", role: "Resp. SSA Italiana", roleKey: "manager", email: "camilla@sakesommelier.it", phone: "+39 333 905 4471", city: "Roma", position: "Responsabile SSA Italiana", initials: "CB", tone: "oro" },
];

// ============ Public entry point ============

export function buildSeed(): SeedData {
  const courses = buildCourses();
  const corsisti = aggregateStudents(courses);
  attachExams(courses);
  return {
    courses,
    corsisti,
    educators: EDUCATORS,
    materialTemplates: buildMaterialTemplates(),
    examTemplates: [EXAM_TEMPLATES.nihonshu, EXAM_TEMPLATES.shochu],
    users: USERS,
  };
}

/**
 * Empty seed — every collection is `[]`. Used when `USE_SEED=false` and no
 * real backend is configured: the app runs against the in-memory DataSource
 * but with zero fake data, so every list / KPI shows the genuine empty state.
 */
export function buildEmptySeed(): SeedData {
  return {
    courses: [],
    corsisti: [],
    educators: [],
    materialTemplates: [],
    examTemplates: [],
    users: [],
  };
}
