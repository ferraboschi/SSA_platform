// Domain constants — ported verbatim from the prototype (data.js, data-exam.js,
// app-state.js). These are the canonical lookup tables; do not redefine elsewhere.

import type {
  CourseStatus,
  CourseTypeColor,
  CourseTypeKey,
  RoleKey,
  StatusTone,
} from "./enums";
import type { MaterialCosts } from "./types";

export interface CourseTypeMeta {
  label: string;
  short: string;
  color: CourseTypeColor;
  minStud: number;
  price: number;
}

export const COURSE_TYPES: Record<CourseTypeKey, CourseTypeMeta> = {
  certificato: { label: "Certificato", short: "CERT", color: "azzurro", minStud: 6, price: 590 },
  introduttivo: { label: "Introduttivo", short: "INTRO", color: "oro", minStud: 6, price: 150 },
  masterclass: { label: "Masterclass", short: "MASTER", color: "neutral", minStud: 4, price: 280 },
  shochu: { label: "Shochu", short: "SHOCHU", color: "azzurro", minStud: 6, price: 380 },
  mixology: { label: "Mixology", short: "MIX", color: "oro", minStud: 5, price: 260 },
};

// Compact labels for dense lists (sidebar, badges).
export const COURSE_TYPE_SHORT_LABEL: Record<CourseTypeKey, string> = {
  certificato: "Cert.",
  introduttivo: "Intro.",
  shochu: "Shochu",
  masterclass: "Master.",
  mixology: "Mix.",
};

// Course types that culminate in a final exam.
export const EXAM_COURSE_TYPES: CourseTypeKey[] = ["certificato", "shochu"];

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

export const STATUS_META: Record<CourseStatus, StatusMeta> = {
  "in-traiettoria": { label: "In traiettoria", tone: "good" },
  monitor: { label: "Da monitorare", tone: "neutral" },
  rischio: { label: "A rischio", tone: "warn" },
  critico: { label: "Critico", tone: "bad" },
};

export interface ExamCategory {
  id: string;
  label: string;
  short: string;
}

export const NIHONSHU_CATS: ExamCategory[] = [
  { id: "storia", label: "Storia & Cultura", short: "Storia" },
  { id: "produzione", label: "Produzione & Tecnica", short: "Produzione" },
  { id: "varieta", label: "Varietà & Stili", short: "Varietà" },
  { id: "degustazione", label: "Degustazione & Sensoriale", short: "Degustazione" },
  { id: "servizio", label: "Servizio & Pairing", short: "Servizio" },
];

export const SHOCHU_CATS: ExamCategory[] = [
  { id: "storia-s", label: "Storia & Tradizione", short: "Storia" },
  { id: "produzione-s", label: "Produzione & Distillazione", short: "Produzione" },
  { id: "ingredienti", label: "Ingredienti & Koji", short: "Ingredienti" },
  { id: "degustazione-s", label: "Degustazione", short: "Degustazione" },
  { id: "servizio-s", label: "Servizio & Cocktail", short: "Servizio" },
];

// Exam pass/retrial thresholds (fraction of total points).
export const EXAM_THRESHOLDS = { pass: 0.8, retrial: 0.7 } as const;

// Operational dashboard thresholds.
export interface DashThresholds {
  shipDays: number;
  bookMin: number;
  sakeExamPct: number;
}

export const DEFAULT_THRESHOLDS: DashThresholds = {
  shipDays: 5,
  bookMin: 30,
  sakeExamPct: 70,
};

// Fixed cost rates (euros). Educator + gestione are per day; diplomi + libri are
// per student and depend on the course type. Everything else is "da imputare".
export const COST_RATES = {
  educatorPerDay: 200,
  gestionePerDay: 300,
  diploma: { certificato: 115, introduttivo: 60, default: 115 },
  libro: { certificato: 9, introduttivo: 8, default: 9 },
} as const;

/** Sensible default material costs for a template of the given course type. */
export function defaultMaterialCosts(type: CourseTypeKey): MaterialCosts {
  const diploma =
    COST_RATES.diploma[type as "certificato" | "introduttivo"] ??
    COST_RATES.diploma.default;
  const libro =
    COST_RATES.libro[type as "certificato" | "introduttivo"] ??
    COST_RATES.libro.default;
  return {
    educatorPerDay: COST_RATES.educatorPerDay,
    gestionePerDay: COST_RATES.gestionePerDay,
    diplomaPerStudent: diploma,
    libroPerStudent: libro,
    location: 0,
    foodPairing: 0,
    cocktailFee: 0,
    accommodation: 0,
    transport: 0,
    adv: 0,
    extra: [],
  };
}

// Operator-defined low-stock watch: link one or more Sake Company SKUs and get a
// dashboard alert when live stock drops below `min`. Persisted in settings_kv.
export interface StockAlert {
  id: string;
  /** Friendly label (optional; defaults to the first product name). */
  label: string;
  /** Watched Sake Company SKUs. */
  skus: string[];
  /** Alert fires when any linked SKU's stock is below this. */
  min: number;
}

// Default educator qualifications (course types an educator may teach).
// Founder (e1) qualified for everything; e2 explicitly NOT shochu.
export const DEFAULT_QUALS: Record<string, CourseTypeKey[]> = {
  e1: ["certificato", "introduttivo", "masterclass", "shochu", "mixology"],
  e2: ["certificato", "introduttivo", "masterclass"],
  e3: ["introduttivo", "masterclass"],
  e4: ["introduttivo", "certificato", "shochu"],
  e5: ["introduttivo"],
  e6: ["introduttivo", "mixology"],
  e7: ["introduttivo", "certificato"],
  e8: ["introduttivo"],
  e9: ["introduttivo"],
  e10: ["introduttivo"],
};

export const FALLBACK_QUALS: CourseTypeKey[] = ["introduttivo"];

// Cities the association operates in. "Online" is a non-physical delivery
// channel kept in the list for course assignment but excluded from geographic
// coverage KPIs (see HUB_CITIES / NON_CITIES in lib/pianificatore).
export const CITIES = [
  "Milano",
  "Roma",
  "Firenze",
  "Torino",
  "Piacenza",
  "Vercelli",
  "Bari",
  "Pescara",
  "Udine",
  "Genova",
  "Bolzano",
  "Napoli",
  "Verona",
  "Online",
] as const;

export interface RoleMeta {
  key: RoleKey;
  label: string;
}

export const ROLE_META: Record<RoleKey, RoleMeta> = {
  admin: { key: "admin", label: "Admin" },
  manager: { key: "manager", label: "Manager SSA" },
  social: { key: "social", label: "Social & Campagne" },
  accountant: { key: "accountant", label: "Contabilità" },
};
