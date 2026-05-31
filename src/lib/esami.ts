// Esami & test — pure, serializable projections and the deterministic test
// simulation engine. Faithful to the prototype (page-esami.jsx,
// page-esame-tests.jsx). No JSX, no Date.now / Math.random: safe to run on the
// server (for projections) and on the client (roster rebuilt as state changes).

import type {
  Course,
  Exam,
  ExamMeta,
  ExamQuestion,
  ExamResult,
  ExamTemplate,
} from "@/lib/domain";

// ===== Deterministic hash (ported verbatim from the prototype seed) =====

export function seedHash(k: string): number {
  let x = 0;
  for (let i = 0; i < k.length; i++) x = (x * 31 + k.charCodeAt(i)) | 0;
  return Math.abs(x);
}

// ===== Family helpers =====

export function examFamilyLabel(type: string): string {
  return type === "shochu" ? "Shochu" : "Nihonshu · Certificato";
}
export function examFamilyTone(type: string): "oro" | "azzurro" {
  return type === "shochu" ? "oro" : "azzurro";
}

// ===== Hub projection (esame list rows) =====

export interface ExamHubItem {
  id: string;
  shortTitle: string;
  city: string;
  day: number;
  month: string;
  year: number;
  enrolled: number;
  type: string;
  done: boolean;
  live: boolean;
  examDayNo: number;
  examDateLabel: string;
  miniDone: number;
  miniTotal: number;
  feedbackStatus: "pronto" | "inviato";
  feedbackResponses: number;
  feedbackTotal: number;
  passed: number;
  resultsTotal: number;
}

export function toExamHubItem(c: Course): ExamHubItem | null {
  if (!c.exam || !c.examMeta) return null;
  const meta = c.examMeta;
  const results = c.examResults2 ?? [];
  return {
    id: c.id,
    shortTitle: c.shortTitle,
    city: c.city,
    day: c.day,
    month: c.month,
    year: c.year,
    enrolled: c.enrolled,
    type: c.type,
    done: meta.done,
    live: meta.live,
    examDayNo: meta.examDayNo,
    examDateLabel: meta.examDateLabel,
    miniDone: meta.miniTests.filter((m) => m.status === "completato").length,
    miniTotal: meta.miniTests.length,
    feedbackStatus: meta.feedback.status,
    feedbackResponses: meta.feedback.responses,
    feedbackTotal: meta.feedback.total,
    passed: results.filter((r) => r.status === "passed").length,
    resultsTotal: results.length,
  };
}

export interface ExamHubData {
  daFare: ExamHubItem[];
  fatti: ExamHubItem[];
  passRate: number;
  studentsDaFare: number;
  allResultsCount: number;
}

export function buildExamHub(courses: Course[]): ExamHubData {
  const items = courses.map(toExamHubItem).filter((x): x is ExamHubItem => x !== null);
  const daFare = items.filter((c) => !c.done);
  const fatti = items.filter((c) => c.done);
  const allResultsCount = fatti.reduce((s, c) => s + c.resultsTotal, 0);
  const passedTotal = fatti.reduce((s, c) => s + c.passed, 0);
  const passRate = allResultsCount ? Math.round((passedTotal / allResultsCount) * 100) : 0;
  const studentsDaFare = daFare.reduce((s, c) => s + c.enrolled, 0);
  return { daFare, fatti, passRate, studentsDaFare, allResultsCount };
}

// ===== Time-estimate constants (per question type, seconds) =====

export const QUESTION_EST_SEC: Record<string, number> = {
  single: 8, truefalse: 8, image: 8, rating: 8,
  multi: 13, fill: 13, match: 13, order: 13,
  open: 45,
};

export function estimateSeconds(qs: ExamQuestion[]): number {
  return (qs || []).reduce((s, q) => s + (QUESTION_EST_SEC[q.type] || 10), 0);
}
export function formatEstimate(sec: number): string {
  return sec >= 60 ? `~${Math.round(sec / 60)} min` : `~${sec}s`;
}
export function pointsTotal(qs: ExamQuestion[]): number {
  return qs.reduce((s, q) => s + (q.points || 1), 0);
}

// ===== Test definitions =====

export type TestState = "bozza" | "aperto" | "chiuso";
export type TestKind = "minitest" | "prova" | "esame" | "feedback";

export interface ExamTest {
  key: string;
  kind: TestKind;
  tag: string;
  shortLabel: string;
  title: string;
  topic: string;
  when: string;
  questions: ExamQuestion[];
  hasScore: boolean;
  hasTimer: boolean;
  duration?: number;
  state: TestState;
  isFinal?: boolean;
}

// Build the ordered list of tests for a course: Day 1..N + Prova esame + Esame.
export function buildTests(course: Course, exam: Exam, template: ExamTemplate, meta: ExamMeta): ExamTest[] {
  const fam = exam.family === "shochu" ? "shochu" : "nihonshu";
  const out: ExamTest[] = [];
  meta.miniTests.forEach((m, i) => {
    const tplDay = template.miniTests[i] || template.miniTests[template.miniTests.length - 1];
    let state: TestState = "bozza";
    if (meta.done) state = "chiuso";
    else if (meta.live) state = m.status === "completato" ? "chiuso" : "bozza";
    out.push({
      key: "day" + m.day,
      kind: "minitest",
      tag: "D" + m.day,
      shortLabel: "Day " + m.day,
      title: m.name,
      topic: m.topic,
      when: `Fine Giorno ${m.day}`,
      questions: (tplDay?.questions || []).map((q) => ({ ...q })),
      hasScore: true,
      hasTimer: false,
      state,
    });
  });
  const provaQs = exam.questions.slice(0, 20).map((q, i) => ({ ...q, n: i + 1 }));
  let provaState: TestState = "bozza";
  if (meta.done) provaState = "chiuso";
  else if (meta.live) provaState = "aperto";
  out.push({
    key: "prova",
    kind: "prova",
    tag: "P",
    shortLabel: "Prova esame",
    title: `Prova esame · ${fam === "shochu" ? "Shochu" : "Nihonshu"}`,
    topic: "Simulazione dell'esame finale (non certifica)",
    when: "Prima dell'esame finale",
    questions: provaQs,
    hasScore: true,
    hasTimer: true,
    duration: 45,
    state: provaState,
  });
  const esameQs = exam.questions.slice(0, 30).map((q, i) => ({ ...q, n: i + 1 }));
  out.push({
    key: "esame",
    kind: "esame",
    tag: "E",
    shortLabel: "Esame",
    title: `Esame finale · ${fam === "shochu" ? "Shochu" : "Nihonshu"}`,
    topic: `Esame di certificazione · Giorno ${meta.examDayNo} · ${meta.examDateLabel}`,
    when: `Giorno ${meta.examDayNo}`,
    questions: esameQs,
    hasScore: true,
    hasTimer: true,
    duration: exam.duration || 60,
    state: meta.done ? "chiuso" : "bozza",
    isFinal: true,
  });
  return out;
}

export function buildFeedbackTest(template: ExamTemplate, meta: ExamMeta): ExamTest {
  return {
    key: "feedback",
    kind: "feedback",
    tag: "F",
    shortLabel: "Feedback",
    title: template.feedback.name,
    topic: "Modulo di fine corso · senza punteggio",
    when: "Fine corso",
    questions: template.feedback.questions.map((q) => ({ ...q })),
    hasScore: false,
    hasTimer: true,
    duration: 15,
    state: meta.done ? "chiuso" : meta.live ? "aperto" : "bozza",
  };
}

// ===== Roster (deterministic per-test simulation) =====

export type ConnStatus = "submitted" | "in-progress" | "waiting" | "absent";

export interface RosterAnswer {
  answered: boolean;
  correct: boolean;
  timeSec: number | null;
  given: number | null;
}

export interface RosterRow {
  name: string;
  email: string;
  conn: ConnStatus;
  checkedIn: boolean;
  answers: RosterAnswer[];
  nAnswered: number;
  nCorrect: number;
  nWrong: number;
  nMissing: number;
  score: number;
  totalTime: number;
}

export interface RosterStudent {
  name: string;
  email: string;
}

export function buildRoster(
  students: RosterStudent[],
  handle: string,
  test: Pick<ExamTest, "key" | "state" | "questions" | "hasScore">,
): RosterRow[] {
  const qs = test.questions;
  const totalPts = pointsTotal(qs);
  return students.map((s) => {
    const k = seedHash(s.email + handle + test.key);
    const ability = 55 + (k % 44);
    let conn: ConnStatus;
    if (test.state === "chiuso") conn = k % 100 < 94 ? "submitted" : "absent";
    else if (test.state === "aperto") {
      const b = k % 100;
      conn = b < 8 ? "absent" : b < 26 ? "waiting" : b < 72 ? "in-progress" : "submitted";
    } else conn = "absent";

    const progressTarget =
      conn === "submitted"
        ? qs.length
        : conn === "in-progress"
          ? Math.max(1, Math.round(qs.length * ((30 + (k % 60)) / 100)))
          : 0;

    const answers: RosterAnswer[] = qs.map((q, qi) => {
      const kk = seedHash(s.email + test.key + qi);
      const answered = qi < progressTarget;
      if (!answered) return { answered: false, correct: false, timeSec: null, given: null };
      const correct = test.hasScore ? kk % 100 < ability : true;
      let given: number | null = null;
      if (q.options && q.options.length) {
        const correctIdx = q.correct && typeof q.correct[0] === "number" ? (q.correct[0] as number) : 0;
        if (test.hasScore) {
          given = correct ? correctIdx : (correctIdx + 1 + (kk % Math.max(1, q.options.length - 1))) % q.options.length;
        } else given = kk % q.options.length;
      }
      return { answered: true, correct, timeSec: 18 + (kk % 110), given };
    });

    const nAnswered = answers.filter((a) => a.answered).length;
    const nCorrect = answers.filter((a) => a.correct && a.answered).length;
    const nWrong = answers.filter((a) => a.answered && !a.correct).length;
    const nMissing = qs.length - nAnswered;
    const corrPts = qs.reduce((sum, q, qi) => sum + (answers[qi].correct && answers[qi].answered ? q.points || 1 : 0), 0);
    const score = totalPts ? Math.round((corrPts / totalPts) * 100) : 0;
    const totalTime = answers.reduce((sum, a) => sum + (a.timeSec || 0), 0);
    return { name: s.name, email: s.email, conn, checkedIn: conn !== "absent", answers, nAnswered, nCorrect, nWrong, nMissing, score, totalTime };
  });
}

export const CONN_ORDER: Record<ConnStatus, number> = {
  "in-progress": 0,
  submitted: 1,
  waiting: 2,
  absent: 3,
};

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function testToken(handle: string, key: string): string {
  return (seedHash(handle + key) % 0xffffffff).toString(16).padStart(8, "0").slice(0, 8);
}

// ===== Per-course exam detail projection =====

export interface ExamCourseHeader {
  id: string;
  shortTitle: string;
  city: string;
  day: number;
  month: string;
  year: number;
  days: number;
  enrolled: number;
  type: string;
  done: boolean;
  live: boolean;
  examDayNo: number;
  examDateLabel: string;
}

export function toExamCourseHeader(c: Course, meta: ExamMeta): ExamCourseHeader {
  return {
    id: c.id,
    shortTitle: c.shortTitle,
    city: c.city,
    day: c.day,
    month: c.month,
    year: c.year,
    days: c.days,
    enrolled: c.enrolled,
    type: c.type,
    done: meta.done,
    live: meta.live,
    examDayNo: meta.examDayNo,
    examDateLabel: meta.examDateLabel,
  };
}

export interface RosterStudentsResult {
  students: RosterStudent[];
  handle: string;
}

export function courseRosterStudents(c: Course): RosterStudentsResult {
  return {
    students: c.students.slice(0, c.enrolled).map((s) => ({ name: s.name, email: s.email })),
    handle: c.handle,
  };
}

// ===== Results (Risultati tab + report list) =====

export interface ResultsSummary {
  promossi: number;
  riserva: number;
  bocciati: number;
  media: number;
  total: number;
  distribution: number[]; // 10 buckets 0-9 → 0-100
  rows: ExamResult[];
}

export function buildResultsSummary(results: ExamResult[]): ResultsSummary {
  const promossi = results.filter((r) => r.status === "passed").length;
  const riserva = results.filter((r) => r.status === "retrial").length;
  const bocciati = results.filter((r) => r.status === "failed").length;
  const media = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0;
  const distribution = Array.from({ length: 10 }, (_, b) =>
    results.filter((r) => Math.min(9, Math.floor(r.score / 10)) === b).length,
  );
  return { promossi, riserva, bocciati, media, total: results.length, distribution, rows: results };
}
