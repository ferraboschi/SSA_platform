"use client";

import { useState } from "react";
import { setPartecipanteNameAction } from "@/lib/share-links/attendance-actions";
import {
  setAttendeeEmailAction,
  setAttendeePhoneAction,
  sendAttendeeConfirmLinkAction,
  correctAndResendAction,
} from "@/lib/share-links/verification-actions";
import { newerIso, type VerificationStateId } from "@/lib/share-links/verification-state";
import type { Student } from "./shared";

/** Contact line + the EXACT buttons the state allows (+ the edit form, which
 *  is the only thing that expands). */
export default function VerifyActions({
  token,
  student: s,
  state,
  onUpdated,
}: {
  token: string;
  student: Student;
  state: VerificationStateId;
  onUpdated: (patch: Partial<Student>) => void;
}) {
  const refId = s.kind === "corsista" ? s.iscrizioneId : s.id;
  const [editing, setEditing] = useState(false);
  const [draftEmail, setDraftEmail] = useState(s.email);
  const [draftPhone, setDraftPhone] = useState(s.phone);
  // A companion has NO Shopify-sourced identity (unlike a corsista's name,
  // which stays read-only here) — name is editable ONLY for kind:"partecipante".
  const [draftName, setDraftName] = useState(s.name);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const isGuest = s.kind === "partecipante";

  if (refId == null) return <span />;
  const ref = { kind: s.kind, id: refId };

  const applySendResult = (res: { sentTo?: string; sentAtIso?: string; url?: string; error?: string }, successNote: string) => {
    onUpdated({
      confirmSent: true,
      confirmSentAt: newerIso(s.confirmSentAt, res.sentAtIso ?? new Date().toISOString()),
    });
    if (res.sentTo) setNote(successNote);
    else {
      setNote(res.error ?? null);
      if (res.url) setLink(res.url);
    }
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setLink(null);
    const res = await sendAttendeeConfirmLinkAction(token, ref).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof sendAttendeeConfirmLinkAction>>,
    );
    setBusy(false);
    if (!res.ok) {
      setNote(res.error || "Invio non riuscito. Riprova tra un minuto.");
      return;
    }
    applySendResult(res, `Email inviata a ${res.sentTo} — in attesa di conferma.`);
  };

  // "Se non l'ha ricevuta": mint the link and copy it — the educator hands it
  // over via WhatsApp/SMS, outside the platform.
  const copyManualLink = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setLink(null);
    const res = await sendAttendeeConfirmLinkAction(token, ref, "link").catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof sendAttendeeConfirmLinkAction>>,
    );
    setBusy(false);
    if (!res.ok || !res.url) {
      setNote(res.error || "Generazione non riuscita. Riprova tra un minuto.");
      return;
    }
    onUpdated({
      confirmSent: true,
      confirmSentAt: newerIso(s.confirmSentAt, res.sentAtIso ?? new Date().toISOString()),
    });
    try {
      await navigator.clipboard.writeText(res.url);
      setNote("Link copiato — invialo via WhatsApp o SMS.");
    } catch {
      setLink(res.url);
      setNote("Link generato:");
    }
  };

  // Renaming a companion is its own small, non-atomic write — it doesn't
  // invalidate an outstanding confirm link (bound by id, not by name), so it
  // never needs to be bundled with the email correct-and-resend. Shared by
  // both save paths below.
  const saveNameIfChanged = async (): Promise<string | null> => {
    if (!isGuest) return null;
    const nameChanged = draftName.trim() !== (s.name || "").trim();
    if (!nameChanged) return null;
    if (!draftName.trim()) return "Il nome è obbligatorio.";
    const r = await setPartecipanteNameAction(token, refId, draftName.trim()).catch(
      () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
    );
    if (r.ok) {
      onUpdated({ name: draftName.trim() });
      return null;
    }
    return r.error || "Salvataggio del nome non riuscito, riprova.";
  };

  const saveFree = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const emailChanged = draftEmail.trim().toLowerCase() !== (s.email || "").trim().toLowerCase();
    const phoneChanged = draftPhone.trim() !== (s.phone || "").trim();
    let err: string | null = await saveNameIfChanged();
    if (!err && emailChanged) {
      const r = await setAttendeeEmailAction(token, ref, draftEmail.trim()).catch(
        () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
      );
      if (r.ok) onUpdated({ email: draftEmail.trim().toLowerCase() });
      else err = r.error || "Salvataggio non riuscito, riprova.";
    }
    if (!err && phoneChanged) {
      const r = await setAttendeePhoneAction(token, ref, draftPhone.trim()).catch(
        () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
      );
      if (r.ok) onUpdated({ phone: draftPhone.trim() });
      else err = r.error || "Salvataggio non riuscito, riprova.";
    }
    setBusy(false);
    if (err) setNote(err);
    else setEditing(false);
  };

  const saveAndResend = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setLink(null);
    const nameErr = await saveNameIfChanged();
    if (nameErr) {
      setBusy(false);
      setNote(nameErr);
      return;
    }
    const res = await correctAndResendAction(token, ref, {
      email: draftEmail.trim(),
      phone: draftPhone.trim(),
    }).catch(() => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof correctAndResendAction>>);
    setBusy(false);
    if (!res.ok) {
      setNote(res.error || "Invio non riuscito. Riprova tra un minuto.");
      return;
    }
    setEditing(false);
    onUpdated({ email: draftEmail.trim().toLowerCase(), phone: draftPhone.trim() });
    applySendResult(res, `Email aggiornata a ${draftEmail.trim().toLowerCase()} · nuovo link inviato.`);
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copiato — invialo via WhatsApp o SMS.");
    } catch {
      window.prompt("Copia il link:", link);
    }
  };

  const openEdit = () => {
    setDraftEmail(s.email);
    setDraftPhone(s.phone);
    setDraftName(s.name);
    setEditing(true);
    setNote(null);
  };

  return (
    <div className="edu-actions">
      <div className="edu-contact">
        <span className="edu-contact-line">
          <span className="edu-contact-k">Email:</span> {s.email || <em>nessuna email</em>}
        </span>
        <span className="edu-contact-line">
          <span className="edu-contact-k">Tel:</span> {s.phone || <em>nessun numero</em>}
        </span>
      </div>

      {editing ? (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {/* Only a companion's name is ours to fix — a corsista's name comes
              from Shopify and stays read-only everywhere else in the app. */}
          {isGuest && (
            <input
              type="text"
              className="edu-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Nome e cognome"
              maxLength={120}
            />
          )}
          <input
            type="email"
            inputMode="email"
            className="edu-input"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="email@esempio.it"
          />
          <input
            type="tel"
            inputMode="tel"
            className="edu-input"
            value={draftPhone}
            onChange={(e) => setDraftPhone(e.target.value)}
            placeholder="Telefono"
            maxLength={40}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {state === "attesa" ? (
              <button
                type="button"
                className="edu-btn primary"
                onClick={saveAndResend}
                disabled={busy || !draftEmail.trim() || (isGuest && !draftName.trim())}
              >
                {busy ? "…" : "Salva e rinvia"}
              </button>
            ) : (
              <button
                type="button"
                className="edu-btn primary"
                onClick={saveFree}
                disabled={busy || !draftEmail.trim() || (isGuest && !draftName.trim())}
              >
                {busy ? "…" : "Salva"}
              </button>
            )}
            <button type="button" className="edu-btn" onClick={() => setEditing(false)} disabled={busy}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <>
          {(state === "verificare" || state === "attesa") && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="edu-btn"
                onClick={openEdit}
                disabled={busy}
              >
                {state === "attesa" ? "Correggi e rinvia" : "Correggi"}
              </button>
              <button type="button" className="edu-btn" onClick={copyManualLink} disabled={busy}>
                {busy ? "…" : "Copia link"}
              </button>
              <button
                type="button"
                className="edu-btn primary"
                onClick={send}
                disabled={busy || !s.email}
                title={!s.email ? "Aggiungi un'email per inviare la conferma." : undefined}
              >
                {busy ? "…" : state === "attesa" ? "Reinvia email" : "Invia email"}
              </button>
            </div>
          )}
          {/* Confermato: the data is FINAL — read-only, no actions. */}
          {state === "verificare" && !s.email && (
            <p className="edu-hint">Aggiungi un&apos;email per inviare la conferma.</p>
          )}
          {state === "attesa" && (
            <p className="edu-hint edu-hint--lock">Email e telefono bloccati fino alla conferma dello studente.</p>
          )}
        </>
      )}

      {note && (
        <div role="status" style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6 }}>
          {note}
          {link && (
            <>
              {" "}
              <button type="button" className="edu-linkbtn" onClick={copyLink}>
                Copia link
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
