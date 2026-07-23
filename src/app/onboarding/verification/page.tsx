"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import { Button, Card, Spinner } from "@/components/ui";
import { Eyebrow, SwanMark } from "@/components/brand";

/**
 * The $5 verification concept screen. In demo mode the action takes no
 * payment and records only a demo_bypass state — it is never a real verified
 * badge. Real billing/ID verification arrives behind provider interfaces.
 */
export default function VerificationPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onVerify() {
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error: rpcError } = await supabase.rpc("demo_verify");
    if (rpcError) {
      setError("Verification didn't go through. Try again.");
      setBusy(false);
      return;
    }
    router.push("/app/lobby");
    router.refresh();
  }

  return (
    <div>
      <Eyebrow className="text-rose-600">Step 2 of 2</Eyebrow>
      <h1 className="mt-3 font-display text-3xl text-charcoal-900">
        Real people only
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-charcoal-700/80">
        Every Swoon member verifies once for{" "}
        <span className="font-semibold text-charcoal-900">$5</span>. It keeps
        bots, catfish, and bad actors out — so when the timer starts, the
        person on screen is exactly who they say they are.
      </p>

      <Card className="mt-8 overflow-hidden">
        <div className="grain relative bg-gradient-to-br from-blush-100 to-blush-200 px-6 py-8">
          <SwanMark className="absolute -right-6 -top-8 h-36 w-36 text-white/40" />
          <p className="font-display text-5xl text-charcoal-900">
            $5
            <span className="ml-2 align-middle text-base text-charcoal-700/70">
              one-time verification
            </span>
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-charcoal-800">
            {[
              "Confirms you're a real, single human being",
              "Funds live moderation and safety tooling",
              "No subscription — dating on Swoon is free after this",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 text-rose-600">
                  ✓
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-5">
          {publicEnv.NEXT_PUBLIC_DEMO_MODE && (
            <p className="mb-4 rounded-lg bg-bluebell-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-bluebell-700">
              Demo build: no charge is taken and no card is needed. Continuing
              records a demo pass — not a real verification.
            </p>
          )}
          {error && (
            <p role="alert" className="mb-3 text-sm text-danger-600">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={onVerify} disabled={busy}>
            {busy ? (
              <Spinner />
            ) : publicEnv.NEXT_PUBLIC_DEMO_MODE ? (
              "Verify me — continue (demo)"
            ) : (
              "Verify me — $5"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
