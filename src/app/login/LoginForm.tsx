"use client";

import { useState, useTransition } from "react";
import { signInAction, signUpAction } from "@/lib/auth/supabase-actions";

type Mode = "signin" | "signup";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result =
        mode === "signin"
          ? await signInAction(email, password, next)
          : await signUpAction(email, password, firstName, lastName);
      if (!result.ok) {
        setError(result.error ?? "Errore sconosciuto.");
      } else if (result.error) {
        setInfo(result.error);
      }
    });
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 420,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "var(--sh-card)",
        padding: 32,
      }}
    >
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginBottom: 4,
          textAlign: "center",
        }}
      >
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
        {mode === "signin" ? "Accedi al tuo account" : "Crea un nuovo account"}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          background: "var(--surface-2)",
          borderRadius: 8,
          padding: 3,
          marginBottom: 20,
          fontSize: 12.5,
        }}
      >
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
            style={{
              padding: "8px 0",
              border: "none",
              borderRadius: 6,
              background: mode === m ? "var(--surface)" : "transparent",
              fontWeight: mode === m ? 600 : 500,
              color: mode === m ? "var(--text)" : "var(--text-2)",
              cursor: "pointer",
              boxShadow: mode === m ? "var(--sh-low)" : "none",
            }}
          >
            {m === "signin" ? "Accedi" : "Registrati"}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: "grid", gap: 12 }}
      >
        {mode === "signup" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field
              label="Nome"
              value={firstName}
              onChange={setFirstName}
              autoComplete="given-name"
              required
            />
            <Field
              label="Cognome"
              value={lastName}
              onChange={setLastName}
              autoComplete="family-name"
              required
            />
          </div>
        )}
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
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            marginTop: 6,
            padding: "10px 14px",
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
          {pending
            ? "Attendi…"
            : mode === "signin"
              ? "Accedi"
              : "Crea account"}
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
        {info && (
          <div
            style={{
              background: "var(--indigo-50)",
              color: "var(--indigo-700)",
              padding: "9px 12px",
              borderRadius: 7,
              fontSize: 12.5,
            }}
          >
            {info}
          </div>
        )}
      </form>
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
          padding: "9px 11px",
          border: "1px solid var(--border)",
          borderRadius: 7,
          fontSize: 13,
          background: "var(--surface)",
          color: "var(--text)",
          outline: "none",
        }}
      />
    </label>
  );
}
