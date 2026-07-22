// REUSABLE PRE-DEPLOY GATE — adversarial regression review of the current branch
// diff, before pushing to prod. This is the net that caught 2 real blockers
// (silent data-loss + a race) on 2026-07-22 before they shipped.
//
// Run:  Workflow({ scriptPath: ".claude/workflows/pre-deploy-review.js" })
//   optional args:
//     "focus text"                     → extra focus note appended to every reviewer
//     { range: "origin/main...HEAD" }  → override the diff range (default shown)
//     { range, focus }
//
// Output: { range, confirmedBlockers[], refuted[], summary }. If confirmedBlockers
// is non-empty, DO NOT DEPLOY until fixed.

export const meta = {
  name: 'pre-deploy-review',
  description: 'Adversarial regression review of the current branch diff before deploy',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}

const REPO = '/Users/ferraboschi/Documents/sakeplatform'
const range = (args && typeof args === 'object' && args.range) || 'origin/main...HEAD'
const focus = (typeof args === 'string' ? args : args && args.focus) || ''

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['BLOCKER', 'NIT'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          summary: { type: 'string' },
          trigger: { type: 'string', description: 'concrete inputs/state → wrong output' },
        },
        required: ['severity', 'file', 'summary', 'trigger'],
      },
    },
  },
  required: ['findings'],
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED'] },
    reason: { type: 'string' },
  },
  required: ['verdict', 'reason'],
}

const BASE =
  REPO + '. Review ONLY the changes in `git diff ' + range + '`. Run that git command yourself; read each changed file AND its pre-change version (`git show <base>:<path>`). This is a PRE-DEPLOY gate for a LIVE exam platform (Next.js app-router + Supabase, deployed on Render from main). Hunt for REGRESSIONS and correctness bugs a real user/educator would hit. Report each finding with file:line, a concrete trigger (inputs → wrong result), and severity (BLOCKER = must fix before deploy / NIT). Be specific; skip style. If the diff is empty, return no findings. READ-ONLY, do NOT edit.' +
  (focus ? '\n\nEXTRA FOCUS FROM THE OPERATOR: ' + focus : '')

phase('Review')

const dims = [
  { key: 'correctness',
    prompt: BASE + '\n\nDIMENSION: correctness & regressions. Logic errors, off-by-one, null/undefined, wrong conditionals, broken error handling, a changed function whose callers now misbehave, a data-shape change not propagated everywhere. For a REFACTOR: prove behavior-preservation against the pre-change version, or find the exact drift (fail-open↔closed, order, message, boundary).' },
  { key: 'exam-critical-path',
    prompt: BASE + '\n\nDIMENSION: the EXAM critical path (the platform’s most bug-prone area). LINK LIFECYCLE + PERMISSIONS: token verify + grace, closure ("Chiudi per tutti" must block everyone instantly), natural expiry (3h submit-only grace — must not orphan in-progress work), presence/absence gate, data-confirmation gate, already-submitted (day shows esito, final/feedback walls), sandbox-reset epoch, the "annulla consegne" undo set. GRADING/CORRECTION: gradeAnswers (fill/multi/choice/TF, partial credit, accepted-answer splitting, fill→AI fallback), the ONE score→outcome rule (scoreToOutcome, EXAM_THRESHOLDS), the correction draft, certificate + per-language email. Does any change let the wrong person in / block the right one, lose or mis-grade an answer, or change a student-visible outcome? Key files: src/lib/exam-links/*, src/lib/esami/*, src/lib/share-links/exam-send-actions.ts, src/app/esame/[token]/page.tsx.' },
  { key: 'security-data',
    prompt: BASE + '\n\nDIMENSION: security & data-integrity. Auth/role gates, RLS assumptions, a fail-OPEN where it should fail-CLOSED (esp. on integrity guarantees), secret logging, unbounded input, a write that can corrupt or orphan a row, a cache poisoned by a RETURNED error (unstable_cache stores returned values but NOT thrown ones — a degraded return is cached), a missing revalidatePath/Tag after a write.' },
]

const reviews = await pipeline(
  dims,
  (d) => agent(d.prompt, { label: 'review:' + d.key, phase: 'Review', effort: 'high', schema: FINDINGS_SCHEMA }),
  // Adversarially verify each BLOCKER as its dimension completes.
  (review, d) => {
    const blockers = ((review && review.findings) || []).filter((f) => f.severity === 'BLOCKER')
    if (!blockers.length) return { dim: d.key, verified: [] }
    return parallel(
      blockers.map((f) => () =>
        agent(
          REPO + '. Adversarially verify this PRE-DEPLOY finding against `git diff ' + range + '` and the actual code. Is it a REAL regression that will happen in production, or a false alarm? Give a concrete reproduction (inputs → outcome) or the precise reason it cannot happen.\n\nFINDING (' + d.key + '): ' + f.summary + '\nfile: ' + f.file + ':' + (f.line || '?') + '\ntrigger: ' + f.trigger,
          { label: 'verify:' + f.file, phase: 'Verify', effort: 'high', schema: VERDICT_SCHEMA },
        ).then((v) => ({ ...f, dim: d.key, ...(v || {}) })),
      ),
    ).then((vs) => ({ dim: d.key, verified: vs.filter(Boolean) }))
  },
)

const all = reviews.flatMap((r) => (r && r.verified) || [])
const confirmed = all.filter((f) => f.verdict === 'CONFIRMED')
return {
  range,
  confirmedBlockers: confirmed,
  refuted: all
    .filter((f) => f.verdict === 'REFUTED')
    .map((f) => ({ file: f.file, summary: f.summary, reason: f.reason })),
  summary:
    confirmed.length +
    ' confirmed blocker(s) — ' +
    (confirmed.length ? 'DO NOT DEPLOY until fixed' : 'clear to deploy (review NITs at leisure)'),
}
