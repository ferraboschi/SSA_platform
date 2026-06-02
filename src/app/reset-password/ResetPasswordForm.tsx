"use client";

import { useState, useTransition } from "react";
import { updatePasswordAction } from "@/lib/auth/supabase-actions";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      setError("Le password non coincidono.");
      return;
    }
    startTransition(async () => {
      const r = await updatePasswordAction(password);
      if (!r.ok) setError(r.error ?? "Impossibile aggiornare la password.");
      // on success the action redirects to /dashboard
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: "grid", gap: 12 }}
    >
      <Field
        label="Nuova password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
      />
      <Field
        label="Conferma password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />
      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 6,
          padding: "11px 14px",
          border: "none",
          borderRadius: 8,
          background: "var(--indigo-600)",
          color: "white",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Attendi…" : "Imposta nuova password"}
      </button>
      {error && (
        <div
          style={{
            background: "var(--danger-bg)",
            color: "var(--danger-fg)",
            padding: "9px 12px",
            borderRadius: 7,
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)" }}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        style={{
          padding: "10px 11px",
          border: "1px solid var(--border)",
          borderRadius: 7,
          fontSize: 16,
          background: "var(--surface)",
          color: "var(--text)",
          outline: "none",
          width: "100%",
        }}
      />
    </label>
  );
}
