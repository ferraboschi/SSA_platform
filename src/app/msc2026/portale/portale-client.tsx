"use client";

// Faithful port of the agency design handoff (design-handoff-msc/.../medagliere.dc.html):
// Compify "Medagliere / Results Portal" for the Milano Sake Challenge 2026 — trilingual (IT/EN/JA),
// 3 medal grades + numeric scores, awards directory, floating filter bar, results list, detail page, toast.
// Uses the design's own 38 sample products (the prototype data); swap `BASE`/`T` for the real DB + app i18n later.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

// Parse the design's computed CSS-string styles into React style objects (camel-cased).
function css(str: string): CSSProperties {
  const o: Record<string, string> = {};
  String(str || "").split(";").forEach((p) => {
    const i = p.indexOf(":");
    if (i < 0) return;
    const k = p.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const v = p.slice(i + 1).trim();
    if (k) o[k] = v;
  });
  return o as CSSProperties;
}

type Lang = "it" | "en" | "ja";
type Medal = "platinum" | "gold" | "silver";
type Session = "nihonshu" | "shochu" | "pairing" | "design";

const META: Record<Medal, { ja: string; en: string; it: string; pillBg: string; pillText: string; dot: string }> = {
  platinum: { ja: "プラチナ", en: "Platinum", it: "Platino", pillBg: "#eef1f6", pillText: "#475569", dot: "#94a3b8" },
  gold: { ja: "ゴールド", en: "Gold", it: "Oro", pillBg: "#fbf2da", pillText: "#92670f", dot: "#d2a02b" },
  silver: { ja: "シルバー", en: "Silver", it: "Argento", pillBg: "#eef1f4", pillText: "#5b6573", dot: "#9aa3ad" },
};
const GRADE: Record<Medal, Record<Lang, string>> = {
  platinum: { ja: "プラチナ賞", en: "Platinum", it: "Platino" },
  gold: { ja: "金賞", en: "Gold", it: "Oro" },
  silver: { ja: "銀賞", en: "Silver", it: "Argento" },
};
const SPECIAL = {
  president: { ja: "プレジデント賞", en: "President Award", it: "Premio Presidente" },
  alliance: { ja: "アリアンス ガストロノミー賞", en: "Alliance Gastronomie", it: "Premio Alliance Gastronomie" },
  jury: { ja: "審査員賞", en: "Jury Award", it: "Premio della Giuria" },
  excellence: { ja: "優秀賞", en: "Excellence Award", it: "Premio Eccellenza" },
  finalists: { ja: "決勝進出", en: "Finalists", it: "Finalisti" },
} as const;
const REGION_ORDER = ["北海道・東北", "関東", "中部・北陸", "近畿", "中国・四国", "九州・沖縄"];
const REGION: Record<string, { en: string; it: string }> = {
  "北海道・東北": { en: "Hokkaido & Tohoku", it: "Hokkaido e Tohoku" },
  "関東": { en: "Kanto", it: "Kanto" },
  "中部・北陸": { en: "Chubu & Hokuriku", it: "Chubu e Hokuriku" },
  "近畿": { en: "Kinki", it: "Kinki" },
  "中国・四国": { en: "Chugoku & Shikoku", it: "Chugoku e Shikoku" },
  "九州・沖縄": { en: "Kyushu & Okinawa", it: "Kyushu e Okinawa" },
};
const CAT_R: Record<string, string> = { "純米大吟醸": "Junmai Daiginjo", "純米吟醸": "Junmai Ginjo", "純米": "Junmai", "吟醸": "Ginjo", "スパークリング": "Sparkling", "芋焼酎": "Imo Shochu", "麦焼酎": "Mugi Shochu", "米焼酎": "Kome Shochu", "ボトルデザイン": "Bottle Design", "ラベルデザイン": "Label Design" };
const PREF_R: Record<string, string> = { "山口県": "Yamaguchi", "山形県": "Yamagata", "福井県": "Fukui", "三重県": "Mie", "愛知県": "Aichi", "秋田県": "Akita", "福島県": "Fukushima", "佐賀県": "Saga", "青森県": "Aomori", "宮城県": "Miyagi", "栃木県": "Tochigi", "群馬県": "Gunma", "新潟県": "Niigata", "広島県": "Hiroshima", "兵庫県": "Hyogo", "高知県": "Kochi", "奈良県": "Nara", "茨城県": "Ibaraki", "京都府": "Kyoto", "鹿児島県": "Kagoshima", "宮崎県": "Miyazaki", "大分県": "Oita", "熊本県": "Kumamoto", "岩手県": "Iwate", "和歌山県": "Wakayama" };
const SESSION_ORDER: Session[] = ["nihonshu", "shochu", "pairing", "design"];
const SESSION: Record<Session, { ja: string; en: string; it: string; short: Record<Lang, string> }> = {
  nihonshu: { ja: "日本酒テイスティング", en: "Tasting Nihonshu", it: "Degustazione Nihonshu", short: { ja: "日本酒", en: "Nihonshu", it: "Nihonshu" } },
  shochu: { ja: "焼酎テイスティング", en: "Tasting Shochu", it: "Degustazione Shochu", short: { ja: "焼酎", en: "Shochu", it: "Shochu" } },
  pairing: { ja: "フードペアリング", en: "Food Pairing", it: "Abbinamento Cibo", short: { ja: "ペアリング", en: "Pairing", it: "Pairing" } },
  design: { ja: "デザイン", en: "Design", it: "Design", short: { ja: "デザイン", en: "Design", it: "Design" } },
};

const T: Record<Lang, Record<string, string>> = {
  it: { portal: "Portale Risultati", breadcrumb: "Milano Sake Challenge 2026 · Risultati", title: "Medagliere", subtitle: "Filtra i prodotti premiati per sessione, categoria e medaglia, apri ogni scheda, inoltra il link o scarica i risultati.", total: "Medaglie Totali", topScore: "Punteggio Top", searchPh: "Cerca prodotto o azienda…", reset: "Azzera filtri", dirTitle: "Sfoglia per premio", dirHint: "Clicca un premio per vedere i prodotti", viewing: "In vista", clear: "Cancella", backDir: "Tutti i premi", allWinners: "Tutti i premiati", bumon: "Categoria", specialAwards: "Premi Speciali", spPresident: "Miglior punteggio assoluto", spAlliance: "Sessione Abbinamento Cibo", spJury: "1° classificato di ogni categoria", spExcellence: "Tutte le medaglie Platino", spFinalists: "Nihonshu in finale", allRegions: "Tutte le regioni", introKicker: "Milano Sake Challenge 2026", introBody: "La principale competizione europea dedicata a sake e shochu giapponesi. Una giuria internazionale ha valutato alla cieca le etichette in gara, assegnando medaglie Platino, Oro e Argento in ogni categoria. Dai migliori nascono i Premi Speciali — Presidente, Giuria e Alliance Gastronomie — premiati alla cerimonia finale.", share: "Inoltra", download: "Scarica", loginToDownload: "Accedi per scaricare", login: "Accedi", connected: "Connesso", logout: "Esci", sortLabel: "Ordina per", sortScore: "Punteggio", sortName: "Nome prodotto", sortBrewery: "Nome azienda", sortSession: "Sessione", sortCategory: "Categoria", allSessions: "Tutte le sessioni", allCats: "Tutte le categorie", resultUnit: "prodotti premiati", scoreCap: "PUNTI", thRank: "Posizione", back: "Torna al medagliere", scoreLabel: "Punteggio finale", notesTitle: "Note di degustazione", imgPlaceholder: "foto bottiglia", barAroma: "Aroma", barTaste: "Gusto", barBalance: "Equilibrio", emptyTitle: "Nessun prodotto trovato", emptySub: "Modifica i filtri e riprova.", footer: "Dati di esempio a scopo dimostrativo. Bevi responsabilmente.", copied: "Link copiato negli appunti", downloaded: "Risultati scaricati", loginFirst: "Accedi per scaricare i risultati", notes: "Profilo elegante e ben definito, con buona persistenza e un finale pulito apprezzato dalla giuria del panel di degustazione." },
  en: { portal: "Results Portal", breadcrumb: "Milano Sake Challenge 2026 · Results", title: "Medal Table", subtitle: "Filter award-winning products by session, category and medal, open each entry, share the link or download the results.", total: "Total Medals", topScore: "Top Score", searchPh: "Search product or company…", reset: "Reset filters", dirTitle: "Browse by award", dirHint: "Click an award to see its products", viewing: "Viewing", clear: "Clear", backDir: "All awards", allWinners: "All winners", bumon: "Division", specialAwards: "Special Awards", spPresident: "Overall top score", spAlliance: "Food Pairing session", spJury: "Winner of each division", spExcellence: "All Platinum medals", spFinalists: "Nihonshu finalists", allRegions: "All regions", introKicker: "Milano Sake Challenge 2026", introBody: "Europe's leading competition for Japanese sake and shochu. An international jury blind-tasted every entry, awarding Platinum, Gold and Silver medals across each division. The very best advance to the Special Awards — President, Jury and Alliance Gastronomie — celebrated at the final ceremony.", share: "Share", download: "Download", loginToDownload: "Sign in to download", login: "Sign in", connected: "Connected", logout: "Sign out", sortLabel: "Sort by", sortScore: "Score", sortName: "Product name", sortBrewery: "Company name", sortSession: "Session", sortCategory: "Category", allSessions: "All sessions", allCats: "All categories", resultUnit: "award-winning products", scoreCap: "SCORE", thRank: "Rank", back: "Back to medal table", scoreLabel: "Final score", notesTitle: "Tasting notes", imgPlaceholder: "bottle shot", barAroma: "Aroma", barTaste: "Taste", barBalance: "Balance", emptyTitle: "No products found", emptySub: "Try adjusting your filters.", footer: "Sample data for demonstration. Please drink responsibly.", copied: "Link copied to clipboard", downloaded: "Results downloaded", loginFirst: "Sign in to download the results", notes: "An elegant, well-defined profile with good length and a clean finish praised by the tasting panel." },
  ja: { portal: "受賞結果ポータル", breadcrumb: "Milano Sake Challenge 2026 · 受賞結果", title: "受賞酒一覧", subtitle: "セッション・部門・メダルで受賞酒を絞り込み、各銘柄を開き、リンクを共有したり結果をダウンロードできます。", total: "総受賞数", topScore: "最高得点", searchPh: "銘柄・蔵元名で検索", reset: "リセット", dirTitle: "受賞カテゴリーから探す", dirHint: "カテゴリーを選ぶと一覧へ移動します", viewing: "表示中", clear: "クリア", backDir: "すべての賞へ", allWinners: "すべての受賞酒", bumon: "部門", specialAwards: "特別賞", spPresident: "総合最高得点", spAlliance: "フードペアリング部門", spJury: "各部門の1位", spExcellence: "プラチナ賞すべて", spFinalists: "決勝進出 日本酒", allRegions: "すべての地域", introKicker: "Milano Sake Challenge 2026", introBody: "日本酒と焼酎を対象とするヨーロッパ最大級のコンペティション。国際審査員によるブラインド審査で、各部門にプラチナ・金・銀のメダルを授与します。その頂点として、プレジデント賞・審査員賞・アリアンス ガストロノミー賞の特別賞が選ばれます。", share: "共有", download: "ダウンロード", loginToDownload: "ログインしてダウンロード", login: "ログイン", connected: "ログイン中", logout: "ログアウト", sortLabel: "並び替え", sortScore: "得点", sortName: "銘柄名", sortBrewery: "蔵元名", sortSession: "セッション", sortCategory: "部門", allSessions: "すべてのセッション", allCats: "すべての部門", resultUnit: "件の受賞酒", scoreCap: "得点", thRank: "順位", back: "一覧に戻る", scoreLabel: "最終得点", notesTitle: "テイスティングノート", imgPlaceholder: "ボトル写真", barAroma: "香り", barTaste: "味わい", barBalance: "バランス", emptyTitle: "該当する受賞酒が見つかりませんでした", emptySub: "検索条件を変更してお試しください", footer: "本データは提案用のサンプルです。20歳未満の飲酒は法律で禁じられています。", copied: "リンクをコピーしました", downloaded: "結果をダウンロードしました", loginFirst: "ログインしてダウンロードしてください", notes: "上品で輪郭のはっきりした味わい。余韻が長く、きれいなフィニッシュが審査員に高く評価されました。" },
};

interface Product { name: string; brewery: string; pref: string; region: string; session: Session; category: string; medal: Medal; score: number; }
const BASE: Product[] = [
  { name: "獺祭 純米大吟醸 磨き二割三分", brewery: "旭酒造", pref: "山口県", region: "中国・四国", session: "nihonshu", category: "純米大吟醸", medal: "platinum", score: 97.4 },
  { name: "十四代 龍泉", brewery: "高木酒造", pref: "山形県", region: "北海道・東北", session: "nihonshu", category: "純米大吟醸", medal: "platinum", score: 97.1 },
  { name: "黒龍 石田屋", brewery: "黒龍酒造", pref: "福井県", region: "中部・北陸", session: "nihonshu", category: "純米大吟醸", medal: "platinum", score: 96.8 },
  { name: "而今 純米大吟醸", brewery: "木屋正酒造", pref: "三重県", region: "中部・北陸", session: "nihonshu", category: "純米大吟醸", medal: "platinum", score: 96.5 },
  { name: "醸し人九平次 別誂", brewery: "萬乗醸造", pref: "愛知県", region: "中部・北陸", session: "nihonshu", category: "純米大吟醸", medal: "gold", score: 95.2 },
  { name: "新政 No.6 X-type", brewery: "新政酒造", pref: "秋田県", region: "北海道・東北", session: "nihonshu", category: "純米", medal: "gold", score: 95.0 },
  { name: "飛露喜 純米吟醸", brewery: "廣木酒造本店", pref: "福島県", region: "北海道・東北", session: "nihonshu", category: "純米吟醸", medal: "gold", score: 94.7 },
  { name: "写楽 純米吟醸", brewery: "宮泉銘醸", pref: "福島県", region: "北海道・東北", session: "nihonshu", category: "純米吟醸", medal: "gold", score: 94.3 },
  { name: "鍋島 純米大吟醸", brewery: "富久千代酒造", pref: "佐賀県", region: "九州・沖縄", session: "nihonshu", category: "純米大吟醸", medal: "gold", score: 94.1 },
  { name: "作 雅乃智 中取り", brewery: "清水清三郎商店", pref: "三重県", region: "中部・北陸", session: "nihonshu", category: "純米大吟醸", medal: "gold", score: 93.8 },
  { name: "上喜元 純米大吟醸 雄町", brewery: "酒田酒造", pref: "山形県", region: "北海道・東北", session: "nihonshu", category: "純米大吟醸", medal: "gold", score: 93.6 },
  { name: "田酒 特別純米", brewery: "西田酒造店", pref: "青森県", region: "北海道・東北", session: "nihonshu", category: "純米", medal: "gold", score: 93.5 },
  { name: "伯楽星 純米吟醸", brewery: "新澤醸造店", pref: "宮城県", region: "北海道・東北", session: "nihonshu", category: "純米吟醸", medal: "gold", score: 93.2 },
  { name: "鳳凰美田 髭判", brewery: "小林酒造", pref: "栃木県", region: "関東", session: "nihonshu", category: "純米大吟醸", medal: "gold", score: 93.0 },
  { name: "久保田 萬寿", brewery: "朝日酒造", pref: "新潟県", region: "中部・北陸", session: "nihonshu", category: "純米大吟醸", medal: "silver", score: 92.4 },
  { name: "八海山 純米吟醸", brewery: "八海醸造", pref: "新潟県", region: "中部・北陸", session: "nihonshu", category: "純米吟醸", medal: "silver", score: 91.9 },
  { name: "出羽桜 桜花吟醸酒", brewery: "出羽桜酒造", pref: "山形県", region: "北海道・東北", session: "nihonshu", category: "吟醸", medal: "silver", score: 91.5 },
  { name: "雨後の月 純米大吟醸", brewery: "相原酒造", pref: "広島県", region: "中国・四国", session: "nihonshu", category: "純米大吟醸", medal: "silver", score: 91.2 },
  { name: "龍力 米のささやき", brewery: "本田商店", pref: "兵庫県", region: "近畿", session: "nihonshu", category: "純米大吟醸", medal: "silver", score: 90.9 },
  { name: "福寿 純米吟醸", brewery: "神戸酒心館", pref: "兵庫県", region: "近畿", session: "nihonshu", category: "純米吟醸", medal: "silver", score: 90.6 },
  { name: "賀茂鶴 大吟醸 特製ゴールド", brewery: "賀茂鶴酒造", pref: "広島県", region: "中国・四国", session: "nihonshu", category: "吟醸", medal: "silver", score: 90.2 },
  { name: "〆張鶴 純", brewery: "宮尾酒造", pref: "新潟県", region: "中部・北陸", session: "nihonshu", category: "純米吟醸", medal: "silver", score: 90.0 },
  { name: "司牡丹 船中八策", brewery: "司牡丹酒造", pref: "高知県", region: "中国・四国", session: "nihonshu", category: "純米", medal: "silver", score: 89.7 },
  { name: "篠峯 純米 うすにごり", brewery: "千代酒造", pref: "奈良県", region: "近畿", session: "nihonshu", category: "純米", medal: "silver", score: 89.4 },
  { name: "結ゆい 純米吟醸 雄町", brewery: "結城酒造", pref: "茨城県", region: "関東", session: "nihonshu", category: "純米吟醸", medal: "silver", score: 89.1 },
  { name: "澪 スパークリング清酒", brewery: "宝酒造", pref: "京都府", region: "近畿", session: "nihonshu", category: "スパークリング", medal: "silver", score: 88.6 },
  { name: "森伊蔵", brewery: "森伊蔵酒造", pref: "鹿児島県", region: "九州・沖縄", session: "shochu", category: "芋焼酎", medal: "platinum", score: 97.0 },
  { name: "富乃宝山", brewery: "西酒造", pref: "鹿児島県", region: "九州・沖縄", session: "shochu", category: "芋焼酎", medal: "gold", score: 94.6 },
  { name: "中々", brewery: "黒木本店", pref: "宮崎県", region: "九州・沖縄", session: "shochu", category: "麦焼酎", medal: "gold", score: 94.0 },
  { name: "三岳", brewery: "三岳酒造", pref: "鹿児島県", region: "九州・沖縄", session: "shochu", category: "芋焼酎", medal: "silver", score: 91.3 },
  { name: "いいちこ スペシャル", brewery: "三和酒類", pref: "大分県", region: "九州・沖縄", session: "shochu", category: "麦焼酎", medal: "silver", score: 90.4 },
  { name: "白岳しろ", brewery: "高橋酒造", pref: "熊本県", region: "九州・沖縄", session: "shochu", category: "米焼酎", medal: "silver", score: 89.5 },
  { name: "awa酒 ブリュット", brewery: "南部美人", pref: "岩手県", region: "北海道・東北", session: "pairing", category: "スパークリング", medal: "gold", score: 93.4 },
  { name: "酔鯨 特別純米", brewery: "酔鯨酒造", pref: "高知県", region: "中国・四国", session: "pairing", category: "純米", medal: "gold", score: 92.6 },
  { name: "紀土 純米酒", brewery: "平和酒造", pref: "和歌山県", region: "近畿", session: "pairing", category: "純米", medal: "silver", score: 90.1 },
  { name: "No.6 R-type", brewery: "新政酒造", pref: "秋田県", region: "北海道・東北", session: "design", category: "ボトルデザイン", medal: "platinum", score: 95.9 },
  { name: "産土 2023", brewery: "花の香酒造", pref: "熊本県", region: "九州・沖縄", session: "design", category: "ラベルデザイン", medal: "gold", score: 93.7 },
  { name: "仙禽 オーガニックナチュール", brewery: "せんきん", pref: "栃木県", region: "関東", session: "design", category: "ボトルデザイン", medal: "silver", score: 90.3 },
];
const DATA = BASE.map((d, i) => ({ ...d, id: i }));
type Row = (typeof DATA)[number];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap');
.pf * { box-sizing: border-box; }
.pf ::placeholder { color: #98a2b3; }
.pf select { -webkit-appearance: none; appearance: none; }
.pf input:focus, .pf select:focus { outline: none; border-color: #1e3a8a !important; box-shadow: 0 0 0 3px rgba(30,58,138,.10); }
@keyframes pf-toast-in { from { opacity:0; transform:translate(-50%,12px) } to { opacity:1; transform:translate(-50%,0) } }
@keyframes pf-page-in { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
.pf-hoverable { transition: transform .12s, box-shadow .12s, border-color .12s; }
.pf-hoverable:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(16,24,40,.08) !important; border-color: #d7dbe2 !important; }
/* ---- responsive ---- */
@media (max-width: 960px) { .pf-dir-grid { grid-template-columns: repeat(2,1fr) !important; } }
@media (max-width: 640px) {
  .pf-wrap { padding-left: 16px !important; padding-right: 16px !important; }
  .pf-portal-label { display: none !important; }
  .pf-intro { flex-direction: column !important; gap: 16px !important; }
  .pf-intro-logo { flex: none !important; border-right: none !important; border-bottom: 1px solid #eef0f3 !important; padding-right: 0 !important; padding-bottom: 20px !important; width: 100% !important; }
  .pf-dir-grid { grid-template-columns: 1fr !important; }
  .pf-filter-row2 { flex-direction: column !important; align-items: stretch !important; }
  .pf-filter-row2 > * { width: 100% !important; }
  .pf-filter-row2 select { width: 100% !important; flex: 1 1 auto !important; }
  .pf-row { gap: 10px !important; padding: 13px 14px !important; }
  .pf-row-chips { display: none !important; }
  .pf-detail-grid { grid-template-columns: 1fr !important; }
  .pf-h1 { font-size: 26px !important; }
}
`;

const selectStyle: CSSProperties = {
  padding: "9px 30px 9px 12px", border: "1px solid #d7dbe2", borderRadius: 8,
  background: "#fff url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 10 10%22><path d=%22M1 3l4 4 4-4%22 stroke=%22%2398a2b3%22 fill=%22none%22 stroke-width=%221.4%22/></svg>') no-repeat right 11px center",
  fontFamily: "inherit", fontSize: 13, color: "#344054", cursor: "pointer", fontWeight: 600,
};

interface State { q: string; session: string; region: string; category: string; medal: string; sort: string; lang: Lang; selectedId: number | null; loggedIn: boolean; toast: string; special: null | "president" | "jury"; }

export function PortaleClient({ showScores = true, defaultLang = "it" as Lang }: { showScores?: boolean; defaultLang?: Lang }) {
  const [st, setStFull] = useState<State>({ q: "", session: "all", region: "all", category: "all", medal: "all", sort: "score", lang: defaultLang, selectedId: null, loggedIn: false, toast: "", special: null });
  const set = (patch: Partial<State> | ((s: State) => Partial<State>)) => setStFull((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  const ttRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const L = st.lang;
  const t = T[L];
  const regionLabel = (r: string) => (L === "ja" ? r : REGION[r][L]);
  const catLabel = (c: string) => (L === "ja" ? c : CAT_R[c] ?? c);
  const prefLabel = (p: string) => (L === "ja" ? p : PREF_R[p] ?? p);
  const medalLabel = (m: Medal) => META[m][L];
  const sessionLabel = (s: Session) => SESSION[s][L];
  const sessionShort = (s: Session) => SESSION[s].short[L];

  // lock body scroll while the detail overlay is open
  useEffect(() => {
    if (st.selectedId != null) { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }
  }, [st.selectedId]);

  const showToast = (msg: string) => { set({ toast: msg }); clearTimeout(ttRef.current); ttRef.current = setTimeout(() => set({ toast: "" }), 1900); };
  const share = () => { try { navigator.clipboard?.writeText(location.href); } catch {} showToast(t.copied); };

  const sessionData = () => DATA.filter((d) => st.session === "all" || d.session === st.session);

  const compute = (): Row[] => {
    const sp = st.special;
    if (sp === "president") return DATA.slice().sort((a, b) => b.score - a.score).slice(0, 1);
    if (sp === "jury") { const m: Record<string, Row> = {}; DATA.forEach((d) => { const k = d.session + "|" + d.category; if (!m[k] || d.score > m[k].score) m[k] = d; }); return Object.values(m).sort((a, b) => b.score - a.score); }
    const { q, region, category, medal, sort } = st;
    const needle = q.trim().toLowerCase();
    const rows = sessionData().filter((d) => {
      if (region !== "all" && d.region !== region) return false;
      if (category !== "all" && d.category !== category) return false;
      if (medal !== "all" && d.medal !== medal) return false;
      if (needle && !(d.name.toLowerCase().includes(needle) || d.brewery.toLowerCase().includes(needle) || d.pref.includes(needle) || (PREF_R[d.pref] || "").toLowerCase().includes(needle))) return false;
      return true;
    }).slice();
    if (sort === "score") rows.sort((a, b) => b.score - a.score);
    else if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    else if (sort === "brewery") rows.sort((a, b) => a.brewery.localeCompare(b.brewery, "ja"));
    else if (sort === "session") rows.sort((a, b) => SESSION_ORDER.indexOf(a.session) - SESSION_ORDER.indexOf(b.session) || b.score - a.score);
    else if (sort === "category") rows.sort((a, b) => a.category.localeCompare(b.category, "ja") || b.score - a.score);
    return rows;
  };

  const csvCell = (v: unknown) => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const doDownload = (rows: Row[], fname: string) => {
    const header = [t.thRank, t.sortName, t.sortBrewery, "Prefecture", "Region", t.sortSession, t.sortCategory, "Medal", t.sortScore];
    const lines = [header.map(csvCell).join(",")];
    rows.forEach((r, i) => lines.push([i + 1, r.name, r.brewery, prefLabel(r.pref), regionLabel(r.region), sessionLabel(r.session), catLabel(r.category), medalLabel(r.medal), r.score].map(csvCell).join(",")));
    const csv = "﻿" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t.downloaded);
  };
  const downloadList = () => { if (!st.loggedIn) { showToast(t.loginFirst); return; } doDownload(compute(), "milano-sake-challenge-2026.csv"); };
  const downloadDetail = () => { if (!st.loggedIn) { showToast(t.loginFirst); return; } const r = DATA[st.selectedId!]; if (r) doDownload([r], "msc2026-" + r.brewery + ".csv"); };

  const openDetail = (id: number) => set({ selectedId: id });
  const closeDetail = () => set({ selectedId: null });
  const selectMedal = (key: string) => { set({ medal: key, special: null }); scrollToList(); };
  const scrollToList = () => { requestAnimationFrame(() => { const el = document.getElementById("pf-list"); const bar = document.getElementById("pf-filter"); const off = 60 + (bar ? bar.offsetHeight : 170) + 16; if (el) { const y = el.getBoundingClientRect().top + window.scrollY - off; window.scrollTo({ top: y, behavior: "smooth" }); } }); };
  const scrollTop = () => { const el = document.getElementById("pf-dir"); if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 72; window.scrollTo({ top: y, behavior: "smooth" }); } };
  const pickSpecial = (key: "president" | "jury") => { set({ special: key, session: "all", category: "all", medal: "all", q: "" }); scrollToList(); };
  const pickFilter = (obj: Partial<State>) => { set({ special: null, session: "all", category: "all", medal: "all", q: "", ...obj }); scrollToList(); };
  const pickCategory = (s: Session, cat: string, gr: Medal) => { set({ special: null, session: s, category: cat, medal: gr, q: "" }); scrollToList(); };
  const reset = () => set({ q: "", session: "all", region: "all", category: "all", medal: "all", sort: "score", special: null });

  // ---- derived (buildDirectory + renderVals) ----
  const cellBase = "display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e9ebef;border-radius:12px;padding:13px 15px;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.04);font-family:inherit;width:100%";
  const actCss = ";border-color:#1e3a8a;box-shadow:0 0 0 1px #1e3a8a,0 6px 16px rgba(16,24,40,.07)";
  const buildDirectory = () => {
    const sl = (o: Record<Lang, string>) => o[L];
    const mk = (o: { glyph: string; tint: string; dot: string; title: string; sub: string; badge: number; onClick: () => void; active?: boolean }) => ({ glyph: o.glyph, tint: o.tint, dot: o.dot, title: o.title, sub: o.sub, badge: String(o.badge), onClick: o.onClick, style: cellBase + (o.active ? actCss : "") });
    const unit = (n: number, ja: string, it: string, en: string) => n + " " + (L === "ja" ? ja : L === "it" ? it : en);
    const groups: { title: string; accent: string; count: string; cells: ReturnType<typeof mk>[] }[] = [];
    const all = DATA;
    const platCount = all.filter((d) => d.medal === "platinum").length;
    const nihonCount = all.filter((d) => d.session === "nihonshu").length;
    const allianceCount = all.filter((d) => d.session === "pairing").length;
    const jm: Record<string, Row> = {}; all.forEach((d) => { const k = d.session + "|" + d.category; if (!jm[k] || d.score > jm[k].score) jm[k] = d; }); const juryCount = Object.keys(jm).length;
    const sp = st.special, noF = !sp && st.category === "all" && st.medal === "all";
    const specialCells = [
      mk({ glyph: "★", tint: "#e8edff", dot: "#1e3a8a", title: sl(SPECIAL.president), sub: t.spPresident, badge: 1, active: sp === "president", onClick: () => pickSpecial("president") }),
      mk({ glyph: "◆", tint: "#e8edff", dot: "#1e3a8a", title: sl(SPECIAL.alliance), sub: t.spAlliance, badge: allianceCount, active: noF && st.session === "pairing", onClick: () => pickFilter({ session: "pairing" }) }),
      mk({ glyph: "◇", tint: "#e8edff", dot: "#1e3a8a", title: sl(SPECIAL.jury), sub: t.spJury, badge: juryCount, active: sp === "jury", onClick: () => pickSpecial("jury") }),
      mk({ glyph: "●", tint: "#eef1f6", dot: "#94a3b8", title: sl(SPECIAL.excellence), sub: t.spExcellence, badge: platCount, active: !sp && st.medal === "platinum" && st.session === "all" && st.category === "all", onClick: () => pickFilter({ medal: "platinum" }) }),
      mk({ glyph: "▲", tint: "#e8edff", dot: "#1e3a8a", title: sl(SPECIAL.finalists), sub: t.spFinalists, badge: nihonCount, active: noF && st.session === "nihonshu", onClick: () => pickFilter({ session: "nihonshu" }) }),
    ];
    groups.push({ title: t.specialAwards, accent: "#1e3a8a", count: unit(specialCells.length, "賞", "premi", "awards"), cells: specialCells });
    SESSION_ORDER.forEach((s) => {
      const sd = all.filter((d) => d.session === s); if (!sd.length) return;
      const cats = [...new Set(sd.map((d) => d.category))]; const cells: ReturnType<typeof mk>[] = [];
      cats.forEach((cat) => { (["platinum", "gold", "silver"] as Medal[]).forEach((gr) => {
        const cnt = sd.filter((d) => d.category === cat && d.medal === gr).length; if (!cnt) return;
        const title = L === "ja" ? cat + t.bumon + " " + GRADE[gr].ja : catLabel(cat) + " · " + GRADE[gr][L];
        cells.push(mk({ glyph: "●", tint: META[gr].pillBg, dot: META[gr].dot, title, sub: sessionShort(s), badge: cnt, active: !sp && st.session === s && st.category === cat && st.medal === gr, onClick: () => pickCategory(s, cat, gr) }));
      }); });
      groups.push({ title: sessionLabel(s), accent: "#475467", count: unit(sd.length, "件", "prodotti", "products"), cells });
    });
    return groups;
  };

  const bars = (r: Row) => {
    const pct = (v: number) => Math.max(8, Math.min(100, Math.round(((v - 58) / 42) * 100))) + "%";
    const a = Math.min(100, r.score - 0.6), ta = Math.min(100, r.score + 0.3), ba = Math.min(100, r.score - 0.2);
    return [
      { label: t.barAroma, val: a.toFixed(1), pct: pct(a) },
      { label: t.barTaste, val: ta.toFixed(1), pct: pct(ta) },
      { label: t.barBalance, val: ba.toFixed(1), pct: pct(ba) },
    ];
  };

  const rows = compute();
  const grouped = (st.sort === "session" || st.sort === "category") && !st.special;
  const counts: Record<string, number> = {};
  if (grouped) rows.forEach((r) => { const k = st.sort === "session" ? r.session : r.category; counts[k] = (counts[k] || 0) + 1; });
  let lastKey: string | null = null;
  const items = rows.map((r, i) => {
    const gk = st.sort === "session" ? r.session : st.sort === "category" ? r.category : null;
    const showHeader = grouped && gk !== lastKey;
    if (showHeader) lastKey = gk;
    return { ...r, rankNum: i + 1, medalLabel: medalLabel(r.medal), pillBg: META[r.medal].pillBg, pillText: META[r.medal].pillText, dot: META[r.medal].dot, prefD: prefLabel(r.pref), categoryD: catLabel(r.category), sessionShort: sessionShort(r.session), showHeader, groupLabel: showHeader ? (st.sort === "session" ? sessionLabel(gk as Session) : catLabel(gk as string)) : "", groupCount: showHeader ? counts[gk as string] : 0 };
  });

  const allD = DATA;
  const medalTally = [
    { label: t.total, count: allD.length, dot: "#1e3a8a" },
    { label: medalLabel("platinum"), count: allD.filter((d) => d.medal === "platinum").length, dot: META.platinum.dot },
    { label: medalLabel("gold"), count: allD.filter((d) => d.medal === "gold").length, dot: META.gold.dot },
    { label: medalLabel("silver"), count: allD.filter((d) => d.medal === "silver").length, dot: META.silver.dot },
  ];

  const pill = "padding:9px 16px;border:none;font-family:inherit;font-size:13px;cursor:pointer;font-weight:600;border-radius:9px";
  const pillOn = pill + ";background:#1e3a8a;color:#fff";
  const pillOff = pill + ";background:#f2f4f7;color:#475467";
  const sessionTabs = [{ key: "all", label: t.allSessions }, ...SESSION_ORDER.map((s) => ({ key: s, label: sessionLabel(s) }))].map((s) => ({ ...s, onClick: () => set({ session: s.key, category: "all", special: null }), style: st.session === s.key ? pillOn : pillOff }));

  const seg = "padding:8px 14px;border:none;font-family:inherit;font-size:12px;cursor:pointer;font-weight:600";
  const segOn = seg + ";background:#1e3a8a;color:#fff";
  const segOff = seg + ";background:#fff;color:#667085";
  const allMedalLabel = L === "ja" ? "すべて" : L === "it" ? "Tutte" : "All";
  const medalPills = [{ key: "all", label: allMedalLabel }, { key: "platinum", label: medalLabel("platinum") }, { key: "gold", label: medalLabel("gold") }, { key: "silver", label: medalLabel("silver") }].map((m) => ({ ...m, onClick: () => set({ medal: m.key, special: null }), style: st.medal === m.key ? segOn : segOff }));

  const sd = sessionData();
  const catsInSession = [...new Set(sd.map((d) => d.category))].sort((a, b) => a.localeCompare(b, "ja"));
  const categoryOptions = [{ value: "all", label: t.allCats }, ...catsInSession.map((c) => ({ value: c, label: catLabel(c) }))];
  const regionOptions = [{ value: "all", label: t.allRegions }, ...REGION_ORDER.filter((r) => DATA.some((d) => d.region === r)).map((r) => ({ value: r, label: regionLabel(r) }))];
  const sortOptions = [{ value: "score", label: t.sortScore }, { value: "name", label: t.sortName }, { value: "brewery", label: t.sortBrewery }, { value: "session", label: t.sortSession }, { value: "category", label: t.sortCategory }];

  const langSeg = "padding:6px 11px;border:none;font-family:inherit;font-size:12px;cursor:pointer;font-weight:600";
  const langOn = langSeg + ";background:#1e3a8a;color:#fff";
  const langOff = langSeg + ";background:#fff;color:#667085";
  const dlOn = "display:flex;align-items:center;gap:7px;padding:9px 16px;border:none;border-radius:8px;background:#1e3a8a;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer";
  const dlOff = "display:flex;align-items:center;gap:7px;padding:9px 16px;border:1px solid #e4e7ec;border-radius:8px;background:#f7f8fa;color:#aeb6c2;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer";
  const dlDetailOff = "display:flex;align-items:center;gap:7px;padding:8px 14px;border:1px solid #e4e7ec;border-radius:8px;background:#f7f8fa;color:#aeb6c2;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer";
  const dlDetailOn = "display:flex;align-items:center;gap:7px;padding:8px 14px;border:none;border-radius:8px;background:#1e3a8a;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer";

  let contextLabel: string;
  if (st.special === "president") contextLabel = SPECIAL.president[L];
  else if (st.special === "jury") contextLabel = SPECIAL.jury[L];
  else { const parts: string[] = []; if (st.session !== "all") parts.push(sessionLabel(st.session as Session)); if (st.region !== "all") parts.push(regionLabel(st.region)); if (st.category !== "all") parts.push(catLabel(st.category)); if (st.medal !== "all") parts.push(GRADE[st.medal as Medal][L]); if (st.q.trim()) parts.push("“" + st.q.trim() + "”"); contextLabel = parts.length ? parts.join(" · ") : t.allWinners; }
  const hasFilter = !!st.special || st.session !== "all" || st.region !== "all" || st.category !== "all" || st.medal !== "all" || !!st.q.trim();

  let detail: (Row & { rankNum: number; medalLabel: string; pillBg: string; pillText: string; dot: string; prefD: string; regionD: string; categoryD: string; sessionLabel: string; bars: ReturnType<typeof bars>; notes: string }) | null = null;
  if (st.selectedId != null) {
    const r = DATA[st.selectedId];
    if (r) { const idx = compute().findIndex((x) => x.id === r.id); detail = { ...r, rankNum: idx >= 0 ? idx + 1 : 1, medalLabel: medalLabel(r.medal), pillBg: META[r.medal].pillBg, pillText: META[r.medal].pillText, dot: META[r.medal].dot, prefD: prefLabel(r.pref), regionD: regionLabel(r.region), categoryD: catLabel(r.category), sessionLabel: sessionLabel(r.session), bars: bars(r), notes: t.notes }; }
  }

  const directoryGroups = buildDirectory();

  return (
    <div className="pf" style={{ minHeight: "100vh", background: "#f5f6f8", fontFamily: "'Inter','Noto Sans JP',sans-serif", color: "#101828", WebkitFontSmoothing: "antialiased" }}>
      <style>{CSS}</style>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e8eaed", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="pf-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1e3a8a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 17 }}>C</div>
            <span style={{ fontWeight: 700, fontSize: 17, color: "#1e3a8a", letterSpacing: "-.01em" }}>Compify</span>
            <span className="pf-portal-label" style={{ fontSize: 13, color: "#98a2b3", fontWeight: 500, paddingLeft: 2 }}>{t.portal}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", border: "1px solid #e4e7ec", borderRadius: 8, overflow: "hidden" }}>
              <button onClick={() => set({ lang: "it" })} style={css(L === "it" ? langOn : langOff)}>IT</button>
              <button onClick={() => set({ lang: "en" })} style={css(L === "en" ? langOn : langOff)}>EN</button>
              <button onClick={() => set({ lang: "ja" })} style={css(L === "ja" ? langOn : langOff)}>日本語</button>
            </div>
            {st.loggedIn ? (
              <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#f2f4f7", borderRadius: 8, padding: "5px 8px 5px 6px" }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "#1e3a8a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>M</div>
                <span style={{ fontSize: 12, color: "#344054", fontWeight: 600 }}>{t.connected}</span>
                <button onClick={() => set((s) => ({ loggedIn: !s.loggedIn }))} style={{ border: "none", background: "none", fontFamily: "inherit", fontSize: 12, color: "#98a2b3", cursor: "pointer", fontWeight: 600, padding: "0 2px" }}>{t.logout}</button>
              </div>
            ) : (
              <button onClick={() => set((s) => ({ loggedIn: !s.loggedIn }))} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px", border: "1px solid #d7dbe2", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12, color: "#344054", cursor: "pointer", fontWeight: 600 }}>{t.login}</button>
            )}
          </div>
        </div>
      </header>

      {/* Title */}
      <div className="pf-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "34px 28px 8px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".08em", color: "#1e3a8a", textTransform: "uppercase", marginBottom: 8 }}>{t.breadcrumb}</div>
        <h1 className="pf-h1" style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: "-.01em", color: "#101828" }}>{t.title}</h1>
        <p style={{ margin: "9px 0 0", fontSize: 14, lineHeight: 1.7, color: "#667085", maxWidth: 600 }}>{t.subtitle}</p>
      </div>

      {/* Intro card */}
      <div className="pf-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 28px 6px" }}>
        <div className="pf-intro" style={{ display: "flex", gap: 28, alignItems: "stretch", background: "#fff", border: "1px solid #e9ebef", borderRadius: 16, padding: "26px 28px", boxShadow: "0 1px 2px rgba(16,24,40,.04)", flexWrap: "wrap" }}>
          <div className="pf-intro-logo" style={{ flex: "0 0 196px", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #eef0f3", paddingRight: 26 }}>
            <img src="/msc-logo.png" alt="Milano Sake Challenge 2026" style={{ width: 170, height: 128, objectFit: "contain", borderRadius: 14 }} />
          </div>
          <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "#1e3a8a", textTransform: "uppercase", marginBottom: 9 }}>{t.introKicker}</div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: "#475467", maxWidth: 780, textWrap: "pretty" as CSSProperties["textWrap"] }}>{t.introBody}</p>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 18, paddingTop: 18, borderTop: "1px solid #eef0f3" }}>
              {medalTally.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 11, height: 11, borderRadius: "50%", background: m.dot }} />
                  <span style={{ fontSize: 21, fontWeight: 700, color: "#101828" }}>{m.count}</span>
                  <span style={{ fontSize: 12, color: "#8a93a3", fontWeight: 600 }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Awards directory */}
      <div id="pf-dir" className="pf-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 28px 2px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#101828" }}>{t.dirTitle}</span>
          <span style={{ fontSize: 12, color: "#98a2b3" }}>{t.dirHint}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {directoryGroups.map((g, gi) => (
            <div key={gi}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: g.accent }} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "#475467", textTransform: "uppercase" }}>{g.title}</span>
                <span style={{ height: 1, flex: 1, background: "#e7eaef" }} />
                <span style={{ fontSize: 11, color: "#98a2b3", fontWeight: 600 }}>{g.count}</span>
              </div>
              <div className="pf-dir-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {g.cells.map((c, ci) => (
                  <button key={ci} className="pf-hoverable" onClick={c.onClick} style={css(c.style)}>
                    <span style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: c.tint, color: c.dot, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{c.glyph}</span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#101828", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</span>
                      <span style={{ display: "block", fontSize: 11, color: "#8a93a3", marginTop: 2 }}>{c.sub}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#475467", flexShrink: 0 }}>{c.badge}</span>
                    <span style={{ fontSize: 15, color: "#cbd2dc", flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating filter menu */}
      <div className="pf-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "10px 28px 0", position: "sticky", top: 60, zIndex: 30 }}>
        <div id="pf-filter" style={{ background: "#fff", border: "1px solid #e9ebef", borderRadius: 14, padding: 16, boxShadow: "0 8px 22px rgba(16,24,40,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #eef0f3" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: "#8a93a3", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0 }}>{t.viewing}</span>
              <span style={{ display: "inline-flex", alignItems: "center", background: "#eef1f6", borderRadius: 8, padding: "5px 12px", fontSize: 13, fontWeight: 700, color: "#1e3a8a", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contextLabel}</span>
              {hasFilter && <button onClick={reset} style={{ border: "none", background: "none", fontFamily: "inherit", fontSize: 12, color: "#98a2b3", cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>✕ {t.clear}</button>}
            </div>
            <button onClick={scrollTop} style={{ border: "none", background: "none", fontFamily: "inherit", fontSize: 12, color: "#1e3a8a", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>↑ {t.backDir}</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sessionTabs.map((s) => <button key={s.key} onClick={s.onClick} style={css(s.style)}>{s.label}</button>)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <button onClick={share} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 15px", border: "1px solid #d7dbe2", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 13, color: "#344054", cursor: "pointer", fontWeight: 600 }}>↗ {t.share}</button>
              <button onClick={downloadList} title={st.loggedIn ? "" : t.loginToDownload} style={css(st.loggedIn ? dlOn : dlOff)}>↓ {t.download}</button>
            </div>
          </div>

          <div className="pf-filter-row2" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: "1px solid #eef0f3" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 12, color: "#8a93a3", fontWeight: 600 }}>{t.sortLabel}</span>
              <select value={st.sort} onChange={(e) => set({ sort: e.target.value })} style={selectStyle}>
                {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <select value={st.region} onChange={(e) => set({ region: e.target.value, special: null })} style={{ ...selectStyle, fontWeight: 500 }}>
              {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={st.category} onChange={(e) => set({ category: e.target.value, special: null })} style={{ ...selectStyle, fontWeight: 500 }}>
              {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ display: "flex", border: "1px solid #e4e7ec", borderRadius: 8, overflow: "hidden" }}>
              {medalPills.map((m) => <button key={m.key} onClick={m.onClick} style={css(m.style)}>{m.label}</button>)}
            </div>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#98a2b3", fontSize: 14 }}>⌕</span>
              <input value={st.q} onChange={(e) => set({ q: e.target.value, special: null })} placeholder={t.searchPh} style={{ width: "100%", padding: "9px 14px 9px 35px", border: "1px solid #d7dbe2", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 13, color: "#101828" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <main id="pf-list" className="pf-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 28px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 2px 13px" }}>
          <div style={{ fontSize: 13, color: "#667085" }}><span style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 15 }}>{items.length}</span> {t.resultUnit}</div>
          <button onClick={reset} style={{ border: "none", background: "none", fontFamily: "inherit", fontSize: 12, color: "#98a2b3", cursor: "pointer", fontWeight: 600 }}>{t.reset}</button>
        </div>

        {items.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #e9ebef", borderRadius: 14, textAlign: "center", padding: "72px 20px", color: "#98a2b3" }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>⌕</div>
            <div style={{ fontSize: 15, color: "#475467", fontWeight: 600 }}>{t.emptyTitle}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{t.emptySub}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {items.map((item) => (
              <div key={item.id}>
                {item.showHeader && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "9px 4px" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", color: "#475467", textTransform: "uppercase" }}>{item.groupLabel}</span>
                    <span style={{ height: 1, flex: 1, background: "#e7eaef" }} />
                    <span style={{ fontSize: 11, color: "#98a2b3", fontWeight: 600 }}>{item.groupCount}</span>
                  </div>
                )}
                <div className="pf-hoverable pf-row" onClick={() => openDetail(item.id)} style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "1px solid #e9ebef", borderRadius: 13, padding: "15px 18px", cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: item.pillBg, color: item.pillText, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{item.rankNum}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#101828" }}>{item.name}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: item.pillBg, borderRadius: 999, padding: "3px 10px 3px 8px" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: item.dot }} /><span style={{ fontSize: 11, fontWeight: 700, color: item.pillText }}>{item.medalLabel}</span></span>
                    </div>
                    <div style={{ fontSize: 13, color: "#667085", marginTop: 3 }}>{item.brewery} · {item.prefD}</div>
                  </div>
                  <div className="pf-row-chips" style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "#475467", background: "#f2f4f7", borderRadius: 6, padding: "4px 9px", whiteSpace: "nowrap", fontWeight: 600 }}>{item.sessionShort}</span>
                    <span style={{ fontSize: 11, color: "#475467", background: "#f2f4f7", borderRadius: 6, padding: "4px 9px", whiteSpace: "nowrap", fontWeight: 600 }}>{item.categoryD}</span>
                  </div>
                  {showScores && (
                    <div style={{ textAlign: "right", flexShrink: 0, width: 62 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#2563eb", lineHeight: 1 }}>{item.score}</div>
                      <div style={{ fontSize: 9, color: "#98a2b3", letterSpacing: ".12em", fontWeight: 600 }}>{t.scoreCap}</div>
                    </div>
                  )}
                  <span style={{ fontSize: 17, color: "#cbd2dc", flexShrink: 0 }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e8eaed", background: "#fff" }}>
        <div className="pf-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#98a2b3" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 20, height: 20, borderRadius: 5, background: "#1e3a8a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>C</span>Powered by Compify · Milano Sake Challenge 2026</span>
          <span>{t.footer}</span>
        </div>
      </footer>

      {/* Detail overlay */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#f5f6f8", overflowY: "auto", animation: "pf-page-in .22s ease both" }}>
          <div style={{ background: "#fff", borderBottom: "1px solid #e8eaed", position: "sticky", top: 0, zIndex: 5 }}>
            <div className="pf-wrap" style={{ maxWidth: 1000, margin: "0 auto", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <button onClick={closeDetail} style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "none", fontFamily: "inherit", fontSize: 14, color: "#344054", cursor: "pointer", fontWeight: 600 }}>‹ {t.back}</button>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <button onClick={share} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", border: "1px solid #d7dbe2", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 13, color: "#344054", cursor: "pointer", fontWeight: 600 }}>↗ {t.share}</button>
                <button onClick={downloadDetail} title={st.loggedIn ? "" : t.loginToDownload} style={css(st.loggedIn ? dlDetailOn : dlDetailOff)}>↓ {t.download}</button>
              </div>
            </div>
          </div>

          <div className="pf-wrap" style={{ maxWidth: 1000, margin: "0 auto", padding: "34px 28px 80px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: detail.pillBg, borderRadius: 999, padding: "6px 14px 6px 10px", marginBottom: 16 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: detail.dot }} /><span style={{ fontSize: 13, fontWeight: 700, color: detail.pillText }}>{detail.medalLabel}</span></div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: "-.01em", color: "#101828" }}>{detail.name}</h1>
            <div style={{ fontSize: 16, color: "#667085", marginTop: 8 }}>{detail.brewery} · {detail.prefD} · {detail.regionD}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <span style={{ fontSize: 12, color: "#475467", background: "#eef1f6", borderRadius: 7, padding: "6px 12px", fontWeight: 600 }}>{detail.sessionLabel}</span>
              <span style={{ fontSize: 12, color: "#475467", background: "#eef1f6", borderRadius: 7, padding: "6px 12px", fontWeight: 600 }}>{detail.categoryD}</span>
              <span style={{ fontSize: 12, color: "#475467", background: "#eef1f6", borderRadius: 7, padding: "6px 12px", fontWeight: 600 }}>{t.thRank} #{detail.rankNum}</span>
            </div>

            <div className="pf-detail-grid" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24, marginTop: 28 }}>
              <div style={{ background: "repeating-linear-gradient(135deg,#eef1f5 0 12px,#e7ebf0 12px 24px)", border: "1px solid #e4e7ec", borderRadius: 16, height: 380, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#98a2b3" }}>
                <div style={{ width: 54, height: 54, borderRadius: 14, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }}>🍶</div>
                <span style={{ fontFamily: "'SF Mono',ui-monospace,Menlo,monospace", fontSize: 11, letterSpacing: ".04em" }}>{t.imgPlaceholder}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ background: "#fff", border: "1px solid #e9ebef", borderRadius: 16, padding: 24, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, borderBottom: "1px solid #f1f3f5", paddingBottom: 18, marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#98a2b3", letterSpacing: ".1em", fontWeight: 600, textTransform: "uppercase" }}>{t.scoreLabel}</div>
                      <div style={{ fontSize: 44, fontWeight: 700, color: "#2563eb", lineHeight: 1, marginTop: 6 }}>{detail.score}</div>
                    </div>
                    <div style={{ fontSize: 13, color: "#8a93a3", fontWeight: 600 }}>/ 100</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                    {detail.bars.map((b, bi) => (
                      <div key={bi}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span style={{ color: "#475467", fontWeight: 600 }}>{b.label}</span><span style={{ color: "#101828", fontWeight: 700 }}>{b.val}</span></div>
                        <div style={{ height: 7, background: "#eef1f5", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 99, background: "#2563eb", width: b.pct }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: "#fff", border: "1px solid #e9ebef", borderRadius: 16, padding: 24, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#101828", marginBottom: 9 }}>{t.notesTitle}</div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: "#667085" }}>{detail.notes}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {st.toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 32, zIndex: 80, background: "#101828", color: "#fff", fontSize: 13, fontWeight: 600, padding: "12px 20px", borderRadius: 10, boxShadow: "0 10px 30px rgba(16,24,40,.25)", animation: "pf-toast-in .2s ease both", transform: "translateX(-50%)" }}>{st.toast}</div>
      )}
    </div>
  );
}
