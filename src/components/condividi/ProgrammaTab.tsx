"use client";

import { useEffect, useRef, useState } from "react";
import type { DayRow } from "./shared";
import { bottlesForStudents, parseVolumeMl } from "@/lib/economics/bottles";

// ─────────────────────────────────────────────────────────────────────────────
// 2 · PROGRAMMA — sakes by day, photo + inline expandable details.
// ─────────────────────────────────────────────────────────────────────────────
export default function ProgrammaTab({
  days,
  day,
  enrolled,
}: {
  days: DayRow[];
  day: number;
  /** Roster size — drives the real bottle need (48ml/person by format). */
  enrolled: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // One DOM ref per sake row, so the just-expanded one can be scrolled into
  // view (see the effect below).
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // On mobile especially, an expanding card can open mostly BELOW the fold —
  // scroll it to the top of the viewport (under the sticky tab bar, via
  // scroll-margin-top on .edu-sake-row) so the whole card, photo included,
  // stays reachable without the reader hunting for it.
  useEffect(() => {
    if (!open) return;
    rowRefs.current.get(open)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);

  const d = days.find((x) => x.day === day);
  if (!d || d.sakes.length === 0) {
    return (
      <div className="edu-empty">
        {d ? "Nessun sake assegnato a questa giornata." : "Il programma non è ancora stato pubblicato."}
      </div>
    );
  }
  return (
    <div className="edu-daycard" style={{ marginBottom: 14 }}>
      {d.sakes.map((s, i) => {
        const id = `${d.day}-${s.code}-${i}`;
        const expanded = open === id;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) rowRefs.current.set(id, el);
              else rowRefs.current.delete(id);
            }}
            className="edu-sake-row"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-2)" }}
          >
            <button
              type="button"
              className="edu-row edu-row-tap"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : id)}
            >
              {s.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" className="edu-sake-thumb" />
              ) : (
                <span className="edu-sake-thumb edu-sake-thumb-empty">{s.code || "—"}</span>
              )}
              <span className="edu-row-main">
                <span className="edu-row-name">{s.name}</span>
                <span className="edu-row-sub">
                  {[s.type, s.size ? `${s.size}ml` : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span aria-hidden style={{ color: "var(--text-4)", flexShrink: 0 }}>
                {expanded ? "▴" : "▾"}
              </span>
            </button>
            {expanded && (
              <div className="edu-sake-detail">
                {s.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image} alt={s.name} className="edu-sake-photo" />
                )}
                <dl className="edu-sake-facts">
                  {s.type && <Fact k="Tipo" v={s.type} />}
                  {s.sakagura && <Fact k="Sakagura" v={s.sakagura} />}
                  {s.region && <Fact k="Regione" v={s.region} />}
                  {s.abv && <Fact k="Alcol" v={s.abv} />}
                  {s.size > 0 && <Fact k="Formato" v={`${s.size} ml`} />}
                  <Fact
                    k="Bottiglie"
                    v={String(
                      enrolled > 0
                        ? bottlesForStudents(enrolled, s.size || parseVolumeMl(s.name, s.code))
                        : s.qty || 1,
                    )}
                  />
                  {s.code && <Fact k="Codice" v={s.code} />}
                </dl>
                {s.aroma && (
                  <p
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--indigo-600)",
                      margin: "10px 0 0",
                      lineHeight: 1.5,
                    }}
                  >
                    🌸 {s.aroma}
                  </p>
                )}
                {s.notes && (
                  <p style={{ fontSize: 12.5, color: "var(--text-2)", margin: "6px 0 0", lineHeight: 1.55 }}>
                    {s.notes}
                  </p>
                )}
                {s.pairing && (
                  <p style={{ fontSize: 12.5, color: "var(--text-2)", margin: "8px 0 0", lineHeight: 1.5 }}>
                    🍽️ <strong>Abbinamento:</strong> {s.pairing}
                  </p>
                )}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="edu-linkbtn">
                    Scheda completa su Sake Company ↗
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
      <dt style={{ color: "var(--text-4)", minWidth: 74 }}>{k}</dt>
      <dd style={{ margin: 0, color: "var(--text-2)", fontWeight: 500 }}>{v}</dd>
    </div>
  );
}
