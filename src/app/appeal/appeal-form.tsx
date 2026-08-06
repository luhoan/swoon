"use client";

import { useActionState } from "react";
import { submitAppeal, type AppealActionState } from "./actions";
import { Button, Spinner } from "@/components/ui";

const initialAppealActionState: AppealActionState = { error: null };

export function AppealForm() {
  const [state, formAction, pending] = useActionState(
    submitAppeal,
    initialAppealActionState,
  );

  return (
    <form action={formAction} noValidate className="mt-5 space-y-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="appeal-statement"
          className="text-sm font-medium text-charcoal-800"
        >
          Why should we review this decision?
        </label>
        <textarea
          id="appeal-statement"
          name="statement"
          required
          minLength={20}
          maxLength={4000}
          rows={7}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={
            state.error ? "appeal-hint appeal-error" : "appeal-hint"
          }
          className={`resize-y rounded-2xl border bg-white/85 px-4 py-3 text-sm leading-relaxed text-charcoal-900 outline-none transition-colors placeholder:text-charcoal-700/40 ${
            state.error
              ? "border-danger-600"
              : "border-charcoal-900/15 focus:border-rose-500"
          }`}
          placeholder="Tell us what you believe was missed or misunderstood."
        />
        <p id="appeal-hint" className="text-xs text-charcoal-700/65">
          20–4,000 characters. A human reviewer will read this.
        </p>
        {state.error && (
          <p
            id="appeal-error"
            role="alert"
            className="text-sm text-danger-600"
          >
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : "Submit appeal"}
      </Button>
    </form>
  );
}
