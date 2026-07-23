import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { MyProfile } from "@/lib/domain/types";

/**
 * Guard for everything under /app: requires a session and finished
 * onboarding. Visual chrome lives in the (shell) group so full-bleed screens
 * (date, decision, match) can opt out.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .maybeSingle<MyProfile>();

  if (!profile?.onboarding_complete) redirect("/onboarding/profile");
  if (profile.verification_status === "none")
    redirect("/onboarding/verification");

  return <>{children}</>;
}
