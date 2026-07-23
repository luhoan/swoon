"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { MatchFoundPayload, QueueResult } from "@/lib/domain/types";

const HEARTBEAT_MS = 10_000;

export type QueueState =
  | { phase: "idle" }
  | { phase: "joining" }
  | { phase: "queued" }
  | { phase: "matched"; sessionId: string }
  | { phase: "error"; message: string };

/**
 * Client side of the matchmaking queue. The user's private Realtime channel
 * delivers match_found instantly; the heartbeat RPC doubles as the fallback,
 * so a dropped broadcast delays a match by at most one heartbeat.
 */
export function useQueue() {
  const [state, setState] = useState<QueueState>({ phase: "idle" });
  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (channelRef.current) {
      supabaseBrowser().removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const join = useCallback(async () => {
    const supabase = supabaseBrowser();
    setState({ phase: "joining" });
    activeRef.current = true;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) {
      setState({ phase: "error", message: "You're signed out. Log in again." });
      return;
    }

    // Subscribe BEFORE joining so a lightning-fast match can't slip past.
    await supabase.realtime.setAuth(session.access_token);
    const channel = supabase
      .channel(`user:${uid}`, { config: { private: true } })
      .on("broadcast", { event: "match_found" }, ({ payload }) => {
        const data = payload as MatchFoundPayload;
        if (activeRef.current) {
          setState({ phase: "matched", sessionId: data.session_id });
        }
      });
    channelRef.current = channel;
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve();
      });
    });
    if (!activeRef.current) return;

    const { data, error } = await supabase.rpc("join_queue");
    if (!activeRef.current) return;
    if (error) {
      cleanup();
      setState({
        phase: "error",
        message: error.message.includes("rate_limited")
          ? "Slow down a little — try again in a few seconds."
          : error.message.includes("onboarding_incomplete")
            ? "Finish your profile before dating."
            : "Couldn't join the queue. Try again.",
      });
      return;
    }

    const result = data as QueueResult;
    if (result.status === "matched" || result.status === "in_session") {
      setState({ phase: "matched", sessionId: result.session_id! });
      return;
    }

    setState({ phase: "queued" });
    heartbeatRef.current = setInterval(async () => {
      if (!activeRef.current) return;
      const { data: hb, error: hbError } = await supabase.rpc("queue_heartbeat");
      if (!activeRef.current || hbError) return;
      const hbResult = hb as QueueResult;
      if (hbResult.status === "matched" && hbResult.session_id) {
        setState({ phase: "matched", sessionId: hbResult.session_id });
      } else if (hbResult.status === "not_queued") {
        // Queue entry evaporated (expiry elsewhere); rejoin quietly.
        await supabase.rpc("join_queue");
      }
    }, HEARTBEAT_MS);
  }, [cleanup]);

  const leave = useCallback(async () => {
    cleanup();
    setState({ phase: "idle" });
    await supabaseBrowser().rpc("leave_queue");
  }, [cleanup]);

  // On unmount: stop heartbeats and, if still waiting, exit the queue so the
  // partner pool stays honest.
  useEffect(() => {
    return () => {
      const wasQueued = activeRef.current;
      cleanup();
      if (wasQueued) {
        void supabaseBrowser().rpc("leave_queue");
      }
    };
  }, [cleanup]);

  return { state, join, leave };
}
