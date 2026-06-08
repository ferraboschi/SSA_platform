"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { syncEducatorsAction } from "@/lib/educators/actions";

/** Re-aligns the educator roster with the public "Chi siamo" page and shows the
 *  result (who got deactivated/reactivated) so the operation is observable. */
export function EducatorSyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await syncEducatorsAction();
      if (!r.ok) {
        setMsg({ ok: false, text: `Non riuscito${r.reason ? `: ${r.reason}` : ""}` });
        return;
      }
      const parts: string[] = [];
      if (r.deactivated.length) parts.push(`disattivati: ${r.deactivated.join(", ")}`);
      if (r.reactivated.length) parts.push(`riattivati: ${r.reactivated.join(", ")}`);
      setMsg({
        ok: true,
        text: parts.length ? `✓ ${parts.join(" · ")}` : "✓ Già allineati al sito",
      });
      router.refresh();
    });

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={run}
        title="Allinea gli educator attivi alla pagina Chi siamo del sito"
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <Icon name="refresh" size={13} />
        {pending ? "Allineo…" : "Allinea dal sito SSA"}
      </button>
      {msg && (
        <span style={{ fontSize: 12, color: msg.ok ? "var(--text-3)" : "var(--danger-fg)" }}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
