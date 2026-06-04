import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/integrations/config";
import { getProductCosts } from "@/lib/integrations/airtable/prices";
import { getSakeCatalog } from "@/lib/integrations/sakecompany/catalog";
import { ensureRagWired, ragGroundingStatus } from "@/lib/rag";
import { getVectorStore } from "@/lib/rag/store";

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

  return NextResponse.json({
    ok: true,
    ...getConnectionStatus(),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    googleMaps: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    resend: Boolean(process.env.RESEND_API_KEY),
    airtablePricesBaseEnv: Boolean(process.env.AIRTABLE_PRICES_BASE_ID),
    sake: { priceCodes, catalogTotal, catalogWithCost },
    rag: { ...ragGroundingStatus(), chunkCount: ragChunkCount },
  });
}
