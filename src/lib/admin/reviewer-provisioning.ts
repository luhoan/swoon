import { z } from "zod";

export type ReviewerRole = "member" | "moderator" | "admin";

export interface ReviewerDirectory {
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  getProfileRole(userId: string): Promise<ReviewerRole | null>;
  setProfileRole(userId: string, role: "moderator"): Promise<void>;
}

export async function provisionAppealReviewer(
  directory: ReviewerDirectory,
  configuredEmail: string,
): Promise<{ userId: string; role: "moderator" | "admin" }> {
  const email = z.string().trim().email().parse(configuredEmail).toLowerCase();
  const user = await directory.findUserByEmail(email);
  if (!user) throw new Error("reviewer_account_missing");

  const currentRole = await directory.getProfileRole(user.id);
  if (!currentRole) throw new Error("reviewer_profile_missing");

  if (currentRole === "member") {
    await directory.setProfileRole(user.id, "moderator");
  }

  const finalRole = await directory.getProfileRole(user.id);
  if (finalRole !== "moderator" && finalRole !== "admin") {
    throw new Error("reviewer_access_missing");
  }

  return { userId: user.id, role: finalRole };
}
