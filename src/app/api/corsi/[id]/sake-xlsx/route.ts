import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { loadCourseProgram } from "@/lib/corsi/program-load";
import { buildSakeXlsx, type SakeXlsxDay } from "@/lib/esami/sake-xlsx";

// Per-course "Sake" workbook (.xlsx) — a flat, searchable table of every sake
// across every day. Admin/manager only. If the day's programme/template has not
// been assigned (no sakes anywhere), we refuse (409) rather than hand back an
// empty file, so the UI can prompt the operator to assign the template first.
export const dynamic = "force-dynamic";

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

  // The operator's saved OVERLAY (settings_kv) is authoritative when present —
  // same source the course page and educator share-link use — falling back to
  // the base program only when no overlay days exist.
  const overlay = (await loadCourseProgram()).get(String(course.id));
  const days: SakeXlsxDay[] =
    overlay?.days?.length
      ? overlay.days
          .slice()
          .sort((a, b) => a.day - b.day)
          .map((d) => ({
            day: d.day,
            sakes: d.sakes.map((s) => ({ name: s.name, qty: s.qty, code: s.code })),
          }))
      : course.program.map((d) => ({
          day: d.day,
          sakes: d.sakes.map((s) => ({ name: s.name, qty: s.qty, code: s.code })),
        }));

  // Guard: no programme/template assigned → no sakes → don't download.
  if (days.every((d) => (d.sakes?.length ?? 0) === 0)) {
    return NextResponse.json({ ok: false, error: "no-template" }, { status: 409 });
  }

  const buf = await buildSakeXlsx(days);
  const slug = (course.shortTitle || "corso").normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sake-${slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
