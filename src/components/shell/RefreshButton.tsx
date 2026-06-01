"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { syncShopifyAction } from "@/lib/sync/actions";

type Result = { kind: "ok" | "err"; text: string } | null;

/**
 * Top-bar refresh: triggers an on-demand Shopify → Supabase sync, then refreshes
 * the router so fresh data renders. Shows a spinner while running and a short
 * result chip afterwards.
 */
export function RefreshButton() {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);

  const run = () => {
    setResult(null);
    startTransition(async () => {
      const res = await syncShopifyAction();
      if (res.ok && res.summary) {
        const s = res.summary;
        const changes =
          s.enrollmentsUpserted +
          s.coursesUpserted +
          s.contactsCreated +
          s.purchasesUpserted;
        setResult({
          kind: "ok",
          text:
            changes === 0
              ? t.sync.noChanges
              : `${t.sync.done}: +${s.enrollmentsUpserted} iscr · +${s.coursesUpserted} corsi · +${s.contactsCreated} contatti`,
        });
        router.refresh();
      } else {
        setResult({ kind: "err", text: res.error || t.sync.error });
      }
      // Auto-dismiss the chip.
      setTimeout(() => setResult(null), 4200);
    });
  };

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        className="btn btn-icon btn-ghost"
        title={t.sync.refreshTitle}
        aria-label={t.sync.refreshTitle}
        onClick={run}
        disabled={pending}
      >
        <Icon name="refresh" size={15} className={pending ? "is-spinning" : undefined} />
      </button>
      {result && (
        <span className={`sync-result ${result.kind === "ok" ? "ok" : "err"}`}>
          {pending ? t.sync.syncing : result.text}
        </span>
      )}
    </span>
  );
}
