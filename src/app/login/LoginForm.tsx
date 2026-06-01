"use client";

import { useState, useTransition } from "react";
import { signInAction } from "@/lib/auth/supabase-actions";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await signInAction(email, password, next);
      if (!result.ok) setError(result.error ?? "Errore di accesso.");
    });
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 400,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "var(--sh-card)",
        padding: "32px clamp(20px, 6vw, 32px)",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, textAlign: "center" }}>
        SSA Platform
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-2)",
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        Accedi al tuo account
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: "grid", gap: 12 }}
      >
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
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
          {pending ? "Attendi…" : "Accedi"}
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

      <p
        style={{
          fontSize: 11,
          color: "var(--text-4)",
          textAlign: "center",
          marginTop: 20,
          lineHeight: 1.5,
        }}
      >
        Gli account sono creati dall&apos;amministratore. Per l&apos;accesso
        contatta il referente SSA.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
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
