"use client";

// Route-level error boundary for the authenticated app. The most common cause
// of "this page couldn't load" is a stale JS chunk after a deploy (an old tab
// requests a chunk hash the new build replaced) — we detect that and reload
// once so the new build loads transparently. Other errors get a clean retry.

import { useEffect } from "react";

function isChunkError(error: Error): boolean {
  const s = `${error?.name} ${error?.message}`.toLowerCase();
  return (
    s.includes("chunk") ||
    s.includes("loading css") ||
    s.includes("failed to fetch dynamically imported module") ||
    s.includes("importing a module script failed") ||
    s.includes("error loading")
  );
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isChunkError(error) || typeof window === "undefined") return;
    // Guard against reload loops: only auto-reload if we haven't in the last 10s.
    const key = "ssa-chunk-reload-at";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div className="card card-pad-lg" style={{ maxWidth: 460, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Pagina non caricata</h1>
        <p className="text-3" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>
          {isChunkError(error)
            ? "C'è stato un aggiornamento dell'app. Ricarico la pagina…"
            : "Si è verificato un errore temporaneo. Riprova."}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Ricarica
          </button>
          <button className="btn" onClick={() => reset()}>
            Riprova
          </button>
        </div>
      </div>
    </div>
  );
}
