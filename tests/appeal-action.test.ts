import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  notifyAppealReviewer: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/appeals/notification", () => ({
  notifyAppealReviewer: mocks.notifyAppealReviewer,
}));

import { submitAppeal } from "@/app/appeal/actions";

const appealId = "11111111-1111-4111-8111-111111111111";
const submittedAt = "2026-08-06T12:00:00.000Z";

function validAppealForm(): FormData {
  const form = new FormData();
  form.set(
    "statement",
    "Please review the circumstances around this account restriction.",
  );
  return form;
}

describe("appeal submission notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "submit_account_appeal") {
        return {
          data: appealId,
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      }
      if (name === "get_my_account_appeals") {
        return {
          data: [
            {
              id: appealId,
              restriction_status: "banned",
              statement:
                "Please review the circumstances around this account restriction.",
              status: "open",
              created_at: submittedAt,
              reviewed_at: null,
            },
          ],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    mocks.notifyAppealReviewer.mockResolvedValue({ status: "sent" });
  });

  it("notifies staff with the safe projection after the appeal commits", async () => {
    await submitAppeal({ error: null }, validAppealForm());

    expect(mocks.notifyAppealReviewer).toHaveBeenCalledWith({
      appealId,
      restrictionStatus: "banned",
      submittedAt,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/appeal");
    expect(mocks.redirect).toHaveBeenCalledWith("/appeal");
  });

  it("keeps the submitted appeal successful when notification throws", async () => {
    mocks.notifyAppealReviewer.mockRejectedValueOnce(
      new Error("email provider unavailable"),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await submitAppeal({ error: null }, validAppealForm());

    expect(mocks.notifyAppealReviewer).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/appeal");
    expect(mocks.redirect).toHaveBeenCalledWith("/appeal");
    expect(errorLog).not.toHaveBeenCalledWith(
      expect.stringContaining("email provider unavailable"),
    );
    errorLog.mockRestore();
  });
});
