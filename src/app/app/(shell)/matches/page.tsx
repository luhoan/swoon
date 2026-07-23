import Link from "next/link";
import Image from "next/image";
import { supabaseServer } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/brand";
import type { MatchSummary } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("get_my_matches");
  const matches = (data ?? []) as MatchSummary[];

  return (
    <div className="mx-auto max-w-2xl">
      <Eyebrow className="text-rose-600">Mutual matches</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-charcoal-900">
        Your swoons
      </h1>

      {matches.length === 0 ? (
        <div className="mt-10 rounded-[--radius-soft] border border-dashed border-charcoal-900/15 p-10 text-center">
          <p className="font-display text-xl text-charcoal-900">
            No matches yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-charcoal-700/70">
            When you and a date both choose match, they land here and the
            conversation keeps going.
          </p>
          <Link
            href="/app/preflight"
            className="mt-6 inline-block rounded-full bg-rose-600 px-7 py-3 text-sm font-medium text-cream-50 shadow-lift transition-transform hover:scale-[1.02]"
          >
            Start dating
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-charcoal-900/6">
          {matches.map((m) => (
            <li key={m.match_id}>
              <Link
                href={`/app/chat/${m.match_id}`}
                className="group flex items-center gap-4 py-4 transition-colors hover:bg-blush-100/50"
              >
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-blush-300">
                  {m.partner.photo_path ? (
                    <Image
                      src={`/api/photo?scope=match&id=${m.match_id}`}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center bg-blush-100 font-display text-xl text-rose-500">
                      {m.partner.display_name?.[0] ?? "?"}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-charcoal-900">
                      {m.partner.display_name}, {m.partner.age}
                    </span>
                    <span className="shrink-0 text-xs text-charcoal-700/50">
                      {new Date(m.last_activity).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-charcoal-700/70">
                    {m.last_message
                      ? m.last_message.body
                      : `You matched — say hello to ${m.partner.display_name}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
