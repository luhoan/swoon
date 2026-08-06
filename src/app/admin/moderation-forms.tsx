"use client";

import { useActionState } from "react";
import {
  restoreAccount,
  reviewAppeal,
  type ModerationActionState,
} from "./actions";

const initialState: ModerationActionState = { ok: false, error: null };

export function AppealReviewForm({ appealId }: { appealId: string }) {
  const [state, action, pending] = useActionState(reviewAppeal, initialState);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="appealId" value={appealId} />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`appeal-note-${appealId}`}
          className="text-xs font-medium text-charcoal-800"
        >
          Internal review note
        </label>
        <textarea
          id={`appeal-note-${appealId}`}
          name="note"
          required
          maxLength={2000}
          rows={3}
          disabled={pending}
          className="resize-y rounded-xl border border-charcoal-900/15 bg-white px-3.5 py-2.5 text-sm text-charcoal-900 outline-none transition-colors focus:border-bluebell-500 disabled:opacity-60"
          placeholder="Evidence checked and reason for the decision"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger-600">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="restore"
          disabled={pending}
          className="min-h-10 rounded-full bg-success-600 px-4 text-xs font-medium text-cream-50 transition-colors hover:brightness-105 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Restore account"}
        </button>
        <button
          type="submit"
          name="decision"
          value="uphold"
          disabled={pending}
          className="min-h-10 rounded-full border border-danger-600/35 px-4 text-xs font-medium text-danger-600 transition-colors hover:bg-danger-600/8 disabled:opacity-50"
        >
          Uphold restriction
        </button>
      </div>
    </form>
  );
}

export function RestoreAccountForm({
  targetUserId,
}: {
  targetUserId: string;
}) {
  const [state, action, pending] = useActionState(restoreAccount, initialState);

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`restore-reason-${targetUserId}`}
          className="text-xs font-medium text-charcoal-800"
        >
          Restoration reason
        </label>
        <input
          id={`restore-reason-${targetUserId}`}
          name="reason"
          required
          maxLength={2000}
          disabled={pending}
          className="rounded-full border border-charcoal-900/15 bg-white px-4 py-2.5 text-sm text-charcoal-900 outline-none transition-colors focus:border-bluebell-500 disabled:opacity-60"
          placeholder="Reason recorded in the audit log"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-10 rounded-full bg-success-600 px-4 text-xs font-medium text-cream-50 transition-colors hover:brightness-105 disabled:opacity-50"
      >
        {pending ? "Restoring…" : "Restore account"}
      </button>
    </form>
  );
}
