import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/integrations/config";
import { getProductCosts } from "@/lib/integrations/airtable/prices";
import { getSakeCatalog } from "@/lib/integrations/sakecompany/catalog";
import { ensureRagWired, ragGroundingStatus } from "@/lib/rag";
import { getVectorStore } from "@/lib/rag/store";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

// Public, secret-free health check: reports which integrations have credentials
// configured (booleans only — never the values). Useful to verify env wiring.
export const dynamic = "force-dynamic";

export async function GET() {
  // Sake cost/type merge diagnostic: confirms the Airtable "Master product list"
  // base is reachable and how many catalog items actually carry a cost (the cause
  // of empty cost/class in the template editor was an unreachable prices base).
  let priceCodes = 0;
  let catalogTotal = 0;
  let catalogWithCost = 0;
  try {
    const costs = await getProductCosts();
    priceCodes = costs.size;
    const cat = await getSakeCatalog();
    catalogTotal = cat.length;
    catalogWithCost = cat.filter((i) => typeof i.cost === "number").length;
  } catch {
    /* diagnostic best-effort */
  }

  // RAG grounding diagnostic: confirms the knowledge-base corpus is reachable so
  // open-answer grading is grounded (not hallucinated). chunkCount > 0 means the
  // persistent pgvector corpus is wired and queryable.
  let ragChunkCount = 0;
  try {
    ensureRagWired();
    ragChunkCount = await getVectorStore().count();
  } catch {
    /* diagnostic best-effort */
  }

  // Personal-exam-links migration diagnostic: confirms the exam_student_links
  // table + exam_submissions.corsista_id column exist (so links persist and
  // submissions tie back to the student). studentLinksRows = stored link count.
  let studentLinksTable = false;
  let studentLinksRows = 0;
  let submissionsCorsistaCol = false;
  try {
    const svc = getSupabaseServiceClient();
    const r1 = await svc.from("exam_student_links").select("id", { count: "exact", head: true });
    studentLinksTable = !r1.error;
    studentLinksRows = r1.count ?? 0;
    const r2 = await svc.from("exam_submissions").select("corsista_id", { head: true }).limit(1);
    submissionsCorsistaCol = !r2.error;
  } catch {
    /* diagnostic best-effort */
  }

  // Exam question-count diagnostic per family: how many exam_templates rows
  // exist, and for the latest row the final/day/feedback counts + duplicate-id
  // detection (a duplicated question bank shows up here).
  async function examCounts(family: "shochu" | "certificato") {
    try {
      const svc = getSupabaseServiceClient();
      const { data } = await svc
        .from("exam_templates")
        .select("id, data")
        .eq("family", family)
        .order("id", { ascending: false });
      const rows = (data ?? []) as Array<{ id: number; data: Record<string, unknown> }>;
      const latest = rows[0]?.data ?? {};
      const finalQs = (latest.questions as unknown[] | undefined) ?? [];
      const mini = (latest.miniTests as Array<{ day?: number; questions?: unknown[] }> | undefined) ?? [];
      const fb = ((latest.feedback as { questions?: unknown[] } | undefined)?.questions) ?? [];
      const ids = finalQs.map((q) => (q as { id?: string }).id).filter(Boolean) as string[];
      const dupFinal = ids.length - new Set(ids).size;
      // Duplicate-text detection (re-import with regenerated ids duplicates text,
      // not ids). Normalize + count uniques; surface a few repeated texts.
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const texts = finalQs.map((q) => norm(String((q as { text?: string }).text ?? "")));
      const seen = new Map<string, number>();
      for (const t of texts) seen.set(t, (seen.get(t) ?? 0) + 1);
      const repeated = [...seen.entries()].filter(([, n]) => n > 1);
      return {
        rows: rows.length,
        final: finalQs.length,
        finalUniqueTexts: seen.size,
        finalDuplicateIds: dupFinal,
        finalTextsRepeatedMax: repeated.reduce((m, [, n]) => Math.max(m, n), 1),
        sampleRepeated: repeated.slice(0, 3).map(([t, n]) => `${n}× ${t.slice(0, 50)}`),
        days: mini.map((m) => ({ day: m.day, q: (m.questions ?? []).length })),
        feedback: fb.length,
      };
    } catch {
      return { rows: -1 };
    }
  }
  const shochuExam = await examCounts("shochu");
  const certExam = await examCounts("certificato");

  return NextResponse.json({
    ok: true,
    ...getConnectionStatus(),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    googleMaps: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    resend: Boolean(process.env.RESEND_API_KEY),
    // Token-signing secrets (presence only — never the value). Exam/share links
    // are HMAC-signed with EXAM_LINK_SECRET, falling back to SYNC_SECRET; if BOTH
    // are false the code uses an insecure dev constant and links are forgeable.
    examLinkSecret: Boolean(process.env.EXAM_LINK_SECRET),
    syncSecret: Boolean(process.env.SYNC_SECRET),
    airtablePricesBaseEnv: Boolean(process.env.AIRTABLE_PRICES_BASE_ID),
    sake: { priceCodes, catalogTotal, catalogWithCost },
    rag: { ...ragGroundingStatus(), chunkCount: ragChunkCount },
    examLinks: { studentLinksTable, studentLinksRows, submissionsCorsistaCol },
    exam: { shochu: shochuExam, certificato: certExam },
  });
}
