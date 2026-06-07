"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import {
  savePushSubscriptionAction,
  removePushSubscriptionAction,
} from "@/lib/push/actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

/** Lets a user opt into push notifications on this device. Groundwork: needs the
 *  VAPID public key in env to be functional; degrades gracefully otherwise. */
export function EnablePushButton() {
  const [state, setState] = useState<State>("loading");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        setState("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  const enable = () =>
    start(async () => {
      setMsg(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState("denied");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
        });
        const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        const r = await savePushSubscriptionAction({
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
          ua: navigator.userAgent,
        });
        if (r.ok) {
          setState("on");
          setMsg("Notifiche attivate su questo dispositivo ✓");
        } else setMsg(r.error || "Errore");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Attivazione non riuscita.");
      }
    });

  const disable = () =>
    start(async () => {
      setMsg(null);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscriptionAction(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
        setMsg("Notifiche disattivate su questo dispositivo.");
      } catch {
        setMsg("Impossibile disattivare.");
      }
    });

  if (state === "loading") return null;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {state === "unsupported" && (
        <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          Le notifiche push non sono supportate da questo browser. Su iPhone:
          installa prima l’app (Aggiungi a Home), poi riapri da lì.
        </span>
      )}
      {state === "unconfigured" && (
        <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          Notifiche push non ancora configurate (manca la chiave VAPID lato
          server).
        </span>
      )}
      {state === "denied" && (
        <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          Permesso notifiche negato. Riattivalo dalle impostazioni del browser
          per questo sito.
        </span>
      )}
      {state === "off" && (
        <button className="btn" disabled={pending} onClick={enable} style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content" }}>
          <Icon name="bell" size={13} />
          {pending ? "Attivo…" : "Attiva notifiche"}
        </button>
      )}
      {state === "on" && (
        <button className="btn btn-ghost" disabled={pending} onClick={disable} style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content" }}>
          <Icon name="check" size={13} />
          Notifiche attive — disattiva
        </button>
      )}
      {msg && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{msg}</span>}
    </div>
  );
}
