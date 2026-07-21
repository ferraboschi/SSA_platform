import "server-only";

// Server-side PDF certificate (one page per language) for emailing as an
// attachment. IT/EN use @react-pdf's built-in Helvetica → reliable, no font
// fetch. Japanese needs a CJK font: we register Noto Sans JP (see JA_FONT below)
// and render a true Japanese page — never tofu/blank.

import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { REPORT_I18N, type ReportLang } from "@/lib/i18n/report";
import { EXAM_THRESHOLDS } from "@/lib/domain/constants";
import { weakAreas, type ExamSection } from "./exam-sections";
import type { OpenReviewItem } from "./certificate-data";
import type { ExamFamily } from "@/lib/domain";

// CJK font for the Japanese certificate page. Static (non-variable) Noto Sans JP
// subset (JP only) from Google's canonical noto-cjk repo, served over jsDelivr.
// Verified to embed real Japanese glyphs in @react-pdf v4 (fontkit renders the
// OpenType/CFF outlines). react-pdf can't decode variable-weight or WOFF2 files,
// so this static OTF is the correct format. If the fetch ever fails at render
// time, the JA branch below falls back to the English page so we never ship a
// blank/tofu certificate.
const JA_FONT_FAMILY = "NotoSansJP";
const JA_FONT_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf";

let jaFontReady = false;
function ensureJaFont(): boolean {
  if (jaFontReady) return true;
  try {
    // Register the single upright weight for BOTH normal and italic styles: Noto
    // Sans JP has no italic face, and react-pdf throws if a requested (style) face
    // isn't registered. Mapping italic → the same src avoids that while keeping
    // CJK glyphs (faux-italic on CJK is meaningless anyway).
    Font.register({
      family: JA_FONT_FAMILY,
      fonts: [
        { src: JA_FONT_URL, fontWeight: 400, fontStyle: "normal" },
        { src: JA_FONT_URL, fontWeight: 400, fontStyle: "italic" },
      ],
    });
    jaFontReady = true;
  } catch {
    jaFontReady = false;
  }
  return jaFontReady;
}

export interface CertificatePdfInput {
  name: string;
  family: ExamFamily;
  status: "passed" | "retrial" | "failed";
  /** Objective score %, or null when no number is certified (all-manual exam or
   *  operator override) — the certificate then shows the outcome alone. */
  score: number | null;
  /** Per-area score bars ({name, pct}); [] hides the breakdown block. */
  sections: ExamSection[];
  /** Cohort average % to print next to the pass threshold, or null to show the
   *  threshold alone (thin data → no misleading media; owner batch 16). */
  classAvg?: number | null;
  /** Open-answer justifications (owner batch 18) → a SECOND page per language.
   *  Empty/omitted → no second page (the resoconto stays one page). */
  openReview?: OpenReviewItem[];
  course: { day: number; month: string; year: number; city: string; educatorName: string };
  completedAt: string;
}

const COLORS = {
  navy: "#1a1a2e",
  text: "#1a1a1a",
  mute: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  track: "#f0f0f3",
  pass: "#1a7f43",
  retrial: "#b45309",
  fail: "#b42318",
  // Soft per-verdict tints for the callout / next-steps boxes (React-PDF has no
  // color-mix — these are the verdict hues at ~7% over white).
  passBg: "#eef7f1",
  retrialBg: "#fdf4e8",
  failBg: "#fdeeec",
};

/** Pass threshold as a whole percentage (80) — the fixed reference under the score. */
const PASS_PCT = Math.round(EXAM_THRESHOLDS.pass * 100);

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 40, paddingHorizontal: 48, fontSize: 11, color: COLORS.text, fontFamily: "Helvetica" },
  headRow: { borderBottomWidth: 1.5, borderBottomColor: COLORS.navy, paddingBottom: 12 },
  docTitle: { fontSize: 16, color: COLORS.navy, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  docSub: { fontSize: 10, color: COLORS.mute, marginTop: 3 },
  disclaimerBox: { marginTop: 14, padding: 9, backgroundColor: "#fafafb", borderWidth: 1, borderColor: COLORS.border, borderRadius: 5 },
  disclaimerText: { fontSize: 8.5, color: COLORS.mute, lineHeight: 1.45 },
  name: { fontSize: 24, marginTop: 18, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 10, color: COLORS.mute, marginTop: 8 },
  scoreBox: { marginTop: 18, padding: 16, borderWidth: 1.5, borderRadius: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scoreLabel: { fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  scoreNum: { fontSize: 38, fontFamily: "Helvetica-Bold" },
  scoreRight: { alignItems: "flex-end" },
  statusBig: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  scoreRef: { fontSize: 8.5, color: COLORS.mute, marginTop: 5, fontFamily: "Helvetica-Bold" },
  personalNote: { fontSize: 7.5, color: COLORS.faint, fontStyle: "italic", marginTop: 3, maxWidth: 230, textAlign: "right" },
  sectionTitle: { fontSize: 9, color: COLORS.mute, letterSpacing: 1, textTransform: "uppercase", marginTop: 22, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  advice: { fontSize: 10.5, lineHeight: 1.5, marginTop: 8 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  barLabel: { width: 200, fontSize: 10 },
  barTrack: { flex: 1, height: 5, backgroundColor: COLORS.track, borderRadius: 2, marginHorizontal: 8, position: "relative" },
  barThresh: { position: "absolute", left: `${PASS_PCT}%`, top: -1.5, bottom: -1.5, width: 1, backgroundColor: COLORS.faint },
  barCount: { width: 40, fontSize: 9, color: COLORS.mute, textAlign: "right", marginRight: 4 },
  barPct: { width: 34, fontSize: 10, textAlign: "right", fontFamily: "Helvetica-Bold" },
  calloutBox: { marginTop: 8, padding: 10, borderWidth: 1, borderRadius: 6 },
  calloutText: { fontSize: 10, lineHeight: 1.5 },
  // ── Open-answer review page (batch 18) ──
  pageTitle: { fontSize: 15, color: COLORS.navy, fontFamily: "Helvetica-Bold", letterSpacing: 0.2 },
  pageIntro: { fontSize: 9.5, color: COLORS.mute, marginTop: 4, marginBottom: 4, lineHeight: 1.4 },
  reviewItem: { marginTop: 12, paddingLeft: 10, borderLeftWidth: 2 },
  reviewQ: { fontSize: 10.5, fontFamily: "Helvetica-Bold", lineHeight: 1.4 },
  reviewGiven: { fontSize: 9.5, color: COLORS.mute, marginTop: 3, lineHeight: 1.4 },
  reviewVote: { fontSize: 8.5, color: COLORS.mute, marginTop: 3, fontFamily: "Helvetica-Bold" },
  reviewRationale: { fontSize: 9.5, color: COLORS.text, marginTop: 4, lineHeight: 1.45 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: COLORS.faint, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
});

function statusColor(status: CertificatePdfInput["status"]): string {
  return status === "passed" ? COLORS.pass : status === "retrial" ? COLORS.retrial : COLORS.fail;
}
function statusBg(status: CertificatePdfInput["status"]): string {
  return status === "passed" ? COLORS.passBg : status === "retrial" ? COLORS.retrialBg : COLORS.failBg;
}
function barColor(pct: number): string {
  return pct >= 80 ? COLORS.pass : pct >= 70 ? COLORS.retrial : COLORS.fail;
}

function CertPage({ input, lang }: { input: CertificatePdfInput; lang: ReportLang }) {
  const t = REPORT_I18N[lang];
  const sc = statusColor(input.status);
  const title = input.status === "passed" ? t.passedTitle : input.status === "retrial" ? t.retrialTitle : t.failedTitle;
  const issued = new Date(input.completedAt).toLocaleDateString(
    lang === "it" ? "it-IT" : lang === "en" ? "en-GB" : "ja-JP",
    { day: "numeric", month: "long", year: "numeric" },
  );

  // For the Japanese page, swap the Helvetica base to the registered CJK font so
  // the glyphs actually render. Noto Sans JP is a single weight, so both regular
  // and bold text use the same family (react-pdf synthesises no faux-bold, which
  // is fine — the layout is unchanged). IT/EN keep undefined overrides ⇒ the base
  // Helvetica styles pass through byte-identically.
  // Empty (not undefined) for it/en so the base Helvetica styles pass through
  // byte-identically while keeping the style arrays free of undefined elements.
  const jaFont: { fontFamily?: string } =
    lang === "ja" ? { fontFamily: JA_FONT_FAMILY } : {};
  // Bold emphasis inside a mixed Text: JA has a single weight (no Helvetica-Bold
  // face registered), so emphasis there just reuses the CJK family.
  const boldFont: { fontFamily: string } =
    lang === "ja" ? { fontFamily: JA_FONT_FAMILY } : { fontFamily: "Helvetica-Bold" };

  // Reference line under the score: the fixed 80% pass threshold, plus the
  // cohort media only when enough results back it (else the threshold alone).
  const refLine =
    `${t.refThreshold} ${PASS_PCT}%` +
    (input.classAvg != null ? ` · ${t.classAvg} ${input.classAvg}%` : "");
  // Areas to consolidate — derived from the per-area bars (null when the exam
  // has no category breakdown, i.e. sections weren't supplied).
  const weak = weakAreas(input.sections, input.status);
  const weakList = weak
    ? weak.items.map((s) => `${s.name} (${Math.round(s.pct)}%)`).join(", ")
    : "";

  return (
    <Page size="A4" style={[styles.page, jaFont]}>
      {/* Personal record — NOT an official SSA certificate (owner batch 17):
          no SSA logo/letterhead, a personal title, and a prominent non-official
          disclaimer. The SSA name appears only descriptively. */}
      <View style={styles.headRow}>
        <Text style={[styles.docTitle, jaFont]}>{t.cert}</Text>
        <Text style={[styles.docSub, jaFont]}>{t.family[input.family]}</Text>
      </View>

      <View style={styles.disclaimerBox}>
        <Text style={[styles.disclaimerText, jaFont]}>{t.disclaimer}</Text>
      </View>

      <Text style={[styles.name, jaFont]}>{input.name}</Text>
      <Text style={[styles.meta, jaFont]}>
        {t.examDate}: {input.course.day} {input.course.month} {input.course.year} · {t.location}: {input.course.city} · {t.educator}: {input.course.educatorName}
      </Text>

      <View style={[styles.scoreBox, { borderColor: sc, justifyContent: input.score == null ? "center" : "space-between" }]}>
        {input.score != null && (
          <View>
            <Text style={[styles.scoreLabel, jaFont, { color: sc }]}>{t.score}</Text>
            <Text style={[styles.scoreNum, jaFont, { color: sc }]}>{input.score}%</Text>
          </View>
        )}
        <View style={styles.scoreRight}>
          <Text style={[styles.statusBig, jaFont, { color: sc }]}>{title}</Text>
          {input.score != null && <Text style={[styles.scoreRef, jaFont]}>{refLine}</Text>}
          <Text style={[styles.personalNote, jaFont]}>{t.personalIndication}</Text>
        </View>
      </View>

      {input.sections.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, jaFont]}>{t.breakdown}</Text>
          {input.sections.map((s, i) => (
            <View key={i} style={styles.barRow}>
              <Text style={[styles.barLabel, jaFont]}>{s.name}</Text>
              <View style={styles.barTrack}>
                <View style={{ width: `${Math.max(0, Math.min(100, s.pct))}%`, height: 5, backgroundColor: barColor(s.pct), borderRadius: 2 }} />
                <View style={styles.barThresh} />
              </View>
              {/* Owner debug call: the raw "X / Y" count next to the % bar. */}
              <Text style={[styles.barCount, jaFont]}>{s.total > 0 ? `${s.correct}/${s.total}` : ""}</Text>
              <Text style={[styles.barPct, jaFont, { color: barColor(s.pct) }]}>{Math.round(s.pct)}%</Text>
            </View>
          ))}
        </>
      )}

      {weak && (
        <>
          <Text style={[styles.sectionTitle, jaFont]}>{t.consolidate[input.status]}</Text>
          <View style={[styles.calloutBox, { borderColor: sc, backgroundColor: statusBg(input.status) }]}>
            <Text style={[styles.calloutText, jaFont]}>
              {t.weakLead[weak.leadKey]} <Text style={boldFont}>{weakList}</Text>
            </Text>
          </View>
        </>
      )}

      <Text style={[styles.sectionTitle, jaFont]}>{t.aiSummary}</Text>
      <Text style={[styles.advice, jaFont]}>{t.advice[input.status]}</Text>

      <Text style={[styles.sectionTitle, jaFont]}>{t.nextTitle}</Text>
      <View style={[styles.calloutBox, { borderColor: sc, backgroundColor: statusBg(input.status) }]}>
        <Text style={[styles.calloutText, jaFont]}>{t.next[input.status]}</Text>
      </View>

      {/* `fixed` pins the footer to the bottom of every page, so if a long
          verdict ever spills past one A4 the issued/branding line still lands
          correctly instead of appearing only on whichever page it flows onto. */}
      <View style={styles.footer} fixed>
        <Text style={jaFont}>{t.issued}: {issued}</Text>
        <Text style={jaFont}>{t.footer}</Text>
      </View>
    </Page>
  );
}

/** Colour of an open-answer badge/accent by how close it is to full marks. */
function reviewColor(vote: number | undefined, points: number, maxPoints: number): string {
  const ratio = vote != null ? (vote - 1) / 4 : maxPoints > 0 ? points / maxPoints : 0;
  return ratio >= 1 ? COLORS.pass : ratio >= 0.7 ? COLORS.retrial : COLORS.fail;
}
/** Points as a compact string (fractional AI points keep one decimal). */
const fmtPts = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Page 2 (owner batch 18): open answers, each justified — where/what/why it
 *  fell short — with the missing pieces integrated from the knowledge base
 *  (the AI rationale). Capped upstream to one page, so a resoconto never exceeds
 *  two pages per language. */
function OpenReviewPage({ input, lang }: { input: CertificatePdfInput; lang: ReportLang }) {
  const t = REPORT_I18N[lang];
  const jaFont: { fontFamily?: string } = lang === "ja" ? { fontFamily: JA_FONT_FAMILY } : {};
  const issued = new Date(input.completedAt).toLocaleDateString(
    lang === "it" ? "it-IT" : lang === "en" ? "en-GB" : "ja-JP",
    { day: "numeric", month: "long", year: "numeric" },
  );
  const items = input.openReview ?? [];

  return (
    <Page size="A4" style={[styles.page, jaFont]}>
      <View style={styles.headRow}>
        <Text style={[styles.pageTitle, jaFont]}>{t.openReviewTitle}</Text>
        <Text style={[styles.pageIntro, jaFont]}>{t.openReviewIntro}</Text>
      </View>

      {items.map((it, i) => {
        const c = reviewColor(it.vote, it.points, it.maxPoints);
        // Points only — no "Voto AI n/5" (owner debug call: the student's document
        // must carry no AI reference). The 1-5 vote still drives the accent colour.
        const scoreLine = `${t.aiVote}: ${fmtPts(it.points)}/${fmtPts(it.maxPoints)}`;
        return (
          <View key={i} style={[styles.reviewItem, { borderLeftColor: c }]}>
            <Text style={[styles.reviewQ, jaFont]}>
              {i + 1}. {it.question}
            </Text>
            <Text style={[styles.reviewGiven, jaFont]}>
              {t.yourAnswer}: {it.given}
            </Text>
            <Text style={[styles.reviewVote, jaFont, { color: c }]}>{scoreLine}</Text>
            <Text style={[styles.reviewRationale, jaFont]}>{it.rationale}</Text>
          </View>
        );
      })}

      <View style={styles.footer} fixed>
        <Text style={jaFont}>{t.issued}: {issued}</Text>
        <Text style={jaFont}>{t.footer}</Text>
      </View>
    </Page>
  );
}

/** Render the resoconto to a PDF Buffer: a page 1 per requested language, plus a
 *  page 2 (open-answer review) whenever there are justifications to show. */
export async function renderCertificatePdf(
  input: CertificatePdfInput,
  langs: ReportLang[] = ["it", "en"],
): Promise<Buffer> {
  // Single-language document (the student's exam language, owner batch 19); the
  // AI justifications are produced in that same language, so the review page
  // follows page 1 directly — EXCEPT for Japanese: the review's length caps are
  // character-based (fine for Latin), but the same char count in CJK is far
  // taller and could spill past the two-page limit. So JA keeps page 1 (fully
  // Japanese) but skips the review page until it gets width-aware CJK layout.
  // The gate is on the REQUESTED language: a JA request that degrades to an EN
  // page (font fetch failed) must STILL skip the review — its rationale text is
  // Japanese and would render as tofu under Helvetica.
  const hasReview = (input.openReview?.length ?? 0) > 0;
  const els: ReactElement[] = [];
  langs.forEach((orig, i) => {
    // If a Japanese page is requested we must have the CJK font registered; if
    // that fails, degrade JA → EN so we never emit a blank/tofu page 1.
    const l: ReportLang = orig !== "ja" ? orig : ensureJaFont() ? "ja" : "en";
    els.push(<CertPage key={`c-${i}`} input={input} lang={l} />);
    if (hasReview && orig !== "ja") els.push(<OpenReviewPage key={`r-${i}`} input={input} lang={l} />);
  });
  return renderToBuffer(<Document>{els}</Document>);
}
