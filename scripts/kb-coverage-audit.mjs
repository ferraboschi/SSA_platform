// READ-ONLY probe: KB coverage audit per exam question (Indagine 4).
// Replicates the grader retrieval EXACTLY (src/lib/rag/grading.ts + pipeline.ts +
// supabase-store.ts): query = question text, k = 4, family_filter = question cat
// with unfiltered fallback when the section returns 0 rows, MIN_RELEVANCE = 0.2.
// No writes. No secrets logged.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire("/Users/ferraboschi/Documents/sakeplatform/package.json");
const { createClient } = require("@supabase/supabase-js");

// Parse .env.local (KEY=VALUE lines) without printing anything.
const env = {};
for (const line of readFileSync("/Users/ferraboschi/Documents/sakeplatform/.env.local", "utf8").split("\n")) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

if (!env.EMBEDDINGS_API_KEY) {
  console.log("EMBEDDINGS_API_KEY assente in .env.local — impossibile replicare la retrieval live.");
  process.exit(2);
}
const EMB_MODEL = env.EMBEDDINGS_MODEL || "text-embedding-3-small";
console.log(`embeddings model: ${EMB_MODEL} (stesso provider del grader)`);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── 1. Load the latest certificato template (same pick as getByFamily: max id) ──
const { data: rows, error } = await sb
  .from("exam_templates")
  .select("id, family, name, data")
  .eq("family", "certificato")
  .order("id", { ascending: false })
  .limit(1);
if (error || !rows?.length) { console.error("ERR template:", error?.message ?? "none"); process.exit(1); }
const tpl = rows[0];
const d = tpl.data ?? {};

// Collect OPEN/FILL questions from miniTests (day1..N) + final exam.
const open = [];
for (const mt of d.miniTests ?? []) {
  for (const q of mt.questions ?? []) {
    if (q.type === "open" || q.type === "fill")
      open.push({ test: `day${mt.day}`, id: q.id, cat: q.cat ?? null, type: q.type, text: q.text ?? "" });
  }
}
for (const q of d.questions ?? []) {
  if (q.type === "open" || q.type === "fill")
    open.push({ test: "final", id: q.id, cat: q.cat ?? null, type: q.type, text: q.text ?? "" });
}
const totalQ =
  (d.questions?.length ?? 0) +
  (d.miniTests ?? []).reduce((a, m) => a + (m.questions?.length ?? 0), 0);
console.log(`template id=${tpl.id} "${tpl.name}" — domande totali=${totalQ}, aperte(open/fill)=${open.length}`);
const byTest = {};
for (const q of open) byTest[q.test] = (byTest[q.test] ?? 0) + 1;
console.log("aperte per test:", JSON.stringify(byTest));

// ── 2. Corpus sanity: chunk count + family tag distribution ──
const { count: chunkCount } = await sb.from("rag_chunks").select("id", { count: "exact", head: true });
const { data: docs } = await sb.from("rag_documents").select("id, title, family");
const famDist = {};
for (const doc of docs ?? []) famDist[doc.family ?? "null"] = (famDist[doc.family ?? "null"] ?? 0) + 1;
console.log(`corpus: ${chunkCount} chunk, ${docs?.length ?? 0} documenti; family dei documenti:`, JSON.stringify(famDist));

// ── 3. Embed all questions in batch (same endpoint/model as the grader) ──
async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await fetch(env.OPENAI_API_URL || "https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.EMBEDDINGS_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMB_MODEL, input: texts.slice(i, i + 100) }),
    });
    if (!res.ok) throw new Error(`embeddings failed (${res.status})`);
    const data = await res.json();
    out.push(...data.data.map((x) => x.embedding));
  }
  return out;
}

const queries = open.map((q) => q.text); // correction-run passes NO rubricKey → query = question text
const vecs = await embed(queries);

// ── 4. Per-question retrieval, replica of grading.ts (k=4, section→fallback, 0.2) ──
const MIN_RELEVANCE = 0.2;
async function match(vec, family) {
  const { data, error } = await sb.rpc("match_rag_chunks", {
    query_embedding: vec,
    match_count: 4,
    family_filter: family ?? null,
  });
  if (error) { console.error("RPC ERR:", error.message); return []; }
  return Array.isArray(data) ? data : [];
}

const results = [];
for (let i = 0; i < open.length; i++) {
  const q = open[i];
  let rowsM = await match(vecs[i], q.cat);
  let sectionApplied = Boolean(q.cat);
  if (rowsM.length === 0 && q.cat) { rowsM = await match(vecs[i], null); sectionApplied = false; }
  const relevant = rowsM.filter((r) => r.similarity >= MIN_RELEVANCE);
  const maxScore = rowsM.length ? Math.max(...rowsM.map((r) => r.similarity)) : 0;
  const verdict =
    relevant.length === 0 ? "ASSENTE" :
    (maxScore < 0.35 || relevant.length < 2) ? "DEBOLE" : "ok";
  results.push({
    test: q.test, cat: q.cat, type: q.type,
    text: q.text.replace(/\s+/g, " ").slice(0, 80),
    nRel: relevant.length, maxScore: Math.round(maxScore * 1000) / 1000,
    sectionApplied, verdict,
    topDoc: relevant.length ? (docs?.find((x) => x.id === rowsM[0].document_id)?.title ?? "?") : "",
  });
}

// ── 5. Table ──
console.log("\nVERDETTO per domanda (soglia grader 0.2; ok = maxScore>=0.35 e >=2 chunk; DEBOLE = 1 chunk o maxScore<0.35; ASSENTE = 0 chunk => il grader RIFIUTA):");
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(pad("test", 6), pad("cat", 13), pad("tipo", 5), pad("domanda", 80), pad("nRel", 5), pad("max", 6), pad("sez", 4), "verdetto");
for (const r of results) {
  console.log(pad(r.test, 6), pad(r.cat ?? "-", 13), pad(r.type, 5), pad(r.text, 80), pad(r.nRel, 5), pad(r.maxScore, 6), pad(r.sectionApplied ? "sì" : "no", 4), r.verdict, r.verdict !== "ok" ? `[top: ${r.topDoc}]` : "");
}

// Summary
const summary = { ok: 0, DEBOLE: 0, ASSENTE: 0 };
for (const r of results) summary[r.verdict]++;
console.log("\nRIEPILOGO:", JSON.stringify(summary), "su", results.length, "domande aperte");
const gaps = results.filter((r) => r.verdict !== "ok");
if (gaps.length) {
  console.log("\nBUCHI (DEBOLE/ASSENTE):");
  for (const r of gaps) console.log(`- [${r.verdict}] (${r.test}/${r.cat}) max=${r.maxScore} nRel=${r.nRel} — ${r.text}`);
}

// ── 6. Pastorizzazione explicit check ──
console.log("\n— PASTORIZZAZIONE —");
const pastQ = results.filter((r) => /pastorizz|hi-?ire|hiire/i.test(r.text));
console.log(`domande aperte che citano pastorizzazione/hi-ire: ${pastQ.length}`);
for (const r of pastQ) console.log(`  [${r.verdict}] max=${r.maxScore} nRel=${r.nRel} — ${r.text}`);
// Textual presence in the corpus (read-only ilike).
for (const term of ["%pastorizz%", "%hi-ire%", "%hiire%"]) {
  const { count } = await sb.from("rag_chunks").select("id", { count: "exact", head: true }).ilike("content", term);
  console.log(`chunk con content ILIKE '${term}': ${count}`);
}
// Semantic probe with a canonical pastorizzazione query.
const [pv] = await embed(["Che cos'è la pastorizzazione del sake (hi-ire), quante volte e perché viene effettuata?"]);
const pm = await match(pv, null);
console.log("probe semantico 'pastorizzazione del sake':", pm.map((r) => `${Math.round(r.similarity * 1000) / 1000} doc#${r.document_id} ${(docs?.find((x) => x.id === r.document_id)?.title ?? "?").slice(0, 50)}`).join(" | "));
