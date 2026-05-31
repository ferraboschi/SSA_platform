import { getDataSource } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import { AccountClient } from "@/components/account/AccountClient";

export default async function Page() {
  const ds = await getDataSource();
  const [users, session] = await Promise.all([ds.users.list(), getSession()]);
  return <AccountClient key={session.user.id} me={session.user} users={users} />;
}
