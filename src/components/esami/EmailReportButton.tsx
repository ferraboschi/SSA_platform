"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { sendExamResultEmailAction } from "@/lib/esami/email-actions";

/** Sends the student's exam-result email (with a link to the certificate). */
export function EmailReportButton({
  courseId,
  email,
  label,
}: {
  courseId: string;
  email: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const send = () =>
    start(async () => {
      const r = await sendExamResultEmailAction(courseId, email);
      if (!r.ok) setMsg(r.error || "Invio non riuscito");
      else setMsg(r.status === "sent" ? `Email inviata ✓ (${r.sentTo})` : "Inviata in modalità test (Resend non configurato)");
      setTimeout(() => setMsg(null), 5000);
    });

  return (
    <span className="no-print" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="btn btn-primary" disabled={pending || !courseId || !email} onClick={send}>
        <Icon name="mail" size={13} />
        {pending ? "Invio…" : label}
      </button>
      {msg && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{msg}</span>}
    </span>
  );
}
