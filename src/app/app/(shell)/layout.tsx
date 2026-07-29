import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out";

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .maybeSingle<{ role: string }>();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-charcoal-900/8 bg-cream-50/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <BrandLockup href="/app/lobby" />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            {[
              { href: "/app/lobby", label: "Lobby" },
              { href: "/app/matches", label: "Matches" },
              { href: "/app/settings", label: "Settings" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium text-charcoal-800 transition-colors hover:bg-blush-100 hover:text-charcoal-900"
              >
                {item.label}
              </Link>
            ))}
            {(profile?.role === "moderator" || profile?.role === "admin") && (
              <Link
                href="/admin"
                className="flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium text-bluebell-700 transition-colors hover:bg-bluebell-500/10"
              >
                Moderation
              </Link>
            )}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        {children}
      </main>
    </div>
  );
}
