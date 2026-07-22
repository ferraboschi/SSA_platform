// REUSABLE SUBSYSTEM AUDIT — the exam LINK LIFECYCLE + PERMISSIONS state machine.
// Maps every access/permission state transition, then adversarially verifies the
// matrix. Re-run any time to catch drift after changes to the link/permission
// code (this subsystem is the platform’s #1 source of recurring bugs).
//
// Run:  Workflow({ scriptPath: ".claude/workflows/exam-link-audit.js" })
// Output: { matrix (markdown), issues, verdict }.

export const meta = {
  name: 'exam-link-audit',
  description: 'Map + adversarially verify the exam link-lifecycle & permission state matrix',
  phases: [{ title: 'Scenarios' }, { title: 'Synthesize' }, { title: 'Verify' }],
}

const REPO = '/Users/ferraboschi/Documents/sakeplatform'
const KEYFILES =
  'Key files (read them fresh — this audit must reflect CURRENT code): src/lib/exam-links/lifecycle.ts (closure/epoch store, isBlockedByClosure), token.ts (verify, ia issued-at, e expiry, graceSeconds), access.ts (subject resolution primitives), actions.ts (submitExam, getLinkStateAction), access-actions.ts (email gate), invite-email.ts, close-finalize.ts (finalize-on-close + undoCloseFinalized), progress-actions.ts (heartbeat), live-progress.ts (presence + isBlockedByAbsence); src/lib/share-links/exam-send-actions.ts (send/copy/all, close/reopen, resolveSendTarget); src/lib/corsi/sandbox-reset.ts; src/app/esame/[token]/page.tsx (render gates); src/components/esame-pubblico/ExamRunner.tsx (poll, closed/expired screens). READ-ONLY, do NOT edit.'

phase('Scenarios')

const probes = [
  { label: 'present-student',
    prompt: REPO + '. Trace what happens across the exam-link surfaces for a student PRESENT at the roll-call AND with data confirmed: (a) can the educator SEND/COPY their personal link, and what extra conditions apply? (b) the shared class link (email gate)? (c) opening their personal link page (which gates run + pass)? (d) can they submit? Cite file:line for each gate + the actual behavior. Flag any inconsistency. ' + KEYFILES },
  { label: 'absent-or-unconfirmed',
    prompt: REPO + '. Trace the ABSENT student and (separately) the PRESENT-but-NOT-CONFIRMED student across send/copy, email gate, page render, and submit-time re-check. Where is each blocked, with what message, and what is the fail-open rule when attendance is UNKNOWN (pre-migration/DB error)? Cite file:line + actual behavior. Note presence rule differences by test kind (day test ↔ that day; feedback/final ↔ any attended day). ' + KEYFILES },
  { label: 'close-and-grace',
    prompt: REPO + '. Trace "Chiudi per tutti": what setClosure writes, how finalizeInProgressOnClose auto-submits in-progress sittings (skip empty, swallow duplicate) + records the undo set, and how the closure blocks EVERY entry point (page, submit, email gate, heartbeat, the open-runner poll). Then trace NATURAL end-of-day expiry: the 3h submit-only grace, and confirm a CLOSURE blocks instantly REGARDLESS of grace (isBlockedByClosure is independent). Edge cases: student mid-typing at close; student who finished within grace; a submit racing the close. Confirm NO in-progress work is silently orphaned. Cite file:line + actual behavior + any residual hole. ' + KEYFILES },
  { label: 'reopen-reset-resubmit',
    prompt: REPO + '. Trace THREE things. (1) REOPEN / "annulla consegne e riapri": clearClosure vs undoCloseFinalized — does the plain reopen re-admit a student auto-finalized by the close (or do they hit the already-submitted wall), and does the undo variant delete ONLY the close-created submissions (never a real hand-in) + un-stamp progress? Any race between finalize and undo? (2) RESET "Riporta a zero": the link epoch — what is wiped vs restored, do pre-reset tokens die? (3) ALREADY-SUBMITTED gate on the /esame page: the ordered gates (invalid/expired/closed/not-found/already-submitted[day→esito vs final→wall, with the retry+fail-closed]/absent/resume). Flag any ordering issue or fail-open where it should fail-closed. Cite file:line + actual behavior. ' + KEYFILES },
]

const scenarios = await parallel(
  probes.map((p) => () => agent(p.prompt, { label: p.label, phase: 'Scenarios', effort: 'high' })),
)

phase('Synthesize')

const bundle = probes.map((p, i) => '## ' + p.label + '\n' + (scenarios[i] || '(none)')).join('\n\n---\n\n')

const matrix = await agent(
  REPO + '. Synthesize a STATE MATRIX (markdown table): rows = states (present, absent, not-confirmed, mid-exam-when-closed, after-close, reopen/re-send, reopen+undo, expired-in-grace, truly-expired, after-reset, already-submitted); columns = [Send/Copy personal] [Shared email gate] [Open page render] [Submit at hand-in] [Open-runner poll]. Each cell = ACTUAL behavior (allowed/blocked + the screen/message), grounded in file:line. THEN a prioritized ISSUES list: inconsistencies, holes, fail-open-where-should-fail-closed, surprising behavior — each with file:line + a concrete trigger + confidence, split into CONFIRMED-BUG vs BY-DESIGN-worth-confirming. Be precise and terse; invent nothing not in the scenario reports below.\n\nREPORTS:\n' + bundle,
  { label: 'matrix', phase: 'Synthesize', effort: 'high' },
)

phase('Verify')

const verdict = await agent(
  REPO + '. Adversarial verifier. Independently CHECK the load-bearing claims and every ISSUE in the matrix below against the actual code. For each issue: CONFIRMED (real, will happen — give a trigger) or REFUTED (matrix wrong — say why), with file:line. Then a crisp FINAL: (a) matrix cells you would correct; (b) the SHORT list of genuine defects needing a code fix, most-severe first; (c) by-design items to confirm with the owner. ' + KEYFILES + '\n\nMATRIX + ISSUES:\n' + matrix,
  { label: 'verify', phase: 'Verify', effort: 'high' },
)

return { matrix, verdict }
