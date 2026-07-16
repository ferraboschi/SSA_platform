// The "Test esame" sandbox: a permanent fictitious course used to try and
// demo the whole exam flow (day tests, feedback, final exam, appello) without
// touching real data. It lives in the corsi table but must NEVER appear in
// lists, stats, exports or alerts — only via its pinned card on /corsi and
// its own detail page. Identified by handle (stable across environments).

export const SANDBOX_COURSE_HANDLE = "corso-test-di-tre-giorni";

/** Every test-fixture course living in the prod corsi table. Besides the
 *  pinned sandbox, "test-verifica-esame" (corso 198) is the earlier exam
 *  test bench: it has fake enrollments (€600) and, being past-dated, would
 *  otherwise surface as a held course in archivio, analytics and the
 *  "da fatturare" queue. */
export const SANDBOX_COURSE_HANDLES = new Set([
  SANDBOX_COURSE_HANDLE,
  "test-verifica-esame",
]);

/** Works on domain courses, list items and raw DB rows alike. */
export function isSandboxCourse(c: {
  handle?: string | null;
  product_handle?: string | null;
}): boolean {
  return c.handle != null && SANDBOX_COURSE_HANDLES.has(c.handle);
}
