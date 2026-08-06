import { describe, expect, it } from "vitest";
import {
  provisionAppealReviewer,
  type ReviewerDirectory,
  type ReviewerRole,
} from "@/lib/admin/reviewer-provisioning";

function directoryWith(
  initialRole: ReviewerRole | null,
  accountExists = true,
): ReviewerDirectory & { updates: ReviewerRole[] } {
  let role = initialRole;
  const updates: ReviewerRole[] = [];
  return {
    updates,
    async findUserByEmail(email) {
      return accountExists && email === "info@tryswoon.live"
        ? { id: "reviewer-user-id" }
        : null;
    },
    async getProfileRole(userId) {
      return userId === "reviewer-user-id" ? role : null;
    },
    async setProfileRole(userId, nextRole) {
      if (userId !== "reviewer-user-id") throw new Error("wrong user");
      role = nextRole;
      updates.push(nextRole);
    },
  };
}

describe("shared appeal reviewer provisioning", () => {
  it("refuses to create or promote an auth account that does not exist", async () => {
    const directory = directoryWith(null, false);

    await expect(
      provisionAppealReviewer(directory, "info@tryswoon.live"),
    ).rejects.toThrow("reviewer_account_missing");
    expect(directory.updates).toEqual([]);
  });

  it("rejects an auth account without a profile", async () => {
    const directory = directoryWith(null);

    await expect(
      provisionAppealReviewer(directory, "info@tryswoon.live"),
    ).rejects.toThrow("reviewer_profile_missing");
    expect(directory.updates).toEqual([]);
  });

  it("promotes the existing shared member account to moderator", async () => {
    const directory = directoryWith("member");

    const result = await provisionAppealReviewer(
      directory,
      " INFO@TRYSWOON.LIVE ",
    );

    expect(result).toEqual({
      userId: "reviewer-user-id",
      role: "moderator",
    });
    expect(directory.updates).toEqual(["moderator"]);
  });

  it.each(["moderator", "admin"] as const)(
    "preserves an existing %s role",
    async (role) => {
      const directory = directoryWith(role);

      const result = await provisionAppealReviewer(
        directory,
        "info@tryswoon.live",
      );

      expect(result.role).toBe(role);
      expect(directory.updates).toEqual([]);
    },
  );
});
