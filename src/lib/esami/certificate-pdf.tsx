import "server-only";

// Server-side PDF certificate (one page per language) for emailing as an
// attachment. Uses @react-pdf built-in Helvetica → reliable for IT/EN with no
// font fetch. Japanese is intentionally NOT rendered here (CJK needs a bundled
// font); the result email also links to the on-screen report, which prints JA
// via the browser's system fonts.

import { readFileSync } from "fs";
import { join } from "path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { REPORT_I18N, type ReportLang } from "@/lib/i18n/report";
import type { ExamFamily } from "@/lib/domain";

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
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.headRow}>
        <View>
          <Text style={styles.brand}>Sake Sommelier Association</Text>
          <Text style={styles.certWord}>{t.cert}</Text>
        </View>
        {LOGO_DATA_URI ? (
          <Image src={LOGO_DATA_URI} style={styles.logo} />
        ) : (
          <Text style={styles.mark}>S</Text>
        )}
      </View>

      <Text style={styles.family}>{t.family[input.family]}</Text>
      <Text style={styles.name}>{input.name}</Text>
      <Text style={styles.meta}>
        {t.examDate}: {input.course.day} {input.course.month} {input.course.year} · {t.location}: {input.course.city} · {t.educator}: {input.course.educatorName}
      </Text>

      <View style={[styles.scoreBox, { borderColor: sc, justifyContent: input.score == null ? "center" : "space-between" }]}>
        {input.score != null && (
          <View>
            <Text style={[styles.scoreLabel, { color: sc }]}>{t.score}</Text>
            <Text style={[styles.scoreNum, { color: sc }]}>{input.score}%</Text>
          </View>
        )}
        <Text style={[styles.statusBig, { color: sc }]}>{title}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t.aiSummary}</Text>
      <Text style={styles.advice}>{t.advice[input.status]}</Text>

      {input.sections.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t.breakdown}</Text>
          {input.sections.map((s, i) => (
            <View key={i} style={styles.barRow}>
              <Text style={styles.barLabel}>{s.label}</Text>
              <View style={styles.barTrack}>
                <View style={{ width: `${Math.max(0, Math.min(100, s.pct))}%`, height: 5, backgroundColor: barColor(s.pct), borderRadius: 2 }} />
              </View>
              <Text style={[styles.barPct, { color: barColor(s.pct) }]}>{Math.round(s.pct)}%</Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.privacy}>{PRIVACY_NOTE[lang]}</Text>

      <View style={styles.footer}>
        <Text>{t.issued}: {issued}</Text>
        <Text>{t.footer}</Text>
      </View>
    </Page>
  );
}

/** Render the certificate to a PDF Buffer (one page per requested language). */
export async function renderCertificatePdf(
  input: CertificatePdfInput,
  langs: ReportLang[] = ["it", "en"],
): Promise<Buffer> {
  const doc = (
    <Document>
      {langs.map((l) => (
        <CertPage key={l} input={input} lang={l} />
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}
