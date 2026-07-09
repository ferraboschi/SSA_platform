// Runs once per server instance, before it starts serving requests.
// Boots the in-app sync scheduler (the platform's "cron"): production Node
// runtime only, so `next dev` sessions and edge bundles never tick against
// the live store.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  const { startSyncScheduler } = await import("@/lib/sync/scheduler");
  startSyncScheduler();
}
