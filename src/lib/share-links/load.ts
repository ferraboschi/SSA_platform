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
import { appConfig } from "@/lib/integrations/config";
import {
  signExamToken,
  EXAM_LINK_TTL_HOURS,
  type ExamTestKey,
} from "@/lib/exam-links/token";
import { getCourseClosures } from "@/lib/exam-links/lifecycle";
import { loadTemplateTests } from "@/lib/exam-links/template-tests";

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
  /** Aroma hook + narrative commentary from the Sake Company product page,
   *  resolved by SKU (nullable — same source as image/url). */
  aroma: string | null;
  notes: string | null;
  region: string | null;
  /** Alcohol by volume, as the store's own label (e.g. "15.5%"). */
  abv: string | null;
  /** Suggested food pairing, comma-joined when the source lists several. */
  pairing: string | null;
}
export interface SharedDay {
  day: number;
  name: string;
  sakes: SharedSake[];
}
export interface SharedStudent {
  /** For a corsista: the corsista id. For a companion: the corsi_partecipanti id. */
  id: number;
  /** Distinguishes an enrolled corsista from an added companion ("doppio"). */
  kind: "corsista" | "partecipante";
  name: string;
  /** Best email: the confirmed-during-course snapshot if set, else the Shopify
   *  email (corsista) / empty (companion). This is what the exam gate matches. */
  email: string;
  /** Whether the attendee confirmed their email at course start (green tick). */
  emailConfirmed: boolean;
  /** Whether a confirmation link was already SENT. False pre-migration. */
  confirmSent: boolean;
  /** Server-truth timestamps for the state chips (null pre-migration). */
  confirmSentAt: string | null;
  emailConfirmedAt: string | null;
  phone: string;
  /** Corsista rows only: the enrollment id (drives the public companion-add). */
  iscrizioneId?: number;
  /** Corsista rows only: seats bought on this order (>=2 ⇒ a "doppio"). */
  tickets?: number;
  /** Corsista rows only: how many companion slots are already filled. */
  companionsUsed?: number;
  /** Companion rows only: a label like "(ospite di <buyer>)". */
  guestOf?: string;
}
export interface SharedExamTest {
  /** "day1" … "dayN", "feedback" or "final". */
  key: string;
  /** Human label ("Test giorno 1" / "Esame finale"). */
  label: string;
  /** The official final exam vs a day mini-test. */
  isFinal: boolean;
  /** Whether the template has questions for this test. Unconfigured tests are
   *  shown as structure ("da configurare") and cannot be sent. */
  configured: boolean;
  /** Ready-to-share student class link (/esame/<signed token>); "" when the
   *  test is not configured. */
  url: string;
  /** Lifecycle: ISO timestamp if the educator closed this test, else null. */
  closedAt: string | null;
}
export interface SharedCourse {
  courseName: string;
  typeLabel: string;
  place: string;
  date: string;
  educator: string;
  hasExam: boolean;
  /**
   * Configured exam tests with their student class links, in run order
   * (day-tests that actually have questions, then the final exam). `null` for
   * non-exam course types (introduttivo/masterclass/…). Present so the educator
   * page can hand each test's link to the class (e.g. paste into WhatsApp).
   */
  exam: SharedExamTest[] | null;
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
  const enrich = (
    code: string,
  ): {
    image: string | null;
    url: string | null;
    aroma: string | null;
    notes: string | null;
    region: string | null;
    abv: string | null;
    pairing: string | null;
  } => {
    const it = code ? catBySku.get(code) : undefined;
    return {
      image: it?.image ?? null,
      url: it?.url ?? null,
      aroma: it?.aroma ?? null,
      notes: it?.notes ?? null,
      region: it?.region ?? null,
      abv: it?.abv ?? null,
      pairing: it?.pairing ?? null,
    };
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

  // Enrolled students — the roster the educator needs. We carry the enrollment
  // id (drives the public companion-add) and the corsista id (drives roll-call
  // writes). Companions are appended below as their own rows.
  const { data: iscr } = await sb
    .from("corsi_iscrizioni")
    .select("id, corsista:corsisti(id,full_name,email,phone)")
    .eq("corso_id", corso.id);
  type IscrJoin = {
    id: number;
    corsista: { id: number; full_name: string | null; email: string | null; phone: string | null } | null;
  };
  const iscrRows = (iscr ?? []) as unknown as IscrJoin[];

  // Tickets per person ("doppio"): SUM purchases.quantity matched on the course
  // title (a single order line for two people is one row with quantity 2) —
  // mirroring the internal roster (aggregations.ts countTicketsByCorsista).
  const ticketCount = new Map<number, number>();
  const { data: pur } = await sb
    .from("purchases")
    .select("corsista_id,quantity")
    .eq("cluster", "corso")
    .eq("product_title", corso.full_title ?? "");
  for (const p of (pur ?? []) as { corsista_id: number; quantity?: number | null }[]) {
    const qty = Number.isFinite(Number(p.quantity)) && Number(p.quantity) > 0 ? Math.trunc(Number(p.quantity)) : 1;
    ticketCount.set(p.corsista_id, (ticketCount.get(p.corsista_id) ?? 0) + qty);
  }

  // Staff seat-count overrides (corsi_iscrizioni.seats_override) keyed by
  // enrollment id — separate query, graceful pre-migration. When set it wins
  // over the inferred count, so the appello shows the right number of slots.
  const seatsOverrideByIscr = new Map<number, number>();
  {
    const { data: ovr, error: ovrErr } = await sb
      .from("corsi_iscrizioni")
      .select("id, seats_override")
      .eq("corso_id", corso.id);
    if (!ovrErr && ovr) {
      for (const o of ovr as { id: number; seats_override: number | null }[]) {
        if (o.seats_override != null && o.seats_override >= 1) seatsOverrideByIscr.set(o.id, Math.trunc(o.seats_override));
      }
    }
  }

  // Existing companions per enrollment (graceful degrade if the table/migration
  // is absent — the roster then simply shows no companions and no add slots).
  const companionsByIscr = new Map<number, { id: number; full_name: string; phone: string }[]>();
  {
    const { data: partData, error: partErr } = await sb
      .from("corsi_partecipanti")
      .select("id, iscrizione_id, full_name, phone")
      .eq("corso_id", corso.id);
    if (!partErr) {
      for (const p of (partData ?? []) as {
        id: number;
        iscrizione_id: number | null;
        full_name: string | null;
        phone: string | null;
      }[]) {
        if (p.iscrizione_id == null) continue;
        (companionsByIscr.get(p.iscrizione_id) ?? companionsByIscr.set(p.iscrizione_id, []).get(p.iscrizione_id)!).push({
          id: p.id,
          full_name: p.full_name ?? "",
          phone: p.phone ?? "",
        });
      }
    }
  }

  // Confirmed-email snapshot per enrollment + per companion (course-start
  // sanitization). Two-tier selects: WITH confirm_sent_at first, then without
  // (so a DB that has the 140000 migration but not the 20260703 one still
  // shows confirmed states), then nothing (pre-migration roster still works).
  type Snap = {
    email: string;
    confirmed: boolean;
    sent: boolean;
    sentAt: string | null;
    confirmedAt: string | null;
  };
  const enrolledEmail = new Map<number, Snap>();
  {
    type Row = {
      id: number;
      enrolled_email: string | null;
      email_confirmed_at: string | null;
      confirm_sent_at?: string | null;
    };
    let rows: Row[] | null = null;
    const rich = await sb
      .from("corsi_iscrizioni")
      .select("id, enrolled_email, email_confirmed_at, confirm_sent_at")
      .eq("corso_id", corso.id);
    rows = rich.data as Row[] | null;
    if (rich.error) {
      const base = await sb
        .from("corsi_iscrizioni")
        .select("id, enrolled_email, email_confirmed_at")
        .eq("corso_id", corso.id);
      rows = base.data as Row[] | null;
    }
    for (const r of rows ?? []) {
      enrolledEmail.set(r.id, {
        email: (r.enrolled_email ?? "").trim(),
        confirmed: Boolean(r.email_confirmed_at),
        sent: Boolean(r.confirm_sent_at),
        sentAt: r.confirm_sent_at ?? null,
        confirmedAt: r.email_confirmed_at ?? null,
      });
    }
  }
  const companionEmail = new Map<number, Snap>();
  {
    type PRow = {
      id: number;
      email: string | null;
      email_confirmed_at: string | null;
      confirm_sent_at?: string | null;
    };
    let rows: PRow[] | null = null;
    const rich = await sb
      .from("corsi_partecipanti")
      .select("id, email, email_confirmed_at, confirm_sent_at")
      .eq("corso_id", corso.id);
    rows = rich.data as PRow[] | null;
    if (rich.error) {
      const base = await sb
        .from("corsi_partecipanti")
        .select("id, email, email_confirmed_at")
        .eq("corso_id", corso.id);
      rows = base.data as PRow[] | null;
    }
    for (const r of rows ?? []) {
      companionEmail.set(r.id, {
        email: (r.email ?? "").trim(),
        confirmed: Boolean(r.email_confirmed_at),
        sent: Boolean(r.confirm_sent_at),
        sentAt: r.confirm_sent_at ?? null,
        confirmedAt: r.email_confirmed_at ?? null,
      });
    }
  }

  const seen = new Set<string>();
  const students: SharedStudent[] = [];
  const companions: SharedStudent[] = [];
  for (const r of iscrRows) {
    const c = r.corsista;
    if (!c) continue;
    const key = (c.email || c.full_name || "").trim().toLowerCase();
    // No identifying field → unusable roster row, skip it (an empty key never
    // dedups, so blank indistinguishable students would pile up).
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const tickets = seatsOverrideByIscr.get(r.id) ?? ticketCount.get(c.id) ?? 1;
    const mine = companionsByIscr.get(r.id) ?? [];
    const snap = enrolledEmail.get(r.id);
    students.push({
      id: c.id,
      kind: "corsista",
      name: c.full_name ?? "",
      email: snap?.email || (c.email ?? ""),
      emailConfirmed: snap?.confirmed ?? false,
      confirmSent: snap?.sent ?? false,
      confirmSentAt: snap?.sentAt ?? null,
      emailConfirmedAt: snap?.confirmedAt ?? null,
      phone: c.phone ?? "",
      iscrizioneId: r.id,
      tickets,
      companionsUsed: mine.length,
    });
    // Each companion becomes its OWN roster line (its own roll-call checkboxes),
    // labelled as a guest of the buyer.
    for (const comp of mine) {
      const csnap = companionEmail.get(comp.id);
      companions.push({
        id: comp.id,
        kind: "partecipante",
        name: comp.full_name,
        email: csnap?.email ?? "",
        emailConfirmed: csnap?.confirmed ?? false,
        confirmSent: csnap?.sent ?? false,
        confirmSentAt: csnap?.sentAt ?? null,
        emailConfirmedAt: csnap?.confirmedAt ?? null,
        phone: comp.phone,
        guestOf: c.full_name ?? "",
      });
    }
  }
  students.sort((a, b) => a.name.localeCompare(b.name));
  companions.sort((a, b) => a.name.localeCompare(b.name));
  students.push(...companions);

  const type = corso.type as CourseTypeKey;

  // Exam section: only certificato (nihonshu) / shochu bear an exam. The FIXED
  // structure (Giorno 1..N, Feedback, Esame finale) always shows — unconfigured
  // tests are "da configurare" with no link. Configured tests get a signed class
  // link; tokens are stateless (the link IS the grant), minted here server-side.
  const examFamily: "nihonshu" | "shochu" | null =
    type === "certificato" ? "nihonshu" : type === "shochu" ? "shochu" : null;
  let exam: SharedExamTest[] | null = null;
  if (examFamily) {
    const base = appConfig.baseUrl.replace(/\/$/, "");
    const now = Math.floor(Date.now() / 1000);
    const exp = now + EXAM_LINK_TTL_HOURS.exam * 3600;
    const [templateTests, closures] = await Promise.all([
      loadTemplateTests(examFamily),
      getCourseClosures(Number(corso.id)),
    ]);
    const link = (testKey: ExamTestKey) =>
      `${base}/esame/${signExamToken({ c: String(corso.id), t: testKey, m: "exam", ia: now, e: exp })}`;
    exam = templateTests.map((t) => ({
      key: t.key,
      label: t.label,
      isFinal: t.isFinal,
      configured: t.configured,
      url: t.configured ? link(t.key) : "",
      closedAt: closures[t.key] ?? null,
    }));
  }

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
    exam,
    // Roll-call days: Certificato = 3, Shochu = 2, everything else = 1.
    // (Kept in sync with courseDayCount in attendance-actions.ts.)
    dayCount: type === "certificato" ? 3 : type === "shochu" ? 2 : 1,
    totalSakes,
    totalSakeCost,
    days,
    students,
  };
}
