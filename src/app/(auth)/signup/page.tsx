"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, TextField, Spinner } from "@/components/ui";

const schema = z
  .object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(10, "Use at least 10 characters"),
    confirm: z.string(),
    acceptedTerms: z.boolean().refine((v) => v, {
      message: "You need to accept the terms to continue",
    }),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });
type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { acceptedTerms: false },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: values.email,
        password: values.password,
        acceptedTerms: values.acceptedTerms,
      }),
    });
    const data: { error?: string; termsVersion?: string } = await res
      .json()
      .catch(() => ({}));
    if (!res.ok) {
      setServerError(data.error ?? "Sign-up failed. Try again.");
      return;
    }

    const supabase = supabaseBrowser();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (loginError) {
      setServerError("Account created — please log in.");
      router.push("/login");
      return;
    }
    // Record the consent that was given on this form.
    await supabase.rpc("accept_terms", {
      p_version: data.termsVersion ?? "2026-07-23",
    });
    router.replace("/onboarding/profile");
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-charcoal-900">
        Skip the swipe
      </h1>
      <p className="mt-2 text-sm text-charcoal-700/80">
        Create your account — you&apos;ll be on a live date in minutes.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 flex flex-col gap-4"
        noValidate
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters"
          error={errors.password?.message}
          {...register("password")}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register("confirm")}
        />

        <label className="flex items-start gap-2.5 text-sm text-charcoal-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-rose-600"
            {...register("acceptedTerms")}
          />
          <span>
            I&apos;m 18 or older and agree to the{" "}
            <a href="/terms" target="_blank" className="underline">
              Terms
            </a>
            ,{" "}
            <a href="/privacy" target="_blank" className="underline">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/safety" target="_blank" className="underline">
              Community Guidelines
            </a>
            .
          </span>
        </label>
        {errors.acceptedTerms && (
          <p role="alert" className="-mt-2 text-xs text-danger-600">
            {errors.acceptedTerms.message}
          </p>
        )}
        {serverError && (
          <p role="alert" className="text-sm text-danger-600">
            {serverError}
          </p>
        )}

        <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? <Spinner /> : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-charcoal-700/80">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-rose-700 underline-offset-2 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
