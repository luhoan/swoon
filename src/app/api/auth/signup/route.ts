import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const TERMS_VERSION = "2026-07-23";

const signupSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128),
  acceptedTerms: z.literal(true),
});

/**
 * Pre-alpha signup: creates the user pre-confirmed via the admin API so the
 * demo flow needs no email round-trip. Documented tradeoff — closed alpha
 * switches to real email confirmation (docs/DECISIONS.md).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  // IP-keyed token bucket: burst of 10, refills one per minute.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const { data: allowed, error: rlError } = await admin.rpc("consume_token", {
    p_key: `signup:ip:${ip}`,
    p_capacity: 10,
    p_refill_per_sec: 1 / 60,
  });
  if (rlError || allowed === false) {
    return NextResponse.json(
      { error: "Too many signups from this network. Try again in a bit." },
      { status: 429 },
    );
  }

  // Supabase Auth briefly 429s/5xxs under admin-create bursts; one short
  // retry absorbs that without hiding real validation failures.
  let error: { status?: number } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
    });
    error = result.error;
    if (!error) break;
    const transient = error.status === 429 || (error.status ?? 500) >= 500;
    if (!transient) break;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  if (error) {
    // Do not reveal whether an email is already registered beyond what the
    // login flow already exposes; keep the message generic but actionable.
    const status =
      error.status === 422 ? 409 : error.status === 429 ? 429 : 400;
    return NextResponse.json(
      {
        error:
          status === 409
            ? "That email can't be used. Try logging in instead."
            : status === 429
              ? "We're a little busy — try again in a few seconds."
              : "Sign-up failed. Check your details and try again.",
      },
      { status },
    );
  }

  return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION });
}
