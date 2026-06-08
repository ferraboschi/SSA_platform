import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { courseRosterStudents } from "@/lib/esami";
import { loadCourseExamResults } from "@/lib/exam-links/results";
import { buildAttendanceXlsx, type AttendanceRow } from "@/lib/esami/attendance-xlsx";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasRole(["admin", "manager"]).catch(() => false))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ds = await getDataSource();
  const course = /^\d+$/.test(id) ? await ds.courses.getById(id) : await ds.courses.getByHandle(id);
  if (!course) return NextResponse.json({ ok: false, error: "course not found" }, { status: 404 });

  const roster = courseRosterStudents(course).students;
  const family = course.type === "certificato" ? "nihonshu" : course.type === "shochu" ? "shochu" : null;
  const subs = family ? await loadCourseExamResults(course.id, family) : [];
  const byEmail = new Map(subs.filter((s) => s.currentResult).map((s) => [s.studentEmail.toLowerCase(), s]));

  // Union: every enrolled student + anyone with a confirmed result not on the roster.
  const emails = new Set<string>();
  const rows: AttendanceRow[] = [];
  const push = (name: string, email: string) => {
    const key = email.toLowerCase();
    if (key && emails.has(key)) return;
    if (key) emails.add(key);
    const { first, last } = splitName(name);
    const res = key ? byEmail.get(key) : undefined;
    rows.push({
      firstName: first,
      lastName: last,
      email,
      score: res ? res.currentScore ?? res.autoScore : null,
      passFail: res?.currentResult ? passFail(res.currentResult) : "",
    });
  };
  for (const s of roster) push(s.name, s.email);
  for (const s of subs) if (s.currentResult) push(s.studentName, s.studentEmail);

  const buf = await buildAttendanceXlsx({
    course: course.shortTitle || "Corso SSA",
    franchise: FRANCHISE,
    educator: course.educator?.name || "",
    courseDate: `${course.day} ${course.month} ${course.year}`,
    examDate: "",
    venue: course.city || "",
    rows,
  });

  const slug = (course.shortTitle || "corso").normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-${slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
