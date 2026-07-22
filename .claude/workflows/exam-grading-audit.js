// REUSABLE SUBSYSTEM AUDIT — the exam GRADING & CORRECTION pipeline.
// Objective grading → score→outcome → correction draft → certificate/email.
// Re-run after changes to grading/correction to catch scoring drift or a
// student-visible outcome change.
//
// Run:  Workflow({ scriptPath: ".claude/workflows/exam-grading-audit.js" })
// Output: { report, verdict }.

export const meta = {
  name: 'exam-grading-audit',
  description: 'Map + adversarially verify the exam grading & correction pipeline',
  phases: [{ title: 'Trace' }, { title: 'Synthesize' }, { title: 'Verify' }],
}

const REPO = '/Users/ferraboschi/Documents/sakeplatform'
const KEYFILES =
  'Key files (read fresh): src/lib/exam-links/grading.ts (gradeAnswers, scoreToOutcome, splitAccepted, multiFraction, isCorrectSubset, certifiedScore), esito.ts (buildDayEsito); src/lib/esami/correction.ts (buildCorrectionDraft, verdictFromPct), correction-run.ts (runSingleSubmissionCorrection / runCourseCorrection), correction-types.ts, rag/grading.ts (AI open-answer grading, rubric 1-5 vote → points); src/lib/esami/exam-sections.ts (computeSections/weakAreas), certificate-data.ts, certificate-pdf.tsx, class-average.ts (unstable_cache), exam-email.ts (per-language templates + merge), alerts/emails.ts (sendExamResultEmail); src/lib/domain/constants.ts (EXAM_THRESHOLDS). READ-ONLY, do NOT edit.'

phase('Trace')

const probes = [
  { label: 'objective-grading',
    prompt: REPO + '. Trace gradeAnswers (grading.ts) for EVERY question type: fill (exact match; accepted-answer splitting by comma/semicolon/newline; a non-matching concept → ok:null routes to AI, NOT ok:false), multi (partial credit via fraction; the two-correct "either/or/both" isCorrectSubset gate), single choice, true/false, match, order. For each: what makes it correct/partial/wrong/ungradeable, and how a blank answer scores. Confirm the count-based autoScore and that ok===null (open lane) never counts as wrong. Give concrete input→verdict examples and cite file:line. Flag any way a legitimately-correct answer is marked wrong (the recurring owner complaint). ' + KEYFILES },
  { label: 'score-to-outcome',
    prompt: REPO + '. Trace the ONE score→outcome rule: scoreToOutcome (grading.ts) rounds to nearest int then compares EXAM_THRESHOLDS (pass .8 / retrial .7); verdictFromPct (correction.ts) must delegate to it; confirm the 3 former inline copies (esito.ts, ExamRunner, seed) call it. Check boundary behavior (79/79.5/80, 69/69.5/70). Then confirm certifiedScore’s rule for when NO number is shown (all-manual / operator override). Cite file:line. Flag any site still hardcoding 80/70 or diverging at a boundary. ' + KEYFILES },
  { label: 'correction-draft',
    prompt: REPO + '. Trace buildCorrectionDraft (correction.ts): the objective lane (points, wrongAnswers, per-category X/Y counts) and the AI open lane (points from rubric vote, missing-result rows, failed→manual). Confirm combinedPct (points-weighted, AI included) vs objectivePct (count-based, matches the live auto-corrector) and the draft verdict from combinedPct. Check runSingleSubmissionCorrection/runCourseCorrection wire it correctly and that the draft is ADVISORY (staff confirms in Esiti; the draft never writes exam_result). Confirm the confirm-path uses the OBJECTIVE score, not combinedPct. Cite file:line + flag any miscount or double-count. ' + KEYFILES },
  { label: 'certificate-email',
    prompt: REPO + '. Trace the student-facing output: buildCertificateData → computeSections/weakAreas (objective correct/total per area), the per-language document (only the exam language rendered), the spilla/diploma messaging by outcome, and the "resoconto personale (non ufficiale)" framing. Then the email: exam-email.ts per-language templates (coerceSavedEmailTemplates back-compat, mergeExamEmailTemplates onto DEFAULTS_BY_LANG[lang]) and sendExamResultEmail using loadExamEmailTemplatesForLang. Finally class-average.ts: confirm it THROWS on a total DB failure (so unstable_cache does not cache a poisoned {n:0}). Cite file:line + flag any language leak, wrong outcome text, or cache-poisoning. ' + KEYFILES },
]

const traces = await parallel(
  probes.map((p) => () => agent(p.prompt, { label: p.label, phase: 'Trace', effort: 'high' })),
)

phase('Synthesize')

const bundle = probes.map((p, i) => '## ' + p.label + '\n' + (traces[i] || '(none)')).join('\n\n---\n\n')

const report = await agent(
  REPO + '. Synthesize a GRADING PIPELINE REPORT from the traces below: (1) a compact table of question-type → grading rule (correct/partial/wrong/ungradeable/blank); (2) the single score→outcome rule + any boundary risk; (3) the draft’s combined-vs-objective scoring + the staff-confirm source; (4) the certificate/email localization + class-average caching posture. THEN a prioritized ISSUES list (file:line + trigger + confidence), split CONFIRMED-BUG vs BY-DESIGN. Invent nothing not in the traces.\n\nTRACES:\n' + bundle,
  { label: 'report', phase: 'Synthesize', effort: 'high' },
)

phase('Verify')

const verdict = await agent(
  REPO + '. Adversarial verifier. Independently CHECK every ISSUE in the report below against the actual code. For each: CONFIRMED (real — give an input→wrong-output trigger) or REFUTED (say why), file:line. Pay special attention to: a correct student answer scored wrong, a boundary verdict flip, a mis-weighted combinedPct, a language leak, and class-average cache poisoning. FINAL: the SHORT list of genuine defects most-severe first, + by-design items to confirm with the owner. ' + KEYFILES + '\n\nREPORT:\n' + report,
  { label: 'verify', phase: 'Verify', effort: 'high' },
)

return { report, verdict }
