// Service-role loader for the PUBLIC "share with educator" page. Server-only.
//
// The share link is reachable without a login, so the cookie-bound (anon)
// client is blocked by RLS. We use the service client to read just what the
// educator needs to prepare the course: header, program (days + sakes), a
// materials summary AND the enrolled roster (name, email, phone — requested by
// the operator). Read-only, no costs, no edit controls. The link carries the
// student roster, so it is short-lived (see SHARE_LINK_TTL_HOURS) and must only
// be shared with the course's educator.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { COURSE_TYPES, EXAM_COURSE_TYPES } from "@/lib/domain";
import type { CourseTypeKey } from "@/lib/domain";

export interface SharedSake {
  code: string;
  name: string;
  type: string;
  sakagura: string;
  size: number;
}
export interface SharedDay {
  day: number;
  name: string;
  sakes: SharedSake[];
}
export interface SharedStudent {
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
  totalSakes: number;
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

  const days: SharedDay[] = ((giorni ?? []) as GiornoJoin[]).map((g) => ({
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
      })),
  }));

  // Enrolled students (name, email, phone) — the roster the educator needs.
  const { data: iscr } = await sb
    .from("corsi_iscrizioni")
    .select("corsista:corsisti(full_name,email,phone)")
    .eq("corso_id", corso.id);
  type IscrJoin = { corsista: { full_name: string | null; email: string | null; phone: string | null } | null };
  const seen = new Set<string>();
  const students: SharedStudent[] = [];
  for (const r of (iscr ?? []) as unknown as IscrJoin[]) {
    const c = r.corsista;
    if (!c) continue;
    const key = (c.email || c.full_name || "").toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    students.push({
      name: c.full_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
    });
  }
  students.sort((a, b) => a.name.localeCompare(b.name));

  const type = corso.type as CourseTypeKey;
  const totalSakes = days.reduce((n, d) => n + d.sakes.length, 0);

  return {
    courseName: corso.short_title || corso.full_title || "Corso SSA",
    typeLabel: COURSE_TYPES[type]?.label ?? "",
    place: corso.delivery_mode === "online" ? "Online" : corso.city || "",
    date: `${corso.month ?? ""} ${corso.year ?? ""}`.trim(),
    educator,
    hasExam: EXAM_COURSE_TYPES.includes(type),
    totalSakes,
    days,
    students,
  };
}
