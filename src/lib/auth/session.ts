import "server-only";

// Session layer (server-only). Resolves the current user into a Session
// (user + role + caps) and exposes a swappable AuthProvider seam. The default
// delegates to the configured DataSource; production wires Supabase Auth
// (cookie-based session) by calling setAuthProvider() at bootstrap — no call
// site changes.
//
// Pure types/helpers (Session, AuthProvider, sessionFor) live in
// ./session-types so they're safely importable by client code too.

import type { User } from "@/lib/domain";
import { getDataSource } from "@/lib/data";
import { sessionFor, type AuthProvider, type Session } from "./session-types";

export { sessionFor };
export type { AuthProvider, Session };

class DataSourceAuthProvider implements AuthProvider {
  async getSession(): Promise<Session> {
    const ds = await getDataSource();
    return sessionFor(await ds.users.getCurrent());
  }

  async listUsers(): Promise<User[]> {
    return (await getDataSource()).users.list();
  }

  async switchUser(id: string): Promise<Session> {
    const ds = await getDataSource();
    await ds.users.setCurrent(id);
    return sessionFor(await ds.users.getCurrent());
  }

  async updateProfile(id: string, patch: Partial<User>): Promise<User> {
    return (await getDataSource()).users.updateProfile(id, patch);
  }
}

let provider: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (!provider) provider = new DataSourceAuthProvider();
  return provider;
}

export function setAuthProvider(p: AuthProvider): void {
  provider = p;
}

export function getSession(): Promise<Session> {
  return getAuthProvider().getSession();
}

export function listUsers(): Promise<User[]> {
  return getAuthProvider().listUsers();
}
