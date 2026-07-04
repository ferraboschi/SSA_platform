import { NextResponse } from "next/server";
import { hasRole } from "@/lib/auth/guard";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { correctionKey, type CorrectionDraft } from "@/lib/esami/correction-types";
import { renderCorrectionPdf } from "@/lib/esami/correction-pdf";

// Per-student DRAFT correction report (Correggi), inline so it can be previewed
// in an iframe and downloaded. Same auth posture as the sibling pdf route:
// admin/manager only.
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasRole(["admin", "manager"]).catch(() => false))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const subParam = new URL(req.url).searchParams.get("sub")?.trim() ?? "";
  if (!/^\d+$/.test(subParam)) {
    return NextResponse.json({ ok: false, error: "missing sub" }, { status: 400 });
  }
  const submissionId = Number(subParam);

  // Cheapest correct course lookup — the report only needs the numeric id (the
  // settings_kv key), the short title and the type; still accepts id OR handle
  // like the sibling pdf route (which goes through the full data source).
  const svc = getSupabaseServiceClient();
  const corsoQuery = svc.from("corsi").select("id, short_title, full_title, type");
  const { data: corsoData } = /^\d+$/.test(id)
    ? await corsoQuery.eq("id", Number(id)).maybeSingle()
    : await corsoQuery.eq("handle", id).maybeSingle();
  const corso = corsoData as
    | { id: number; short_title: string | null; full_title: string | null; type: string }
    | null;
  if (!corso) {
    return NextResponse.json({ ok: false, error: "course not found" }, { status: 404 });
  }
  const family =
    corso.type === "certificato" ? "Sake Sommelier" : corso.type === "shochu" ? "Shochu Sommelier" : null;
  if (!family) {
    return NextResponse.json({ ok: false, error: "no exam" }, { status: 404 });
  }

  // The draft persisted by the last Correggi run (exam-correction:<corso>:<sub>).
  const { data: kv } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", correctionKey(corso.id, submissionId))
    .maybeSingle();
  const draft = ((kv as { value: unknown } | null)?.value ?? null) as CorrectionDraft | null;
  if (!draft) {
    return new NextResponse("Bozza non trovata: esegui prima Correggi.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Submission timestamp — course-scoped so a foreign sub id can't pull another
  // course's row; the run timestamp is the graceful fallback.
  const { data: subRow } = await svc
    .from("exam_submissions")
    .select("created_at")
    .eq("id", submissionId)
    .eq("corso_id", corso.id)
    .maybeSingle();
  const submittedAt = (subRow as { created_at: string } | null)?.created_at ?? draft.at;

  const buf = await renderCorrectionPdf({
    draft,
    courseName: corso.short_title || corso.full_title || "Corso",
    family,
    submittedAt,
  });

  const slug = draft.studentName.normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bozza-${slug || "esame"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
