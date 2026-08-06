/** End-to-end coverage for restricted members and human appeal reviewers. */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { signupAndOnboard } from "./helpers";

config({ path: [".env.local", ".env"] });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function userIdFor(email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`No auth user found for ${email}`);
  return user.id;
}

test("member appeal: a banned member can submit a private appeal", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const email = await signupAndOnboard(page, "Appealer", "avatar-a.jpg");
  const userId = await userIdFor(email);
  await admin
    .from("profiles")
    .update({ account_status: "banned" })
    .eq("user_id", userId);

  await page.goto("/app/lobby");
  await page.waitForURL("**/appeal");
  await expect(
    page.getByRole("heading", { name: "Your account is restricted" }),
  ).toBeVisible();
  await expect(page.getByText(/account has been banned/i)).toBeVisible();

  const statement = page.getByLabel("Why should we review this decision?");
  await statement.fill("Too short");
  await page.getByRole("button", { name: "Submit appeal" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Use at least 20 characters" }),
  ).toContainText("Use at least 20 characters");

  await statement.fill(
    "I believe this ban belongs to a different account and would like a review.",
  );
  await page.getByRole("button", { name: "Submit appeal" }).click();
  await expect(
    page.getByRole("heading", { name: "Appeal received" }),
  ).toBeVisible();
  await expect(page.getByText(/internal review note/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 640 });
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflows).toBe(false);

  await admin
    .from("profiles")
    .update({ account_status: "active" })
    .eq("user_id", userId);
  await page.goto("/appeal");
  await page.waitForURL("**/app/lobby");
  await expect(page.getByText(/Appealer/)).toBeVisible();
});
