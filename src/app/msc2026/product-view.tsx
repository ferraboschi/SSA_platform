"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  C, type Winner, type MedalRef, type SessionReport, type SessionKey, type MedalKey, type RadarAxis, type LangKey,
  VISIBLE, SESSION_ORDER, MEDAL_META, SESSION_META, REGION_META, SHEET_LABELS, UI, RADAR_LABELS,
  medalImageFor, companyName, regionKeyOf, present, productByRegId, winnerByRegId,
} from "./shared";
import { Header, Toast, useLang, MEDA_CSS, ShareIcon, ExternalIcon, BackIcon, AwardIcon } from "./ui";

export function ProductView({ winner }: { winner: Winner }) {
  const [lang, setLang] = useLang();
  const [toast, setToast] = useState<string | null>(null);
  const t = UI[lang];
  const L = (k: keyof typeof SHEET_LABELS) => SHEET_LABELS[k][lang];
  const r = regionKeyOf(winner);

  const rec = productByRegId(winner.reg_id);
  const medals: MedalRef[] = rec?.medals ?? [{ session: winner.session, category: winner.category, medal: winner.medal, cat_code: winner.cat_code, reg_id: winner.reg_id }];
  const reports = rec?.reports ?? {};
  const heroMedal = medals[0];
  const heroWinner = winnerByRegId(heroMedal.reg_id) ?? winner;
  const mm = MEDAL_META[heroMedal.medal];

  // "Back" returns to the medagliere with the filters the user had set (saved by the list in sessionStorage) —
  // so navigating into a product and back doesn't wipe medal/session/category/search. The logo stays a clean reset.
  const [backHref, setBackHref] = useState("/msc2026");
  useEffect(() => { try { const f = sessionStorage.getItem("msc-filters"); if (f) setBackHref(`/msc2026?${f}`); } catch {} }, []);

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1800); };
  const forward = useCallback(() => {
    const data = { title: winner.name, text: `${winner.name} — ${winner.company_en} · Milano Sake Challenge 2026`, url: window.location.href };
    if (navigator.share) { navigator.share(data).catch(() => {}); }
    else { navigator.clipboard?.writeText(window.location.href); flash(t.copied); }
  }, [winner.name, winner.company_en, t.copied]);
  const save = useCallback(() => { flash(t.saved); window.setTimeout(() => window.print(), 250); }, [t.saved]);
  // Social sharing (opens the platform's web share intent with this product page's URL)
  const shareText = `${winner.name} — ${winner.company_en} · Milano Sake Challenge 2026`;
  const here = () => window.location.href;
  const openShare = (u: string) => window.open(u, "_blank", "noopener,noreferrer");
  const shareWhatsApp = () => openShare(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${here()}`)}`);
  const shareFacebook = () => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(here())}`);
  const shareX = () => openShare(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(here())}`);
  const shareLinkedIn = () => openShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(here())}`);
  const shareEmail = () => { window.location.href = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n${here()}`)}`; };
  const copyLink = () => { navigator.clipboard?.writeText(here()); flash(t.copied); };

  // Technical sheet
  const stats: { label: string; value: ReactNode }[] = [];
  if (present(winner.polishing_rate)) stats.push({ label: L("polishing_rate"), value: `${winner.polishing_rate}%` });
  if (present(winner.smv)) stats.push({ label: L("smv"), value: String(winner.smv) });
  if (present(winner.alcohol)) stats.push({ label: L("alcohol"), value: `${winner.alcohol}%` });
  if (present(winner.brewery_founded)) stats.push({ label: L("brewery_founded"), value: String(winner.brewery_founded) });
  // product_type moves to a chip in the hero (next to the medals) — not a technical fact.
  const chipRows: { label: string; chips: string[] }[] = [];
  if (present(winner.rice)) chipRows.push({ label: L("rice"), chips: winner.rice! });
  if (present(winner.yeast)) chipRows.push({ label: L("yeast"), chips: winner.yeast! });
  const kojiPertinent = (winner.koji ?? []).filter((k) => k.toLowerCase() !== "yellow"); // "yellow" is the default → not informative
  if (kojiPertinent.length) chipRows.push({ label: L("koji"), chips: kojiPertinent });
  // Price + product type alone don't make a technical sheet → only show the section with a substantive fact.
  const hasRealTech = present(winner.polishing_rate) || present(winner.smv) || present(winner.alcohol) || present(winner.brewery_founded) || chipRows.length > 0;

  const siblings = VISIBLE.filter((w) => w.company_en === winner.company_en && w.reg_id !== winner.reg_id)
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);

  const meta = [winner.category, winner.prefecture, REGION_META[r][lang]].filter(Boolean).join(" · ");
  const reportSessions = SESSION_ORDER.filter((s) => reports[s]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.font, color: C.ink }}>
      <style>{MEDA_CSS}</style>
      <Header lang={lang} setLang={setLang} onShare={forward} />

      <div className="msc-wrap" style={{ paddingTop: 20, paddingBottom: 64 }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <Link href={backHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.sub, fontSize: 13.5, fontWeight: 600, textDecoration: "none", marginBottom: 16 }}>
            <BackIcon /> {t.back}
          </Link>

          {/* Hero */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: C.shadow, overflow: "hidden" }}>
            <div style={{ height: 5, background: mm.band }} />
            <div className="msc-hero">
              <div style={{ flexShrink: 0, width: 132, height: 168, background: "linear-gradient(180deg,#f9fafb,#f1f3f6)", border: `1px solid ${C.border2}`, borderRadius: 16, display: "grid", placeItems: "center" }}>
                <Image src={medalImageFor(heroWinner)} alt="" width={104} height={134} style={{ objectFit: "contain", width: "auto", height: 138 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {medals.map((m) => {
                    const cm = MEDAL_META[m.medal];
                    return (
                      <span key={m.reg_id} style={{ display: "inline-flex", alignItems: "center", background: cm.band, color: cm.bandText, border: `1px solid ${cm.bandBorder}`, padding: "4px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>
                        {cm[lang]}
                      </span>
                    );
                  })}
                  {winner.product_type && (
                    <span style={{ display: "inline-flex", alignItems: "center", background: "#eef1f5", color: C.ink, border: `1px solid ${C.border2}`, padding: "4px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 700 }}>{winner.product_type}</span>
                  )}
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: C.ink, margin: 0, lineHeight: 1.18, letterSpacing: "-0.01em" }}>{winner.name}</h1>
                <div style={{ fontSize: 15, color: C.sub, marginTop: 6 }}>{companyName(winner, lang)}</div>
                <div style={{ fontSize: 13, color: C.micro, marginTop: 10 }}>{meta}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  {winner.brewery_website && (
                    <a href={winner.brewery_website} target="_blank" rel="noopener noreferrer" className="msc-btn msc-btn-primary">
                      {t.website} <ExternalIcon />
                    </a>
                  )}
                  <button onClick={forward} className="msc-btn"><ShareIcon /> {t.forward}</button>
                </div>
              </div>
            </div>
          </div>

          {/* Medaglie — all awards for this bottle */}
          <Section title={`${t.medalsTitle} · ${medals.length}`}>
            <div className="msc-medalgrid">
              {medals.map((m) => {
                const cm = MEDAL_META[m.medal];
                const mw = winnerByRegId(m.reg_id);
                return (
                  <div key={m.reg_id} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "14px 14px 14px 18px", border: `1px solid ${cm.bandBorder}`, borderRadius: 12, background: "#fff", overflow: "hidden" }}>
                    <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: cm.band }} />
                    {mw && <Image src={medalImageFor(mw)} alt="" width={32} height={42} style={{ objectFit: "contain", width: "auto", height: 42, flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: cm.bandText }}>{cm[lang]}</div>
                      <div style={{ fontSize: 12, color: C.sub }}>{SESSION_META[m.session][lang]} · {m.category}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Scheda tecnica — only when there is a real technical fact (not just price/type) */}
          {hasRealTech && (
            <Section title={t.techSheet}>
              {stats.length > 0 && (
                <div className="msc-statgrid">
                  {stats.map((s, i) => (
                    <div key={i} style={{ background: "#fafbfc", border: `1px solid ${C.border2}`, borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11.5, color: C.micro }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 3 }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {chipRows.length > 0 && (
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {chipRows.map((cr, i) => (
                    <FactRow key={i} label={cr.label}><Chips items={cr.chips} /></FactRow>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Rapporti di valutazione */}
          {reportSessions.length > 0 && (
            <Section title={t.reportsTitle} note={t.reportNote}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {reportSessions.map((s) => (
                  <ReportBlock key={s} session={s} rep={reports[s]!} medal={medals.find((m) => m.session === s)?.medal} lang={lang} />
                ))}
              </div>
            </Section>
          )}

          {/* Conserva e condividi — download + social share */}
          <div style={{ background: "linear-gradient(180deg,#fff,#f7f8fb)", border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: C.shadow, padding: "20px 22px", marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{t.saveForwardTitle}</div>
              <div style={{ fontSize: 13, color: C.sub, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{winner.name}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
              <DownloadMenu label={t.download} onPick={(code) => { if (code === "it" || code === "en" || code === "ja") setLang(code); save(); }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SocialBtn label="WhatsApp" bg="#25d366" onClick={shareWhatsApp}><WhatsAppIcon /></SocialBtn>
                <SocialBtn label="Facebook" bg="#1877f2" onClick={shareFacebook}><FacebookIcon /></SocialBtn>
                <SocialBtn label="X" bg="#0f1419" onClick={shareX}><XIcon /></SocialBtn>
                <SocialBtn label="LinkedIn" bg="#0a66c2" onClick={shareLinkedIn}><LinkedInIcon /></SocialBtn>
                <SocialBtn label="Email" bg="#64748b" onClick={shareEmail}><MailIcon /></SocialBtn>
                <SocialBtn label={t.share} bg="#312e81" onClick={copyLink}><LinkIcon /></SocialBtn>
              </div>
            </div>
          </div>

          {/* Sakagura */}
          {(rec?.description_jp || siblings.length > 0) && (
            <Section title={companyName(winner, lang)}>
              {rec?.description_jp && (
                <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: siblings.length ? 16 : 0 }}>{rec.description_jp}</div>
              )}
              {siblings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{t.otherFromSakagura}</div>
                  {siblings.map((w) => {
                    const sw = winnerByRegId(w.reg_id) ?? w;
                    return (
                      <Link key={w.reg_id} href={`/msc2026/${w.reg_id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.border2}`, textDecoration: "none" }}>
                        <Image src={medalImageFor(sw)} alt="" width={28} height={38} style={{ objectFit: "contain", width: "auto", height: 36, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.name}</span>
                          <span style={{ display: "block", fontSize: 12, color: C.sub }}>{MEDAL_META[w.medal][lang]} · {SESSION_META[w.session][lang]}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          <div style={{ marginTop: 18, fontSize: 12, color: C.micro, textAlign: "center" }}>{t.awardedAt} · {t.noScore}</div>
        </div>
      </div>

      {toast && <Toast msg={toast} />}
    </div>
  );
}

// ─── Report block per session ────────────────────────────────────────────────
function ReportBlock({ session, rep, medal, lang }: { session: SessionKey; rep: SessionReport; medal?: MedalKey; lang: "it" | "en" | "ja" }) {
  const t = UI[lang];
  const sm = SESSION_META[session];
  const cm = medal ? MEDAL_META[medal] : null;
  const isTasting = session === "nihonshu" || session === "shochu";

  return (
    <div style={{ border: `1px solid ${C.border2}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", background: cm ? cm.band : "#fafbfc", borderBottom: `1px solid ${cm ? cm.bandBorder : C.border2}`, boxShadow: cm ? "inset 0 1px 0 rgba(255,255,255,0.55)" : "none" }}>
        <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.65)", color: cm ? cm.bandText : sm.accent, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.6)", flexShrink: 0 }}><AwardIcon /></span>
        <span style={{ fontWeight: 800, fontSize: 14.5, color: cm ? cm.bandText : C.ink, textShadow: cm ? "0 1px 0 rgba(255,255,255,0.4)" : "none" }}>{sm[lang]}</span>
        {cm && <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 13, color: cm.bandText, textTransform: "uppercase", letterSpacing: ".08em", textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}>{cm[lang]}</span>}
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {rep.radar && rep.radar.length >= 3 && <RadarPanel axes={rep.radar} lang={lang} accent={sm.accent} />}
        {isTasting && (
          <>
            {(rep.color || rep.clarity || rep.distillation) && (
              <div style={{ fontSize: 13.5, color: C.ink }}>
                {[rep.color && `${t.colore}: ${rep.color}`, rep.clarity && `${t.limpidezza}: ${rep.clarity}`, rep.distillation && `${t.distillazione}: ${rep.distillation}`].filter(Boolean).join(" · ")}
              </div>
            )}
            {rep.profile && rep.profile.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {rep.profile.map((p, i) => (
                  <span key={i} style={{ fontSize: 12, color: C.sub, background: "#f2f4f7", borderRadius: 7, padding: "3px 9px" }}><b style={{ color: C.ink, fontWeight: 600 }}>{p.k}</b> {p.v}</span>
                ))}
              </div>
            )}
            {rep.aromas && rep.aromas.length > 0 && <FactRow label={t.aromi}><Chips items={rep.aromas} /></FactRow>}
            {rep.palate && rep.palate.length > 0 && <FactRow label={t.palato}><Chips items={rep.palate} /></FactRow>}
            {rep.texture && rep.texture.length > 0 && <FactRow label={t.texture}><Chips items={rep.texture} /></FactRow>}
            {rep.pairing_top && rep.pairing_top.length > 0 && <FactRow label={t.abbinamento}><Chips items={rep.pairing_top} /></FactRow>}
          </>
        )}
        {session === "design" && (
          <>
            {rep.messages && rep.messages.length > 0 && <FactRow label={t.messaggi}><Chips items={rep.messages} /></FactRow>}
            {rep.profile && rep.profile.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {rep.profile.map((p, i) => (
                  <span key={i} style={{ fontSize: 12, color: C.sub, background: "#f2f4f7", borderRadius: 7, padding: "3px 9px" }}><b style={{ color: C.ink, fontWeight: 600 }}>{p.k}</b> {p.v}</span>
                ))}
              </div>
            )}
            {rep.channels && rep.channels.length > 0 && <FactRow label={t.canali}><Chips items={rep.channels} /></FactRow>}
          </>
        )}
        {session === "pairing" && (
          <>
            {(rep.harmony || rep.role || rep.descriptor || rep.context) && (
              <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6 }}>
                {[rep.descriptor, rep.harmony, rep.role, rep.context].filter(Boolean).join(" · ")}
              </div>
            )}
            {rep.other && rep.other.length > 0 && <FactRow label={t.altriAbb}><Chips items={rep.other} /></FactRow>}
          </>
        )}
        {rep.comments && rep.comments.length > 0 && (
          <div style={{ marginTop: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>{t.commenti}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rep.comments.map((c, i) => (
                <blockquote key={i} style={{ margin: 0, padding: "8px 14px", borderLeft: `3px solid ${sm.accent}`, background: "#fafbfc", borderRadius: "0 8px 8px 0", fontSize: 13, color: "#475467", fontStyle: "italic", lineHeight: 1.55 }}>«{c}»</blockquote>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Radar ("keyviat") — product profile vs jury average ─────────────────────
function RadarPanel({ axes, lang, accent }: { axes: RadarAxis[]; lang: LangKey; accent: string }) {
  const t = UI[lang];
  const N = axes.length;
  // Larger radar: a bigger R/viewBox ratio makes the plot itself read big (less wasted margin), not just the SVG box.
  const W = 460, H = 384, cx = W / 2, cy = 184, R = 134, MAX = 100;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i: number, val: number, rad = R) => {
    const r = rad * (val / MAX);
    return [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
  };
  const polyOf = (vals: number[], rad = R) => vals.map((v, i) => pt(i, v, rad).join(",")).join(" ");
  const rings = [25, 50, 75, 100];
  const jury = axes.map((a) => a.avg);
  const JURY = "#d97706"; // stronger amber — doubles the contrast of this key-viz vs the old thin pale line

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingBottom: 4 }}>
      <div style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 800, color: C.sub, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>{t.radarTitle}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 480 }} role="img" aria-label={t.radarTitle}>
        {/* grid rings — a touch stronger so the frame holds, but still clearly behind the data */}
        {rings.map((rg) => (
          <polygon key={rg} points={polyOf(axes.map(() => rg))} fill="none" stroke="#dde1e8" strokeWidth={1.25} />
        ))}
        {/* spokes + labels — labels enlarged and darkened (were thin/pale) */}
        {axes.map((a, i) => {
          const [ex, ey] = pt(i, MAX);
          const [lx, ly] = pt(i, MAX + 22);
          const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
          return (
            <g key={a.key}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#dde1e8" strokeWidth={1.25} />
              <text x={lx} y={ly + 4} fontSize={13.5} fontWeight={700} fill={C.ink} textAnchor={anchor}>
                {RADAR_LABELS[a.key]?.[lang] ?? a.key}
              </text>
            </g>
          );
        })}
        {/* jury average — the only line shown: bolder stroke + translucent fill + vertex dots = strong technical read */}
        <polygon points={polyOf(jury)} fill={JURY} fillOpacity={0.14} stroke={JURY} strokeWidth={3.5} strokeDasharray="7 4" strokeLinejoin="round" />
        {jury.map((v, i) => { const [x, y] = pt(i, v); return <circle key={i} cx={x} cy={y} r={3.8} fill={JURY} />; })}
      </svg>
      {/* legend */}
      <div style={{ display: "flex", gap: 18, fontSize: 13, fontWeight: 600, color: C.sub }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ width: 18, height: 0, borderTop: `3px dashed ${JURY}` }} /> {t.legendJury}</span>
      </div>
    </div>
  );
}

// ─── Small presentational helpers ────────────────────────────────────────────
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: C.shadow, padding: "20px 22px", marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 13, fontWeight: 800, color: C.micro, letterSpacing: ".06em", textTransform: "uppercase", margin: 0 }}>{title}</h2>
        {note && <span style={{ fontSize: 11.5, color: "#aab2bd" }}>{note}</span>}
      </div>
      {children}
    </section>
  );
}
// A labelled "section": header on top, content (a tag cloud) below on full width — no wasted left column.
function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ background: "#f7f8fa", border: `1px solid ${C.border2}`, borderRadius: 11, padding: "11px 13px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
function Chips({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {items.map((c, j) => (
        <span key={j} style={{ background: "#fff", border: `1px solid ${C.border2}`, borderRadius: 8, padding: "4px 11px", fontSize: 12.5, color: "#475467" }}>{c}</span>
      ))}
    </div>
  );
}
// ─── Download + social share ─────────────────────────────────────────────────
function SocialBtn({ label, bg, onClick, children }: { label: string; bg: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "50%", border: "none", background: bg, color: "#fff", cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,0.2)" }}>
      {children}
    </button>
  );
}
function DownloadIcon() { return (<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" /></svg>); }
function WhatsAppIcon() { return (<svg width={17} height={17} viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.1c-.24.68-1.2 1.26-1.97 1.42-.53.11-1.22.2-3.55-.76-2.98-1.23-4.9-4.27-5.05-4.47-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.59-.37.79-.37.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.82 2 .89 2.15.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.45.53-.15.15-.3.32-.13.61.17.29.76 1.25 1.63 2.02 1.12.99 2.07 1.3 2.37 1.45.3.15.47.12.64-.07.17-.2.74-.86.94-1.16.2-.3.4-.25.66-.15.27.1 1.7.8 1.99.95.3.15.49.22.56.35.07.12.07.72-.17 1.4z" /></svg>); }
function FacebookIcon() { return (<svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.33-.04-1.57-.14-2.88-.14C11.9 2 10 3.66 10 6.7v2.8H7v4h3V22h4v-8.5z" /></svg>); }
function XIcon() { return (<svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.5 8.6L23 22h-6.9l-5.4-7-6.2 7H1.3l8-9.1L1 2h7l4.9 6.5L18.9 2zm-2.4 18h1.9L7.6 4H5.6L16.5 20z" /></svg>); }
function LinkedInIcon() { return (<svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M6.94 5.5a2.06 2.06 0 1 1-4.12 0 2.06 2.06 0 0 1 4.12 0zM2.4 8.9h4.06V22H2.4V8.9zm6.6 0h3.9v1.79h.05c.54-1.02 1.86-2.1 3.83-2.1 4.1 0 4.86 2.7 4.86 6.2V22h-4.06v-5.6c0-1.34-.02-3.06-1.87-3.06-1.87 0-2.16 1.46-2.16 2.96V22H9V8.9z" /></svg>); }
function MailIcon() { return (<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>); }
function LinkIcon() { return (<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></svg>); }
function CaretDown() { return (<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>); }

// "Download PDF" with a language picker (graphic only for now — the actual per-language export comes later).
function DownloadMenu({ label, onPick }: { label: string; onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const LANGS = [
    { code: "it", name: "Italiano" }, { code: "en", name: "English" }, { code: "ja", name: "日本語" },
    { code: "zh", name: "中文" }, { code: "de", name: "Deutsch" }, { code: "fr", name: "Français" },
  ];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="msc-btn msc-btn-primary" aria-haspopup="menu" aria-expanded={open}>
        <DownloadIcon /> {label} <CaretDown />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadowMd, zIndex: 50, minWidth: 190, padding: 5 }}>
            {LANGS.map((l) => (
              <button key={l.code} role="menuitem" onClick={() => { onPick(l.code); setOpen(false); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f4f5f8"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, color: C.ink, cursor: "pointer", fontFamily: "inherit" }}>
                {l.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
