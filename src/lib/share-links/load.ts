// Service-role loader for the PUBLIC "share with educator" page. Server-only.
//
// The share link is reachable without a login, so the cookie-bound (anon) client
// is blocked by RLS. We use the service client to read what the educator needs to
// prepare the course: header, the per-day PROGRAMME (days + sakes + cost + image),
// the enrolled roster (name/email/phone), and the roll-call day count. Read-only.
// The link carries the roster, so it is short-lived (SHARE_LINK_TTL_HOURS) and must
// only be shared with the course's educator.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { COURSE_TYPES, EXAM_COURSE_TYPES } from "@/lib/domain";
import type { CourseTypeKey } from "@/lib/domain";
import { loadCourseProgram } from "@/lib/corsi/program-load";
import { getSakeCatalog } from "@/lib/integrations/sakecompany/catalog";

export interface SharedSake {
  code: string;
  name: string;
  type: string;
  sakagura: string;
  size: number;
  /** € per bottle. */
  cost: number;
  qty: number;
  /** Sake Company product image + storefront URL, resolved by SKU (nullable). */
  image: string | null;
  url: string | null;
}
export interface SharedDay {
  day: number;
  name: string;
  sakes: SharedSake[];
}
export interface SharedStudent {
  id: number;
  name: string;
  email: string;
  phone: string;
}
export interface SharedCourse {
  courseName: string;
  typeLabel: string;
  place: string;
  date: string;
  educator: string;
  hasExam: boolean;
  /** Roll-call days: Certificato = 3, everything else = 1. */
  dayCount: number;
  /** Distinct sakes across all days. */
  totalSakes: number;
  /** Σ cost × qty across all days (€). */
  totalSakeCost: number;
  days: SharedDay[];
  students: SharedStudent[];
}

export async function loadSharedCourse(
  courseId: string,
): Promise<SharedCourse | null> {
  const sb = getSupabaseServiceClient();

  const { data: corso } = await sb
    .from("corsi")
    .select("id, short_title, full_title, type, city, delivery_mode, month, year, educator_id")
    .eq("id", Number(courseId))
    .maybeSingle();
  if (!corso) return null;

  let educator = "";
  if (corso.educator_id) {
    const { data: edu } = await sb
      .from("educators")
      .select("full_name")
      .eq("id", corso.educator_id)
      .maybeSingle();
    educator = edu?.full_name ?? "";
  }

  // Sake image + storefront URL, resolved by SKU from the (cached) SC catalog.
  const catalog = await getSakeCatalog().catch(() => []);
  const catBySku = new Map(catalog.filter((c) => c.sku).map((c) => [c.sku as string, c]));
  const enrich = (code: string): { image: string | null; url: string | null } => {
    const it = code ? catBySku.get(code) : undefined;
    return { image: it?.image ?? null, url: it?.url ?? null };
  };

  // The operator's "Programma & Economia" edits persist to a settings_kv OVERLAY
  // (course_program), NOT to corsi_giorni/corsi_sake. The overlay is authoritative
  // when present — exactly as the internal course page treats it — so the educator
  // link must read it too (base tables are effectively vestigial for UI-set courses).
  const overlay = (await loadCourseProgram()).get(String(corso.id));
  let days: SharedDay[];
  if (overlay?.days?.length) {
    days = overlay.days
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((d) => ({
        day: d.day,
        name: d.name,
        sakes: d.sakes.map((s) => ({
          code: s.code ?? "",
          name: s.name,
          type: s.type ?? "",
          sakagura: s.sakagura ?? "",
          size: s.size ?? 0,
          cost: s.cost ?? 0, // overlay cost is already in €
          qty: s.qty ?? 0,
          ...enrich(s.code ?? ""),
        })),
      }));
  } else {
    // Fallback: the base tables (rarely populated — external sync only).
    const { data: giorni } = await sb
      .from("corsi_giorni")
      .select("day_no,name,sakes:corsi_sake(code,name,type,sakagura,size_ml,position)")
      .eq("corso_id", corso.id)
      .order("day_no");
    type GiornoJoin = {
      day_no: number;
      name: string;
      sakes?: Array<{
        code: string | null;
        name: string;
        type: string | null;
        sakagura: string | null;
        size_ml: number | null;
        position: number;
      }>;
    };
    days = ((giorni ?? []) as GiornoJoin[]).map((g) => ({
      day: g.day_no,
      name: g.name,
      sakes: (g.sakes ?? [])
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          code: s.code ?? "",
          name: s.name,
          type: s.type ?? "",
          sakagura: s.sakagura ?? "",
          size: s.size_ml ?? 0,
          cost: 0,
          qty: 1,
          ...enrich(s.code ?? ""),
        })),
    }));
  }

  // Enrolled students (id, name, email, phone) — the roster the educator needs
  // (the id drives the roll-call/attendance writes).
  const { data: iscr } = await sb
    .from("corsi_iscrizioni")
    .select("corsista:corsisti(id,full_name,email,phone)")
    .eq("corso_id", corso.id);
  type IscrJoin = {
    corsista: { id: number; full_name: string | null; email: string | null; phone: string | null } | null;
  };
  const seen = new Set<string>();
  const students: SharedStudent[] = [];
  for (const r of (iscr ?? []) as unknown as IscrJoin[]) {
    const c = r.corsista;
    if (!c) continue;
    const key = (c.email || c.full_name || "").trim().toLowerCase();
    // No identifying field → unusable roster row, skip it (an empty key never
    // dedups, so blank indistinguishable students would pile up).
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    students.push({
      id: c.id,
      name: c.full_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
    });
  }
  students.sort((a, b) => a.name.localeCompare(b.name));

  const type = corso.type as CourseTypeKey;
  const totalSakes = days.reduce((n, d) => n + d.sakes.length, 0);
  const totalSakeCost = days.reduce(
    (n, d) => n + d.sakes.reduce((m, s) => m + (s.cost || 0) * (s.qty || 0), 0),
    0,
  );

  return {
    courseName: corso.short_title || corso.full_title || "Corso SSA",
    typeLabel: COURSE_TYPES[type]?.label ?? "",
    place: corso.delivery_mode === "online" ? "Online" : corso.city || "",
    date: `${corso.month ?? ""} ${corso.year ?? ""}`.trim(),
    educator,
    hasExam: EXAM_COURSE_TYPES.includes(type),
    dayCount: type === "certificato" ? 3 : 1,
    totalSakes,
    totalSakeCost,
    days,
    students,
  };
}
