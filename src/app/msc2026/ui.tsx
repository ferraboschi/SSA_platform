"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { C, type LangKey, UI } from "./shared";

// ─── Language (persisted across navigation) ──────────────────────────────────
export function useLang(): [LangKey, (l: LangKey) => void] {
  const [lang, setLang] = useState<LangKey>("it");
  useEffect(() => {
    try {
      const s = localStorage.getItem("msc-lang");
      if (s === "it" || s === "en" || s === "ja") setLang(s);
    } catch {}
  }, []);
  const set = (l: LangKey) => {
    setLang(l);
    try {
      localStorage.setItem("msc-lang", l);
    } catch {}
  };
  return [lang, set];
}

// ─── Shared header (Compify bar) ─────────────────────────────────────────────
export function Header({ lang, setLang, onShare }: { lang: LangKey; setLang: (l: LangKey) => void; onShare: () => void }) {
  const t = UI[lang];
  return (
    <header style={{ background: C.card, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 50 }}>
      <div className="msc-wrap msc-headbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href="/msc2026" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, textDecoration: "none" }}>
          <Image src="/msc-logo.png" alt="Milano Sake Challenge" width={90} height={36} priority style={{ width: "auto", height: 34, objectFit: "contain", flexShrink: 0 }} />
          <span className="msc-brand-sub" style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 12, fontSize: 12, fontWeight: 600, color: C.micro, whiteSpace: "nowrap" }}>{t.portal} · 2026</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onShare} className="msc-btn" title={t.share}>
            <ShareIcon /> <span className="msc-btn-label">{t.share}</span>
          </button>
          <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {(["it", "en", "ja"] as LangKey[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  padding: "7px 11px",
                  border: "none",
                  background: lang === l ? C.indigoDark : "#fff",
                  color: lang === l ? "#fff" : C.sub,
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {l === "ja" ? "日本語" : l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

export function Toast({ msg }: { msg: string }) {
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: C.shadowMd }}>
      {msg}
    </div>
  );
}

// ─── Icons (lucide-style, inherit Compify's line aesthetic) ──────────────────
const ico = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export function SearchIcon() { return (<svg {...ico} width={15} height={15}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>); }
export function ShareIcon() { return (<svg {...ico} width={16} height={16}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>); }
export function ChevronIcon() { return (<svg {...ico} width={18} height={18}><path d="m9 18 6-6-6-6" /></svg>); }
export function BackIcon() { return (<svg {...ico} width={16} height={16}><path d="m15 18-6-6 6-6" /></svg>); }
export function ExternalIcon() { return (<svg {...ico} width={14} height={14}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>); }
export function AwardIcon() { return (<svg {...ico} width={17} height={17}><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /><circle cx="12" cy="8" r="6" /></svg>); }

// ─── Shared CSS ──────────────────────────────────────────────────────────────
export const MEDA_CSS = `
html, body { overscroll-behavior-y: none; }
html { scrollbar-gutter: stable; } /* reserve the scrollbar gutter so filtering never shifts the page sideways */
body { overflow-anchor: none; } /* the search row collapses/expands on scroll — don't let scroll-anchoring jump the page */
.msc-wrap { max-width: 1180px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
.msc-headbar { height: 64px; }
.msc-tabs { display: flex; gap: 4px; background: #eef0f3; border: 1px solid ${C.border}; border-radius: 12px; padding: 4px; overflow-x: auto; }
.msc-tabs-fill > button, .msc-tabs-fill > div { flex: 1 1 0; justify-content: center; min-width: 0; }
@media (max-width: 760px) { .msc-tabs-fill > button, .msc-tabs-fill > div { flex: 0 0 auto; } }
.msc-filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.msc-select { appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238a93a3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>"); background-repeat: no-repeat; background-position: right 10px center; }
.msc-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 13px; border: 1px solid ${C.border}; background: #fff; color: #344054; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; text-decoration: none; transition: background .12s, border-color .12s; }
.msc-btn:hover { background: #f9fafb; border-color: #d0d5dd; }
.msc-btn-primary { background: ${C.indigoDark}; color: #fff; border-color: ${C.indigoDark}; }
.msc-btn-primary:hover { background: #3b3791; border-color: #3b3791; }
.msc-btn-label { display: inline; }
.msc-row { display: flex; align-items: center; gap: 14px; width: 100%; padding: 11px 20px; border: none; border-top: 1px solid ${C.border2}; background: #fff; cursor: pointer; text-align: left; font-family: inherit; text-decoration: none; transition: background .1s; }
.msc-row:hover { background: #f8f9fc; }
.msc-row-medal { flex-shrink: 0; width: 44px; display: flex; align-items: center; justify-content: center; }
.msc-row-cat { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 12.5px; color: ${C.sub}; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msc-row-main { flex: 1; min-width: 0; }
.msc-row-name { display: block; font-size: 14.5px; font-weight: 600; color: ${C.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.msc-row-company { display: block; margin-top: 1px; font-size: 12.5px; color: ${C.sub}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.msc-row-meta { display: none; }
.msc-statgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.msc-hero { display: flex; gap: 22px; padding: 24px; }
.msc-medalgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.msc-sticky { position: sticky; top: 64px; z-index: 40; background: ${C.bg}; border-bottom: 1px solid ${C.border}; box-shadow: 0 8px 18px -14px rgba(16,24,40,0.22); }
.msc-flabel { font-size: 11px; font-weight: 700; color: ${C.micro}; letter-spacing: .06em; text-transform: uppercase; flex-shrink: 0; }
.msc-cat-wrap { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
/* Smooth-collapse wrapper (used by the medal list on mobile + the category grid on both). Base is global so it can
   animate on desktop too; WHICH class actually collapses it is media-gated: is-collapsed (mobile, stuck-based) vs
   is-collapsed-scroll (desktop, follows the free-search row's scroll show/hide). */
.msc-collapsible { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .34s ease, opacity .26s ease; opacity: 1; }
.msc-collapsible-inner { min-height: 0; overflow: hidden; }
.msc-banner-body { display: flex; align-items: center; gap: 24px; padding: 20px; }
.msc-banner-video { flex: 1.4 1 0; min-width: 0; }
.msc-banner-text { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
/* "Comprimi" pinned to the banner's bottom-right when expanded (desktop); in-flow, right-aligned on mobile. */
.msc-banner-collapse { position: absolute; bottom: 14px; right: 18px; }
@media (min-width: 641px) { .msc-collapsible.is-collapsed-scroll { grid-template-rows: 0fr; opacity: 0; } }
@media (max-width: 760px) {
  .msc-banner-body { flex-direction: column; align-items: stretch; gap: 16px; padding: 18px 20px 16px; }
  .msc-banner-video, .msc-banner-text { flex: none; }
  .msc-banner-collapse { position: static; align-self: flex-end; }
}
.msc-medal-mobile { display: none; } /* mobile-only vertical medal list; desktop uses the segmented strip */
.msc-cats-toggle, .msc-medals-toggle { display: none; } /* mobile-only show/hide bars ("Categorie" / "Medaglia"); desktop always shows the full controls */
@media (max-width: 900px) {
  .msc-row-cat { display: none; }
}
@media (max-width: 640px) {
  .msc-wrap { padding-left: 16px; padding-right: 16px; }
  .msc-brand-sub { display: none; }
  /* Medals go vertical: hide the desktop strip, show the full-width stack. */
  .msc-medal-desktop { display: none; }
  .msc-medal-mobile { display: block; }
  /* Once a medal is chosen, collapse every non-selected row — only the picked medal stays. */
  .msc-medal-mobile[data-selected="1"] .msc-medalitem:not(.msc-medalitem--on) { display: none !important; }
  /* Hide medals with no results for the current filter (non-pertinent) instead of just dimming them. */
  .msc-medal-mobile .msc-medalitem--off { display: none !important; }
  /* Mobile collapse (stuck-based) for the medal list & category grid — base rules are global (above). */
  .msc-collapsible.is-collapsed { grid-template-rows: 0fr; opacity: 0; }
  /* Fixed, uniform height for every medal row — and the same value on the session pill (below) so Medaglia == Sessione. */
  .msc-medal-mobile .msc-medalitem { height: 54px; box-sizing: border-box; }
  /* "Categorie" / "Medaglia" toggle bars: full-width, shorter than the pills (secondary), white with an indigo label+chevron. */
  .msc-cats-toggle, .msc-medals-toggle {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; padding: 10px 15px;
    border: 1px solid ${C.border}; border-radius: 10px; background: #fff; box-shadow: ${C.shadow};
    color: ${C.indigo}; font-weight: 600; font-size: 13px; font-family: inherit; cursor: pointer;
  }
  .msc-cats-toggle { margin-top: 10px; }
  .msc-medals-toggle { margin-bottom: 9px; }
 /* !important beats the button's inline display:flex */
  /* Stick the filter block only while a medal is selected (keeps it pinned); unselected, the tall list scrolls away. */
  .msc-sticky[data-mobstick="0"] { position: static; box-shadow: none; }
  /* Sessions collapse like medals: pick one → hide the "SESSIONI" label + the other sessions, so only the chosen
     session shows. The inline category chip ("Aged Honkaku ×") STAYS so its × can clear/re-navigate the category. */
  .msc-session-bar[data-selected="1"] .msc-flabel { display: none; }
  .msc-session-bar[data-selected="1"] .msc-sessionitem:not(.msc-sessionitem--on) { display: none !important; }
  /* Drop the gray segmented track: the collapsed session becomes a full-width filled pill, same height/fullness as the medal. */
  .msc-session-bar[data-selected="1"] { background: transparent !important; border-color: transparent !important; padding: 0 !important; overflow: visible; }
  .msc-session-bar[data-selected="1"] .msc-sessionitem--on {
    flex: 1 1 auto !important; width: 100%;
    justify-content: space-between !important;
    height: 54px !important; box-sizing: border-box !important; /* exact same height as the medal pill (.msc-medalitem) */
    padding: 0 14px !important;
    border: 1px solid ${C.indigo} !important; background: ${C.indigoBg} !important;
    border-radius: 11px !important; box-shadow: none !important;
  }
  /* Enlarge the session label to match the medal (15px); works for both the SegTab and the pill's inner button. */
  .msc-session-bar[data-selected="1"] .msc-sessionitem--on,
  .msc-session-bar[data-selected="1"] .msc-sessionitem--on > button { font-size: 15px !important; color: ${C.ink} !important; }
  /* Two colours only: the indigo pill + a white category chip that pops inside it (the "›" separator is dropped).
     The chip is enlarged on mobile — it was cramped — for a comfortable tap target. */
  .msc-session-bar[data-selected="1"] .msc-cat-sep { display: none; }
  .msc-session-bar[data-selected="1"] .msc-cat-chip { background: #fff !important; padding: 6px 9px 6px 13px !important; font-size: 13.5px !important; gap: 7px !important; }
  .msc-statgrid { grid-template-columns: repeat(2, 1fr); }
  .msc-hero { flex-direction: column; gap: 16px; padding: 20px; }
  .msc-row-place { display: none; }
  .msc-row { align-items: flex-start; padding: 13px 16px; }
  .msc-row-name { white-space: normal; overflow: visible; font-size: 15px; line-height: 1.32; }
  .msc-row-company { white-space: normal; overflow: visible; line-height: 1.35; }
  .msc-row-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 6px; font-size: 12px; color: ${C.sub}; }
  .msc-btn-label { display: none; }
  .msc-filters { flex-wrap: nowrap; gap: 8px; }
  .msc-result-count { display: none; }
}
`;
