import { getDataSource } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import { listStaffInvitesAction, type StaffInviteView } from "@/lib/auth/supabase-actions";
import { AccountClient } from "@/components/account/AccountClient";

export default async function Page() {
  const ds = await getDataSource();
  const [users, session] = await Promise.all([ds.users.list(), getSession()]);

  // Admin-only: the persisted list of staff invites (empty for non-admins).
  let invites: StaffInviteView[] = [];
  if (session.user.roleKey === "admin") {
    try {
      invites = await listStaffInvitesAction();
    } catch {
      invites = [];
    }
  }

  return (
    <AccountClient
      key={session.user.id}
      me={session.user}
      users={users}
      invites={invites}
    />
  );
}
