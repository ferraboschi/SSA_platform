// Roll-call presence SUMS — PURE (no imports). Owner rule (25/9/2026): the
// platform only COUNTS presences (per student across the days, per day across
// the roster); it never gates the exam on them. Shared by the admin course
// page (rows from corsi_presenze) and the educator appello (the live map).

export interface PresenceRow {
  corsista_id: number | null;
  day_no: number;
  present: boolean | null;
}

/** Sorted, unique day numbers each corsista is marked PRESENT on. */
export function presentDaysByCorsista(rows: PresenceRow[]): Map<number, number[]> {
  const acc = new Map<number, Set<number>>();
  for (const r of rows) {
    if (r.corsista_id == null || !r.present) continue;
    const day = Number(r.day_no);
    if (!Number.isInteger(day) || day < 1) continue;
    (acc.get(r.corsista_id) ?? acc.set(r.corsista_id, new Set()).get(r.corsista_id)!).add(day);
  }
  const out = new Map<number, number[]>();
  for (const [id, days] of acc) out.set(id, [...days].sort((a, b) => a - b));
  return out;
}

/** Day numbers marked present in a per-subject roll-call map ({ [day]: bool }),
 *  bounded to 1..maxDay so a stale higher day never counts. */
export function presentDaysFromMap(
  dayMap: Record<string | number, boolean> | undefined,
  maxDay: number,
): number[] {
  if (!dayMap) return [];
  return Object.entries(dayMap)
    .filter(([d, v]) => v && Number.isInteger(Number(d)) && Number(d) >= 1 && Number(d) <= maxDay)
    .map(([d]) => Number(d))
    .sort((a, b) => a - b);
}

/** How many of the COURSE days (1..dayCount, exam day excluded) are present. */
export function countCourseDays(presentDays: number[], dayCount: number): number {
  return presentDays.filter((d) => d >= 1 && d <= dayCount).length;
}

/** Present count per day (1..maxDay) across every subject's present days. */
export function presenceCountsByDay(
  presentDaysPerSubject: Iterable<number[]>,
  maxDay: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (let d = 1; d <= maxDay; d++) out.set(d, 0);
  for (const days of presentDaysPerSubject) {
    for (const d of days) if (d >= 1 && d <= maxDay) out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
}

/** "2/3" style label for a student, plus the exam-day flag when applicable. */
export function presenceLabel(presentDays: number[], dayCount: number, examDay: number | null): string {
  const base = `${countCourseDays(presentDays, dayCount)}/${dayCount}`;
  return examDay != null && presentDays.includes(examDay) ? `${base} + esame` : base;
}
