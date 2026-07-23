"use client";

import { forwardRef } from "react";

type ButtonVariant = "primary" | "dark" | "ghost" | "danger" | "outline";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-rose-600 text-cream-50 hover:bg-rose-700 shadow-lift disabled:bg-rose-500/50",
  dark: "bg-charcoal-900 text-cream-100 hover:bg-charcoal-800 disabled:opacity-50",
  ghost:
    "bg-transparent text-charcoal-900 hover:bg-blush-100 disabled:opacity-40",
  danger:
    "bg-danger-600 text-cream-50 hover:brightness-110 disabled:opacity-50",
  outline:
    "border border-charcoal-900/25 text-charcoal-900 hover:border-rose-600 hover:text-rose-700 disabled:opacity-40",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "md" | "lg" | "sm";
  }
>(function Button(
  { variant = "primary", size = "md", className = "", ...props },
  ref,
) {
  const sizes = {
    sm: "px-3.5 py-1.5 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-7 py-3.5 text-base",
  };
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed ${sizes[size]} ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
});

export const TextField = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    error?: string;
    hint?: string;
  }
>(function TextField({ label, error, hint, id, className = "", ...props }, ref) {
  const fieldId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={fieldId}
        className="text-sm font-medium text-charcoal-800"
      >
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={`rounded-xl border bg-white/80 px-4 py-2.5 text-charcoal-900 placeholder:text-charcoal-700/40 ${
          error
            ? "border-danger-600"
            : "border-charcoal-900/15 focus:border-rose-500"
        } outline-none transition-colors`}
        {...props}
      />
      {hint && !error && (
        <p className="text-xs text-charcoal-700/70">{hint}</p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="text-xs text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[--radius-soft] border border-charcoal-900/8 bg-white/70 shadow-lift backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`animate-spin ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
