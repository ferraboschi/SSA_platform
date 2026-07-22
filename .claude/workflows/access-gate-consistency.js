// REUSABLE DRIFT GUARD — verify the exam access decision stays CONSOLIDATED.
// The subject-resolution + gate logic was unified into src/lib/exam-links/access.ts
// (resolveSubjectIds / subjectKeyOf / subjectColId) + shared gates. This checks
// that no entry point has RE-INLINED a divergent copy since. Cheap (1 agent).
//
// Run:  Workflow({ scriptPath: ".claude/workflows/access-gate-consistency.js" })
// Output: { drift[], verdict }.

export const meta = {
  name: 'access-gate-consistency',
  description: 'Guard that the exam access/permission decision stays consolidated (no re-inlined copies)',
  phases: [{ title: 'Scan' }],
}

const REPO = '/Users/ferraboschi/Documents/sakeplatform'

phase('Scan')

const result = await agent(
  REPO + '. Verify the exam ACCESS/PERMISSION logic is still consolidated in src/lib/exam-links/access.ts, not re-inlined. Grep src/ (exclude access.ts itself and *.test.ts) for DRIFT — copies that should use the shared helpers:\n' +
  '1. Inline subject parse: `/^\\d+$/.test(` applied to a token subject field (s/p) or `Number(res.payload.s)` style — should be resolveSubjectIds.\n' +
  '2. Inline subject key: template strings building `c${...}` / `p${...}` for a corsista/companion key — should be subjectKeyOf.\n' +
  '3. Inline subject column: `corsistaId != null ? "corsista_id" : "partecipante_id"` — should be subjectColId.\n' +
  '4. Hardcoded exam thresholds: literal `>= 80` / `>= 70` (or `>= 0.8`/`>= 0.7`) deciding a passed/retrial/failed outcome — should be scoreToOutcome / EXAM_THRESHOLDS.\n' +
  '5. A confirmation check `email_confirmed_at` re-implemented in a NEW place beyond the known send/email-gate sites.\n' +
  'For each hit: is it a genuine drift (a divergent re-implementation that should adopt the shared helper) or legitimate (e.g. inside access.ts, a test, a DB row field access, or an unrelated numeric compare)? Report only GENUINE drift, with file:line and the helper it should use. If none, say so explicitly. READ-ONLY.',
  { label: 'drift-scan', phase: 'Scan', effort: 'high', schema: {
    type: 'object', additionalProperties: false,
    properties: {
      clean: { type: 'boolean' },
      drift: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            file: { type: 'string' },
            line: { type: 'integer' },
            kind: { type: 'string' },
            shouldUse: { type: 'string' },
            snippet: { type: 'string' },
          },
          required: ['file', 'kind', 'shouldUse'],
        },
      },
      verdict: { type: 'string' },
    },
    required: ['clean', 'drift', 'verdict'],
  } },
)

return result || { clean: true, drift: [], verdict: 'no result' }
