/** Only allow same-origin relative redirect targets (block open-redirect). */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith("/")) return "/dashboard";
  // "//evil.com" and "/\evil.com" are treated as absolute URLs by browsers.
  if (next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}
