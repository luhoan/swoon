import { describe, expect, it, vi } from "vitest";
import { notifyAppealReviewer } from "@/lib/appeals/notification";

const appeal = {
  appealId: "11111111-1111-4111-8111-111111111111",
  restrictionStatus: "banned" as const,
  submittedAt: "2026-08-06T12:00:00.000Z",
};

const configuredEnv = {
  RESEND_API_KEY: "re_test_key",
  APPEAL_REVIEW_EMAIL: "info@tryswoon.live",
  APPEAL_EMAIL_FROM: "Swoon Appeals <appeals@updates.tryswoon.live>",
  NEXT_PUBLIC_APP_URL: "https://tryswoon.live",
};

describe("appeal review email notification", () => {
  it("sends an authorized reviewer a privacy-minimized, idempotent message", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await notifyAppealReviewer(appeal, {
      env: configuredEnv,
      fetch: fetcher,
      reviewerHasAccess: async (email) => email === "info@tryswoon.live",
    });

    expect(result).toEqual({ status: "sent" });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "Idempotency-Key": "appeal-11111111-1111-4111-8111-111111111111",
    });

    const message = JSON.parse(String(init.body)) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };
    expect(message.from).toBe(
      "Swoon Appeals <appeals@updates.tryswoon.live>",
    );
    expect(message.to).toEqual(["info@tryswoon.live"]);
    expect(message.subject).toBe("New Swoon account appeal");
    expect(message.text).toContain("banned account");
    expect(message.text).toContain("August 6, 2026 at 12:00 PM UTC");
    expect(message.text).toContain(
      "https://tryswoon.live/admin#appeals-heading",
    );
    expect(message.html).toContain(
      "https://tryswoon.live/admin#appeals-heading",
    );
    expect(JSON.stringify(message).toLowerCase()).not.toContain("statement");
  });

  it("skips delivery when email configuration is incomplete", async () => {
    const fetcher = vi.fn();
    const reviewerHasAccess = vi.fn();

    const result = await notifyAppealReviewer(appeal, {
      env: {
        APPEAL_REVIEW_EMAIL: "info@tryswoon.live",
        NEXT_PUBLIC_APP_URL: "https://tryswoon.live",
      },
      fetch: fetcher,
      reviewerHasAccess,
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "configuration_missing",
    });
    expect(reviewerHasAccess).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not email a recipient without moderator access", async () => {
    const fetcher = vi.fn();

    const result = await notifyAppealReviewer(appeal, {
      env: configuredEnv,
      fetch: fetcher,
      reviewerHasAccess: async () => false,
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "reviewer_access_missing",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a sanitized failure when Resend rejects delivery", async () => {
    const fetcher = vi.fn(async () =>
      new Response("provider response containing sensitive diagnostics", {
        status: 500,
      }),
    );

    const result = await notifyAppealReviewer(appeal, {
      env: configuredEnv,
      fetch: fetcher,
      reviewerHasAccess: async () => true,
    });

    expect(result).toEqual({
      status: "failed",
      reason: "provider_error:500",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive diagnostics");
  });
});
