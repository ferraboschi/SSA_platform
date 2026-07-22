"use client";

import { useState } from "react";
import { createEmergencyExamLink } from "@/lib/exam-links/actions";

/**
 * EMERGENCY channel (owner). Normally the educator sends the exam links from the
 * Condividi page — that is the standard flow. This panel exists ONLY for the rare
 * case where the educator can't do it from their usual device (broken/dead phone):
 * the SSA responsible mints the REAL generic "room" link for the FINAL exam here
 * and hands it off via an external channel (WhatsApp). The link is identical to the
 * one the educator would generate — it respects every rule (confirmed data,
 * presence at the appello, closure) via the /esame email gate.
 */
export function ExamLinkPanel({ courseId }: { courseId: string }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    const res = await createEmergencyExamLink(courseId).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof createEmergencyExamLink>>,
    );
    setBusy(false);
    if (res.ok && res.url) setLink(res.url);
    else setError(res.error || "Generazione non riuscita.");
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copia il link:", link);
    }
  };

  const waHref = link
    ? `https://wa.me/?text=${encodeURIComponent(
        `Link per l'Esame finale SSA. Aprilo e inserisci la tua email (quella confermata all'appello) per accedere e svolgere l'esame:\n${link}`,
      )}`
    : "#";

  return (
    <div>
      <div
        className="card card-pad"
        style={{
          marginBottom: 16,
          background: "#fef3c7",
          border: "1px solid #fcd34d",
          boxShadow: "none",
          fontSize: 13,
          color: "#92400e",
          lineHeight: 1.55,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Solo per emergenze</div>
        In condizioni normali i link d&apos;esame li invia l&apos;<strong>educator</strong> dalla pagina
        «Condividi con educator». Usa questa scheda <strong>solo</strong> se l&apos;educator non può
        farlo dal suo dispositivo (es. telefono rotto o scarico): genera qui il{" "}
        <strong>link della stanza</strong> per l&apos;Esame finale e recapitalo tramite un canale
        esterno (WhatsApp). Il link rispetta le stesse regole di sempre — dati confermati,
        presenza all&apos;appello, chiusura — perché all&apos;apertura chiede la mail confermata.
      </div>

      <div className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Esame finale{" "}
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--indigo-600)" }}>
                OBBLIGATORIO
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 2 }}>
              Un unico link per la stanza · ogni studente entra con la propria email confermata.
            </div>
          </div>
          {!link && (
            <button className="btn btn-primary" disabled={busy} onClick={generate}>
              {busy ? "Genero…" : "Genera link della stanza"}
            </button>
          )}
        </div>

        {error && <div style={{ fontSize: 12.5, color: "var(--danger-fg, #b91c1c)" }}>{error}</div>}

        {link && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="input mono"
                style={{ flex: "1 1 220px", minWidth: 0, fontSize: 11.5 }}
              />
              <button className="btn btn-sm" onClick={copy} style={{ flexShrink: 0 }}>
                {copied ? "Copiato ✓" : "Copia"}
              </button>
              <a
                className="btn btn-sm"
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                Invia via WhatsApp
              </a>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>
              Condividi questo link con la stanza dell&apos;esame. Se serve, puoi rigenerarlo.
            </div>
            <button
              className="btn btn-sm"
              onClick={generate}
              disabled={busy}
              style={{ justifySelf: "start" }}
            >
              {busy ? "Genero…" : "Rigenera link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
