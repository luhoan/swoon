"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDateSession } from "@/lib/session/use-date-session";
import { useCountdown } from "@/lib/session/use-countdown";
import { ReportDialog } from "@/components/report-dialog";
import { Button, Spinner } from "@/components/ui";
import { SwanMark } from "@/components/brand";

function MediaButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!active}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-white/12 text-cream-100 hover:bg-white/20"
          : "bg-danger-600 text-cream-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function DatePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const { state, toggleMic, toggleCam, leaveDate, timerExpired } =
    useDateSession(sessionId);
  const [reportOpen, setReportOpen] = useState(false);

  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);

  const { display, totalSeconds } = useCountdown(
    state.endsAt,
    state.serverOffsetMs,
    timerExpired,
  );

  useEffect(() => {
    if (remoteRef.current && state.remoteStream) {
      remoteRef.current.srcObject = state.remoteStream;
    }
  }, [state.remoteStream]);
  useEffect(() => {
    if (localRef.current && state.localStream) {
      localRef.current.srcObject = state.localStream;
    }
  }, [state.localStream]);

  // Route away when the date is over.
  useEffect(() => {
    if (state.phase === "ended") {
      const decisionOpen =
        state.resolution === "pending" &&
        state.endReason !== null &&
        ["timer", "left", "partner_left"].includes(state.endReason);
      router.replace(
        decisionOpen ? `/app/decision/${sessionId}` : "/app/lobby",
      );
    }
    if (state.phase === "not_found") {
      router.replace("/app/lobby");
    }
  }, [state.phase, state.resolution, state.endReason, router, sessionId]);

  const urgent = totalSeconds !== null && totalSeconds <= 15;

  return (
    // Locked to the viewport: a date must never scroll, whatever resolution
    // or orientation the two cameras happen to produce.
    <div className="on-dark flex h-dvh flex-col overflow-hidden bg-ink-990 text-cream-100">
      {/* Top bar: brand, timer, report */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-5 py-4">
        <SwanMark className="h-8 w-auto" />
        <div className="absolute left-1/2 top-4 -translate-x-1/2 text-center">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.3em] text-cream-100/60">
            Speed date
          </p>
          <p
            aria-live="polite"
            className={`font-display text-3xl tabular-nums ${
              urgent ? "animate-pulse-heart text-blush-300" : "text-cream-100"
            }`}
          >
            {display}
          </p>
        </div>
        {state.partner && (
          <button
            onClick={() => setReportOpen(true)}
            className="rounded-full border border-cream-100/25 px-4 py-1.5 text-xs font-medium text-cream-100/80 transition-colors hover:border-danger-600 hover:text-danger-600"
          >
            Report
          </button>
        )}
      </header>

      {/* Stage */}
      <main className="relative min-h-0 flex-1 px-4 pb-24 sm:px-6">
        <div className="relative mx-auto h-full max-w-5xl overflow-hidden rounded-[--radius-soft] bg-ink-950">
          {/* Absolute fill so the element size comes from the stage, never
              from the camera's intrinsic resolution; contain keeps the whole
              person in frame instead of cropping them. */}
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />

          {/* Remote overlays */}
          {state.partner && (
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-ink-990/70 px-3.5 py-1.5 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-success-600" aria-hidden />
              <span className="text-sm font-medium">
                {state.partner.display_name}, {state.partner.age}
              </span>
              <span className="text-xs text-cream-100/60">
                {state.partner.city}
              </span>
            </div>
          )}
          {!state.partnerMedia.mic && state.phase === "active" && (
            <div className="absolute right-4 top-4 rounded-full bg-ink-990/70 px-3 py-1.5 text-xs text-cream-100/80 backdrop-blur">
              Muted
            </div>
          )}

          {/* Connection states over the stage */}
          {(state.phase === "loading" || state.phase === "connecting") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-990/85">
              <SwanMark className="h-16 w-auto animate-pulse-heart" />
              <p className="font-display text-xl">
                {state.partner
                  ? `Connecting you with ${state.partner.display_name}…`
                  : "Setting up your date…"}
              </p>
              <Spinner className="h-5 w-5 text-blush-300" />
            </div>
          )}
          {(state.phase === "reconnecting" || state.phase === "partner_gone") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-990/80 backdrop-blur-sm">
              <Spinner className="h-6 w-6 text-blush-300" />
              <p className="font-display text-xl">
                {state.phase === "partner_gone"
                  ? `Waiting for ${state.partner?.display_name ?? "your date"} to come back…`
                  : "Reconnecting…"}
              </p>
              <p className="text-xs text-cream-100/60">
                The clock keeps running — hang tight a moment.
              </p>
            </div>
          )}
          {state.phase === "media_denied" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-990/90 px-8 text-center">
              <p className="max-w-sm text-sm leading-relaxed text-cream-100/85">
                Your camera or microphone got blocked. Re-allow access in the
                address bar, then reload this page — the date is still yours
                while the timer runs.
              </p>
              <Button variant="outline" className="border-cream-100/40 text-cream-100" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </div>
          )}
          {state.phase === "connect_failed" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-990/90 px-8 text-center">
              <SwanMark className="h-14 w-auto opacity-50" />
              <p className="font-display text-2xl">We couldn&apos;t connect you</p>
              <p className="max-w-sm text-sm leading-relaxed text-cream-100/70">
                Some networks block direct video. Neither of you did anything
                wrong — let&apos;s find you a new date.
              </p>
              <Button onClick={() => router.replace("/app/preflight")}>
                Back to the queue
              </Button>
            </div>
          )}
          {state.phase === "duplicate_tab" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-990/90 px-8 text-center">
              <p className="font-display text-2xl">
                This date is open in another tab
              </p>
              <p className="max-w-sm text-sm text-cream-100/70">
                Switch back to the original tab to keep dating.
              </p>
              <Button variant="outline" className="border-cream-100/40 text-cream-100" onClick={() => router.replace("/app/lobby")}>
                Go to lobby
              </Button>
            </div>
          )}

          {/* Local PiP */}
          {state.localStream && (
            <div className="absolute bottom-4 right-4 w-32 overflow-hidden rounded-xl border border-cream-100/20 shadow-float sm:w-44">
              <video
                ref={localRef}
                autoPlay
                playsInline
                muted
                // 16:9 matches how most webcams actually frame you, so the
                // self-view isn't cropped down to a sliver.
                className={`aspect-video w-full -scale-x-100 object-cover ${
                  state.camOn ? "" : "opacity-0"
                }`}
              />
              {!state.camOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-ink-950 text-xs text-cream-100/60">
                  Camera off
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Controls */}
      <footer className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-center gap-4 pb-6 pt-3">
        <MediaButton onClick={toggleMic} active={state.micOn} label={state.micOn ? "Mute microphone" : "Unmute microphone"}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
          </svg>
        </MediaButton>

        <button
          onClick={() => void leaveDate()}
          className="flex h-14 items-center gap-2 rounded-full bg-danger-600 px-7 font-medium text-cream-50 shadow-float transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Leave date
        </button>

        <MediaButton onClick={toggleCam} active={state.camOn} label={state.camOn ? "Turn camera off" : "Turn camera on"}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M4 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5l4 3v-9l-4 3V8a2 2 0 0 0-2-2H4Z" />
          </svg>
        </MediaButton>
      </footer>

      {state.partner && (
        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          reportedUserId={state.partner.user_id}
          sessionId={sessionId}
          displayName={state.partner.display_name}
        />
      )}
    </div>
  );
}
