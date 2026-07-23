"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  DecisionResolvedPayload,
  PartnerProfile,
  SessionResolution,
} from "@/lib/domain/types";
import { Button, Spinner } from "@/components/ui";
import { SwanMark, Eyebrow } from "@/components/brand";

type Phase =
  | "loading"
  | "deciding"
  | "waiting" // I decided; partner hasn't
  | "no_match"
  | "gone";

/**
 * The private Match-or-Pass moment. Your choice is never revealed — only the
 * combined outcome is. A mutual match routes to the celebration screen.
 */
export default function DecisionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const resolvedRef = useRef(false);

  const goToMatch = useCallback(
    async (matchId: string | null) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      if (matchId) {
        router.replace(`/app/match/${matchId}`);
        return;
      }
      // Broadcast might omit the id; the matches table has it (RLS: member).
      const { data } = await supabaseBrowser()
        .from("matches")
        .select("id")
        .eq("session_id", sessionId)
        .maybeSingle();
      router.replace(data ? `/app/match/${data.id}` : "/app/lobby");
    },
    [router, sessionId],
  );

  const onResolution = useCallback(
    (resolution: SessionResolution, matchId: string | null) => {
      if (resolution === "mutual") {
        void goToMatch(matchId);
      } else if (resolution === "no_match") {
        if (!resolvedRef.current) setPhase("no_match");
      }
    },
    [goToMatch],
  );

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    async function init() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession || cancelled) return;
      const uid = authSession.user.id;

      const { data: session } = await supabase
        .from("video_sessions")
        .select("status, resolution, end_reason")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (!session || session.status !== "ended") {
        setPhase("gone");
        return;
      }
      if (session.resolution === "mutual") {
        void goToMatch(null);
        return;
      }
      if (session.resolution === "no_match") {
        setPhase("no_match");
        return;
      }
      if (!["timer", "left", "partner_left"].includes(session.end_reason ?? "")) {
        setPhase("gone");
        return;
      }

      const { data: partnerData } = await supabase.rpc("get_partner_profile", {
        p_session: sessionId,
      });
      if (cancelled) return;
      if (partnerData) setPartner(partnerData as PartnerProfile);

      const { data: myDecision } = await supabase
        .from("date_decisions")
        .select("choice")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      setPhase(myDecision ? "waiting" : "deciding");

      // Live resolution + lazy timeout polling as fallback.
      await supabase.realtime.setAuth(authSession.access_token);
      channel = supabase
        .channel(`user:${uid}`, { config: { private: true } })
        .on("broadcast", { event: "decision_resolved" }, ({ payload }) => {
          const data = payload as DecisionResolvedPayload;
          if (data.session_id === sessionId) {
            onResolution(data.resolution, data.match_id);
          }
        });
      channel.subscribe();

      poll = setInterval(async () => {
        const { data } = await supabase.rpc("resolve_decisions", {
          p_session: sessionId,
        });
        if (data === "mutual") onResolution("mutual", null);
        if (data === "no_match") onResolution("no_match", null);
      }, 8000);
    }

    void init();
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId, goToMatch, onResolution]);

  async function decide(choice: "match" | "pass") {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("submit_decision", {
      p_session: sessionId,
      p_choice: choice,
    });
    setBusy(false);
    if (error) {
      setPhase("gone");
      return;
    }
    const result = data as { resolution: SessionResolution };
    if (result.resolution === "mutual") {
      void goToMatch(null);
    } else if (result.resolution === "no_match") {
      setPhase("no_match");
    } else {
      setPhase("waiting");
    }
  }

  return (
    <div className="on-dark grain relative flex min-h-dvh flex-col items-center justify-center bg-ink-990 px-6 text-center text-cream-100">
      <SwanMark className="absolute left-1/2 top-10 h-12 w-auto -translate-x-1/2 opacity-80" />

      {phase === "loading" && <Spinner className="h-7 w-7 text-blush-300" />}

      {(phase === "deciding" || phase === "waiting") && partner && (
        <div className="flex max-w-md flex-col items-center">
          <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-blush-300/60">
            {partner.photo_path ? (
              <Image
                src={`/api/photo?scope=session&id=${sessionId}`}
                alt=""
                fill
                sizes="128px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full items-center justify-center bg-charcoal-800 font-display text-4xl text-blush-300">
                {partner.display_name?.[0]}
              </span>
            )}
          </div>
          <Eyebrow className="mt-6 text-blush-300/80">Time&apos;s up</Eyebrow>
          <h1 className="mt-2 font-display text-3xl leading-snug">
            How was your date with {partner.display_name}?
          </h1>

          {phase === "deciding" ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-cream-100/70">
                Your answer stays private. Only a mutual{" "}
                <em className="not-italic text-blush-300">match</em> is ever
                revealed.
              </p>
              <div className="mt-8 flex w-full gap-3">
                <button
                  onClick={() => decide("pass")}
                  disabled={busy}
                  className="flex-1 rounded-full border border-cream-100/25 py-3.5 font-medium text-cream-100/85 transition-colors hover:border-cream-100/60 disabled:opacity-50"
                >
                  Pass
                </button>
                <button
                  onClick={() => decide("match")}
                  disabled={busy}
                  className="flex-1 rounded-full bg-rose-600 py-3.5 font-medium text-cream-50 shadow-float transition-transform hover:scale-[1.02] disabled:opacity-50"
                >
                  Match ♥
                </button>
              </div>
            </>
          ) : (
            <div className="mt-8 flex flex-col items-center gap-3">
              <Spinner className="h-5 w-5 text-blush-300" />
              <p className="text-sm text-cream-100/70">
                Answer locked in. Waiting for {partner.display_name}…
              </p>
            </div>
          )}
        </div>
      )}

      {phase === "no_match" && (
        <div className="flex max-w-md flex-col items-center">
          <h1 className="font-display text-3xl">Not this time</h1>
          <p className="mt-3 text-sm leading-relaxed text-cream-100/70">
            No match on this one — and no hard feelings. The next
            three-minute date could be the one.
          </p>
          <Button className="mt-8" onClick={() => router.replace("/app/preflight")}>
            Find another date
          </Button>
          <Button
            variant="ghost"
            className="mt-2 text-cream-100/70 hover:bg-white/10 hover:text-cream-100"
            onClick={() => router.replace("/app/lobby")}
          >
            Back to lobby
          </Button>
        </div>
      )}

      {phase === "gone" && (
        <div className="flex max-w-md flex-col items-center">
          <h1 className="font-display text-3xl">That date has wrapped up</h1>
          <Button className="mt-8" onClick={() => router.replace("/app/lobby")}>
            Back to lobby
          </Button>
        </div>
      )}
    </div>
  );
}
