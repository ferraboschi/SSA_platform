// The "Test esame" sandbox: a permanent fictitious course used to try and
// demo the whole exam flow (day tests, feedback, final exam, appello) without
// touching real data. It lives in the corsi table but must NEVER appear in
// lists, stats, exports or alerts — only via its pinned card on /corsi and
// its own detail page. Identified by handle (stable across environments).

export const SANDBOX_COURSE_HANDLE = "corso-test-di-tre-giorni";

/** Works on domain courses, list items and raw DB rows alike. */
export function isSandboxCourse(c: {
  handle?: string | null;
  product_handle?: string | null;
}): boolean {
  return c.handle === SANDBOX_COURSE_HANDLE;
}
