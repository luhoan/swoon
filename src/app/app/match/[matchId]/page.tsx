"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { MatchSummary } from "@/lib/domain/types";
import { SwanMark } from "@/components/brand";

/** The "It's a Swoon!" celebration — dark, script type, paired portraits. */
export default function MatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const router = useRouter();
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [myPhotoUrl, setMyPhotoUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;
    async function load() {
      const { data } = await supabase.rpc("get_my_matches");
      if (cancelled) return;
      const found = (data as MatchSummary[] | null)?.find(
        (m) => m.match_id === matchId,
      );
      if (!found) {
        setMissing(true);
        return;
      }
      setMatch(found);

      const { data: profile } = await supabase
        .from("profiles")
        .select("photo_path")
        .maybeSingle();
      if (cancelled || !profile?.photo_path) return;
      // Own photo: the storage RLS lets owners sign their own objects.
      const { data: signed } = await supabase.storage
        .from("profile-photos")
        .createSignedUrl(profile.photo_path, 300);
      if (!cancelled && signed) setMyPhotoUrl(signed.signedUrl);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  useEffect(() => {
    if (missing) router.replace("/app/lobby");
  }, [missing, router]);

  return (
    <div className="on-dark grain relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink-990 px-6 text-center text-cream-100">
      {/* soft blush glow behind the moment */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-600/15 blur-3xl"
      />

      <div className="relative flex flex-col items-center">
        <p className="text-sm uppercase tracking-[0.35em] text-cream-100/60">
          It&apos;s a
        </p>
        <p className="font-script text-7xl leading-tight text-blush-300 sm:text-8xl">
          Swoon!
        </p>

        <div className="mt-8 flex items-center">
          <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-blush-300 sm:h-32 sm:w-32">
            {myPhotoUrl ? (
              <Image src={myPhotoUrl} alt="You" fill sizes="128px" className="object-cover" unoptimized />
            ) : (
              <span className="flex h-full items-center justify-center bg-charcoal-800 font-display text-3xl text-blush-300">
                You
              </span>
            )}
          </div>
          <SwanMark className="z-10 -mx-4 h-14 w-auto animate-pulse-heart drop-shadow-[0_0_12px_rgba(217,132,143,0.5)]" />
          <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-blush-300 sm:h-32 sm:w-32">
            {match?.partner.photo_path ? (
              <Image
                src={`/api/photo?scope=match&id=${matchId}`}
                alt={match.partner.display_name}
                fill
                sizes="128px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full items-center justify-center bg-charcoal-800 font-display text-3xl text-blush-300">
                {match?.partner.display_name?.[0] ?? "♥"}
              </span>
            )}
          </div>
        </div>

        {match && (
          <>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-cream-100/75">
              You and {match.partner.display_name} both said match. The
              conversation doesn&apos;t have to stop at three minutes.
            </p>
            <Link
              href={`/app/chat/${matchId}`}
              className="mt-8 rounded-full bg-rose-600 px-10 py-3.5 font-medium text-cream-50 shadow-float transition-transform hover:scale-[1.03]"
            >
              Send a message
            </Link>
            <Link
              href="/app/preflight"
              className="mt-3 rounded-full px-6 py-2.5 text-sm text-cream-100/70 transition-colors hover:text-cream-100"
            >
              Keep dating
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
