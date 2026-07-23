"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { REPORT_CATEGORIES, type ReportCategory } from "@/lib/domain/types";
import { Button, Spinner } from "@/components/ui";

export function ReportDialog({
  open,
  onClose,
  reportedUserId,
  sessionId,
  displayName,
}: {
  open: boolean;
  onClose: (submitted: boolean) => void;
  reportedUserId: string;
  sessionId?: string;
  displayName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [narrative, setNarrative] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setCategory(null);
      setNarrative("");
      setError(null);
      setDone(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function submit() {
    if (!category) {
      setError("Choose what happened");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabaseBrowser().rpc("create_report", {
      p_reported: reportedUserId,
      p_session: sessionId ?? null,
      p_category: category,
      p_narrative: narrative.trim() || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(
        rpcError.message.includes("rate_limited")
          ? "You've sent several reports recently — this one couldn't be added."
          : "The report didn't go through. Try again.",
      );
      return;
    }
    setDone(true);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={() => onClose(done)}
      className="m-auto w-[min(92vw,26rem)] rounded-[--radius-soft] bg-cream-50 p-0 text-charcoal-900 shadow-float backdrop:bg-ink-990/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        {done ? (
          <div>
            <h2 className="font-display text-2xl">Report received</h2>
            <p className="mt-2 text-sm leading-relaxed text-charcoal-700/80">
              Thank you — our safety team reviews every report. You can also
              block {displayName ?? "this person"} from any chat screen.
            </p>
            <Button className="mt-5 w-full" onClick={() => onClose(true)}>
              Done
            </Button>
          </div>
        ) : (
          <div>
            <h2 className="font-display text-2xl">
              Report {displayName ?? "this person"}
            </h2>
            <p className="mt-1.5 text-sm text-charcoal-700/80">
              What happened? Reports are private — they&apos;ll never know you
              reported them.
            </p>

            <div role="radiogroup" aria-label="Report reason" className="mt-4 flex flex-col gap-1.5">
              {REPORT_CATEGORIES.map((c) => (
                <label
                  key={c.value}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                    category === c.value
                      ? "border-rose-600 bg-blush-100"
                      : "border-charcoal-900/12 hover:border-rose-500/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-category"
                    value={c.value}
                    checked={category === c.value}
                    onChange={() => setCategory(c.value)}
                    className="accent-rose-600"
                  />
                  {c.label}
                </label>
              ))}
            </div>

            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Anything else we should know (optional)"
              className="mt-3 w-full resize-none rounded-xl border border-charcoal-900/15 bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-rose-500"
            />

            {error && (
              <p role="alert" className="mt-2 text-sm text-danger-600">
                {error}
              </p>
            )}

            <div className="mt-4 flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onClose(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={submit} disabled={busy}>
                {busy ? <Spinner /> : "Submit report"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
