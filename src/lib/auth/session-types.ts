// Pure type & helper module — safe to import from BOTH client and server code.
// Separated from session.ts so the heavyweight provider stays server-only.

import { ROLE_META, type RoleMeta, type User } from "@/lib/domain";
import { ROLE_CAPABILITIES, type Capability } from "./roles";

export interface Session {
  user: User;
  role: RoleMeta;
  capabilities: Capability[];
}

export interface AuthProvider {
  getSession(): Promise<Session>;
  listUsers(): Promise<User[]>;
  switchUser(id: string): Promise<Session>;
  updateProfile(id: string, patch: Partial<User>): Promise<User>;
}

export function sessionFor(user: User): Session {
  return {
    user,
    role: ROLE_META[user.roleKey],
    capabilities: ROLE_CAPABILITIES[user.roleKey],
  };
}
