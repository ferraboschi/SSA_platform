"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  C, type MedalKey, type SessionKey, type LangKey, type Winner, type SearchTag,
  VISIBLE, MEDAL_ORDER, ALL_CATEGORIES, CATEGORY_GROUPS, CATEGORY_TYPE_OF, SEARCH_ENTITIES, SEARCH_KEYS, MEDAL_META, SESSION_META, UI,
  medalImageFor, companyName,
} from "./shared";
import { Header, Toast, useLang, MEDA_CSS, SearchIcon, ChevronIcon } from "./ui";

function MedagliereClient() {
  const [lang, setLang] = useLang();
  const [activeMedal, setActiveMedal] = useState<MedalKey | "all">("all");
  const [catType, setCatType] = useState<SessionKey | null>(null); // chosen category type (Nihonshu/Shochu/Abbinamento)
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [tags, setTags] = useState<SearchTag[]>([]); // free-search tags (sakagura / product / region)
  const [toast, setToast] = useState<string | null>(null);
  const [congratsClosed, setCongratsClosed] = useState(false); // dismissible congrats banner (persisted)
  const [searchVisible, setSearchVisible] = useState(true); // free-search row auto-hides on scroll-down while filtering
  const visibleRef = useRef(true);
  const t = UI[lang];

  const visible = VISIBLE;

  useEffect(() => { try { if (localStorage.getItem("msc-congrats") === "closed") setCongratsClosed(true); } catch {} }, []);
  const closeCongrats = () => { setCongratsClosed(true); try { localStorage.setItem("msc-congrats", "closed"); } catch {} };

  // Free-search row auto-hides when scrolling DOWN, reappears when scrolling UP (only matters while a filter is engaged).
  // A short cooldown after each toggle ignores the reflow-induced scroll (collapsing shortens the page) → no flicker loop.
  useEffect(() => {
    let lastY = window.scrollY, ticking = false, cooldownUntil = 0;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - lastY) > 6) {
          const now = performance.now();
          if (now >= cooldownUntil) {
            // hide only well into the list (never near the search↔list boundary, where toggling would flicker)
            const desired = y > lastY && y > 320 ? false : (y < lastY ? true : visibleRef.current);
            if (desired !== visibleRef.current) {
              visibleRef.current = desired;
              setSearchVisible(desired);
              cooldownUntil = now + 380;
            }
          }
          lastY = y;
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const m = p.get("medal");
    if (m && (MEDAL_ORDER as string[]).includes(m)) setActiveMedal(m as MedalKey);
    const cat = p.get("cat");
    if (cat && ALL_CATEGORIES.includes(cat)) { setActiveCategory(cat); setCatType(CATEGORY_TYPE_OF[cat] ?? null); }
    const loaded: SearchTag[] = [];
    for (const raw of p.getAll("t")) {
      const i = raw.indexOf(":");
      if (i < 0) continue;
      const tag = { type: raw.slice(0, i) as SearchTag["type"], value: raw.slice(i + 1) };
      if (SEARCH_KEYS.has(`${tag.type} ${tag.value}`)) loaded.push(tag);
    }
    if (loaded.length) setTags(loaded);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (activeMedal !== "all") p.set("medal", activeMedal);
    if (activeCategory) p.set("cat", activeCategory);
    for (const tag of tags) p.append("t", `${tag.type}:${tag.value}`);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [activeMedal, activeCategory, tags]);

  const baseRS = useMemo(() => {
    if (tags.length === 0) return visible;
    // OR across tags: a product matches if it satisfies ANY tag (sakagura, product name, or prefecture).
    return visible.filter((w) =>
      tags.some((tag) =>
        tag.type === "region" ? w.prefecture === tag.value
          : tag.type === "sakagura" ? w.company_en === tag.value
          : w.name === tag.value
      )
    );
  }, [visible, tags]);

  // Cross-filter pertinence — medals are session-specific, so medal ↔ session(type) exclude each other:
  //  - medals enabled = those present under the active SESSION-type and/or CATEGORY
  //  - sessions enabled = those (category-types) present under the active MEDAL
  //  - categories enabled = those present under the active MEDAL
  const medalsPresent = useMemo(() => {
    let src = baseRS;
    if (catType) src = src.filter((w) => CATEGORY_TYPE_OF[w.category] === catType);
    if (activeCategory) src = src.filter((w) => w.category === activeCategory);
    return new Set(src.map((w) => w.medal));
  }, [baseRS, catType, activeCategory]);

  const typesPresent = useMemo(() => {
    const src = activeMedal === "all" ? baseRS : baseRS.filter((w) => w.medal === activeMedal);
    return new Set(src.map((w) => CATEGORY_TYPE_OF[w.category]));
  }, [baseRS, activeMedal]);

  const categoriesPresent = useMemo(() => {
    let src = baseRS;
    if (catType) src = src.filter((w) => CATEGORY_TYPE_OF[w.category] === catType);
    if (activeMedal !== "all") src = src.filter((w) => w.medal === activeMedal);
    return new Set(src.map((w) => w.category));
  }, [baseRS, catType, activeMedal]);

  // The session (catType) now HIDES the other sessions (real filter), not just reveals categories.
  const filtered = useMemo(
    () => baseRS.filter((w) =>
      (catType === null || CATEGORY_TYPE_OF[w.category] === catType) &&
      (activeMedal === "all" || w.medal === activeMedal) &&
      (!activeCategory || w.category === activeCategory)
    ),
    [baseRS, catType, activeMedal, activeCategory]
  );

  const grouped = useMemo(() => {
    const byMedal = new Map<MedalKey, Winner[]>();
    for (const w of filtered) {
      if (!byMedal.has(w.medal)) byMedal.set(w.medal, []);
      byMedal.get(w.medal)!.push(w);
    }
    return MEDAL_ORDER.filter((m) => byMedal.has(m)).map((m) => ({
      medal: m,
      items: byMedal.get(m)!.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [filtered]);

  // Drop a chosen chip if the other dimension makes it non-present (safety for URL-loaded states).
  useEffect(() => {
    if (activeMedal !== "all" && !medalsPresent.has(activeMedal)) setActiveMedal("all");
  }, [medalsPresent, activeMedal]);
  useEffect(() => {
    if (activeCategory && !categoriesPresent.has(activeCategory)) setActiveCategory(null);
  }, [categoriesPresent, activeCategory]);
  useEffect(() => {
    if (catType && !typesPresent.has(catType)) { setCatType(null); setActiveCategory(null); }
  }, [typesPresent, catType]);

  const flash = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 1800); }, []);
  const copyLink = useCallback(() => {
    const p = new URLSearchParams();
    if (activeMedal !== "all") p.set("medal", activeMedal);
    if (activeCategory) p.set("cat", activeCategory);
    for (const tag of tags) p.append("t", `${tag.type}:${tag.value}`);
    const url = `${window.location.origin}${window.location.pathname}${p.toString() ? `?${p}` : ""}`;
    navigator.clipboard?.writeText(url);
    flash(t.copied);
  }, [activeMedal, activeCategory, tags, t.copied, flash]);

  // Selecting a chip is the filter (toggle re-click = back to all). NEVER scroll — the page/header stay exactly put;
  // only the list updates (client: adding a filter must not hide the saluti / move the header).
  const pickMedal = (m: MedalKey) => {
    setActiveMedal((cur) => (cur === m ? "all" : m));
    // Best/Good With ARE the food-pairing medals → auto-select the Abbinamento Cibo session so its 5 foods reveal.
    if (m === "best_with" || m === "good_with") setCatType("pairing");
  };
  // Type (session) selector reveals that type's categories (re-click hides them); switching type clears the chosen category.
  const pickType = (k: SessionKey) => { setCatType((cur) => (cur === k ? null : k)); setActiveCategory(null); };
  const pickCategory = (c: string) => setActiveCategory((cur) => (cur === c ? null : c));
  const clearCategory = () => setActiveCategory(null); // chip × → reopen the category panel (no scroll)
  const addTag = (tag: SearchTag) => setTags((cur) => (cur.some((x) => x.type === tag.type && x.value === tag.value) ? cur : [...cur, tag]));
  const removeTag = (tag: SearchTag) => setTags((cur) => cur.filter((x) => !(x.type === tag.type && x.value === tag.value)));
  const resetAll = () => { setActiveMedal("all"); setCatType(null); setActiveCategory(null); setTags([]); };
  const hasFilters = activeMedal !== "all" || catType !== null || activeCategory !== null || tags.length > 0;
  const filterEngaged = activeMedal !== "all" || catType !== null; // a medal or session is applied
  const showSearch = !filterEngaged || searchVisible; // when no filter is engaged the search always stays

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.font, color: C.ink }}>
      <style>{MEDA_CSS}</style>
      <Header lang={lang} setLang={setLang} onShare={copyLink} />

      {/* Title */}
      <div className="msc-wrap" style={{ paddingTop: 28, paddingBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.micro, letterSpacing: ".06em" }}>{t.kicker}</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "6px 0 6px", color: C.ink, letterSpacing: "-0.01em" }}>{t.title}</h1>
        {!congratsClosed && (
          <div style={{ position: "relative", marginTop: 18, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "16px 44px 16px 20px", borderRadius: 16, border: "1px solid #ece2c6", background: "linear-gradient(135deg,#fffaef 0%,#fcf4e2 100%)", boxShadow: C.shadow }}>
            <Image src="/msc-logo.png" alt="Milano Sake Challenge 2026" width={130} height={52} style={{ width: "auto", height: 50, objectFit: "contain", flexShrink: 0 }} />
            <p style={{ margin: 0, flex: "1 1 300px", minWidth: 0, fontSize: 14, lineHeight: 1.55, color: "#6b5b33" }}>{t.congrats}</p>
            <button onClick={closeCongrats} aria-label="close" style={{ position: "absolute", top: 10, right: 10, border: "none", background: "transparent", cursor: "pointer", color: "#b08a3a", display: "flex", padding: 4 }}><CloseMini /></button>
          </div>
        )}
      </div>

      {/* Filters — float below the header on scroll */}
      <div className="msc-sticky">
      <div className="msc-wrap" style={{ paddingTop: 14, paddingBottom: 12 }}>
        {/* MEDAGLIA — always full; selecting one fades (never hides) the others. Non-pertinent are disabled. */}
        <div className="msc-tabs msc-tabs-fill" style={{ alignItems: "center" }}>
          <span className="msc-flabel" style={{ padding: "0 8px" }}>{t.medalLabel}</span>
          {MEDAL_ORDER.map((m) => (
            <MedalChip key={m} active={activeMedal === m} disabled={!medalsPresent.has(m)} faded={activeMedal !== "all" && activeMedal !== m} onClick={() => pickMedal(m)} label={MEDAL_META[m][lang]} dot={MEDAL_META[m].dot} activeText={MEDAL_META[m].chipText} />
          ))}
        </div>

        {/* SESSIONI — pick a session (Nihonshu / Shochu / Abbinamento). Its categories appear below until one is chosen;
            the choice then sits as a sub-section row UNDER its session, and the panel reopens when that chip's × is clicked. */}
        {/* The chosen category lives INSIDE the active session's pill (same line): "Nihonshu › [Futsushu ×]". */}
        <div className="msc-tabs msc-tabs-fill" style={{ marginTop: 10, alignItems: "center" }}>
          <span className="msc-flabel" style={{ padding: "0 8px" }}>{t.sessionsLabel}</span>
          {CATEGORY_GROUPS.map((g) =>
            catType === g.key && activeCategory ? (
              <div key={g.key} style={{ minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#fff", boxShadow: C.shadow, borderRadius: 9, padding: "4px 6px 4px 13px" }}>
                <button onClick={() => pickType(g.key)} style={{ border: "none", background: "transparent", color: C.ink, fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", padding: 0, whiteSpace: "nowrap" }}>{SESSION_META[g.key][lang]}</button>
                <span style={{ color: "#c2c8d0", fontSize: 15, lineHeight: 1 }}>›</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.indigoBg, color: C.indigoDark, border: `1px solid ${C.indigo}`, borderRadius: 7, padding: "3px 5px 3px 9px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {activeCategory}
                  <button onClick={clearCategory} aria-label="clear" style={{ border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", color: C.indigo, padding: 0, opacity: 0.75 }}><CloseMini /></button>
                </span>
              </div>
            ) : (
              <SegTab key={g.key} active={catType === g.key} disabled={!typesPresent.has(g.key)} onClick={() => pickType(g.key)} label={SESSION_META[g.key][lang]} />
            )
          )}
        </div>
        {catType && !activeCategory && (
          <div className="msc-cat-wrap" style={{ marginTop: 10 }}>
            {(CATEGORY_GROUPS.find((g) => g.key === catType)?.cats ?? []).map((c) => (
              <CatButton key={c} active={false} disabled={!categoriesPresent.has(c)} onClick={() => pickCategory(c)} label={c} />
            ))}
          </div>
        )}

        {/* Unified autocomplete tag search + count + Reset — collapses on scroll-down (while filtering), reopens on scroll-up */}
        <div style={{ display: "grid", gridTemplateRows: showSearch ? "1fr" : "0fr", transition: "grid-template-rows .26s ease, opacity .2s ease", opacity: showSearch ? 1 : 0, pointerEvents: showSearch ? "auto" : "none" }}>
          <div style={{ minHeight: 0, overflow: showSearch ? "visible" : "hidden" }}>
            <div className="msc-filters" style={{ marginTop: 14 }}>
              <TagSearch tags={tags} onAdd={addTag} onRemove={removeTag} lang={lang} />
              {hasFilters && (
                <span className="msc-result-count" style={{ fontSize: 12.5, fontWeight: 700, color: C.indigo, background: C.indigoBg, borderRadius: 8, padding: "7px 11px", flexShrink: 0, whiteSpace: "nowrap" }}>{filtered.length} {t.results}</span>
              )}
              <button onClick={hasFilters ? resetAll : undefined} disabled={!hasFilters} className="msc-btn" style={{ marginLeft: "auto", flexShrink: 0, opacity: hasFilters ? 1 : 0.4, cursor: hasFilters ? "pointer" : "default" }}>Reset</button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Results — grouped by medal; all blocks stay visible (scroll up/down) */}
      <div className="msc-wrap" style={{ paddingTop: 18, paddingBottom: 64 }}>
        {grouped.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "56px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{t.noResults}</div>
            <div style={{ fontSize: 14, color: C.sub, marginTop: 6 }}>{t.noResultsSub}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {grouped.map((g) => (
              <div id={`m-${g.medal}`} key={g.medal}>
                <TierCard medal={g.medal} items={g.items} lang={lang} count={hasFilters ? g.items.length : undefined} category={activeCategory} />
              </div>
            ))}
          </div>
        )}
      </div>

      <footer style={{ borderTop: `1px solid ${C.border}`, background: C.card }}>
        <div className="msc-wrap" style={{ padding: "20px 0", fontSize: 12.5, color: C.micro, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>{t.noScore}</span>
          <span>Milano Sake Challenge 2026</span>
        </div>
      </footer>

      {toast && <Toast msg={toast} />}
    </div>
  );
}

// ─── Unified autocomplete tag search (sakagura / product / region) ────────────
function TagSearch({ tags, onAdd, onRemove, lang }: { tags: SearchTag[]; onAdd: (t: SearchTag) => void; onRemove: (t: SearchTag) => void; lang: LangKey }) {
  const t = UI[lang];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const typeLabel = (ty: SearchTag["type"]) => (ty === "sakagura" ? t.tagSakagura : ty === "product" ? t.tagProduct : t.tagRegion);
  const sugg = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return [];
    const has = (e: SearchTag) => tags.some((x) => x.type === e.type && x.value === e.value);
    const typeRank = { sakagura: 0, product: 1, region: 2 } as const; // sakagura first, then products, then regions
    return SEARCH_ENTITIES.filter((e) => !has(e) && e.value.toLowerCase().includes(qq))
      .sort((a, b) =>
        typeRank[a.type] - typeRank[b.type] ||
        (a.value.toLowerCase().startsWith(qq) ? 0 : 1) - (b.value.toLowerCase().startsWith(qq) ? 0 : 1) ||
        a.value.localeCompare(b.value)
      )
      .slice(0, 8);
  }, [q, tags]);
  const choose = (e: SearchTag) => { onAdd(e); setQ(""); setOpen(false); };
  return (
    <div style={{ position: "relative", flex: "1 1 360px", minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "5px 8px", border: `1px solid ${open ? C.indigo : C.border}`, borderRadius: 9, background: "#fff", minHeight: 42 }}>
        <span style={{ color: C.micro, display: "flex", paddingLeft: 2 }}><SearchIcon /></span>
        {tags.map((tag) => (
          <span key={`${tag.type} ${tag.value}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 6px 4px 9px", borderRadius: 7, background: C.indigoBg, color: C.indigoDark, fontSize: 12.5, fontWeight: 600, maxWidth: "100%" }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: C.indigo, opacity: 0.7 }}>{typeLabel(tag.type)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag.value}</span>
            <button onClick={() => onRemove(tag)} aria-label="remove" style={{ border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", color: C.indigo, padding: 0, opacity: 0.7 }}><CloseMini /></button>
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
          style={{ flex: "1 1 90px", minWidth: 90, border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: C.font, color: C.ink, padding: "5px 2px" }} />
      </div>
      {open && sugg.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: C.shadowMd, zIndex: 60, maxHeight: 300, overflowY: "auto", padding: 4 }}>
          {sugg.map((e) => (
            <button key={`${e.type} ${e.value}`} onMouseDown={(ev) => { ev.preventDefault(); choose(e); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", border: "none", background: "transparent", color: C.ink, borderRadius: 7, padding: "8px 10px", fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.value}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: C.micro, flexShrink: 0 }}>{typeLabel(e.type)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chips ───────────────────────────────────────────────────────────────────
// Separated category button (distinct from the next; grows to fill/balance the row, wraps onto multiple rows).
// `faded` = a different category is selected → dim this one but keep it visible and clickable (nothing disappears).
function CatButton({ active, onClick, label, disabled, faded }: { active: boolean; onClick: () => void; label: string; disabled?: boolean; faded?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{ flex: "1 1 auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", minHeight: 36, border: `1px solid ${active ? C.indigo : C.border}`, borderRadius: 9, background: active ? C.indigoBg : "#fff", color: disabled ? "#c2c8d0" : active ? C.indigoDark : C.sub, fontWeight: 600, fontSize: 13, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : faded ? 0.5 : 1, whiteSpace: "nowrap", fontFamily: "inherit", transition: "background .12s, border-color .12s, opacity .12s" }}>
      {/* 3 slots: left mirror (keeps label centred) · centred label · the × pinned far-right in its own reserved slot */}
      <span aria-hidden style={{ flex: "0 0 14px" }} />
      <span style={{ flex: "1 1 auto", textAlign: "center" }}>{label}</span>
      <span aria-hidden={!active} style={{ flex: "0 0 14px", display: "inline-flex", justifyContent: "flex-end", color: C.indigo, opacity: 0.7, visibility: active ? "visible" : "hidden" }}><CloseMini /></span>
    </button>
  );
}

// Segmented gray-track tab for the category type — neutral (no colour); dims + disables when not pertinent to the medal.
function SegTab({ active, onClick, label, disabled }: { active: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", borderRadius: 9, background: active ? "#fff" : "transparent", boxShadow: active ? C.shadow : "none", color: disabled ? "#c2c8d0" : active ? C.ink : C.sub, fontWeight: 600, fontSize: 13.5, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap", fontFamily: "inherit", transition: "background .12s, opacity .12s" }}>
      {label}
      {active && <span style={{ display: "inline-flex", color: C.micro, marginLeft: 1 }}><CloseMini /></span>}
    </button>
  );
}

function MedalChip({ active, onClick, label, dot, activeText, disabled, faded }: { active: boolean; onClick: () => void; label: string; dot?: string; activeText?: string; disabled?: boolean; faded?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", borderRadius: 9, background: active ? "#fff" : "transparent", boxShadow: active ? C.shadow : "none", color: disabled ? "#c2c8d0" : active ? (activeText ?? C.ink) : C.sub, fontWeight: 600, fontSize: 12.5, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : faded ? 0.5 : 1, whiteSpace: "nowrap", fontFamily: "inherit", transition: "background .12s, opacity .12s" }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, opacity: disabled ? 0.4 : active ? 1 : 0.6 }} />}
      {label}
      {active && <span style={{ display: "inline-flex", color: activeText ?? C.micro, opacity: 0.7, marginLeft: 1 }}><CloseMini /></span>}
    </button>
  );
}

// Elegant medal glyph (ribbon + star medallion) used in the tier header.
function MedalBadgeIcon() {
  return (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.2 3.2 10 8.5M15.8 3.2 14 8.5" />
      <circle cx="12" cy="14.5" r="6" />
      <path d="M12 11.1l1.16 2.35 2.59.38-1.87 1.83.44 2.58L12 17.41l-2.32 1.22.44-2.58-1.87-1.83 2.59-.38z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Each medal tier = its own block-card with a luxe metallic header. `count` shows only when a filter is active;
// `category` (the active category filter) is appended to the band label, e.g. "GOLD · DAIGINJO".
function TierCard({ medal, items, lang, count, category }: { medal: MedalKey; items: Winner[]; lang: LangKey; count?: number; category?: string | null }) {
  const mm = MEDAL_META[medal];
  return (
    <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: C.shadow, overflow: "hidden", scrollMarginTop: 230 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 20px", background: mm.band, borderBottom: `1px solid ${mm.bandBorder}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)" }}>
        <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.65)", color: mm.bandText, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 2px rgba(16,24,40,0.12)", flexShrink: 0 }}><MedalBadgeIcon /></span>
        <span style={{ minWidth: 0, fontSize: 15, fontWeight: 800, color: mm.bandText, textTransform: "uppercase", letterSpacing: ".1em", textShadow: "0 1px 0 rgba(255,255,255,0.45)" }}>
          {mm[lang]}{category ? <span style={{ fontWeight: 700, letterSpacing: ".04em" }}> · {category}</span> : null}
        </span>
        {count !== undefined && (
          <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: "#fff", background: mm.bandText, borderRadius: 999, padding: "2px 11px", boxShadow: "0 1px 2px rgba(16,24,40,0.2)" }}>{count}</span>
        )}
      </div>
      {items.map((w) => (<ProductRow key={w.reg_id} winner={w} lang={lang} />))}
    </section>
  );
}

function ProductRow({ winner, lang }: { winner: Winner; lang: LangKey }) {
  const img = medalImageFor(winner);
  const sm = SESSION_META[winner.session];
  const place = winner.prefecture ?? ""; // only the prefecture — not the macro-area (client: "solo la regione, non l'area")
  return (
    <Link className="msc-row" href={`/msc2026/${winner.reg_id}`}>
      <span className="msc-row-medal">
        <Image src={img} alt="" width={40} height={52} style={{ objectFit: "contain", width: "auto", height: 48 }} />
      </span>
      <span className="msc-row-main">
        <span className="msc-row-name">{winner.name}</span>
        <span className="msc-row-company">{companyName(winner, lang)}</span>
        {/* mobile-only meta line: session · category (· prefecture) */}
        <span className="msc-row-meta">
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: sm.accent, flexShrink: 0 }} />
          {SESSION_META[winner.session][lang]} · {winner.category}{place ? ` · ${place}` : ""}
        </span>
      </span>
      <span className="msc-row-cat">
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: sm.accent, flexShrink: 0 }} />
        {SESSION_META[winner.session][lang]} · {winner.category}
      </span>
      <span className="msc-row-place" style={{ fontSize: 12.5, color: C.micro, flexShrink: 0, textAlign: "right" }}>{place}</span>
      <span style={{ color: "#c2c8d0", flexShrink: 0, display: "flex", alignSelf: "center" }}><ChevronIcon /></span>
    </Link>
  );
}

function CloseMini() { return (<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>); }

export { MedagliereClient };
