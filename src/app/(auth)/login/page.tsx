"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, TextField, Spinner } from "@/components/ui";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError("Email or password didn't match. Try again.");
      return;
    }
    router.replace(params.get("next") ?? "/app/lobby");
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-charcoal-900">Welcome back</h1>
      <p className="mt-2 text-sm text-charcoal-700/80">
        Your next three-minute date is waiting.
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        {serverError && (
          <p role="alert" className="text-sm text-danger-600">
            {serverError}
          </p>
        )}
        <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? <Spinner /> : "Log in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-charcoal-700/80">
        New here?{" "}
        <Link
          href="/signup"
          className="font-medium text-rose-700 underline-offset-2 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
