"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SignalingChannel } from "@/lib/call/signaling";
import { PeerCall } from "@/lib/call/webrtc";
import type {
  EndReason,
  PartnerProfile,
  PeerRole,
  SessionResolution,
} from "@/lib/domain/types";

export type DatePhase =
  | "loading"
  | "media_denied"
  | "connecting"
  | "active"
  | "reconnecting"
  | "partner_gone"
  | "connect_failed"
  | "duplicate_tab"
  | "not_found"
  | "ended";

export interface DateSessionState {
  phase: DatePhase;
  role: PeerRole | null;
  partner: PartnerProfile | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startsAt: string | null;
  endsAt: string | null;
  /** serverNow - clientNow in ms; add to Date.now() for server time. */
  serverOffsetMs: number;
  micOn: boolean;
  camOn: boolean;
  partnerMedia: { mic: boolean; cam: boolean };
  endReason: EndReason | null;
  resolution: SessionResolution | null;
}

const PARTNER_GRACE_MS = 20_000;
const CONNECT_TIMEOUT_MS = 25_000;

/**
 * Everything about one live date: authoritative session state from Postgres,
 * signaling over the private session channel, and the P2P connection.
 * The server row always wins; Realtime only makes it feel instant.
 */
export function useDateSession(sessionId: string) {
  const [state, setState] = useState<DateSessionState>({
    phase: "loading",
    role: null,
    partner: null,
    localStream: null,
    remoteStream: null,
    startsAt: null,
    endsAt: null,
    serverOffsetMs: 0,
    micOn: true,
    camOn: true,
    partnerMedia: { mic: true, cam: true },
    endReason: null,
    resolution: null,
  });

  const signalingRef = useRef<SignalingChannel | null>(null);
  const callRef = useRef<PeerCall | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const endedRef = useRef(false);
  const everConnectedRef = useRef(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((partial: Partial<DateSessionState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const teardown = useCallback(() => {
    if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
    graceTimerRef.current = null;
    connectTimerRef.current = null;
    callRef.current?.close();
    callRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    const signaling = signalingRef.current;
    signalingRef.current = null;
    if (signaling) void signaling.close();
  }, []);

  const handleEnded = useCallback(
    (reason: string, resolution: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      teardown();
      patch({
        phase:
          reason === "connect_failed" || reason === "connect_timeout"
            ? "connect_failed"
            : "ended",
        endReason: reason as EndReason,
        resolution: resolution as SessionResolution,
        localStream: null,
        remoteStream: null,
      });
    },
    [patch, teardown],
  );

  const endSession = useCallback(
    async (reason: "timer" | "left" | "partner_left" | "connect_failed") => {
      if (endedRef.current) return;
      const supabase = supabaseBrowser();
      void signalingRef.current?.send("bye", {
        reason: reason === "left" ? "left" : "ended",
      });
      const { data, error } = await supabase.rpc("end_session", {
        p_session: sessionId,
        p_reason: reason,
      });
      if (!error && data) {
        const result = data as { end_reason: string; resolution: string };
        handleEnded(result.end_reason ?? reason, result.resolution ?? "pending");
      } else if (error && !endedRef.current) {
        // 'too_early' timer races are fine — the broadcast will arrive.
        if (!error.message.includes("too_early")) {
          handleEnded(reason, "pending");
        }
      }
    },
    [handleEnded, sessionId],
  );

  useEffect(() => {
    let cancelled = false;
    endedRef.current = false;
    const supabase = supabaseBrowser();
    const tabId = crypto.randomUUID().slice(0, 8);

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const uid = user.id;

      // 1. Authoritative session row (RLS: participants only).
      const { data: session } = await supabase
        .from("video_sessions")
        .select("id, status, starts_at, ends_at, end_reason, resolution")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (!session) {
        patch({ phase: "not_found" });
        return;
      }
      if (session.status === "ended") {
        endedRef.current = true;
        patch({
          phase: "ended",
          endReason: session.end_reason,
          resolution: session.resolution,
        });
        return;
      }

      const { data: participants } = await supabase
        .from("video_session_participants")
        .select("user_id, role")
        .eq("session_id", sessionId);
      if (cancelled) return;
      const mine = participants?.find((p) => p.user_id === uid);
      const theirs = participants?.find((p) => p.user_id !== uid);
      if (!mine || !theirs) {
        patch({ phase: "not_found" });
        return;
      }
      const role = mine.role as PeerRole;
      patch({ role, startsAt: session.starts_at, endsAt: session.ends_at });

      const { data: partnerData } = await supabase.rpc("get_partner_profile", {
        p_session: sessionId,
      });
      if (cancelled) return;
      if (partnerData) patch({ partner: partnerData as PartnerProfile });

      // 2. Local media. Permission was granted in preflight; this re-acquire
      // is instant. Denial mid-flow still gets a humane screen.
      let localStream: MediaStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        if (!cancelled) patch({ phase: "media_denied" });
        return;
      }
      if (cancelled) {
        localStream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = localStream;
      patch({ localStream, phase: "connecting" });

      // 3. Signaling channel.
      const signaling = new SignalingChannel(supabase, sessionId, uid, tabId);
      signalingRef.current = signaling;

      let partnerPresent = false;
      let sawInitialSync = false;

      signaling
        .on("session_ended", (data) => handleEnded(data.reason, data.resolution))
        .on("session_started", (data) =>
          patch({ startsAt: data.starts_at, endsAt: data.ends_at }),
        )
        .on("peer_hello", () => {
          callRef.current?.kickoff();
          const s = localStreamRef.current;
          if (s) {
            void signaling.send("media_state", {
              mic: s.getAudioTracks()[0]?.enabled ?? true,
              cam: s.getVideoTracks()[0]?.enabled ?? true,
            });
          }
        })
        .on("media_state", (data) => patch({ partnerMedia: data }))
        .on("bye", () => {
          // Partner left deliberately; skip the grace period.
          if (!endedRef.current) void endSession("partner_left");
        })
        .onPresence((peers, joined, left) => {
          if (endedRef.current) return;
          // Duplicate tab: same user present under another tab id that isn't us.
          const otherTabs = peers.filter(
            (p) => p.userId === uid && p.tabId !== tabId,
          );
          if (!sawInitialSync) {
            sawInitialSync = true;
            if (otherTabs.length > 0) {
              patch({ phase: "duplicate_tab" });
              teardown();
              endedRef.current = true; // this tab only; session lives on
              return;
            }
          }

          const partnerHere = peers.some((p) => p.userId === theirs.user_id);
          if (partnerHere && !partnerPresent) {
            partnerPresent = true;
            if (graceTimerRef.current) {
              clearTimeout(graceTimerRef.current);
              graceTimerRef.current = null;
            }
            if (everConnectedRef.current) patch({ phase: "reconnecting" });
            callRef.current?.kickoff();
          } else if (!partnerHere && partnerPresent) {
            partnerPresent = false;
            // 20s grace: timer keeps running, the date is not extended.
            patch({ phase: "partner_gone" });
            graceTimerRef.current = setTimeout(() => {
              if (!endedRef.current) void endSession("partner_left");
            }, PARTNER_GRACE_MS);
          }
          void joined;
          void left;
        });

      const subscribed = await signaling.subscribe();
      if (cancelled) return;
      if (subscribed !== "ok") {
        patch({ phase: "connect_failed" });
        return;
      }

      // 4. Tell the server we're ready; when both are, the clock starts.
      const { data: readyData } = await supabase.rpc("participant_ready", {
        p_session: sessionId,
      });
      if (cancelled) return;
      if (readyData) {
        const ready = readyData as {
          status: string;
          starts_at: string | null;
          ends_at: string | null;
          server_now: string;
        };
        if (ready.status === "ended") {
          handleEnded("stale", "no_match");
          return;
        }
        patch({
          startsAt: ready.starts_at,
          endsAt: ready.ends_at,
          serverOffsetMs: new Date(ready.server_now).getTime() - Date.now(),
        });
      }

      // 5. The P2P connection itself.
      const call = new PeerCall(
        signaling,
        role === "callee", // callee is the polite peer
        localStream,
        {
          remoteStream: (stream) => {
            if (cancelled) return;
            patch({ remoteStream: stream });
          },
          connectionState: (connState) => {
            if (cancelled || endedRef.current) return;
            if (connState === "connected") {
              if (!everConnectedRef.current) {
                everConnectedRef.current = true;
                void supabase.rpc("mark_connected", { p_session: sessionId });
                if (connectTimerRef.current) {
                  clearTimeout(connectTimerRef.current);
                  connectTimerRef.current = null;
                }
              }
              patch({ phase: "active" });
            } else if (connState === "reconnecting") {
              patch({ phase: "reconnecting" });
            }
          },
        },
      );
      callRef.current = call;

      void signaling.send("peer_hello", { tabId });
      void signaling.send("media_state", { mic: true, cam: true });

      // STUN-only reality check: if no path exists, fail fast with a humane
      // "skip & requeue" instead of a black screen.
      connectTimerRef.current = setTimeout(() => {
        if (!everConnectedRef.current && !endedRef.current) {
          void endSession("connect_failed");
        }
      }, CONNECT_TIMEOUT_MS);
    }

    void init();

    const onPageHide = () => {
      void signalingRef.current?.send("bye", { reason: "left" });
      teardown();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    patch({ micOn: track.enabled });
    const cam = localStreamRef.current?.getVideoTracks()[0]?.enabled ?? true;
    void signalingRef.current?.send("media_state", {
      mic: track.enabled,
      cam,
    });
  }, [patch]);

  const toggleCam = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    patch({ camOn: track.enabled });
    const mic = localStreamRef.current?.getAudioTracks()[0]?.enabled ?? true;
    void signalingRef.current?.send("media_state", {
      mic,
      cam: track.enabled,
    });
  }, [patch]);

  const leaveDate = useCallback(() => endSession("left"), [endSession]);
  const timerExpired = useCallback(() => endSession("timer"), [endSession]);

  return { state, toggleMic, toggleCam, leaveDate, timerExpired };
}
