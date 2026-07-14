import "server-only";

// DRAFT correction report (Correggi) — one A4 page per student, Italian UI but
// the QUESTION/ANSWER content is full of romanized Japanese (ō, ū) and real
// kanji, which built-in Helvetica (WinAnsi) renders as tofu — so we register
// Noto Sans JP exactly like the certificate does (same jsDelivr source), with
// a Helvetica fallback if the font can't be fetched. Glyphs like ★/⚠ are
// still avoided (tinted chips / spelled-out warnings) so the fallback never
// degrades meaning.
// Colors are the platform tokens hardcoded from src/styles/tokens.css (CSS
// variables don't exist inside react-pdf). One color = one meaning: green =
// correct/promosso, amber = rimandato/ungrounded, red = wrong/bocciato/failed.

import {
  Document,
  Font,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  CorrectionDraft,
  OpenGrade,
  WrongAnswer,
} from "@/lib/esami/correction-types";

// Same canonical static OTFs the certificate uses (react-pdf can't decode
// variable-weight/WOFF2). Own family name so the certificate's single-weight
// registration of "NotoSansJP" is never clobbered.
const REPORT_FONT = "NotoSansJPReport";
const FONT_BASE = "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/SubsetOTF/JP";

let fontReady = false;
let fontTried = false;
function ensureReportFont(): boolean {
  if (fontTried) return fontReady;
  fontTried = true;
  try {
    Font.register({
      family: REPORT_FONT,
      fonts: [
        { src: `${FONT_BASE}/NotoSansJP-Regular.otf`, fontWeight: 400 },
        { src: `${FONT_BASE}/NotoSansJP-Bold.otf`, fontWeight: 700 },
      ],
    });
    fontReady = true;
  } catch {
    fontReady = false;
  }
  return fontReady;
}

// Font styles resolved once: custom family with real weights, or the built-in
// Helvetica pair when registration failed (offline render — never a crash).
const useNoto = ensureReportFont();
const FAM: { fontFamily: string } = { fontFamily: useNoto ? REPORT_FONT : "Helvetica" };
const BOLD: { fontFamily: string; fontWeight?: 700 } = useNoto
  ? { fontFamily: REPORT_FONT, fontWeight: 700 }
  : { fontFamily: "Helvetica-Bold" };

// Platform tokens (src/styles/tokens.css) + the certificate's neutral grays.
const COLORS = {
  indigo: "#635BFF", // --indigo
  text: "#1a1a1a",
  mute: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  success: "#00875A", // --success
  successBg: "#E3FCEF", // --success-bg
  successFg: "#006644", // --success-fg
  warning: "#C77700", // --warning
  warningBg: "#FFF5E5", // --warning-bg
  warningFg: "#8A5A00", // --warning-fg
  danger: "#DE3618", // --danger
  dangerBg: "#FFEAE5", // --danger-bg
  dangerFg: "#BF2600", // --danger-fg
};

// Advisory verdict → band tint + label. Same thresholds story as the live
// grader (>=80 promosso, >=70 rimandato) — the bar ticks below mark them.
const VERDICT: Record<
  CorrectionDraft["verdict"],
  { label: string; bg: string; fg: string; accent: string }
> = {
  passed: { label: "PROMOSSO", bg: COLORS.successBg, fg: COLORS.successFg, accent: COLORS.success },
  retrial: { label: "RIMANDATO", bg: COLORS.warningBg, fg: COLORS.warningFg, accent: COLORS.warning },
  failed: { label: "BOCCIATO", bg: COLORS.dangerBg, fg: COLORS.dangerFg, accent: COLORS.danger },
};

const styles = StyleSheet.create({
  // paddingBottom leaves room for the fixed footer (absolute at bottom 28).
  // GOTCHA (@react-pdf 4.x): a page-level lineHeight silently prevents fixed
  // absolutely-positioned elements (the footer) from rendering — so lineHeight
  // lives on the individual content text styles below, never on the page.
  page: { paddingTop: 48, paddingBottom: 72, paddingHorizontal: 48, fontSize: 9.5, color: COLORS.text, ...FAM },
  eyebrow: { fontSize: 8, color: COLORS.indigo, letterSpacing: 1.5, textTransform: "uppercase", ...BOLD },
  title: { fontSize: 22, marginTop: 6 },
  student: { fontSize: 16, marginTop: 10, ...BOLD },
  meta: { fontSize: 9.5, color: COLORS.mute, marginTop: 4, lineHeight: 1.35 },
  band: { marginTop: 22, borderRadius: 8, padding: 16 },
  bandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  bandVerdict: { fontSize: 20, letterSpacing: 0.5, ...BOLD },
  bandRight: { alignItems: "flex-end" },
  bandScoreLabel: { fontSize: 7.5, letterSpacing: 1, textTransform: "uppercase", ...BOLD },
  bandScoreNum: { fontSize: 18, marginTop: 2, ...BOLD },
  // 0–100 track: white on the tinted band; fill + ticks are absolute overlays.
  barTrack: { marginTop: 14, height: 6, borderRadius: 3, backgroundColor: "#FFFFFF", position: "relative" },
  barFill: { position: "absolute", left: 0, top: 0, height: 6, borderRadius: 3 },
  tick: { position: "absolute", top: -2, width: 1, height: 10 },
  tickLabels: { flexDirection: "row", marginTop: 3 },
  tickText: { fontSize: 6.5 },
  sectionLabel: { fontSize: 8, color: COLORS.mute, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 24, marginBottom: 6, ...BOLD },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 6, borderBottomWidth: 0.75, borderBottomColor: COLORS.border },
  statLabel: { fontSize: 9.5, paddingRight: 12 },
  statValue: { fontSize: 9.5, textAlign: "right", ...BOLD },
  statBold: { ...BOLD },
  item: { marginBottom: 12 },
  chipRow: { flexDirection: "row", marginBottom: 3 },
  chip: { backgroundColor: COLORS.dangerBg, color: COLORS.dangerFg, fontSize: 6.5, letterSpacing: 0.8, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, ...BOLD },
  q: { fontSize: 10, marginBottom: 3, lineHeight: 1.35, ...BOLD },
  ans: { fontSize: 9, marginBottom: 1.5, lineHeight: 1.35 },
  aiPts: { ...BOLD },
  ground: { fontSize: 8, color: COLORS.faint, marginTop: 2, lineHeight: 1.3 },
  empty: { fontSize: 9.5, color: COLORS.successFg },
  moreNote: { fontSize: 8.5, color: COLORS.mute, marginTop: 2 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.75, borderTopColor: COLORS.border, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: COLORS.faint },
  footerNote: { fontSize: 7.5, color: COLORS.faint, flex: 1, paddingRight: 12 },
});

function clampPct(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

/** Points formatted the Italian way (AI points can be fractional): 7 / 7,5. */
function pts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

/** Hard cap for long free text; "…" (U+2026) is WinAnsi-safe. */
function trimTo(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function fmtDateIt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Course/office timezone, not the server's (Render runs UTC).
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

function fmtDateTimeIt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  });
}

// "Domande da rivedere" = OBJECTIVE wrongs only, important-first, capped —
// the AI-graded open answers get their OWN uncapped section (they are few by
// nature and are the heart of the report; a long wrong-list must never crowd
// them off the page).
const MAX_REVIEW_ITEMS = 12;
function buildWrongItems(draft: CorrectionDraft): { items: WrongAnswer[]; extra: number } {
  const all = [
    ...draft.wrongAnswers.filter((w) => w.important),
    ...draft.wrongAnswers.filter((w) => !w.important),
  ];
  return { items: all.slice(0, MAX_REVIEW_ITEMS), extra: Math.max(0, all.length - MAX_REVIEW_ITEMS) };
}

function WrongItem({ w }: { w: WrongAnswer }) {
  return (
    <View style={styles.item} wrap={false}>
      {w.important && (
        <View style={styles.chipRow}>
          {/* "★" is outside WinAnsi (built-in Helvetica) — the red chip IS the flag. */}
          <Text style={styles.chip}>IMPORTANTE</Text>
        </View>
      )}
      <Text style={styles.q}>{trimTo(w.question, 220)}</Text>
      <Text style={[styles.ans, { color: COLORS.dangerFg }]}>Risposta data: {trimTo(w.given || "—", 300)}</Text>
      <Text style={[styles.ans, { color: COLORS.successFg }]}>Risposta corretta: {trimTo(w.correct, 300)}</Text>
    </View>
  );
}

function OpenItem({ g }: { g: OpenGrade }) {
  // Grounding transparency line: failed call → manual review (red); ungrounded
  // suggestion → caution (amber); otherwise list the KB sources relied on.
  const grounding =
    g.failed ? (
      <Text style={[styles.ground, { color: COLORS.dangerFg }]}>Attenzione — valutazione non riuscita: revisione manuale</Text>
    ) : !g.grounded || g.citedTitles.length === 0 ? (
      <Text style={[styles.ground, { color: COLORS.warningFg }]}>Attenzione — non basata sulla knowledge base</Text>
    ) : (
      <Text style={styles.ground}>Fonti KB: {g.citedTitles.join(", ")}</Text>
    );
  return (
    // wrap ON: full rationales (owner batch 7 — no more truncated feedback)
    // may cross a page boundary instead of overflowing it.
    <View style={styles.item}>
      <Text style={styles.q}>{trimTo(g.question, 220)}</Text>
      <Text style={styles.ans}>Risposta data: {trimTo(g.given || "—", 400)}</Text>
      <Text style={styles.ans}>
        <Text style={styles.aiPts}>
          {g.vote != null ? `Voto AI: ${g.vote}/5 — ` : ""}Valutazione AI: {pts(g.points)}/{pts(g.maxPoints)} punti
        </Text>
        {g.rationale.trim() ? ` — ${trimTo(g.rationale, 900)}` : ""}
      </Text>
      {grounding}
    </View>
  );
}

export async function renderCorrectionPdf(args: {
  draft: CorrectionDraft;
  courseName: string;
  family: string;
  submittedAt: string;
}): Promise<Buffer> {
  const { draft, courseName, family, submittedAt } = args;
  const v = VERDICT[draft.verdict];
  const p = clampPct(draft.combinedPct);
  const t = draft.totals;
  const { items: wrongItems, extra } = buildWrongItems(draft);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <Text style={styles.eyebrow}>Sake Sommelier Association</Text>
        <Text style={styles.title}>Bozza esito esame</Text>
        <Text style={styles.student}>{draft.studentName}</Text>
        <Text style={styles.meta}>
          {courseName} · {family} · consegnato il {fmtDateIt(submittedAt)} · esame finale
        </Text>

        {/* ── Verdict band + 0–100 score bar (ticks at the thresholds) ── */}
        <View style={[styles.band, { backgroundColor: v.bg }]}>
          <View style={styles.bandRow}>
            <Text style={[styles.bandVerdict, { color: v.fg }]}>{v.label}</Text>
            <View style={styles.bandRight}>
              <Text style={[styles.bandScoreLabel, { color: v.fg }]}>Punteggio complessivo</Text>
              <Text style={[styles.bandScoreNum, { color: v.fg }]}>{p}%</Text>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${p}%`, backgroundColor: v.accent }]} />
            <View style={[styles.tick, { left: "70%", backgroundColor: v.fg }]} />
            <View style={[styles.tick, { left: "80%", backgroundColor: v.fg }]} />
          </View>
          <View style={styles.tickLabels}>
            <View style={{ width: "70%", alignItems: "flex-end" }}>
              <Text style={[styles.tickText, { color: v.fg }]}>70</Text>
            </View>
            <View style={{ width: "10%", alignItems: "flex-end" }}>
              <Text style={[styles.tickText, { color: v.fg }]}>80</Text>
            </View>
          </View>
        </View>

        {/* ── Sintesi ────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Sintesi</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Domande oggettive</Text>
          <Text style={styles.statValue}>
            {pts(t.objectiveEarned)}/{pts(t.objectiveMax)} punti ({clampPct(draft.objectivePct)}%)
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Domande aperte (valutazione AI su knowledge base)</Text>
          <Text style={styles.statValue}>
            {t.openMax > 0 ? `${pts(t.openEarned)}/${pts(t.openMax)} punti` : "—"}
            {t.openFailed > 0 && (
              <Text style={{ color: COLORS.warningFg }}> · {t.openFailed} da rivedere a mano</Text>
            )}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, styles.statBold]}>Totale</Text>
          <Text style={styles.statValue}>
            {pts(t.earned)}/{pts(t.max)} punti — {p}%
          </Text>
        </View>

        {/* ── Valutazione domande aperte (AI) — never trimmed: this is the
               heart of the report, a long wrong-list must not crowd it out ── */}
        {draft.openGrades.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Valutazione domande aperte (AI su knowledge base)</Text>
            {draft.openGrades.map((g) => (
              <OpenItem key={`o-${g.qid}`} g={g} />
            ))}
          </>
        )}

        {/* ── Domande da rivedere (oggettive sbagliate, importanti prima) ── */}
        <Text style={styles.sectionLabel}>Domande da rivedere</Text>
        {wrongItems.length === 0 ? (
          <Text style={styles.empty}>Nessuna domanda da rivedere: tutte le risposte oggettive sono corrette.</Text>
        ) : (
          wrongItems.map((w) => <WrongItem key={`w-${w.qid}`} w={w} />)
        )}
        {extra > 0 && (
          <Text style={styles.moreNote}>
            {extra === 1 ? "+ 1 altra domanda non mostrata" : `+ altre ${extra} domande non mostrate`}
          </Text>
        )}

        {/* ── Fixed footer (repeats when content flows to a 2nd page) ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerNote}>
            {`Bozza generata automaticamente il ${fmtDateTimeIt(draft.at)} — l'esito ufficiale viene confermato dalla segreteria SSA.`}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
            fixed
          />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
