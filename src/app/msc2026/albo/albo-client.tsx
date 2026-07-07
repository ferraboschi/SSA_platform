"use client";

// "Albo dei Premiati" — a navigable results directory in the Kura-Master browse spirit (jump-nav + scroll-spy,
// nothing hidden) applied to OUR data + Compify look. Session = the filter; category = a jump-to (scroll, don't hide);
// search/region = optional narrowing. Real winners (VISIBLE, 403; Magnifica embargoed) + all our medal grades.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  VISIBLE, MEDAL_ORDER, MEDAL_META, SESSION_ORDER, SESSION_META, CATEGORY_GROUPS, CATEGORIES_BY_SESSION, SEARCH_ENTITIES,
  companyName, medalImageFor, type Winner, type SessionKey, type MedalKey, type LangKey, type SearchTag,
} from "../shared";

type SortKey = "name" | "company" | "prefecture";
type SortState = { key: SortKey; dir: "asc" | "desc" };
const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

const T: Record<LangKey, Record<string, string>> = {
  it: { brandSub: "Portale Risultati", kicker: "Milano Sake Challenge 2026 · Risultati", title: "Albo dei Premiati", subtitle: "Sfoglia i vincitori per sessione e categoria. Clicca una categoria per saltarci: la lista non si nasconde, scorre.", jumpTo: "Salta a", searchTagPh: "Cerca sakagura, prodotto o regione…", tagSakagura: "Sakagura", tagProduct: "Prodotto", tagRegion: "Regione", genLink: "Genera link", copied: "Link copiato", allPrefs: "Tutte le prefetture", winners: "premiati", winnerOne: "premiato", noResults: "Nessun risultato per questi criteri", reset: "Azzera", magnifica: "Magnifica: annuncio a settembre", inThis: "in questa vista", backTop: "↑ Torna su", colName: "Nome Sake", colSakagura: "Sakagura", colPrefecture: "Regione" },
  en: { brandSub: "Results Portal", kicker: "Milano Sake Challenge 2026 · Results", title: "Roll of Honour", subtitle: "Browse the winners by session and category. Click a category to jump: nothing is hidden, it scrolls.", jumpTo: "Jump to", searchTagPh: "Search sakagura, product, or region…", tagSakagura: "Sakagura", tagProduct: "Product", tagRegion: "Region", genLink: "Copy link", copied: "Link copied", allPrefs: "All prefectures", winners: "winners", winnerOne: "winner", noResults: "No results for these criteria", reset: "Reset", magnifica: "Magnifica: announced in September", inThis: "in this view", backTop: "↑ Back to top", colName: "Sake name", colSakagura: "Brewery", colPrefecture: "Region" },
  ja: { brandSub: "受賞結果ポータル", kicker: "Milano Sake Challenge 2026 · 受賞結果", title: "受賞酒一覧", subtitle: "セッション・部門で受賞酒を一覧。部門をクリックすると移動します（隠さずスクロール）。", jumpTo: "移動", searchTagPh: "蔵元・銘柄・地域を検索…", tagSakagura: "蔵元", tagProduct: "銘柄", tagRegion: "地域", genLink: "リンク", copied: "コピーしました", allPrefs: "すべての都道府県", winners: "受賞", winnerOne: "受賞", noResults: "該当する結果がありません", reset: "リセット", magnifica: "マニフィカ賞：9月発表", inThis: "この表示で", backTop: "↑ 上へ", colName: "銘柄", colSakagura: "蔵元", colPrefecture: "地域" },
};

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400&display=swap');
.al * { box-sizing: border-box; }
.al ::placeholder { color: #98a2b3; }
.al select { -webkit-appearance: none; appearance: none; }
.al input:focus, .al select:focus { outline: none; border-color: #1e3a8a !important; box-shadow: 0 0 0 3px rgba(30,58,138,.10); }
.al-jump { scroll-margin-top: 172px; }
@keyframes al-flash { 0% { background:#eef1ff; } 100% { background:transparent; } }
.al-flash { animation: al-flash 1.1s ease; }
.al-rail { display:flex; gap:7px; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }
.al-rail::-webkit-scrollbar { display:none; }

/* ── Category collector: white card; medal groups headed by a slim Gallery Wall-Label header ──
   Marriage principle: serif = jewelry (category, tier, sake names) · Inter = chassis (sort headers,
   counts, region caps, hairlines) · indigo = interaction. Metal reduced to one gold hairline. */
.al-collector { background:#fff; border:1px solid #e9ebef; border-radius:16px; padding:24px 24px 14px; box-shadow:0 1px 2px rgba(16,24,40,.05); }
/* centered category title — "Bodoni Milano · cornice incisa": Bodoni Moda between engraved double
   hairlines with a matte-gold fleuron cap, MILANO · MMXXVI in spaced small caps, count in italic. */
.al-cat-head { display:flex; flex-direction:column; align-items:center; text-align:center; margin-bottom:10px; }
.al-cat-rule, .al-cat-rule2 { width:100%; max-width:430px; position:relative; height:7px; }
.al-cat-rule { margin-bottom:14px; }
.al-cat-rule2 { margin-top:14px; }
.al-cat-rule::before, .al-cat-rule::after, .al-cat-rule2::before, .al-cat-rule2::after { content:""; position:absolute; left:0; right:0; height:1px; background:#dfe3e9; }
.al-cat-rule::before, .al-cat-rule2::before { top:0; }
.al-cat-rule::after, .al-cat-rule2::after { bottom:0; }
.al-cat-rule .fl { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); color:#b08a3e; font-size:13px; line-height:1; background:#fff; padding:0 12px; }
.al-cat-title { margin:0; font-family:'Bodoni Moda',Didot,'EB Garamond',serif; font-weight:400; font-size:34px; letter-spacing:.005em; color:#0f1b3d; line-height:1.1; }
.al-cat-milano { margin:12px 0 0; font-size:10px; font-weight:600; letter-spacing:.42em; text-transform:uppercase; color:#98a2b3; }
.al-cat-milano .d { color:#b08a3e; }
.al-cat-count { margin:9px 0 0; font-family:'Bodoni Moda','EB Garamond',serif; font-style:italic; font-size:14px; font-weight:400; color:#475467; }
.al-tablebody { position:relative; }
/* Gallery Wall-Label tier band (sticky): MEDAGLIA – CATEGORIA on one line. The category sits centered
   in the page at the SAME size as the tier word (29px, Bodoni echoing the big title), baseline-aligned
   with the medal. It fades in only once the band sticks (while the big title is on screen it would be
   a duplicate) and holds for all the card's tiers; the next card's bands replace it with the fade. */
.al-band { position:sticky; z-index:5; display:flex; align-items:center; gap:13px; padding:10px 6px 9px; background:#fff; margin-top:28px; box-shadow:0 7px 9px -8px rgba(16,24,40,.14); }
.al-band-catname { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-family:'Bodoni Moda',Didot,'EB Garamond',serif; font-weight:400; font-size:29px; line-height:1; color:#0f1b3d; max-width:46%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; opacity:0; transition:opacity .18s ease; pointer-events:none; }
.al-band-photo { height:34px !important; width:auto !important; object-fit:contain; flex-shrink:0; }
.al-band-tier { font-family:'EB Garamond',Georgia,serif; font-size:29px; font-weight:400; color:#101828; line-height:1; }
.al-band-tier .w { font-style:italic; font-weight:500; padding-bottom:4px; border-bottom:1px solid #b08a3e; }
.al-band-count { margin-left:auto; font-size:11px; font-weight:500; letter-spacing:.13em; text-transform:uppercase; color:#98a2b3; font-variant-numeric:tabular-nums; flex-shrink:0; }
/* the sort filters — light-tech: uppercase micro-labels, carets, indigo when active — above the four columns */
.al-colhead { display:grid; gap:16px; padding:14px 8px 9px; border-bottom:1px solid #e7eaef; }
.al-bandth { display:inline-flex; align-items:center; gap:6px; border:none; background:none; font-family:'Inter',sans-serif; cursor:pointer; padding:0; font-size:10.5px; font-weight:600; letter-spacing:.09em; text-transform:uppercase; color:#98a2b3; text-align:left; }
.al-bandth:hover { color:#1e3a8a; }
.al-bandth[data-active="1"] { color:#1e3a8a; }
.al-sortarrow { font-size:9px; line-height:1; opacity:.85; }
/* rows: serif names (jewelry), sans meta (chassis) — no category column: the sticky echo carries it */
.al-trow { display:grid; align-items:baseline; gap:16px; padding:14px 8px; border-bottom:1px solid #f1f3f6; text-decoration:none; transition:background .12s; }
.al-trow:hover { background:#fbfcfe; }
.al-td { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.al-td-name { font-family:'EB Garamond',Georgia,serif; font-size:16.5px; font-weight:500; color:#101828; }
.al-td-saka { font-size:13.5px; color:#475467; }
.al-td-reg { font-size:11.5px; letter-spacing:.06em; text-transform:uppercase; color:#98a2b3; font-variant-numeric:tabular-nums; }

@media (max-width: 720px) {
  .al-wrap { padding-left: 16px !important; padding-right: 16px !important; }
  .al-portal-sub { display: none; }
  /* ── compact filter: 4 tight rows instead of a half-screen stack ── */
  .al-topbar { flex-direction: column !important; align-items: stretch !important; gap: 8px !important; }
  /* session tabs: one horizontally-scrolling row, not a wrapping 2-row block */
  .al-seg-row { flex-wrap: nowrap !important; overflow-x: auto; scrollbar-width: none; }
  .al-seg-row::-webkit-scrollbar { display: none; }
  /* tools: prefecture on its own row; search + link icon share the next row */
  .al-tools { flex: 0 0 auto !important; flex-wrap: wrap !important; gap: 8px !important; justify-content: flex-start !important; }
  .al-prefsel { flex: 1 1 100% !important; }
  .al-search { min-width: 0 !important; flex: 1 1 auto !important; }
  .al-linkbtn { flex: 0 0 auto !important; padding: 9px 11px !important; }
  .al-linklabel { display: none; }   /* icon-only share button on phones */
  .al-jump { scroll-margin-top: 250px; }
  /* the 4-column grid can't fit a phone: hide the sort headers and stack each entry as a labelled card */
  .al-collector { padding:16px 14px 10px; }
  .al-cat-title { font-size:25px; }
  .al-cat-rule, .al-cat-rule2 { max-width:300px; }
  /* no room to center it beside the tier on a phone: the category becomes a full-width line above,
     always visible (the !important overrides the stuck-only inline opacity, which is a desktop notion) */
  .al-band { gap:11px; padding:8px 4px 9px; margin-top:20px; flex-wrap:wrap; }
  .al-band-catname { position:static; transform:none; order:-1; flex:1 1 100%; max-width:none; font-size:17px; opacity:1 !important; }
  .al-band-photo { height:30px !important; }
  .al-band-tier { font-size:24px; }
  .al-colhead { display:none; }
  .al-trow { grid-template-columns:1fr !important; gap:3px; padding:14px 6px; }
  .al-td { white-space:normal; }
  .al-td-saka::before, .al-td-reg::before { content:attr(data-label) ": "; color:#98a2b3; font-weight:600; }
}
`;


export function AlboClient({ defaultLang = "it" as LangKey }: { defaultLang?: LangKey }) {
  const [lang, setLang] = useState<LangKey>(defaultLang);
  const [session, setSession] = useState<SessionKey>("nihonshu");
  const [tags, setTags] = useState<SearchTag[]>([]);   // free-search tags: sakagura / product / region
  const [pref, setPref] = useState<string>("all");      // prefecture quick-filter (individual prefectures, not macro-areas)
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [sorts, setSorts] = useState<Record<string, SortState>>({}); // per medal-band sort (keyed by section:medal)
  const [bandTop, setBandTop] = useState<number>(172);               // sticky offset for the medal bands (under the filter bar)
  const [toast, setToast] = useState<string>("");
  const ready = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);

  const t = T[lang];
  const secId = (i: number) => "albo-sec-" + i;

  // categories of the active session, in the curated order.
  // CATEGORY_GROUPS carries the curated order for nihonshu/shochu/pairing, but has NO design entry
  // (on the list page design reuses those categories, so its leftover set is empty). Fall back to the
  // per-session category set for design (and any session CATEGORY_GROUPS doesn't cover).
  const cats = useMemo(() => {
    const grouped = CATEGORY_GROUPS.find((g) => g.key === session)?.cats;
    return grouped && grouped.length ? grouped : (CATEGORIES_BY_SESSION[session] ?? []);
  }, [session]);

  // winners of the active session, filtered by search + region (narrowing), grouped Category → Medal, sorted A→Z
  const { sections, total } = useMemo(() => {
    const matchTag = (w: Winner, tg: SearchTag) =>
      tg.type === "region" ? (w.prefecture ?? "") === tg.value
      : tg.type === "sakagura" ? w.company_en === tg.value
      : w.name === tg.value;
    const inSession = VISIBLE.filter((w) => w.session === session)
      .filter((w) => pref === "all" || (w.prefecture ?? "") === pref)
      .filter((w) => tags.length === 0 || tags.some((tg) => matchTag(w, tg)));
    const secs = cats.map((cat) => {
      const rows = inSession.filter((w) => w.category === cat);
      const byMedal = MEDAL_ORDER.filter((m) => rows.some((r) => r.medal === m)).map((m) => ({
        medal: m, items: rows.filter((r) => r.medal === m),
      }));
      return { cat, count: rows.length, byMedal };
    }).filter((s) => s.count > 0);
    return { sections: secs, total: secs.reduce((n, s) => n + s.count, 0) };
  }, [session, cats, tags, pref]);

  // individual prefectures present in this session (not the macro-areas), alphabetical
  const prefOptions = useMemo(() => {
    const present = new Set(VISIBLE.filter((w) => w.session === session).map((w) => w.prefecture).filter(Boolean) as string[]);
    return Array.from(present).sort((a, b) => a.localeCompare(b));
  }, [session]);

  // scroll-spy: the active category = the last heading scrolled past the sticky line.
  // The tolerance (+30) must exceed jumpTo's landing offset (+16), otherwise a freshly-jumped section
  // sits just below the line and the spy would keep the PREVIOUS category highlighted.
  useEffect(() => {
    const line = () => (barRef.current ? barRef.current.getBoundingClientRect().bottom : 156) + 30;
    const spy = () => {
      const heads = Array.from(document.querySelectorAll<HTMLElement>("[data-sec]"));
      let cur = 0;
      const L = line();
      for (const h of heads) { if (h.getBoundingClientRect().top - L <= 1) cur = Number(h.dataset.idx); else break; }
      setActiveIdx(cur);
    };
    spy();
    window.addEventListener("scroll", spy, { passive: true });
    window.addEventListener("resize", spy);
    return () => { window.removeEventListener("scroll", spy); window.removeEventListener("resize", spy); };
  }, [sections]);

  // keep the active chip visible in the rail
  useEffect(() => {
    const c = document.querySelector<HTMLElement>(`[data-chip="${activeIdx}"]`);
    c?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  // the medal bands stick just under the filter bar — measure its height so the offset adapts (mobile bar is taller)
  useEffect(() => {
    const measure = () => setBandTop(60 + (barRef.current?.offsetHeight ?? 112));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [session, lang, sections.length]);

  // Sticky hand-off with fade: a stuck band keeps opacity 1 for the whole scroll of its rows, then
  // dissolves over the last ~70px as the NEXT band (or the card's end) closes in and replaces it.
  // The centered category name inside the band fades in only while the band is stuck — while the big
  // Bodoni title is still on screen it would read as a duplicate.
  useEffect(() => {
    const FADE = 70; // px over which the outgoing band dissolves
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = 60 + (barRef.current?.offsetHeight ?? 112);
      document.querySelectorAll<HTMLElement>(".al-tablebody").forEach((body) => {
        const bands = Array.from(body.querySelectorAll<HTMLElement>(".al-band"));
        bands.forEach((band, bi) => {
          const r = band.getBoundingClientRect();
          const stuck = r.top <= line + 2;
          let opacity = 1;
          if (stuck) {
            // the incoming edge: the next band's top, or the end of this card's table
            const next = bands[bi + 1];
            const limit = next ? next.getBoundingClientRect().top : body.getBoundingClientRect().bottom;
            const gap = limit - r.bottom;
            if (gap < FADE) opacity = Math.max(0, gap / FADE);
          }
          band.style.opacity = String(opacity);
          const cat = band.querySelector<HTMLElement>(".al-band-catname");
          if (cat) cat.style.opacity = stuck ? "1" : "0";
        });
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [sections]);

  const jumpTo = (i: number) => {
    const el = document.getElementById(secId(i));
    if (!el) return;
    setActiveIdx(i); // select the clicked chip immediately (don't wait for the scroll-spy to catch up)
    const off = (barRef.current ? barRef.current.getBoundingClientRect().bottom : 156) + 16;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
    el.classList.remove("al-flash"); void el.offsetWidth; el.classList.add("al-flash");
  };
  const changeSession = (s: SessionKey) => { setSession(s); setTags([]); setPref("all"); setActiveIdx(0); window.scrollTo({ top: 0 }); };

  // ── Link generator: restore the view from the URL on load, then keep the URL in sync so the
  //    "Genera link" button copies a permalink that reproduces session + prefecture + search tags. ──
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("s"); if (s && (SESSION_ORDER as string[]).includes(s)) setSession(s as SessionKey);
    const l = p.get("l"); if (l === "en" || l === "ja" || l === "it") setLang(l);
    const pf = p.get("pref"); if (pf) setPref(pf);
    const ts = p.getAll("t")
      .map((raw) => { const i = raw.indexOf(":"); return { type: raw.slice(0, i), value: raw.slice(i + 1) } as SearchTag; })
      .filter((tg) => SEARCH_ENTITIES.some((e) => e.type === tg.type && e.value === tg.value));
    if (ts.length) setTags(ts);
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    const p = new URLSearchParams();
    if (session !== "nihonshu") p.set("s", session);
    if (lang !== "it") p.set("l", lang);
    if (pref !== "all") p.set("pref", pref);
    tags.forEach((tg) => p.append("t", `${tg.type}:${tg.value}`));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [session, lang, pref, tags]);

  const genLink = async () => {
    try { await navigator.clipboard?.writeText(window.location.href); } catch { /* clipboard blocked; URL is still shareable from the address bar */ }
    setToast(t.copied);
    window.setTimeout(() => setToast(""), 1800);
  };

  const segBtn = (on: boolean): React.CSSProperties => ({ padding: "8px 15px", border: "none", borderRadius: 9, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", background: on ? "#1e3a8a" : "#f2f4f7", color: on ? "#fff" : "#475467", whiteSpace: "nowrap" });
  const langBtn = (on: boolean): React.CSSProperties => ({ padding: "6px 11px", border: "none", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", background: on ? "#1e3a8a" : "#fff", color: on ? "#fff" : "#667085" });
  const selStyle: React.CSSProperties = { padding: "9px 30px 9px 12px", border: "1px solid #d7dbe2", borderRadius: 8, background: "#fff url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 10 10%22><path d=%22M1 3l4 4 4-4%22 stroke=%22%2398a2b3%22 fill=%22none%22 stroke-width=%221.4%22/></svg>') no-repeat right 11px center", fontFamily: "inherit", fontSize: 13, color: "#344054", fontWeight: 500, cursor: "pointer" };

  // shared 3-column grid template — the sort headers and the rows below use it so the columns line up:
  // Nome Sake · Sakagura · Regione (the category lives in the sticky echo, not in the rows)
  const COLS3 = "minmax(0,2.3fr) minmax(0,1.7fr) minmax(0,.9fr)";
  const getSort = (gid: string) => sorts[gid] ?? DEFAULT_SORT;
  const toggleSort = (gid: string, key: SortKey) => setSorts((prev) => {
    const cur = prev[gid] ?? DEFAULT_SORT;
    return { ...prev, [gid]: cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" } };
  });
  const sortItems = (items: Winner[], so: SortState) => {
    const val = (w: Winner) => (so.key === "company" ? companyName(w, lang) : so.key === "prefecture" ? (w.prefecture ?? "") : w.name);
    const d = so.dir === "asc" ? 1 : -1;
    return items.slice().sort((a, b) => val(a).localeCompare(val(b)) * d || a.name.localeCompare(b.name));
  };
  // one sortable column header, living inside the medal band → sorting is scoped to that medal, not the category
  const bandTh = (label: string, key: SortKey, gid: string, so: SortState) => (
    <button type="button" className="al-bandth" data-active={so.key === key ? "1" : "0"} onClick={() => toggleSort(gid, key)}>
      {label}<span className="al-sortarrow">{so.key === key ? (so.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
    </button>
  );

  return (
    <div className="al" style={{ minHeight: "100vh", background: "#f5f6f8", fontFamily: "'Inter','Noto Sans JP',sans-serif", color: "#101828", WebkitFontSmoothing: "antialiased" }}>
      <style>{STYLES}</style>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e8eaed", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="al-wrap" style={{ maxWidth: 1420, margin: "0 auto", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1e3a8a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 17 }}>C</div>
            <span style={{ fontWeight: 700, fontSize: 17, color: "#1e3a8a", letterSpacing: "-.01em" }}>Compify</span>
            <span className="al-portal-sub" style={{ fontSize: 13, color: "#98a2b3", fontWeight: 500, paddingLeft: 2 }}>{t.brandSub}</span>
          </div>
          <div style={{ display: "flex", border: "1px solid #e4e7ec", borderRadius: 8, overflow: "hidden" }}>
            {(["it", "en", "ja"] as LangKey[]).map((l) => <button key={l} onClick={() => setLang(l)} style={langBtn(lang === l)}>{l === "ja" ? "日本語" : l.toUpperCase()}</button>)}
          </div>
        </div>
      </header>

      {/* Title */}
      <div className="al-wrap" style={{ maxWidth: 1420, margin: "0 auto", padding: "30px 28px 6px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".08em", color: "#1e3a8a", textTransform: "uppercase", marginBottom: 8 }}>{t.kicker}</div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: "-.01em" }}>{t.title}</h1>
        <p style={{ margin: "9px 0 0", fontSize: 14, lineHeight: 1.7, color: "#667085", maxWidth: 640 }}>{t.subtitle}</p>
      </div>

      {/* Sticky nav: session filter + search/region + category jump-rail (scroll-spy) */}
      <div ref={barRef} style={{ position: "sticky", top: 60, zIndex: 30, background: "#f5f6f8", paddingTop: 12 }}>
        <div className="al-wrap" style={{ maxWidth: 1420, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ background: "#fff", border: "1px solid #e9ebef", borderRadius: 14, padding: 14, boxShadow: "0 8px 22px rgba(16,24,40,.08)" }}>
            <div className="al-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div className="al-seg-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SESSION_ORDER.map((s) => <button key={s} onClick={() => changeSession(s)} style={segBtn(session === s)}>{SESSION_META[s][lang]}</button>)}
              </div>
              <div className="al-tools" style={{ display: "flex", alignItems: "center", gap: 9, flex: "1 1 460px", minWidth: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <select className="al-prefsel" value={pref} onChange={(e) => setPref(e.target.value)} style={selStyle} aria-label={t.allPrefs}>
                  <option value="all">{t.allPrefs}</option>
                  {prefOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <TagSearch
                  tags={tags}
                  onAdd={(e) => setTags((prev) => (prev.some((x) => x.type === e.type && x.value === e.value) ? prev : [...prev, e]))}
                  onRemove={(e) => setTags((prev) => prev.filter((x) => !(x.type === e.type && x.value === e.value)))}
                  t={t}
                />
                <button onClick={genLink} title={t.genLink} className="al-linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", border: "1px solid #d7dbe2", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#344054", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  <span className="al-linklabel">{t.genLink}</span>
                </button>
              </div>
            </div>
            {/* category jump-rail with scroll-spy */}
            <div className="al-rail" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eef0f3" }}>
              <span style={{ fontSize: 11, color: "#8a93a3", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0, alignSelf: "center", paddingRight: 2 }}>{t.jumpTo}</span>
              {sections.map((s, i) => {
                const on = activeIdx === i;
                return (
                  <button key={s.cat} data-chip={i} onClick={() => jumpTo(i)} style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, padding: "6px 11px", border: `1px solid ${on ? "#1e3a8a" : "#e4e7ec"}`, borderRadius: 999, background: on ? "#1e3a8a" : "#fff", color: on ? "#fff" : "#475467", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "background .12s, border-color .12s, color .12s" }}>
                    {s.cat}
                    <span style={{ fontSize: 11, fontWeight: 700, color: on ? "rgba(255,255,255,.85)" : "#98a2b3" }}>{s.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Directory body — everything visible, grouped Category → Medal → rows */}
      <main className="al-wrap" style={{ maxWidth: 1420, margin: "0 auto", padding: "16px 28px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 2px 14px" }}>
          <span style={{ fontSize: 13, color: "#667085" }}><span style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 15 }}>{total}</span> {t.winners} · {SESSION_META[session][lang]} {t.inThis}</span>
          {(tags.length > 0 || pref !== "all") && <button onClick={() => { setTags([]); setPref("all"); }} style={{ border: "none", background: "none", fontFamily: "inherit", fontSize: 12, color: "#98a2b3", cursor: "pointer", fontWeight: 600 }}>{t.reset}</button>}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#b6bdc8" }}>{t.magnifica}</span>
        </div>

        {sections.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #e9ebef", borderRadius: 14, textAlign: "center", padding: "64px 20px", color: "#98a2b3" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⌕</div>
            <div style={{ fontSize: 15, color: "#475467", fontWeight: 600 }}>{t.noResults}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {sections.map((s, i) => (
              <section key={s.cat} id={secId(i)} data-sec data-idx={i} className="al-jump al-collector">
                {/* Category title — "Bodoni Milano · cornice incisa" (chosen from the title lab) */}
                <div className="al-cat-head">
                  <span className="al-cat-rule" aria-hidden><span className="fl">❦</span></span>
                  <h2 className="al-cat-title">{s.cat}</h2>
                  <div className="al-cat-milano">Milano <span className="d">·</span> MMXXVI</div>
                  <span className="al-cat-count">{s.count} {s.count === 1 ? t.winnerOne : t.winners}</span>
                  <span className="al-cat-rule2" aria-hidden />
                </div>
                {/* Medal bands are sticky within this body: Platino sticks under the menu until Doppio Oro
                    overtakes it, then Doppio Oro sticks, and so on — iOS-style section headers. Each band
                    carries the medal photo, the enlarged "category · medal", and the sortable column headers. */}
                <div className="al-tablebody">
                  {s.byMedal.map((mg) => {
                    const mm = MEDAL_META[mg.medal];
                    const gid = `${i}:${mg.medal}`;
                    const so = getSort(gid);
                    const items = sortItems(mg.items, so);
                    return (
                      <Fragment key={mg.medal}>
                        <div className="al-band" style={{ top: bandTop }}>
                          <Image src={medalImageFor(mg.items[0])} alt="" width={40} height={52} className="al-band-photo" />
                          <span className="al-band-tier"><span className="w">{mm[lang]}</span></span>
                          <span className="al-band-catname">{s.cat}</span>
                          <span className="al-band-count">{mg.items.length} {mg.items.length === 1 ? t.winnerOne : t.winners}</span>
                        </div>
                        <div className="al-colhead" style={{ gridTemplateColumns: COLS3 }}>
                          {bandTh(t.colName, "name", gid, so)}
                          {bandTh(t.colSakagura, "company", gid, so)}
                          {bandTh(t.colPrefecture, "prefecture", gid, so)}
                        </div>
                        {items.map((w) => (
                          <Link key={w.reg_id} href={`/msc2026/${w.reg_id}`} className="al-trow" style={{ gridTemplateColumns: COLS3 }}>
                            <span className="al-td al-td-name">{w.name}</span>
                            <span className="al-td al-td-saka" data-label={t.colSakagura}>{companyName(w, lang)}</span>
                            <span className="al-td al-td-reg" data-label={t.colPrefecture}>{w.prefecture ?? "—"}</span>
                          </Link>
                        ))}
                      </Fragment>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ marginTop: 34, border: "1px solid #e4e7ec", background: "#fff", borderRadius: 8, padding: "9px 15px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#475467", cursor: "pointer" }}>{t.backTop}</button>
      </main>

      {/* Footer — the "esempio 2" treatment: tricolore trio, italic signature, MILANO · MMXXVI */}
      <footer style={{ borderTop: "1px solid #e8eaed", background: "#fff" }}>
        <div className="al-wrap" style={{ maxWidth: 1420, margin: "0 auto", padding: "28px 28px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, textAlign: "center" }}>
          <span aria-hidden style={{ display: "flex", gap: 7 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#1a7a4a" }} />
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#d8dce2" }} />
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#b02a2a" }} />
          </span>
          <span style={{ fontFamily: "'EB Garamond',Georgia,serif", fontStyle: "italic", fontSize: 14, color: "#475467" }}>{t.title} · Milano Sake Challenge</span>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".24em", textTransform: "uppercase", color: "#98a2b3" }}>Milano · MMXXVI</span>
          <span style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#b6bdc8" }}><span style={{ width: 16, height: 16, borderRadius: 4, background: "#1e3a8a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>C</span>Powered by Compify · Milano Sake Challenge 2026</span>
        </div>
      </footer>

      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)", background: "#101828", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 80, boxShadow: "0 10px 30px rgba(16,24,40,.28)" }}>{toast}</div>
      )}
    </div>
  );
}

// ── Tag autocomplete: type "yamagata" → suggests the Yamagata region; type a name that is also a brewery →
//    suggests it tagged "Sakagura". Selecting adds a chip that carries its type label, exactly like the source page. ──
function TagSearch({ tags, onAdd, onRemove, t }: { tags: SearchTag[]; onAdd: (e: SearchTag) => void; onRemove: (e: SearchTag) => void; t: Record<string, string> }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const typeLabel = (ty: SearchTag["type"]) => (ty === "sakagura" ? t.tagSakagura : ty === "product" ? t.tagProduct : t.tagRegion);
  const sugg = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return [];
    const has = (e: SearchTag) => tags.some((x) => x.type === e.type && x.value === e.value);
    const rank = { sakagura: 0, product: 1, region: 2 } as const; // sakagura first, then products, then regions
    return SEARCH_ENTITIES.filter((e) => !has(e) && e.value.toLowerCase().includes(qq))
      .sort((a, b) =>
        rank[a.type] - rank[b.type] ||
        (a.value.toLowerCase().startsWith(qq) ? 0 : 1) - (b.value.toLowerCase().startsWith(qq) ? 0 : 1) ||
        a.value.localeCompare(b.value)
      )
      .slice(0, 8);
  }, [q, tags]);
  const choose = (e: SearchTag) => { onAdd(e); setQ(""); setOpen(false); };
  return (
    <div className="al-search" style={{ position: "relative", flex: "1 1 240px", minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "5px 8px", border: `1px solid ${open ? "#1e3a8a" : "#d7dbe2"}`, borderRadius: 8, background: "#fff", minHeight: 40 }}>
        <span style={{ color: "#98a2b3", fontSize: 14, paddingLeft: 2, flexShrink: 0 }}>⌕</span>
        {tags.map((tag) => (
          <span key={`${tag.type} ${tag.value}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 6px 3px 8px", borderRadius: 7, background: "#eef1fb", color: "#1e3a8a", fontSize: 12, fontWeight: 600, maxWidth: "100%", minWidth: 0 }}>
            <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#3b5fc0", opacity: 0.75 }}>{typeLabel(tag.type)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{tag.value}</span>
            <button onClick={() => onRemove(tag)} aria-label="rimuovi" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#1e3a8a", padding: 0, opacity: 0.7, flexShrink: 0, fontSize: 13, lineHeight: 1 }}>✕</button>
          </span>
        ))}
        <input value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && sugg.length) { e.preventDefault(); choose(sugg[0]); }
            else if (e.key === "Backspace" && q === "" && tags.length) onRemove(tags[tags.length - 1]);
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={tags.length === 0 ? t.searchTagPh : ""}
          style={{ flex: "1 1 60px", minWidth: 60, border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: "inherit", color: "#101828", padding: "4px 2px" }} />
      </div>
      {open && sugg.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e4e7ec", borderRadius: 10, boxShadow: "0 12px 28px rgba(16,24,40,.14)", zIndex: 60, maxHeight: 300, overflowY: "auto", padding: 4 }}>
          {sugg.map((e) => (
            <button key={`${e.type} ${e.value}`} onMouseDown={(ev) => { ev.preventDefault(); choose(e); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", border: "none", background: "transparent", color: "#101828", borderRadius: 7, padding: "8px 10px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.value}</span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#98a2b3", flexShrink: 0 }}>{typeLabel(e.type)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
