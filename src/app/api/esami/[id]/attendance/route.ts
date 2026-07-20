import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { courseRosterStudents } from "@/lib/esami";
import { loadCourseExamResults } from "@/lib/exam-links/results";
import { buildAttendanceXlsx, type AttendanceRow } from "@/lib/esami/attendance-xlsx";
import { monthIndexIt } from "@/lib/dates/italian-months";

// CSS Attendance List (.xlsx) for a course, pre-filled with what we have. The
// franchise is fixed; columns we don't track stay blank. Admin/manager only.
export const dynamic = "force-dynamic";

const FRANCHISE = "Sake Sommelier Association Italia";

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0].toUpperCase(), last: parts.slice(1).join(" ").toUpperCase() };
}
function passFail(status: string): string {
  return status === "passed" ? "PASS" : status === "failed" ? "FAIL" : status === "retrial" ? "RETRIAL" : "";
}

// Template dates are English-style ("26 February 2023").
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function enDate(day: number | null | undefined, monthIt: string, year: number): string {
  const mIdx = monthIndexIt(monthIt);
  if (mIdx < 0 || !year) return "";
  return `${day || 1} ${EN_MONTHS[mIdx]} ${year}`;
}
/** DOB is now collected via a date picker (ISO YYYY-MM-DD) — render it in the
 *  template's "1 January 1980" form. A legacy free-typed value passes through. */
function enDob(raw: string | undefined | null): string {
  const v = (raw ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  const [, y, mo, d] = m;
  const mi = Number(mo) - 1;
  return mi >= 0 && mi < 12 ? `${Number(d)} ${EN_MONTHS[mi]} ${y}` : v;
}

/** "Maschile"/"Male"/"男性" → the template's M/F/Other. */
function genderMFO(raw: string | undefined): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (/^m|男/.test(v)) return "M";
  if (/^f|donna|女/.test(v)) return "F";
  return "Other";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasRole(["admin", "manager"]).catch(() => false))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  // ?only=passed → the SSA-London file: passed students only, anagraphics from
  // the final exam's registration step, exam/certification dates filled.
  const onlyPassed = new URL(req.url).searchParams.get("only") === "passed";
  const ds = await getDataSource();
  const course = /^\d+$/.test(id) ? await ds.courses.getById(id) : await ds.courses.getByHandle(id);
  if (!course) return NextResponse.json({ ok: false, error: "course not found" }, { status: 404 });

  const roster = courseRosterStudents(course).students;
  // Phones live on the domain students (verified contact), keyed by email.
  const phoneByEmail = new Map(
    (course.students ?? [])
      .filter((s) => s.email)
      .map((s) => [s.email.toLowerCase(), s.phone ?? ""]),
  );
  const family = course.type === "certificato" ? "nihonshu" : course.type === "shochu" ? "shochu" : null;
  const subs = family ? await loadCourseExamResults(course.id, family) : [];
  const byEmail = new Map(subs.filter((s) => s.currentResult).map((s) => [s.studentEmail.toLowerCase(), s]));

  // Union: every enrolled student + anyone with a confirmed result not on the roster.
  const emails = new Set<string>();
  const rows: AttendanceRow[] = [];
  const push = (name: string, email: string, phone?: string) => {
    const key = email.toLowerCase();
    if (key && emails.has(key)) return;
    if (key) emails.add(key);
    const res = key ? byEmail.get(key) : undefined;
    if (onlyPassed && res?.currentResult !== "passed") return;
    const { first, last } = splitName(name);
    const reg = res?.registration ?? null;
    rows.push({
      firstName: first,
      lastName: last,
      email,
      score: res ? res.currentScore : null,
      passFail: res?.currentResult ? passFail(res.currentResult) : "",
      gender: genderMFO(reg?.gender),
      nationality: reg?.nationality ?? "",
      dob: enDob(reg?.dob),
      occupation: reg?.occupation ?? "",
      residency: reg?.residency ?? "",
      contactNumber: phone ?? phoneByEmail.get(key) ?? "",
    });
  };
  for (const s of roster) push(s.name, s.email);
  for (const s of subs) if (s.currentResult) push(s.studentName, s.studentEmail);

  // Exam day = the course's LAST day (start + days − 1); certification = same,
  // per the template ("same as Exam Date"). English-style dates as required.
  const examDay = (course.day || 1) + Math.max(0, (course.days || 1) - 1);
  const examDate = enDate(examDay, course.month, course.year);
  const buf = await buildAttendanceXlsx({
    course: course.shortTitle || "Corso SSA",
    franchise: FRANCHISE,
    educator: course.educator?.name || "",
    courseDate: enDate(course.day, course.month, course.year),
    examDate,
    certificationDate: onlyPassed ? examDate : "",
    venue: course.city || "",
    rows,
  });

  const slug = (course.shortTitle || "corso").normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${onlyPassed ? "css-attendance-promossi" : "attendance"}-${slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
