"use client";

// Client-side session context. Hydrated once from the server session, then used
// by the shell for the current user, capability checks, and the user switch.

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Capability } from "./roles";
import type { Session } from "./session";
import { switchUserAction } from "./actions";

interface SessionContextValue {
  session: Session;
  can: (cap: Capability) => boolean;
  switchUser: (id: string) => void;
  switching: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const router = useRouter();
  const [switching, startTransition] = useTransition();

  const value: SessionContextValue = {
    session,
    can: (cap) => session.capabilities.includes(cap),
    switchUser: (id) =>
      startTransition(async () => {
        await switchUserAction(id);
        router.refresh();
      }),
    switching,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}

export function useCurrentUser() {
  return useSession().session.user;
}

export function useCan() {
  return useSession().can;
}
