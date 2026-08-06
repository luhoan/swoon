import { z } from "zod";

const notificationEnvSchema = z.object({
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  APPEAL_REVIEW_EMAIL: z
    .string()
    .trim()
    .email()
    .default("info@tryswoon.live"),
  APPEAL_EMAIL_FROM: z.string().trim().min(3).optional(),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),
});

export interface AppealNotificationInput {
  appealId: string;
  restrictionStatus: "suspended" | "banned";
  submittedAt: string;
}

export interface NotificationResult {
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

type NotificationEnvironment = Record<string, string | undefined>;
type EmailFetch = (url: string, init: RequestInit) => Promise<Response>;

interface NotificationDependencies {
  env?: NotificationEnvironment;
  fetch?: EmailFetch;
  reviewerHasAccess?: (email: string) => Promise<boolean>;
}

async function configuredReviewerHasAccess(email: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const admin = supabaseAdmin();
  let page = 1;

  while (page > 0) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    const user = data.users.find(
      (candidate) => candidate.email?.trim().toLowerCase() === email,
    );
    if (user) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (profileError) throw profileError;
      return profile?.role === "moderator" || profile?.role === "admin";
    }

    page = data.nextPage ?? 0;
  }

  return false;
}

function formatSubmittedAt(value: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
  return `${formatted} UTC`;
}

export async function notifyAppealReviewer(
  input: AppealNotificationInput,
  dependencies: NotificationDependencies = {},
): Promise<NotificationResult> {
  const parsed = notificationEnvSchema.safeParse(
    dependencies.env ?? process.env,
  );
  if (
    !parsed.success ||
    !parsed.data.RESEND_API_KEY ||
    !parsed.data.APPEAL_EMAIL_FROM
  ) {
    return { status: "skipped", reason: "configuration_missing" };
  }

  const config = parsed.data;
  const recipient = config.APPEAL_REVIEW_EMAIL.toLowerCase();
  const reviewerHasAccess =
    dependencies.reviewerHasAccess ?? configuredReviewerHasAccess;

  try {
    if (!(await reviewerHasAccess(recipient))) {
      return { status: "skipped", reason: "reviewer_access_missing" };
    }
  } catch {
    return { status: "failed", reason: "reviewer_access_check_failed" };
  }

  const reviewUrl = new URL(
    "/admin#appeals-heading",
    config.NEXT_PUBLIC_APP_URL,
  ).toString();
  const submittedAt = formatSubmittedAt(input.submittedAt);
  const restriction = `${input.restrictionStatus} account`;
  const text = [
    "A new Swoon account appeal is ready for review.",
    `Restriction: ${restriction}`,
    `Submitted: ${submittedAt}`,
    `Review securely: ${reviewUrl}`,
    "Sign in with the shared reviewer account. Appeal details and moderation actions are available only in the protected dashboard.",
  ].join("\n\n");
  const html = [
    "<h1>New Swoon account appeal</h1>",
    `<p>A ${restriction} submitted an appeal on ${submittedAt}.</p>`,
    `<p><a href="${reviewUrl}">Review appeal securely</a></p>`,
    "<p>Sign in with the shared reviewer account. Appeal details and moderation actions are available only in the protected dashboard.</p>",
  ].join("");

  const fetcher = dependencies.fetch ?? fetch;
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `appeal-${input.appealId}`,
      },
      body: JSON.stringify({
        from: config.APPEAL_EMAIL_FROM,
        to: [recipient],
        subject: "New Swoon account appeal",
        text,
        html,
      }),
    });

    if (!response.ok) {
      return {
        status: "failed",
        reason: `provider_error:${response.status}`,
      };
    }
    return { status: "sent" };
  } catch {
    return { status: "failed", reason: "delivery_error" };
  }
}
