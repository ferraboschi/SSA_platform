import "server-only";

// Server-side PDF certificate (one page per language) for emailing as an
// attachment. IT/EN use @react-pdf's built-in Helvetica → reliable, no font
// fetch. Japanese needs a CJK font: we register Noto Sans JP (see JA_FONT below)
// and render a true Japanese page — never tofu/blank.

import { readFileSync } from "fs";
import { join } from "path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { REPORT_I18N, type ReportLang } from "@/lib/i18n/report";
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

// SSA logo loaded once as a data URI for the PDF header (falls back to a text
// mark if the asset can't be read).
const LOGO_DATA_URI: string | null = (() => {
  try {
    const buf = readFileSync(join(process.cwd(), "public", "ssa-logo.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
})();

const PRIVACY_NOTE: Record<ReportLang, string> = {
  it: "Questo esito è personale: ti chiediamo di non pubblicare questo documento sui social.",
  en: "This result is personal: please do not publish this document on social media.",
  ja: "この結果は個人的なものです。本書類をSNS上に公開しないようお願いします。",
};

export interface CertificatePdfInput {
  name: string;
  family: ExamFamily;
  status: "passed" | "retrial" | "failed";
  /** Objective score %, or null when no number is certified (all-manual exam or
   *  operator override) — the certificate then shows the outcome alone. */
  score: number | null;
  sections: { label: string; pct: number }[];
  course: { day: number; month: string; year: number; city: string; educatorName: string };
  completedAt: string;
}

const COLORS = {
  navy: "#1a1a2e",
  text: "#1a1a1a",
  mute: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  pass: "#1a7f43",
  retrial: "#b45309",
  fail: "#b42318",
};

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 40, paddingHorizontal: 48, fontSize: 11, color: COLORS.text, fontFamily: "Helvetica" },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: COLORS.navy, paddingBottom: 12 },
  brand: { fontSize: 9, color: COLORS.mute, letterSpacing: 1, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  certWord: { fontSize: 13, marginTop: 4, fontFamily: "Helvetica-Bold" },
  mark: { width: 34, height: 34, backgroundColor: COLORS.navy, color: "#fff", textAlign: "center", paddingTop: 8, fontSize: 16, fontFamily: "Helvetica-Bold", borderRadius: 4 },
  logo: { height: 38, objectFit: "contain" },
  privacy: { fontSize: 9, color: COLORS.faint, fontStyle: "italic", marginTop: 22, lineHeight: 1.4 },
  family: { fontSize: 9, color: COLORS.mute, letterSpacing: 1, textTransform: "uppercase", marginTop: 22, fontFamily: "Helvetica-Bold" },
  name: { fontSize: 26, marginTop: 6, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 10, color: COLORS.mute, marginTop: 8 },
  scoreBox: { marginTop: 22, padding: 16, borderWidth: 1.5, borderRadius: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scoreLabel: { fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  scoreNum: { fontSize: 38, fontFamily: "Helvetica-Bold" },
  statusBig: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  sectionTitle: { fontSize: 9, color: COLORS.mute, letterSpacing: 1, textTransform: "uppercase", marginTop: 22, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  advice: { fontSize: 10.5, lineHeight: 1.5, marginTop: 8 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  barLabel: { width: 200, fontSize: 10 },
  barTrack: { flex: 1, height: 5, backgroundColor: "#f0f0f3", borderRadius: 2, marginHorizontal: 8 },
  barPct: { width: 34, fontSize: 10, textAlign: "right", fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: COLORS.faint, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
});

function statusColor(status: CertificatePdfInput["status"]): string {
  return status === "passed" ? COLORS.pass : status === "retrial" ? COLORS.retrial : COLORS.fail;
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

  return (
    <Page size="A4" style={[styles.page, jaFont]}>
      <View style={styles.headRow}>
        <View>
          <Text style={[styles.brand, jaFont]}>Sake Sommelier Association</Text>
          <Text style={[styles.certWord, jaFont]}>{t.cert}</Text>
        </View>
        {LOGO_DATA_URI ? (
          <Image src={LOGO_DATA_URI} style={styles.logo} />
        ) : (
          <Text style={[styles.mark, jaFont]}>S</Text>
        )}
      </View>

      <Text style={[styles.family, jaFont]}>{t.family[input.family]}</Text>
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
        <Text style={[styles.statusBig, jaFont, { color: sc }]}>{title}</Text>
      </View>

      <Text style={[styles.sectionTitle, jaFont]}>{t.aiSummary}</Text>
      <Text style={[styles.advice, jaFont]}>{t.advice[input.status]}</Text>

      {input.sections.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, jaFont]}>{t.breakdown}</Text>
          {input.sections.map((s, i) => (
            <View key={i} style={styles.barRow}>
              <Text style={[styles.barLabel, jaFont]}>{s.label}</Text>
              <View style={styles.barTrack}>
                <View style={{ width: `${Math.max(0, Math.min(100, s.pct))}%`, height: 5, backgroundColor: barColor(s.pct), borderRadius: 2 }} />
              </View>
              <Text style={[styles.barPct, jaFont, { color: barColor(s.pct) }]}>{Math.round(s.pct)}%</Text>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.privacy, jaFont]}>{PRIVACY_NOTE[lang]}</Text>

      <View style={styles.footer}>
        <Text style={jaFont}>{t.issued}: {issued}</Text>
        <Text style={jaFont}>{t.footer}</Text>
      </View>
    </Page>
  );
}

/** Render the certificate to a PDF Buffer (one page per requested language). */
export async function renderCertificatePdf(
  input: CertificatePdfInput,
  langs: ReportLang[] = ["it", "en"],
): Promise<Buffer> {
  // Resolve the pages to render. If a Japanese page is requested we must have the
  // CJK font registered; if that fails, degrade JA → EN so we never emit a blank
  // or tofu page (the localized email is the primary win regardless).
  const pages: ReportLang[] = langs.map((l) => {
    if (l !== "ja") return l;
    return ensureJaFont() ? "ja" : "en";
  });
  const doc = (
    <Document>
      {pages.map((l, i) => (
        <CertPage key={`${l}-${i}`} input={input} lang={l} />
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}
