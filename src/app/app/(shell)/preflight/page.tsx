"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueue } from "@/lib/queue/use-queue";
import { Button, Spinner } from "@/components/ui";
import { Eyebrow, SwanMark } from "@/components/brand";

type MediaPhase =
  | { status: "asking" }
  | { status: "ready"; stream: MediaStream }
  | { status: "denied" }
  | { status: "failed"; message: string };

/**
 * Camera check + queue. Nobody enters the queue without working media —
 * an empty black rectangle is a bad first date.
 */
export default function PreflightPage() {
  const router = useRouter();
  const [media, setMedia] = useState<MediaPhase>({ status: "asking" });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { state: queue, join, leave } = useQueue();

  const acquire = useCallback(async () => {
    setMedia({ status: "asking" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setMedia({ status: "ready", stream });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setMedia({ status: "denied" });
      } else {
        setMedia({
          status: "failed",
          message:
            "We couldn't reach your camera or microphone. Close other apps that might be using them and try again.",
        });
      }
    }
  }, []);

  useEffect(() => {
    void acquire();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [acquire]);

  useEffect(() => {
    if (media.status === "ready" && videoRef.current) {
      videoRef.current.srcObject = media.stream;
    }
  }, [media]);

  // Matched: release the preview camera (the date screen re-acquires it) and go.
  useEffect(() => {
    if (queue.phase === "matched") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      router.push(`/app/date/${queue.sessionId}`);
    }
  }, [queue, router]);

  const searching = queue.phase === "joining" || queue.phase === "queued";

  return (
    <div className="mx-auto max-w-2xl">
      <Eyebrow className="text-rose-600">Before your date</Eyebrow>
      <h1 className="mt-2 font-display text-3xl text-charcoal-900">
        {searching ? "Finding your date…" : "Quick camera check"}
      </h1>

      <div className="relative mt-6 overflow-hidden rounded-[--radius-soft] bg-ink-950 shadow-float">
        <div className="relative aspect-video">
          {media.status === "ready" && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full -scale-x-100 object-cover"
            />
          )}
          {media.status === "asking" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-cream-100/80">
              <Spinner className="h-6 w-6" />
              <p className="text-sm">Waiting for camera permission…</p>
            </div>
          )}
          {media.status === "denied" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-cream-100/90">
              <p className="text-sm leading-relaxed">
                Swoon needs your camera and microphone for live dates. Allow
                access in your browser&apos;s address bar, then try again.
              </p>
              <Button variant="outline" size="sm" onClick={acquire} className="border-cream-100/40 text-cream-100 hover:border-blush-300 hover:text-blush-300">
                Try again
              </Button>
            </div>
          )}
          {media.status === "failed" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-cream-100/90">
              <p className="text-sm leading-relaxed">{media.message}</p>
              <Button variant="outline" size="sm" onClick={acquire} className="border-cream-100/40 text-cream-100 hover:border-blush-300 hover:text-blush-300">
                Try again
              </Button>
            </div>
          )}

          {/* Searching overlay: swan drifts over the preview while we pair. */}
          {searching && media.status === "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-950/70 backdrop-blur-[2px]">
              <SwanMark className="h-16 w-auto animate-pulse-heart" />
              <p className="font-display text-xl text-cream-100">
                Finding your date…
              </p>
              <p className="max-w-xs text-center text-xs leading-relaxed text-cream-100/70">
                You&apos;ll be connected the moment someone&apos;s ready.
                Three minutes on the clock, then you both decide.
              </p>
            </div>
          )}
        </div>
      </div>

      {queue.phase === "error" && (
        <p role="alert" className="mt-4 text-sm text-danger-600">
          {queue.message}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        {!searching ? (
          <Button
            size="lg"
            disabled={media.status !== "ready"}
            onClick={() => void join()}
          >
            Start dating
          </Button>
        ) : (
          <Button size="lg" variant="outline" onClick={() => void leave()}>
            Cancel search
          </Button>
        )}
        <Button variant="ghost" onClick={() => router.push("/app/lobby")}>
          Back to lobby
        </Button>
      </div>

      <ul className="mt-8 space-y-2 border-t border-charcoal-900/8 pt-6 text-xs leading-relaxed text-charcoal-700/70">
        <li>Be kind — you&apos;re on camera with a real person.</li>
        <li>
          Keep it clothed and legal. Nudity or harassment ends your Swoon
          account.
        </li>
        <li>
          <strong>Leave</strong> and <strong>Report</strong> are one tap away
          for the whole date.
        </li>
      </ul>
    </div>
  );
}
