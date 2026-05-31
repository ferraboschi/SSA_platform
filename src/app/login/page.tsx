import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { supabaseConfig } from "@/lib/integrations/config";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Not configured → fall back to the dashboard (in-memory stub auth).
  if (!supabaseConfig.isConfigured) {
    redirect(next ?? "/dashboard");
  }

  // Already signed in → bounce to the target page.
  const sb = await getSupabaseServerClient();
  const { data } = await sb.auth.getUser();
  if (data.user) redirect(next ?? "/dashboard");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--surface-2)",
      }}
    >
      <LoginForm next={next ?? "/dashboard"} />
    </div>
  );
}
