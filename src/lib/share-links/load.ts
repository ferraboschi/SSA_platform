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
import { COURSE_TYPES, courseHasExam } from "@/lib/domain";
import type { CourseTypeKey } from "@/lib/domain";
import { loadCourseProgram } from "@/lib/corsi/program-load";
import { getSakeCatalogSafe } from "@/lib/integrations/sakecompany/catalog";
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
  /** Corsista rows only: effective seat count for companion slots (suppressed to
   *  1 on F4-expanded lines so no phantom slot appears). */
  tickets?: number;
  /** Corsista rows only: the REAL number of tickets purchased (for display). */
  ticketsBought?: number;
  /** Corsista rows only: net paid on the enrollment, € (buyer carries the line). */
  amount?: number;
  /** Multi-ticket extra seat not yet completed (F4): a "da completare" roll-call
   *  row the educator fills in at check-in. `guestOf` = the buyer's name. */
  placeholder?: boolean;
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
  /** No program days configured yet — the UI shows one day + a notice. */
  programMissing?: boolean;
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

  const type = corso.type as CourseTypeKey;
  const examFamily: "nihonshu" | "shochu" | null =
    type === "certificato" ? "nihonshu" : type === "shochu" ? "shochu" : null;

  type IscrJoin = {
    id: number;
    line_item_id: number | null;
    amount_cents: number | null;
    discount_cents: number | null;
    corsista: { id: number; full_name: string | null; email: string | null; phone: string | null; placeholder?: boolean } | null;
  };
  type Snap = {
    email: string;
    confirmed: boolean;
    sent: boolean;
    sentAt: string | null;
    confirmedAt: string | null;
  };

  // Everything below depends ONLY on the corso row, so it runs as ONE parallel
  // group. It used to be 12+ strictly sequential round-trips, all blocking the
  // first byte of the page — the "link educator lento". Each member keeps its
  // own graceful fallback exactly as before.
  const [
    educator,
    catalog,
    overlay,
    iscrRows,
    ticketCount,
    seatsOverrideByIscr,
    companionsByIscr,
    enrolledEmail,
    companionEmail,
    examParts,
  ] = await Promise.all([
    // Educator display name.
    (async () => {
      if (!corso.educator_id) return "";
      const { data: edu } = await sb
        .from("educators")
        .select("full_name")
        .eq("id", corso.educator_id)
        .maybeSingle();
      return edu?.full_name ?? "";
    })(),
    // Sake enrichment catalog — TIME-BOXED with a last-known-good fallback, so a
    // slow/failed Sake Company crawl can neither stall the page nor blank the
    // tasting data (see getSakeCatalogSafe).
    getSakeCatalogSafe(),
    // Programma & Economia overlay (settings_kv) — authoritative when present.
    loadCourseProgram().then((m) => m.get(String(corso.id))),
    // Roster enrollments (join corsisti).
    (async () => {
      const { data: iscr } = await sb
        .from("corsi_iscrizioni")
        .select("id, line_item_id, amount_cents, discount_cents, corsista:corsisti(id,full_name,email,phone,placeholder)")
        .eq("corso_id", corso.id);
      return (iscr ?? []) as unknown as IscrJoin[];
    })(),
    // Tickets per person ("doppio"): SUM purchases.quantity on the course title.
    (async () => {
      const map = new Map<number, number>();
      const { data: pur } = await sb
        .from("purchases")
        .select("corsista_id,quantity")
        .eq("cluster", "corso")
        .eq("product_title", corso.full_title ?? "");
      for (const p of (pur ?? []) as { corsista_id: number; quantity?: number | null }[]) {
        const qty = Number.isFinite(Number(p.quantity)) && Number(p.quantity) > 0 ? Math.trunc(Number(p.quantity)) : 1;
        map.set(p.corsista_id, (map.get(p.corsista_id) ?? 0) + qty);
      }
      return map;
    })(),
    // Staff seat-count overrides — separate query ON PURPOSE: the column is a
    // pending migration, so folding it into the roster select would kill the
    // whole roster pre-migration. In parallel it costs nothing extra.
    (async () => {
      const map = new Map<number, number>();
      const { data: ovr, error: ovrErr } = await sb
        .from("corsi_iscrizioni")
        .select("id, seats_override")
        .eq("corso_id", corso.id);
      if (!ovrErr && ovr) {
        for (const o of ovr as { id: number; seats_override: number | null }[]) {
          if (o.seats_override != null && o.seats_override >= 1) map.set(o.id, Math.trunc(o.seats_override));
        }
      }
      return map;
    })(),
    // Companions per enrollment (graceful if the table/migration is absent).
    (async () => {
      const map = new Map<number, { id: number; full_name: string; phone: string }[]>();
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
          (map.get(p.iscrizione_id) ?? map.set(p.iscrizione_id, []).get(p.iscrizione_id)!).push({
            id: p.id,
            full_name: p.full_name ?? "",
            phone: p.phone ?? "",
          });
        }
      }
      return map;
    })(),
    // Confirmed-email snapshot per enrollment (two-tier select, as before).
    (async () => {
      const map = new Map<number, Snap>();
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
        map.set(r.id, {
          email: (r.enrolled_email ?? "").trim(),
          confirmed: Boolean(r.email_confirmed_at),
          sent: Boolean(r.confirm_sent_at),
          sentAt: r.confirm_sent_at ?? null,
          confirmedAt: r.email_confirmed_at ?? null,
        });
      }
      return map;
    })(),
    // Confirmed-email snapshot per companion (two-tier select, as before).
    (async () => {
      const map = new Map<number, Snap>();
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
        map.set(r.id, {
          email: (r.email ?? "").trim(),
          confirmed: Boolean(r.email_confirmed_at),
          sent: Boolean(r.confirm_sent_at),
          sentAt: r.confirm_sent_at ?? null,
          confirmedAt: r.email_confirmed_at ?? null,
        });
      }
      return map;
    })(),
    // Exam structure (template tests + closures) — only for exam-bearing types.
    (async () => {
      if (!examFamily) return null;
      const [templateTests, closures] = await Promise.all([
        loadTemplateTests(examFamily),
        getCourseClosures(Number(corso.id)),
      ]);
      return { templateTests, closures };
    })(),
  ]);

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
  // (course_program), NOT to corsi_giorni/corsi_sake. The overlay (fetched in the
  // parallel group above) is authoritative when present — exactly as the internal
  // course page treats it. The base-tables fallback below is the ONLY remaining
  // conditional round-trip.
  let days: SharedDay[];
  if (overlay?.days?.length) {
    days = overlay.days
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((d) => ({
        day: d.day,
        name: d.name,
        // A day in the overlay may have no sakes array (partially-edited
        // program) — never .map() on undefined or the whole page crashes.
        sakes: (d.sakes ?? []).map((s) => ({
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

  // Multi-ticket (F4): a line_item_id on more than one row is "expanded" — its
  // extra seats already exist as their own rows, so the buyer must NOT also show
  // an inflated ticket count (that would double the seat). Placeholder seats that
  // aren't completed yet carry no real person and are skipped below.
  const expandedLines = new Set<number>();
  {
    const perLine = new Map<number, number>();
    for (const r of iscrRows) {
      if (r.line_item_id == null) continue;
      perLine.set(r.line_item_id, (perLine.get(r.line_item_id) ?? 0) + 1);
    }
    for (const [lineId, n] of perLine) if (n > 1) expandedLines.add(lineId);
  }

  // Buyer name per order line (from the real seat-1 row) — used to label a
  // multi-ticket extra seat as "2° posto di <buyer>".
  const buyerNameByLine = new Map<number, string>();
  for (const r of iscrRows) {
    const c = r.corsista;
    if (!c || c.placeholder || r.line_item_id == null) continue;
    if (!buyerNameByLine.has(r.line_item_id)) buyerNameByLine.set(r.line_item_id, c.full_name ?? "");
  }

  const seen = new Set<string>();
  const students: SharedStudent[] = [];
  const companions: SharedStudent[] = [];
  const lineOf = new Map<SharedStudent, number | null>();
  // F4 extra seats not yet completed, grouped by their order line so they render
  // directly under the buyer.
  const placeholdersByLine = new Map<number, SharedStudent[]>();
  for (const r of iscrRows) {
    const c = r.corsista;
    if (!c) continue;
    const snap = enrolledEmail.get(r.id);

    // A not-yet-completed placeholder seat (F4 multi-ticket): show it on the
    // roll-call as a "da completare" row the educator fills in at check-in. It
    // keeps its (placeholder) corsista_id, so presence works and — once filled —
    // it becomes a normal corsista row across ALL days without re-entry.
    if (c.placeholder) {
      const line = r.line_item_id;
      const ph: SharedStudent = {
        id: c.id,
        kind: "corsista",
        name: "", // empty → UI shows "Posto da completare"
        email: "", // hide the synthetic placeholder email
        emailConfirmed: false,
        confirmSent: Boolean(snap?.sent),
        confirmSentAt: snap?.sentAt ?? null,
        emailConfirmedAt: null,
        phone: "",
        iscrizioneId: r.id,
        placeholder: true,
        guestOf: line != null ? (buyerNameByLine.get(line) ?? "") : "",
      };
      if (line != null) (placeholdersByLine.get(line) ?? placeholdersByLine.set(line, []).get(line)!).push(ph);
      else students.push(ph); // stray seat with no line → just list it
      continue;
    }

    const key = (c.email || c.full_name || "").trim().toLowerCase();
    // No identifying field → unusable roster row, skip it (an empty key never
    // dedups, so blank indistinguishable students would pile up).
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    // Expanded lines: the buyer occupies exactly one seat (the extras are their
    // own rows), so don't inflate `tickets` — otherwise the appello shows phantom
    // companion slots. `ticketsBought` keeps the REAL purchased count for display.
    const lineExpanded = r.line_item_id != null && expandedLines.has(r.line_item_id);
    const tickets = lineExpanded ? 1 : (seatsOverrideByIscr.get(r.id) ?? ticketCount.get(c.id) ?? 1);
    const ticketsBought = seatsOverrideByIscr.get(r.id) ?? ticketCount.get(c.id) ?? 1;
    // Net paid on this enrollment (buyer seat carries the full line total): the
    // owner wants price + ticket count visible on the roll-call.
    const amount = Math.max(0, ((r.amount_cents || 0) - (r.discount_cents || 0)) / 100);
    const mine = companionsByIscr.get(r.id) ?? [];
    const st: SharedStudent = {
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
      ticketsBought,
      amount,
      companionsUsed: mine.length,
    };
    students.push(st);
    lineOf.set(st, r.line_item_id);
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
  // Interleave: each buyer is immediately followed by its "da completare" extra
  // seats, so the 2nd ticket shows right under the person who bought it.
  const ordered: SharedStudent[] = [];
  for (const st of students) {
    ordered.push(st);
    const line = lineOf.get(st);
    if (line != null) {
      const phs = placeholdersByLine.get(line);
      if (phs) ordered.push(...phs);
    }
  }
  ordered.push(...companions);
  students.length = 0;
  students.push(...ordered);

  // Exam section: only certificato (nihonshu) / shochu bear an exam. The FIXED
  // structure (Giorno 1..N, Feedback, Esame finale) always shows — unconfigured
  // tests are "da configurare" with no link. Configured tests get a signed class
  // link; tokens are stateless (the link IS the grant), minted here server-side.
  // Data (templateTests + closures) was fetched in the parallel group above.
  let exam: SharedExamTest[] | null = null;
  if (examParts) {
    const { templateTests, closures } = examParts;
    const base = appConfig.baseUrl.replace(/\/$/, "");
    const now = Math.floor(Date.now() / 1000);
    const exp = now + EXAM_LINK_TTL_HOURS.exam * 3600;
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
    hasExam: courseHasExam(type),
    exam,
    // Roll-call days = the course's REAL program length ONLY (the operator
    // adds/removes days freely). No program yet → ONE day + the missing flag,
    // never the fabricated type baseline (owner's rule, batch 7): sharing the
    // link auto-seeds the expected days as real entries, so this fallback only
    // covers legacy links minted before that.
    dayCount: Math.max(1, days.length),
    programMissing: days.length === 0,
    totalSakes,
    totalSakeCost,
    days,
    students,
  };
}
