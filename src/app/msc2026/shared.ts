// Shared data, tokens and helpers for the MSC2026 medagliere.
// Pure module (no "use client", no JSX) so both server and client components can import it.
import winnersData from "@/lib/msc2026-data.json";
import reportsData from "@/lib/msc2026-reports.json";

// ─── Types ─────────────────────────────────────────────────────────────────
export type MedalKey =
  | "platinum"
  | "double_gold"
  | "gold"
  | "silver"
  | "best_design"
  | "good_design"
  | "magnifica"
  | "best_with"
  | "good_with";
export type SessionKey = "nihonshu" | "shochu" | "pairing" | "design";
export type LangKey = "it" | "en" | "ja";
export type RegionKey =
  | "hokkaido_tohoku"
  | "kanto"
  | "chubu_hokuriku"
  | "kinki"
  | "chugoku_shikoku"
  | "kyushu_okinawa"
  | "altro";

export interface Winner {
  session: SessionKey;
  category: string;
  cat_code: string;
  medal: MedalKey;
  magnifica_tasting?: boolean;
  reg_id: string;
  number?: number;
  name: string;
  company_en: string;
  company_jp?: string;
  prefecture?: string;
  region?: string;
  country?: string;
  polishing_rate?: number | string;
  smv?: number | string;
  alcohol?: number | string;
  price?: number | string;
  currency?: string;
  product_type?: string;
  bubble?: string;
  shochu_type?: string;
  distillation?: string;
  years_aging?: number | string;
  brewery_website?: string;
  brewery_founded?: number | string;
  koji?: string[];
  koji_rice?: string[];
  rice?: string[];
  yeast?: string[];
  aroma?: string[];
  taste?: string[];
  finishing?: string[];
  product_id?: string;
}

export const ALL = winnersData as unknown as Winner[];
export const VISIBLE = ALL.filter((w) => w.medal !== "magnifica"); // Magnifica embargoed until Sept

// ─── Consolidated product records (medals + grounded reports, from real votes) ──
export interface MedalRef { session: SessionKey; category: string; medal: MedalKey; cat_code: string; reg_id: string }
export interface RadarAxis { key: string; v: number; avg: number }
export interface SessionReport {
  clarity?: string; color?: string; distillation?: string;
  profile?: { k: string; v: string }[];
  aromas?: string[]; palate?: string[]; texture?: string[]; pairing_top?: string[];
  messages?: string[]; channels?: string[]; price?: string;
  harmony?: string; role?: string; descriptor?: string; context?: string; other?: string[];
  comments?: string[];
  radar?: RadarAxis[];
}

export const RADAR_LABELS: Record<string, Record<LangKey, string>> = {
  identita: { it: "Identità giapponese", en: "Japanese Identity", ja: "日本らしさ" },
  originalita: { it: "Originalità", en: "Originality", ja: "独創性" },
  coerenza: { it: "Coerenza", en: "Coherence", ja: "一貫性" },
  appeal: { it: "Appeal europeo", en: "European Appeal", ja: "欧州での魅力" },
  impatto: { it: "Impatto visivo", en: "Visual Impact", ja: "視覚的インパクト" },
  primaimpressione: { it: "Prima impressione", en: "First Impression", ja: "第一印象" },
  leggibilita: { it: "Leggibilità", en: "Readability", ja: "可読性" },
  comunicazione: { it: "Comunicazione", en: "Communication", ja: "コミュニケーション" },
  dolcezza: { it: "Dolcezza", en: "Sweetness", ja: "甘み" },
  acidita: { it: "Acidità", en: "Acidity", ja: "酸味" },
  umami: { it: "Umami", en: "Umami", ja: "旨味" },
  alcol: { it: "Alcol", en: "Alcohol", ja: "アルコール" },
  corpo: { it: "Corpo", en: "Body", ja: "ボディ" },
  persistenza: { it: "Persistenza", en: "Length", ja: "余韻" },
  equilibrio: { it: "Equilibrio", en: "Balance", ja: "バランス" },
  // food pairing
  armonia: { it: "Armonia", en: "Harmony", ja: "調和" },
  primoassaggio: { it: "Primo assaggio", en: "First taste", ja: "第一印象" },
  evoluzione: { it: "Evoluzione", en: "Evolution", ja: "余韻の変化" },
  pulizia: { it: "Pulizia palato", en: "Palate cleansing", ja: "口中の浄化" },
  match: { it: "Match strutturale", en: "Structural match", ja: "構造の一致" },
  perscomb: { it: "Persistenza", en: "Combined length", ja: "複合的余韻" },
  complessita: { it: "Complessità", en: "Complexity", ja: "複雑さ" },
  perscompl: { it: "Pers. e complessità", en: "Length & complexity", ja: "余韻と複雑さ" },
};
export interface ProductRecord {
  medals: MedalRef[];
  reports: Partial<Record<SessionKey, SessionReport>>;
  website?: string | null;
  description_jp?: string | null;
  social?: { type?: string; url?: string }[];
  slug?: string;
  company_slug?: string;
}
const REPORTS = reportsData as unknown as Record<string, ProductRecord>;
const BY_REGID: Record<string, Winner> = {};
const REGID_TO_PROD: Record<string, string> = {};
for (const w of ALL) {
  BY_REGID[w.reg_id] = w;
  if (w.product_id) REGID_TO_PROD[w.reg_id] = w.product_id;
}
export function winnerByRegId(reg_id: string): Winner | undefined {
  return BY_REGID[reg_id];
}
export function productByRegId(reg_id: string): ProductRecord | null {
  const pid = REGID_TO_PROD[reg_id];
  return pid ? REPORTS[pid] ?? null : null;
}

// ─── Compify design tokens ───────────────────────────────────────────────────
export const C = {
  ink: "#101828",
  sub: "#667085",
  micro: "#8a93a3",
  bg: "#f6f7f9",
  card: "#ffffff",
  border: "#e9ebef",
  border2: "#eef0f3",
  indigo: "#4f46e5",
  indigoDark: "#312e81",
  indigoBg: "#eef2ff",
  green: "#16a34a",
  orange: "#f59e0b",
  shadow: "0 1px 2px rgba(16,24,40,0.04)",
  shadowMd: "0 4px 16px rgba(16,24,40,0.08)",
  font: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// ─── Domain metadata (validated against the dataset) ─────────────────────────
export const SESSION_ORDER: SessionKey[] = ["nihonshu", "shochu", "design", "pairing"];
export const MEDAL_ORDER: MedalKey[] = ["platinum", "double_gold", "gold", "silver", "best_design", "good_design", "best_with", "good_with"];
export const REGION_KEYS: RegionKey[] = ["hokkaido_tohoku", "kanto", "chubu_hokuriku", "kinki", "chugoku_shikoku", "kyushu_okinawa", "altro"];
// Individual prefectures present in the data (for the autocomplete filter), alphabetical
export const PREFECTURES: string[] = Array.from(
  new Set(VISIBLE.map((w) => w.prefecture).filter(Boolean) as string[])
).sort((a, b) => a.localeCompare(b));

// Categories per session (the category filter is contextual to the selected session)
export const CATEGORIES_BY_SESSION: Record<SessionKey, string[]> = (() => {
  const m = new Map<SessionKey, Set<string>>();
  for (const w of VISIBLE) {
    if (!m.has(w.session)) m.set(w.session, new Set());
    m.get(w.session)!.add(w.category);
  }
  const out = {} as Record<SessionKey, string[]>;
  for (const s of ["nihonshu", "shochu", "design", "pairing"] as SessionKey[]) {
    out[s] = Array.from(m.get(s) ?? []).sort((a, b) => a.localeCompare(b));
  }
  return out;
})();

// Flat union of every category across all sessions (the list filter no longer scopes by session).
export const ALL_CATEGORIES: string[] = Array.from(
  new Set(VISIBLE.map((w) => w.category).filter(Boolean) as string[])
).sort((a, b) => a.localeCompare(b));

// Categories grouped by their type, with a separator between Nihonshu, Shochu and pairing foods.
// Design reuses nihonshu+shochu styles, so it adds no new group; dedupe keeps each category once.
export const CATEGORY_GROUPS: { key: SessionKey; cats: string[] }[] = (() => {
  // Client-specified display order for Nihonshu (categories not listed — e.g. Liqueur — fall to the end, alphabetical).
  const NIHONSHU_ORDER = [
    "Junmai Daiginjo (<35%)", "Junmai Daiginjo (≥35%)", "Daiginjo", "Junmai Ginjo", "Ginjo", "Junmai",
    "Honjozo", "Futsushu", "Koshu", "Nigori", "Sparkling", "Special Methods", "Umeshu", "Yuzushu",
  ];
  const byOrder = (order: string[]) => (a: string, b: string) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  };
  const seen = new Set<string>();
  const groups: { key: SessionKey; cats: string[] }[] = [];
  for (const key of ["nihonshu", "shochu", "pairing"] as SessionKey[]) {
    let cats = (CATEGORIES_BY_SESSION[key] ?? []).filter((c) => !seen.has(c));
    if (key === "nihonshu") cats = cats.slice().sort(byOrder(NIHONSHU_ORDER));
    cats.forEach((c) => seen.add(c));
    if (cats.length) groups.push({ key, cats });
  }
  const leftover = ALL_CATEGORIES.filter((c) => !seen.has(c)); // safety: any design-only category
  if (leftover.length) groups.push({ key: "design", cats: leftover });
  return groups;
})();

// Free-search entities for the autocomplete tag field (sakagura names, product names, prefectures/"regions").
export type SearchTag = { type: "sakagura" | "product" | "region"; value: string };
export const SEARCH_ENTITIES: SearchTag[] = (() => {
  const saka = new Set<string>(), prod = new Set<string>();
  for (const w of VISIBLE) { if (w.company_en) saka.add(w.company_en); if (w.name) prod.add(w.name); }
  const out: SearchTag[] = [];
  Array.from(saka).sort((a, b) => a.localeCompare(b)).forEach((v) => out.push({ type: "sakagura", value: v }));
  Array.from(prod).sort((a, b) => a.localeCompare(b)).forEach((v) => out.push({ type: "product", value: v }));
  PREFECTURES.forEach((v) => out.push({ type: "region", value: v }));
  return out;
})();
export const SEARCH_KEYS = new Set(SEARCH_ENTITIES.map((e) => `${e.type} ${e.value}`));

// Reverse lookup: which type (group key) a category belongs to — used to restore the type tab from a `?cat=` URL.
export const CATEGORY_TYPE_OF: Record<string, SessionKey> = (() => {
  const m: Record<string, SessionKey> = {};
  for (const g of CATEGORY_GROUPS) for (const c of g.cats) m[c] = g.key;
  return m;
})();

// `band`/`bandText`/`bandBorder` style the tier header — platinum/gold/silver use a multi-stop metallic sheen,
// design/pairing a refined soft gradient. (`chipBg`/`chipText` stay for small chips elsewhere.)
export const MEDAL_META: Record<MedalKey, { it: string; en: string; ja: string; dot: string; chipBg: string; chipText: string; band: string; bandText: string; bandBorder: string }> = {
  platinum: { it: "Platino", en: "Platinum", ja: "プラチナ賞", dot: "#94a3b8", chipBg: "#eef1f6", chipText: "#475569", band: "linear-gradient(135deg,#f6f8fb 0%,#d3dae4 22%,#abb6c5 42%,#f0f3f7 52%,#9ca8b8 64%,#cad2dd 82%,#f3f6f9 100%)", bandText: "#3b4453", bandBorder: "#c4ccd8" },
  double_gold: { it: "Doppio Oro", en: "Double Gold", ja: "ダブルゴールド賞", dot: "#e08a1e", chipBg: "#fff3e0", chipText: "#b45309", band: "linear-gradient(135deg,#fcecac 0%,#e4ba50 24%,#c89324 44%,#fff4cb 53%,#bd8c22 66%,#e2b44e 84%,#f9e6a4 100%)", bandText: "#6b4e12", bandBorder: "#d9b85c" },
  gold: { it: "Oro", en: "Gold", ja: "ゴールド賞", dot: "#d2a02b", chipBg: "#fbf2da", chipText: "#92670f", band: "linear-gradient(135deg,#f8e5a4 0%,#ddaa40 26%,#c0902a 46%,#fef0c1 54%,#b9871f 68%,#deb14a 86%,#f5df98 100%)", bandText: "#6b4e12", bandBorder: "#d5b04b" },
  silver: { it: "Argento", en: "Silver", ja: "シルバー賞", dot: "#9aa3ad", chipBg: "#eef1f4", chipText: "#5b6573", band: "linear-gradient(135deg,#f4f6f9 0%,#d6dbe4 24%,#b6bfcc 44%,#f0f3f7 53%,#aab4c1 66%,#cfd6df 84%,#f2f4f8 100%)", bandText: "#4a525f", bandBorder: "#c9d0db" },
  best_design: { it: "Best Design", en: "Best Design", ja: "ベストデザイン賞", dot: "#3b5fc0", chipBg: "#eef1f6", chipText: "#1e3a8a", band: "linear-gradient(135deg,#eaf0fe 0%,#c6d4f5 50%,#dde7fc 100%)", bandText: "#1e3a8a", bandBorder: "#c5d2ef" },
  good_design: { it: "Good Design", en: "Good Design", ja: "グッドデザイン賞", dot: "#6b8ae0", chipBg: "#f0f4ff", chipText: "#3b5fc0", band: "linear-gradient(135deg,#eef3ff 0%,#d4e0fb 50%,#e6eeff 100%)", bandText: "#3b5fc0", bandBorder: "#d2dff6" },
  magnifica: { it: "Magnifica", en: "Magnifica", ja: "マニフィカ賞", dot: "#be185d", chipBg: "#fdf1f5", chipText: "#9d174d", band: "linear-gradient(135deg,#fdeaf1 0%,#f3c3d7 50%,#fbe0ea 100%)", bandText: "#9d174d", bandBorder: "#f0c6d7" },
  best_with: { it: "Best With", en: "Best With", ja: "ベストウィズ賞", dot: "#14b8a6", chipBg: "#effdf9", chipText: "#0f766e", band: "linear-gradient(135deg,#e3fbf4 0%,#bfeede 50%,#dcf8ef 100%)", bandText: "#0f766e", bandBorder: "#bfe9dd" },
  good_with: { it: "Good With", en: "Good With", ja: "グッドウィズ賞", dot: "#22c55e", chipBg: "#f0fdf4", chipText: "#15803d", band: "linear-gradient(135deg,#e9fbef 0%,#c9eed4 50%,#e1f7e8 100%)", bandText: "#15803d", bandBorder: "#c8e9d1" },
};

export const SESSION_META: Record<SessionKey, { it: string; en: string; ja: string; sub: { it: string; en: string; ja: string }; accent: string }> = {
  nihonshu: { it: "Nihonshu", en: "Nihonshu", ja: "日本酒", sub: { it: "Sake", en: "Sake", ja: "日本酒" }, accent: "#4f46e5" },
  shochu: { it: "Shochu", en: "Shochu", ja: "焼酎", sub: { it: "Shochu", en: "Shochu", ja: "焼酎" }, accent: "#c2740c" },
  design: { it: "Design", en: "Design", ja: "デザイン", sub: { it: "Design", en: "Design", ja: "デザイン" }, accent: "#7c3aed" },
  pairing: { it: "Abbinamento Cibo", en: "Food Pairing", ja: "フードペアリング", sub: { it: "Food Pairing", en: "Food Pairing", ja: "ペアリング" }, accent: "#16a34a" },
};

export const REGION_META: Record<RegionKey, Record<LangKey, string>> = {
  hokkaido_tohoku: { it: "Hokkaido e Tohoku", en: "Hokkaido & Tohoku", ja: "北海道・東北" },
  kanto: { it: "Kanto", en: "Kanto", ja: "関東" },
  chubu_hokuriku: { it: "Chubu e Hokuriku", en: "Chubu & Hokuriku", ja: "中部・北陸" },
  kinki: { it: "Kinki", en: "Kinki", ja: "近畿" },
  chugoku_shikoku: { it: "Chugoku e Shikoku", en: "Chugoku & Shikoku", ja: "中国・四国" },
  kyushu_okinawa: { it: "Kyushu e Okinawa", en: "Kyushu & Okinawa", ja: "九州・沖縄" },
  altro: { it: "Altro / Estero", en: "Other / Foreign", ja: "その他・海外" },
};

export const SHEET_LABELS = {
  product_type: { it: "Tipo prodotto", en: "Product type", ja: "種別" },
  prefecture: { it: "Prefettura", en: "Prefecture", ja: "都道府県" },
  region: { it: "Regione", en: "Region", ja: "地域" },
  polishing_rate: { it: "Raffinazione", en: "Polishing rate", ja: "精米歩合" },
  smv: { it: "Nihonshudo (SMV)", en: "Sake Meter Value", ja: "日本酒度" },
  alcohol: { it: "Alcol", en: "Alcohol", ja: "アルコール度数" },
  price: { it: "Prezzo", en: "Price", ja: "価格" },
  rice: { it: "Varietà di riso", en: "Rice variety", ja: "原料米" },
  yeast: { it: "Lievito", en: "Yeast", ja: "酵母" },
  koji: { it: "Koji", en: "Koji", ja: "麹" },
  brewery_founded: { it: "Anno di fondazione", en: "Founded", ja: "創業年" },
} as const;

export const UI: Record<LangKey, Record<string, string>> = {
  it: {
    kicker: "MILANO SAKE CHALLENGE 2026 · MEDAGLIERE",
    title: "Medagliere",
    congrats: "Le nostre più sentite congratulazioni a tutte le sakagura e a tutti i produttori premiati alla Milano Sake Challenge 2026. Grazie per aver condiviso con noi l'eccellenza del vostro sake e shōchū.",
    searchTagPh: "Cerca sakagura, prodotto o regione…", tagSakagura: "Sakagura", tagProduct: "Prodotto", tagRegion: "Regione",
    portal: "Portale Risultati",
    all: "Tutte", sakagura: "Sakagura", region: "Regione", allRegions: "Tutte le regioni",
    searchPh: "Cerca sakagura o prodotto…", results: "risultati", alpha: "ordine alfabetico",
    share: "Condividi", copied: "Link copiato", techSheet: "Scheda tecnica", website: "Vai al sito",
    noResults: "Nessun prodotto trovato", noResultsSub: "Modifica i filtri e riprova.", clear: "Azzera filtri",
    noScore: "Nessun punteggio mostrato", awarded: "premiati", medalLabel: "Medaglia",
    back: "Torna al medagliere", awardedAt: "Premiato alla Milano Sake Challenge 2026",
    sakaguraLabel: "Sakagura", categoryLabel: "Categoria", sessionLabel: "Sessione",
    otherFromSakagura: "Altri prodotti di questa sakagura", viewSakagura: "Vedi tutti",
    medalsTitle: "Medaglie", reportsTitle: "Rapporti di valutazione",
    aromi: "Aromi", palato: "Palato", texture: "Texture", colore: "Colore", limpidezza: "Limpidezza", distillazione: "Distillazione",
    abbinamento: "Abbinamento consigliato", messaggi: "Messaggi percepiti", canali: "Canali di vendita", prezzoPercepito: "Fascia di prezzo percepita",
    commenti: "Dai commenti dei giudici", altriAbb: "Altri abbinamenti suggeriti",
    reportNote: "Sintesi dalle valutazioni della giuria. Nessun punteggio mostrato.",
    saveForwardTitle: "Conserva e condividi", save: "Salva", download: "Scarica PDF", forward: "Inoltra", saved: "Apertura salvataggio…",
    radarTitle: "Profilo della giuria", legendProduct: "Questo prodotto", legendJury: "Media della giuria", sessionsLabel: "Sessioni",
    prefPh: "Cerca prefettura…", prefAll: "Tutte le prefetture",
    smartA: "Su", smartB: "nessun risultato per", smartC: "ma su", smartD: "ho trovato qualcosa.", smartGoto: "Passa a", smartAll: "tutte le sessioni",
    ctaTitle: "Ti interessa un sake premiato?", ctaSub: "Scrivi al tuo referente Sake Company per informazioni e ordini.",
    ctaContact: "Contatta", ctaRef: "il tuo referente Sake Company", ctaWa: "su WhatsApp",
  },
  en: {
    kicker: "MILANO SAKE CHALLENGE 2026 · MEDAL TABLE",
    title: "Medal Table",
    congrats: "Our warmest congratulations to every sakagura and producer awarded at the Milano Sake Challenge 2026. Thank you for sharing the excellence of your sake and shōchū with us.",
    searchTagPh: "Search sakagura, product, or region…", tagSakagura: "Sakagura", tagProduct: "Product", tagRegion: "Region",
    portal: "Results Portal",
    all: "All", sakagura: "Sakagura", region: "Region", allRegions: "All regions",
    searchPh: "Search sakagura or product…", results: "results", alpha: "alphabetical order",
    share: "Share", copied: "Link copied", techSheet: "Technical sheet", website: "Visit website",
    noResults: "No products found", noResultsSub: "Try adjusting your filters.", clear: "Clear filters",
    noScore: "No scores shown", awarded: "awarded", medalLabel: "Medal",
    back: "Back to medal table", awardedAt: "Awarded at the Milano Sake Challenge 2026",
    sakaguraLabel: "Sakagura", categoryLabel: "Category", sessionLabel: "Session",
    otherFromSakagura: "More from this sakagura", viewSakagura: "View all",
    medalsTitle: "Medals", reportsTitle: "Evaluation reports",
    aromi: "Aromas", palato: "Palate", texture: "Texture", colore: "Colour", limpidezza: "Clarity", distillazione: "Distillation",
    abbinamento: "Recommended pairing", messaggi: "Perceived messages", canali: "Sales channels", prezzoPercepito: "Perceived price range",
    commenti: "From the judges' notes", altriAbb: "Other suggested pairings",
    reportNote: "Synthesised from the jury's evaluations. No scores shown.",
    saveForwardTitle: "Keep & share", save: "Save", download: "Download PDF", forward: "Forward", saved: "Opening save…",
    radarTitle: "Jury profile", legendProduct: "This product", legendJury: "Jury average", sessionsLabel: "Sessions",
    prefPh: "Search prefecture…", prefAll: "All prefectures",
    smartA: "No matches for", smartB: "in", smartC: "— but found results in", smartD: ".", smartGoto: "Switch to", smartAll: "all sessions",
    ctaTitle: "Interested in an award-winning sake?", ctaSub: "Message your Sake Company contact for details and orders.",
    ctaContact: "Contact", ctaRef: "your Sake Company contact", ctaWa: "on WhatsApp",
  },
  ja: {
    kicker: "MILANO SAKE CHALLENGE 2026 · 受賞酒一覧",
    title: "受賞酒一覧",
    congrats: "ミラノ・サケ・チャレンジ2026で受賞されたすべての蔵元・生産者の皆様に、心よりお祝い申し上げます。素晴らしい日本酒・焼酎をお分かちいただき、ありがとうございました。",
    searchTagPh: "蔵元・銘柄・地域を検索…", tagSakagura: "蔵元", tagProduct: "銘柄", tagRegion: "地域",
    portal: "受賞結果ポータル",
    all: "すべて", sakagura: "蔵元", region: "地域", allRegions: "すべての地域",
    searchPh: "蔵元・銘柄を検索…", results: "件", alpha: "五十音順",
    share: "シェア", copied: "リンクをコピーしました", techSheet: "詳細データ", website: "サイトを見る",
    noResults: "該当する受賞酒がありません", noResultsSub: "検索条件を変更してください。", clear: "条件をクリア",
    noScore: "得点は表示されません", awarded: "受賞", medalLabel: "メダル",
    back: "一覧へ戻る", awardedAt: "Milano Sake Challenge 2026 受賞",
    sakaguraLabel: "蔵元", categoryLabel: "部門", sessionLabel: "セッション",
    otherFromSakagura: "この蔵元の他の受賞酒", viewSakagura: "すべて見る",
    medalsTitle: "メダル", reportsTitle: "評価レポート",
    aromi: "香り", palato: "味わい", texture: "テクスチャー", colore: "色", limpidezza: "清澄度", distillazione: "蒸留方法",
    abbinamento: "おすすめのペアリング", messaggi: "伝わるメッセージ", canali: "販売チャネル", prezzoPercepito: "想定価格帯",
    commenti: "審査員のコメントより", altriAbb: "その他のおすすめペアリング",
    reportNote: "審査員の評価をもとに作成。得点は表示されません。",
    saveForwardTitle: "保存・共有", save: "保存", download: "PDFを保存", forward: "転送", saved: "保存を開いています…",
    radarTitle: "審査員プロファイル", legendProduct: "この商品", legendJury: "審査員平均", sessionsLabel: "セッション",
    prefPh: "都道府県を検索…", prefAll: "すべての都道府県",
    smartA: "", smartB: "では", smartC: "の結果はありませんが、", smartD: "で見つかりました。", smartGoto: "に切り替える", smartAll: "すべてのセッション",
    ctaTitle: "受賞酒にご興味がありますか？", ctaSub: "詳細・ご注文は Sake Company の担当者まで。",
    ctaContact: "連絡する：", ctaRef: "Sake Company の担当者", ctaWa: "（WhatsApp）",
  },
};

// ─── Medal artwork resolution (validated) ────────────────────────────────────
export const MEDAL_PLACEHOLDER = "/medals/placeholder.png";
const TASTING_TIER: Record<string, string> = { platinum: "platino", double_gold: "doppio_oro", gold: "oro", silver: "argento" };
const BEST_DESIGN_CODES = new Set(["D", "F", "G", "GG", "H", "J", "JDO", "JDU", "K", "N", "S", "U", "Y", "AG", "AW", "BA", "RI", "SP", "SSH"]);
const PAIRING_ART_CODES = new Set(["PR", "SD", "TA"]);

export function medalImageFor(w: Winner): string {
  const { session, medal, cat_code } = w;
  if (session === "nihonshu" || session === "shochu") {
    const tier = TASTING_TIER[medal];
    if (tier) return `/medals/${session}_${tier}.png`;
  } else if (session === "design") {
    if (medal === "good_design") return "/medals/good_design.png";
    if (medal === "best_design" && BEST_DESIGN_CODES.has(cat_code)) return `/medals/best_design_${cat_code}.png`;
  } else if (session === "pairing") {
    if ((medal === "good_with" || medal === "best_with") && PAIRING_ART_CODES.has(cat_code)) return `/medals/pairing_goodwith_${cat_code}.png`;
  }
  return MEDAL_PLACEHOLDER;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function present(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
export function companyName(w: Winner, lang: LangKey) {
  return lang === "ja" && w.company_jp ? w.company_jp : w.company_en;
}
export function regionKeyOf(w: Winner): RegionKey {
  return w.region && (REGION_KEYS as string[]).includes(w.region) ? (w.region as RegionKey) : "altro";
}
export function fmtPrice(v: number | string) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? `¥${n.toLocaleString("ja-JP")}` : String(v);
}
