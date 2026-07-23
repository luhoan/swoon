import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";

/**
 * Server-side moderator gate. The role lives in the database and is checked
 * on every admin request — never trusted from the client.
 */
export async function requireModerator(): Promise<{
  userId: string;
  role: "moderator" | "admin";
}> {
  if (!serverEnv().ADMIN_TOOLS_ENABLED) redirect("/app/lobby");

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .maybeSingle<{ role: string }>();

  if (profile?.role !== "moderator" && profile?.role !== "admin") {
    redirect("/app/lobby");
  }
  return { userId: user.id, role: profile.role as "moderator" | "admin" };
}
