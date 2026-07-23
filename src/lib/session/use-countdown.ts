"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Skew-corrected countdown. remaining = endsAt - (now + serverOffset).
 * Fires onExpire exactly once when it crosses zero.
 */
export function useCountdown(
  endsAt: string | null,
  serverOffsetMs: number,
  onExpire?: () => void,
) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    firedRef.current = false;
    if (!endsAt) {
      setRemainingMs(null);
      return;
    }
    const target = new Date(endsAt).getTime();
    const tick = () => {
      const remaining = target - (Date.now() + serverOffsetMs);
      setRemainingMs(Math.max(0, remaining));
      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [endsAt, serverOffsetMs]);

  const totalSeconds =
    remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const display =
    totalSeconds === null
      ? "–:––"
      : `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;

  return { remainingMs, totalSeconds, display };
}
