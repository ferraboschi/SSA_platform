"use client";

// Root-level error boundary. Renders its own <html>/<body> because it replaces
// the root layout when a top-level error occurs. Like (app)/error.tsx it
// auto-reloads on stale-chunk errors (common right after a deploy).

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

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isChunkError(error) || typeof window === "undefined") return;
    const key = "ssa-chunk-reload-at";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0b0f",
          color: "#f4f4f5",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Pagina non caricata</h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 18, opacity: 0.75 }}>
            {isChunkError(error)
              ? "C'è stato un aggiornamento dell'app. Ricarico la pagina…"
              : "Si è verificato un errore temporaneo. Riprova."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "9px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              background: "#e8590c",
              color: "#fff",
            }}
          >
            Ricarica
          </button>
        </div>
      </body>
    </html>
  );
}
