import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/integrations/config";
import { getProductCosts } from "@/lib/integrations/airtable/prices";
import { getSakeCatalog } from "@/lib/integrations/sakecompany/catalog";
import { ensureRagWired, ragGroundingStatus } from "@/lib/rag";
import { getVectorStore } from "@/lib/rag/store";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { loadCourseProgram } from "@/lib/corsi/program-load";
import { getGrantedScopes } from "@/lib/integrations/shopify/admin-client";
import { hasRole } from "@/lib/auth/guard";

// Liveness + admin-only diagnostics. Anonymous callers get a trivial `{ ok: true }`
// so the endpoint stays usable as a public health probe; the detailed wiring/data
// diagnostics (integration status, data counts, migration state, exam-question
// samples) are gated behind the admin role and never exposed anonymously.
export const dynamic = "force-dynamic";

export async function GET() {
  // Trivial, always-public liveness. Detailed diagnostics require admin: anything
  // below this point can leak integration wiring, data counts and exam-question
  // text, so a non-admin (or unauthenticated) caller gets only `{ ok: true }`.
  const isAdmin = await hasRole(["admin"]).catch(() => false);
  if (!isAdmin) return NextResponse.json({ ok: true });

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

  // Live-exam-progress migration diagnostic (20260703120000 + 20260703130000):
  // confirms the exam_progress table exists AND carries the answers column —
  // i.e. both migrations are applied, so the educator's live progress bar and
  // per-answer counts work (not silently degraded).
  let examProgressTable = false;
  let progressAnswersCol = false;
  try {
    const svc = getSupabaseServiceClient();
    const r1 = await svc.from("exam_progress").select("id", { head: true }).limit(1);
    examProgressTable = !r1.error;
    const r2 = await svc.from("exam_progress").select("answers", { head: true }).limit(1);
    progressAnswersCol = !r2.error;
  } catch {
    /* diagnostic best-effort */
  }

  // Sidebar/catalog course-dot diagnostic: among PUBLISHED courses, how many are
  // missing an educator / city / date, and how many have no sake program. This is
  // exactly what drives the two status dots — confirms whether "all grey" is real
  // (no programs yet, logistics complete) or a detection bug.
  const courseStatus = { published: 0, noEducator: 0, noCity: 0, noDate: 0, noProgram: 0 };
  try {
    const svc = getSupabaseServiceClient();
    // Genuinely upcoming only: published AND starting today or later, so the
    // diagnostic doesn't count stale past rows still flagged "pubblicato".
    const today = new Date().toISOString().slice(0, 10);
    const { data: cs } = await svc
      .from("corsi")
      .select("id, city, month, year, start_date, educator_id")
      .eq("lifecycle", "pubblicato")
      .gte("start_date", today)
      .limit(2000);
    const program = await loadCourseProgram();
    const hasProg = (id: number) =>
      !!program.get(String(id))?.days?.some((d) => (d.sakes?.length ?? 0) > 0);
    for (const c of (cs ?? []) as Array<{
      id: number; city: string | null; month: string | null; year: number | null;
      start_date: string | null; educator_id: number | null;
    }>) {
      courseStatus.published++;
      if (!c.educator_id) courseStatus.noEducator++;
      if (!c.city || !c.city.trim()) courseStatus.noCity++;
      if (!c.year || !c.month || !c.month.trim() || !c.start_date) courseStatus.noDate++;
      if (!hasProg(c.id)) courseStatus.noProgram++;
    }
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

  // Shopify discount-write capability: can the SSA admin token CREATE+SAVE
  // discount codes (needed to auto-issue credit redemption codes to Shopify)?
  // Reads the granted scopes (no side effects). canWriteDiscounts=false means the
  // custom app needs `write_discounts` added + reinstall before auto-create works.
  let shopifyScopes: string[] = [];
  let canWriteDiscounts = false;
  let scopesError: string | null = null;
  try {
    shopifyScopes = await getGrantedScopes();
    canWriteDiscounts = shopifyScopes.includes("write_discounts");
  } catch (e) {
    scopesError = e instanceof Error ? e.message : "unknown";
  }

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
    examProgress: { table: examProgressTable, answersCol: progressAnswersCol },
    courseStatus,
    exam: { shochu: shochuExam, certificato: certExam },
    shopifyDiscounts: { canWriteDiscounts, scopes: shopifyScopes, error: scopesError },
  });
}
