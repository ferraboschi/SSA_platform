// Public, tokenized "share with educator" page — reachable WITHOUT app login.
//
// The link is a signed, expiring token (src/lib/share-links/token.ts), specific
// to one course. We verify it, then load a read-only view (header + program +
// materials summary) via the service client (anon is blocked by RLS).
import type { Metadata } from "next";
import { verifyShareToken } from "@/lib/share-links/token";
import { loadSharedCourse } from "@/lib/share-links/load";
import EducatorTabs from "@/components/condividi/EducatorTabs";
import { loadPlannerState } from "@/lib/pianificatore-server";
import type { PlannerSaved } from "@/lib/pianificatore";
import { COURSE_TYPES } from "@/lib/domain/constants";
import "@/components/esame-pubblico/exam-public.css";

export const metadata: Metadata = {
  title: "SSA · Corso condiviso",
  robots: { index: false, follow: false },
};

function Invalid({ reason }: { reason: string }) {
  return (
    <div className="exam-public-shell">
      <div className="exam-public-card" style={{ textAlign: "center", maxWidth: 460 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Link non valido</h1>
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>{reason}</p>
      </div>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const res = verifyShareToken(token);
  if (!res.ok) {
    const msg =
      res.reason === "expired"
        ? "Questo link è scaduto. Chiedi alla segreteria SSA un link aggiornato."
        : "Questo link non è valido. Verifica di aver copiato l'indirizzo completo.";
    return <Invalid reason={msg} />;
  }

  // Planner share (sentinel id "planner") → read-only plan view.
  if (res.payload.c === "planner") {
    const plan = await loadPlannerState();
    return <PlannerShareView plan={plan} />;
  }

  // Safety net: a single bad data shape (e.g. a partially-edited program) must
  // never crash the whole public page — degrade to a clear message instead.
  let course: Awaited<ReturnType<typeof loadSharedCourse>>;
  try {
    course = await loadSharedCourse(res.payload.c);
  } catch (e) {
    console.error(
      `[condividi] loadSharedCourse failed for course ${res.payload.c}:`,
      e instanceof Error ? e.message : String(e),
    );
    return (
      <Invalid reason="Pagina temporaneamente non disponibile. Riprova tra poco o chiedi alla segreteria SSA un link aggiornato." />
    );
  }
  if (!course) {
    return <Invalid reason="Corso non trovato o non più disponibile." />;
  }

  return (
    <div className="exam-public-shell">
      <div className="exam-public-card exam-public-card--wide">
        {/* Header */}
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            paddingBottom: 16,
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--indigo-600)" }}>
            Sake Sommelier Association
          </div>
          <h1 style={{ fontSize: "clamp(20px, 4vw, 26px)", margin: "6px 0 10px", lineHeight: 1.2 }}>
            {course.courseName}
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {course.typeLabel && <Chip>{course.typeLabel}</Chip>}
            {course.place && <Chip>📍 {course.place}</Chip>}
            {course.date && <Chip>🗓️ {course.date}</Chip>}
            {course.educator && <Chip>👤 {course.educator}</Chip>}
          </div>
        </div>

        {course.programMissing && (
          <p
            style={{
              fontSize: 13,
              color: "#92400e",
              background: "#fef3c7",
              borderRadius: 10,
              padding: "10px 12px",
              margin: "0 0 14px",
              lineHeight: 1.5,
            }}
          >
            Le giornate di questo corso non sono ancora configurate: viene mostrata una sola
            giornata. Chiedi alla segreteria SSA di configurare il programma.
          </p>
        )}

        {/* Compact summary */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <Stat label="Iscritti" value={String(course.students.filter((s) => s.kind === "corsista").length)} />
          <Stat label="Giornate" value={String(course.dayCount)} />
          <Stat label="Sake totali" value={String(course.totalSakes)} />
          <Stat label="Esame finale" value={course.hasExam ? "Sì" : "No"} />
        </div>

        {/* The 4 tabs: Appello (by day) · Verifica email · Programma · Esami.
            The client component gets ONLY the signed token — every write goes
            through token-verified server actions (never a raw course id). */}
        <EducatorTabs
          token={token}
          students={course.students}
          dayCount={course.dayCount}
          days={course.days}
          tests={course.exam}
        />

        <div
          style={{
            marginTop: 22,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
            fontSize: 11.5,
            color: "var(--text-4)",
            textAlign: "center",
          }}
        >
          Pagina condivisa dalla segreteria SSA · i link d&apos;esame sono per gli studenti
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        padding: "4px 10px",
        borderRadius: 999,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
      }}
    >
      {children}
    </span>
  );
}

function PlannerShareView({ plan }: { plan: PlannerSaved | null }) {
  const planned = plan?.planned ?? [];
  const targets = plan?.targets ?? {};
  const groups = new Map<string, typeof planned>();
  for (const p of planned) {
    const d = p.dates?.[0];
    if (!d) continue;
    const key = d.slice(0, 7); // YYYY-MM
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  const keys = [...groups.keys()].sort();
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  };
  const dayLabel = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—";

  return (
    <div className="exam-public-shell">
      <div className="exam-public-card" style={{ maxWidth: 720 }}>
        <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--indigo-600)" }}>
            Sake Sommelier Association
          </div>
          <h1 style={{ fontSize: "clamp(20px, 4vw, 26px)", margin: "6px 0 4px" }}>Pianificazione corsi</h1>
          <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
            {planned.length} corsi pianificati
          </p>
        </div>

        {(targets.intro != null || targets.cert != null || targets.citta != null) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            {targets.intro != null && <Stat label="Obiettivo introduttivi" value={String(targets.intro)} />}
            {targets.cert != null && <Stat label="Obiettivo certificati" value={String(targets.cert)} />}
            {targets.citta != null && <Stat label="Obiettivo città" value={String(targets.citta)} />}
          </div>
        )}

        {planned.length === 0 ? (
          <p style={{ color: "var(--text-3)", fontSize: 13, fontStyle: "italic" }}>
            Nessun corso pianificato al momento.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {keys.map((k) => (
              <div key={k}>
                <h2 style={{ fontSize: 14, margin: "0 0 8px", textTransform: "capitalize" }}>{monthLabel(k)}</h2>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  {groups.get(k)!.map((p, i, arr) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--border-2)",
                      }}
                    >
                      <Chip>{COURSE_TYPES[p.type]?.label ?? p.type}</Chip>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.city || "—"}</span>
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                        {p.mode === "online" ? "Online" : "In presenza"}
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-4)" }}>
                        {dayLabel(p.dates?.[0])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 22, paddingTop: 14, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--text-4)", textAlign: "center" }}>
          Vista di sola lettura · condivisa dalla SSA
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: "1 1 120px",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 14px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
