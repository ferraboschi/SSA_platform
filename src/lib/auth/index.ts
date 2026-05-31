export {
  NAV_GROUP_ORDER,
  NAV_ITEMS,
  type NavGroupKey,
  type NavItemDef,
} from "./navigation";
export {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  ROLE_VIEWS,
  roleCan,
  navForRole,
  type Capability,
  type RoleView,
  type NavGroup,
} from "./roles";
// `./session` is server-only (it imports the DataSource which reaches into
// Supabase server clients). Import it directly from "@/lib/auth/session" in
// server code. The pure types + sessionFor helper are safe everywhere.
export {
  sessionFor,
  type AuthProvider,
  type Session,
} from "./session-types";
export {
  SessionProvider,
  useSession,
  useCurrentUser,
  useCan,
} from "./context";
