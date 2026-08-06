import { redirect } from "next/navigation";
import { BrandLockup, Eyebrow, SwanMark } from "@/components/brand";
import { Card } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out";
import { supabaseServer } from "@/lib/supabase/server";
import type { AppealSummary } from "@/lib/domain/types";
import { AppealForm } from "./appeal-form";

export const dynamic = "force-dynamic";

export default async function AppealPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, account_status")
    .maybeSingle<{
      display_name: string | null;
      account_status: "active" | "quarantined" | "suspended" | "banned";
    }>();

  if (
    !profile ||
    profile.account_status === "active" ||
    profile.account_status === "quarantined"
  ) {
    redirect("/app/lobby");
  }

  const { data } = await supabase.rpc("get_my_account_appeals");
  const appeals = (data ?? []) as AppealSummary[];
  const openAppeal = appeals.find((appeal) => appeal.status === "open");
  const latestAppeal = appeals[0];
  const cooldownUntil =
    latestAppeal?.status === "upheld" && latestAppeal.reviewed_at
      ? new Date(new Date(latestAppeal.reviewed_at).getTime() + 7 * 86_400_000)
      : null;
  const inCooldown = Boolean(cooldownUntil && cooldownUntil > new Date());
  const restrictionLabel =
    profile.account_status === "banned" ? "banned" : "suspended";

  return (
    <div className="relative min-h-dvh overflow-hidden bg-cream-50">
      <SwanMark className="pointer-events-none absolute -right-24 top-20 h-[28rem] w-auto rotate-6 text-blush-300 opacity-25" />
      <header className="relative border-b border-charcoal-900/8 bg-white/55 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <BrandLockup href="/" />
          <SignOutButton className="inline-flex min-h-11 items-center rounded-full border border-charcoal-900/20 px-4 text-sm font-medium text-charcoal-800 transition-colors hover:border-rose-600 hover:text-rose-700" />
        </div>
      </header>

      <main className="relative mx-auto grid w-full max-w-5xl gap-8 px-5 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:py-20">
        <section>
          <Eyebrow className="text-bluebell-700">Account review</Eyebrow>
          <h1 className="mt-3 max-w-xl font-display text-4xl leading-tight text-charcoal-900 sm:text-5xl">
            Your account is restricted
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-charcoal-700/80">
            {profile.display_name ? `${profile.display_name}, your` : "Your"} account
            has been {restrictionLabel}. You can&apos;t use Swoon while this
            restriction is active, but you can ask our safety team to review
            the decision.
          </p>
          <div className="mt-7 border-l-2 border-bluebell-500/30 pl-4 text-xs leading-relaxed text-charcoal-700/65">
            <p className="font-medium uppercase tracking-[0.14em] text-bluebell-700">
              Review path
            </p>
            <p className="mt-2">Your statement → human review → decision</p>
          </div>
        </section>

        <Card className="p-6 sm:p-8">
          {openAppeal ? (
            <>
              <Eyebrow className="text-success-600">Submitted</Eyebrow>
              <h2 className="mt-2 font-display text-3xl text-charcoal-900">
                Appeal received
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-charcoal-700/80">
                A human reviewer will take another look. Your account remains
                {` ${restrictionLabel}`} while the appeal is open.
              </p>
              <blockquote className="mt-5 rounded-2xl bg-bluebell-500/8 p-4 text-sm leading-relaxed text-charcoal-800">
                {openAppeal.statement}
              </blockquote>
              <p className="mt-3 text-xs text-charcoal-700/60">
                Submitted {new Date(openAppeal.created_at).toLocaleString()}
              </p>
            </>
          ) : inCooldown && cooldownUntil ? (
            <>
              <Eyebrow className="text-danger-600">Decision made</Eyebrow>
              <h2 className="mt-2 font-display text-3xl text-charcoal-900">
                Restriction upheld
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-charcoal-700/80">
                The reviewer kept the restriction in place. You may submit a
                new appeal after {cooldownUntil.toLocaleDateString()}.
              </p>
            </>
          ) : (
            <>
              <Eyebrow className="text-rose-600">Your statement</Eyebrow>
              <h2 className="mt-2 font-display text-3xl text-charcoal-900">
                Ask us to take another look
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-charcoal-700/80">
                Be specific about what you think was missed or misunderstood.
                Submitting an appeal does not lift the restriction immediately.
              </p>
              <AppealForm />
            </>
          )}

          <p className="mt-7 border-t border-charcoal-900/8 pt-5 text-xs leading-relaxed text-charcoal-700/60">
            Trouble accessing this form? Email{" "}
            <a className="underline" href="mailto:info@tryswoon.live">
              info@tryswoon.live
            </a>
            .
          </p>
        </Card>
      </main>
    </div>
  );
}
