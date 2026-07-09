"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { getSyncRunStatusAction, syncShopifyAction } from "@/lib/sync/actions";

type Result = { kind: "ok" | "err"; text: string } | null;

const POLL_MS = 8_000;
const MAX_POLLS = 45; // ~6 minutes — past that the run is reported as still working

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Top-bar refresh: kicks off the background Shopify sync (the run takes
 * minutes, longer than any request may live behind Render's proxy), keeps the
 * spinner on while polling the run status, then shows the real outcome.
 */
export function RefreshButton() {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = (r: Exclude<Result, null>) => {
    setResult(r);
    if (dismissRef.current) clearTimeout(dismissRef.current);
    dismissRef.current = setTimeout(() => setResult(null), 6000);
  };

  const run = () => {
    if (dismissRef.current) clearTimeout(dismissRef.current);
    setResult(null);
    startTransition(async () => {
      const res = await syncShopifyAction().catch(() => null);
      if (!res?.ok || !res.startedAt) {
        finish({ kind: "err", text: res?.error || t.sync.error });
        return;
      }

      // A run is now in flight (ours, or a colleague's already running one):
      // poll until that run reports its outcome.
      const startedAt = res.startedAt;
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_MS);
        const st = await getSyncRunStatusAction().catch(() => null);
        if (!st?.ok) continue; // transient — keep polling
        if (st.running || !st.finishedAt || (st.startedAt ?? "") < startedAt) continue;
        if (st.succeeded && st.summary) {
          const s = st.summary;
          const newEnrollments = s.enrollmentsUpserted + s.enrollmentsBackfilled;
          const changes =
            newEnrollments + s.coursesUpserted + s.contactsCreated + s.purchasesUpserted;
          finish({
            kind: "ok",
            text:
              changes === 0
                ? t.sync.noChanges
                : `${t.sync.done}: +${newEnrollments} iscr · +${s.coursesUpserted} corsi · +${s.contactsCreated} contatti`,
          });
          router.refresh();
        } else {
          finish({ kind: "err", text: st.error || t.sync.error });
        }
        return;
      }
      // Still running after ~6 min: the server keeps working — tell the user
      // the data will land, rather than faking an error.
      finish({ kind: "ok", text: t.sync.stillRunning });
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
      {(result || pending) && (
        <span className={`sync-result ${!result || result.kind === "ok" ? "ok" : "err"}`}>
          {pending && !result ? t.sync.syncing : result?.text}
        </span>
      )}
    </span>
  );
}
