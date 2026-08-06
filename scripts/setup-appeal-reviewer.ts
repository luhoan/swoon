import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  provisionAppealReviewer,
  type ReviewerDirectory,
  type ReviewerRole,
} from "../src/lib/admin/reviewer-provisioning";

config({ path: [".env.local", ".env"] });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const reviewerEmail =
  process.env.APPEAL_REVIEW_EMAIL?.trim() || "info@tryswoon.live";

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const directory: ReviewerDirectory = {
  async findUserByEmail(email) {
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
      if (user) return { id: user.id };
      page = data.nextPage ?? 0;
    }
    return null;
  },

  async getProfileRole(userId) {
    const { data, error } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data?.role as ReviewerRole | undefined) ?? null;
  },

  async setProfileRole(userId, role) {
    const { error } = await admin
      .from("profiles")
      .update({ role })
      .eq("user_id", userId);
    if (error) throw error;
  },
};

try {
  const result = await provisionAppealReviewer(directory, reviewerEmail);
  console.log(`${reviewerEmail.toLowerCase()} is ready as ${result.role}.`);
} catch (error) {
  if (error instanceof Error && error.message === "reviewer_account_missing") {
    console.error(
      `Create the ${reviewerEmail} Swoon account through /signup, then run reviewer:setup again.`,
    );
  } else if (
    error instanceof Error &&
    error.message === "reviewer_profile_missing"
  ) {
    console.error(
      `The ${reviewerEmail} auth account has no profile. Complete signup, then run reviewer:setup again.`,
    );
  } else {
    console.error("Appeal reviewer setup failed.");
  }
  process.exit(1);
}
