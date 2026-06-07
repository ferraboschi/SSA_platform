"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** "Installa l'app" entry point. On Chrome/Android shows a one-tap install; on
 *  iOS (no native prompt) shows the Aggiungi-a-Home instructions. Renders nothing
 *  once installed. */
export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const ios = isIos();

  const click = async () => {
    if (ios) {
      setShowIosHelp((v) => !v);
      return;
    }
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      setDeferred(null);
    }
  };

  // Nothing to offer (desktop browser without prompt, not iOS): hide.
  if (!ios && !deferred) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button className="btn" onClick={click} style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content" }}>
        <Icon name="download" size={13} />
        Installa l’app
      </button>
      {ios && showIosHelp && (
        <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.5, maxWidth: 380 }}>
          Su iPhone/iPad: apri questa pagina in <b>Safari</b>, tocca il pulsante
          <b> Condividi</b> (il quadrato con la freccia) e scegli{" "}
          <b>«Aggiungi a Home»</b>. L’app comparirà come icona, e potrai ricevere
          le notifiche.
        </div>
      )}
    </div>
  );
}
