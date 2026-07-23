import Link from "next/link";
import Image from "next/image";
import { supabaseServer } from "@/lib/supabase/server";
import { Eyebrow, SwanMark } from "@/components/brand";
import type { MatchSummary, MyProfile } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const supabase = await supabaseServer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .maybeSingle<MyProfile>();
  const { data: matchesData } = await supabase.rpc("get_my_matches");
  const matches = (matchesData ?? []) as MatchSummary[];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const quarantined = profile?.account_status === "quarantined";

  return (
    <div className="mx-auto max-w-3xl">
      <Eyebrow className="text-rose-600">The lobby</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-charcoal-900">
        {greeting}, {profile?.display_name ?? "you"}.
      </h1>

      {quarantined ? (
        <div className="mt-8 rounded-[--radius-soft] border border-bluebell-500/30 bg-bluebell-500/8 p-6 text-sm leading-relaxed text-charcoal-800">
          <p className="font-medium text-charcoal-900">
            Your account is being reviewed
          </p>
          <p className="mt-1.5">
            Dating is paused while our team looks into a report. Your matches
            and chats still work. If you think this is a mistake, contact{" "}
            <a className="underline" href="mailto:safety@tryswoon.live">
              safety@tryswoon.live
            </a>
            .
          </p>
        </div>
      ) : (
        <Link
          href="/app/preflight"
          className="grain group relative mt-8 block overflow-hidden rounded-[--radius-soft] bg-gradient-to-br from-blush-200 via-blush-300 to-blush-400 p-8 shadow-float transition-transform hover:-translate-y-0.5 sm:p-10"
        >
          <SwanMark className="absolute -right-8 -top-10 h-48 w-48 text-white/30 transition-transform duration-500 group-hover:rotate-6" />
          <p className="max-w-xs font-display text-3xl leading-snug text-charcoal-900">
            Ready for a three-minute date?
          </p>
          <p className="mt-3 max-w-sm text-sm text-charcoal-800/80">
            We&apos;ll check your camera, then find someone new. When the timer
            runs out, you both choose — match or pass.
          </p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-charcoal-900 px-6 py-3 text-sm font-medium text-cream-100 transition-colors group-hover:bg-charcoal-800">
            Start dating
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </Link>
      )}

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl text-charcoal-900">
            Your swoons
          </h2>
          {matches.length > 0 && (
            <Link
              href="/app/matches"
              className="text-sm font-medium text-rose-700 underline-offset-2 hover:underline"
            >
              See all
            </Link>
          )}
        </div>

        {matches.length === 0 ? (
          <p className="mt-4 max-w-md text-sm leading-relaxed text-charcoal-700/70">
            No mutual matches yet. When you and a date both choose{" "}
            <em className="font-medium not-italic text-rose-700">match</em>,
            they&apos;ll appear here and chat opens up.
          </p>
        ) : (
          <ul className="mt-5 flex gap-4 overflow-x-auto pb-2">
            {matches.slice(0, 8).map((m) => (
              <li key={m.match_id} className="shrink-0">
                <Link
                  href={`/app/chat/${m.match_id}`}
                  className="group flex w-24 flex-col items-center gap-2"
                >
                  <span className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-blush-300 transition-colors group-hover:border-rose-500">
                    {m.partner.photo_path ? (
                      <Image
                        src={`/api/photo?scope=match&id=${m.match_id}`}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center bg-blush-100 font-display text-2xl text-rose-500">
                        {m.partner.display_name?.[0] ?? "?"}
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate text-xs font-medium text-charcoal-800">
                    {m.partner.display_name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-14 border-t border-charcoal-900/8 pt-6 text-xs leading-relaxed text-charcoal-700/60">
        Every date has one-tap <strong>Leave</strong> and{" "}
        <strong>Report</strong>. Dates are never recorded. Read how we keep
        Swoon safe on the{" "}
        <Link href="/safety" className="underline">
          safety page
        </Link>
        .
      </p>
    </div>
  );
}
