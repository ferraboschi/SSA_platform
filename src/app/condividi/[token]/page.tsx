// Public, tokenized "share with educator" page — reachable WITHOUT app login.
//
// The link is a signed, expiring token (src/lib/share-links/token.ts), specific
// to one course. We verify it, then load a read-only view (header + program +
// materials summary) via the service client (anon is blocked by RLS).
import type { Metadata } from "next";
import { verifyShareToken } from "@/lib/share-links/token";
import { loadSharedCourse } from "@/lib/share-links/load";
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

  const course = await loadSharedCourse(res.payload.c);
  if (!course) {
    return <Invalid reason="Corso non trovato o non più disponibile." />;
  }

  return (
    <div className="exam-public-shell">
      <div className="exam-public-card" style={{ maxWidth: 720 }}>
        {/* Header */}
        <div
          style={{
            borderBottom: "1px solid var(--border, #e5e7eb)",
            paddingBottom: 16,
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--indigo-600, #4f46e5)" }}>
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

        {/* Materials summary */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <Stat label="Iscritti" value={String(course.students.length)} />
          <Stat label="Giornate" value={String(course.days.length)} />
          <Stat label="Sake totali" value={String(course.totalSakes)} />
          <Stat label="Esame finale" value={course.hasExam ? "Sì" : "No"} />
        </div>

        {/* Enrolled students roster */}
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Iscritti</h2>
        {course.students.length === 0 ? (
          <p style={{ color: "var(--text-3)", fontSize: 13, fontStyle: "italic", marginBottom: 20 }}>
            Nessun iscritto al momento.
          </p>
        ) : (
          <div
            style={{
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 24,
            }}
          >
            {course.students.map((s, i) => (
              <div
                key={`${s.email}-${i}`}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderBottom:
                    i === course.students.length - 1 ? "none" : "1px solid var(--border-2, #f0f1f3)",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: "var(--surface-2, #f4f5f7)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-3, #6b7280)",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: "1 1 160px", minWidth: 0 }}>
                  {s.name || "—"}
                </span>
                {s.email && (
                  <a
                    href={`mailto:${s.email}`}
                    style={{ fontSize: 12, color: "var(--indigo-600, #4f46e5)", textDecoration: "none", flex: "1 1 200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {s.email}
                  </a>
                )}
                {s.phone && (
                  <a
                    href={`tel:${s.phone}`}
                    style={{ fontSize: 12, color: "var(--text-2, #374151)", textDecoration: "none", flexShrink: 0 }}
                  >
                    {s.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Program */}
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Programma & sake</h2>
        {course.days.length === 0 && (
          <p style={{ color: "var(--text-3)", fontSize: 13, fontStyle: "italic" }}>
            Il programma non è ancora stato pubblicato.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {course.days.map((d) => (
            <div
              key={d.day}
              style={{
                border: "1px solid var(--border, #e5e7eb)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  background: "var(--surface-2, #f4f5f7)",
                  borderBottom: "1px solid var(--border, #e5e7eb)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: "var(--indigo-50, #eef2ff)",
                    color: "var(--indigo-600, #4f46e5)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  G{d.day}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-4, #9ca3af)" }}>
                  {d.sakes.length} sake
                </span>
              </div>
              {d.sakes.length === 0 ? (
                <div style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--text-4, #9ca3af)", fontStyle: "italic" }}>
                  Nessun sake assegnato a questa giornata.
                </div>
              ) : (
                d.sakes.map((s, i) => (
                  <div
                    key={`${s.code}-${i}`}
                    style={{
                      padding: "10px 14px",
                      borderBottom:
                        i === d.sakes.length - 1 ? "none" : "1px solid var(--border-2, #f0f1f3)",
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3, #6b7280)", marginTop: 2 }}>
                      {[s.type, s.sakagura, s.size ? `${s.size}ml` : "", s.code]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 22,
            paddingTop: 14,
            borderTop: "1px solid var(--border, #e5e7eb)",
            fontSize: 11.5,
            color: "var(--text-4, #9ca3af)",
            textAlign: "center",
          }}
        >
          Vista di sola lettura · condivisa dalla segreteria SSA
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
        background: "var(--surface-2, #f4f5f7)",
        border: "1px solid var(--border, #e5e7eb)",
        color: "var(--text-2, #374151)",
      }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: "1 1 120px",
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 10,
        padding: "10px 14px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-4, #9ca3af)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
