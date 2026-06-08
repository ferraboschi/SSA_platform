import "server-only";

// Aligns educator activation with the public "Chi siamo" page (the source of
// truth for who's an active educator). Educators no longer on the page are set
// active=false — they vanish from the educator list/assignment but their row +
// course history are preserved (never deleted).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

const PAGE = "https://www.sakesommelierassociation.it/pages/chi-siamo";
// Phrases that look like names but aren't (roles / org labels).
const NOISE = /(association|sommelier|educator|head|team|staff|italiana|italia)/i;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchActiveNames(): Promise<string[]> {
  const res = await fetch(PAGE, {
    headers: { "User-Agent": "Mozilla/5.0 (SSA-Platform educator-sync)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`chi-siamo fetch ${res.status}`);
  const html = await res.text();
  const clean = (s: string) =>
    s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").trim();
  const out = new Set<string>();
  const nameRe = /^[A-ZÀ-Ý][\wÀ-ÿ'.]+(?: [A-ZÀ-Ý][\wÀ-ÿ'.]+){1,3}$/;

  const blockRe = /<(h[1-5]|strong|figcaption|p)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const t = clean(m[2]);
    if (nameRe.test(t) && !NOISE.test(t)) out.add(t);
  }
  const altRe = /alt="([^"]{4,40})"/gi;
  while ((m = altRe.exec(html))) {
    const t = m[1].trim();
    if (nameRe.test(t) && !NOISE.test(t)) out.add(t);
  }
  return [...out];
}

export interface EducatorActivationResult {
  ok: boolean;
  deactivated: string[];
  reactivated: string[];
  activeOnPage: number;
  reason?: string;
}

export async function syncEducatorActivation(): Promise<EducatorActivationResult> {
  let names: string[];
  try {
    names = await fetchActiveNames();
  } catch (e) {
    return { ok: false, deactivated: [], reactivated: [], activeOnPage: 0, reason: e instanceof Error ? e.message : String(e) };
  }
  // SAFETY GUARD: a parsing failure must never mass-deactivate everyone.
  if (names.length < 8) {
    return { ok: false, deactivated: [], reactivated: [], activeOnPage: names.length, reason: "too few names parsed" };
  }
  const onPage = new Set(names.map(norm));

  const svc = getSupabaseServiceClient();
  const { data, error } = await svc.from("educators").select("id, full_name, active");
  if (error) return { ok: false, deactivated: [], reactivated: [], activeOnPage: onPage.size, reason: error.message };
  const rows = (data ?? []) as { id: number; full_name: string; active: boolean }[];

  const deactivated: string[] = [];
  const reactivated: string[] = [];
  for (const r of rows) {
    const present = onPage.has(norm(r.full_name));
    if (!present && r.active) {
      await svc.from("educators").update({ active: false }).eq("id", r.id);
      deactivated.push(r.full_name);
    } else if (present && !r.active) {
      await svc.from("educators").update({ active: true }).eq("id", r.id);
      reactivated.push(r.full_name);
    }
  }
  return { ok: true, deactivated, reactivated, activeOnPage: onPage.size };
}
