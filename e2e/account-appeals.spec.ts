/** End-to-end coverage for restricted members and human appeal reviewers. */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { PASSWORD, signupAndOnboard } from "./helpers";

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

async function createReadyUser(
  name: string,
  options: {
    role?: "member" | "moderator" | "admin";
    status?: "active" | "suspended" | "banned";
    onboardingComplete?: boolean;
  } = {},
) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const email = `e2e-${slug}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@test.tryswoon.live`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: name,
      date_of_birth: "1995-06-15",
      city: "Testville",
      onboarding_complete: options.onboardingComplete ?? true,
      verification_status:
        options.onboardingComplete === false ? "none" : "demo_bypass",
      role: options.role ?? "member",
      account_status: options.status ?? "active",
    })
    .eq("user_id", data.user.id);
  if (profileError) throw profileError;

  return { id: data.user.id, email };
}

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
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

test("member appeal: a ban takes priority over incomplete onboarding", async ({
  page,
}) => {
  const user = await createReadyUser("Incomplete Target", {
    status: "banned",
    onboardingComplete: false,
  });

  await login(page, user.email);
  await page.waitForURL("**/appeal");
  await expect(
    page.getByRole("heading", { name: "Your account is restricted" }),
  ).toBeVisible();
});

test("moderator: reviews appeals and directly restores banned accounts", async ({
  browser,
}) => {
  test.setTimeout(240_000);

  const [appealingUser, directUser, upheldUser, reviewer] = await Promise.all([
    createReadyUser("Review Target", { status: "banned" }),
    createReadyUser("Direct Target", { status: "banned" }),
    createReadyUser("Upheld Target", { status: "banned" }),
    createReadyUser("Safety Reviewer", { role: "moderator" }),
  ]);

  const appealingContext = await browser.newContext();
  const appealingPage = await appealingContext.newPage();
  await login(appealingPage, appealingUser.email);
  await appealingPage.waitForURL("**/appeal");
  await appealingPage
    .getByLabel("Why should we review this decision?")
    .fill("I can verify that this restriction was attached to the wrong account.");
  await appealingPage.getByRole("button", { name: "Submit appeal" }).click();
  await expect(
    appealingPage.getByRole("heading", { name: "Appeal received" }),
  ).toBeVisible();

  const upheldContext = await browser.newContext();
  const upheldPage = await upheldContext.newPage();
  await login(upheldPage, upheldUser.email);
  await upheldPage.waitForURL("**/appeal");
  await upheldPage
    .getByLabel("Why should we review this decision?")
    .fill("Please review the evidence for this restriction one more time.");
  await upheldPage.getByRole("button", { name: "Submit appeal" }).click();
  await expect(
    upheldPage.getByRole("heading", { name: "Appeal received" }),
  ).toBeVisible();

  const moderatorContext = await browser.newContext();
  const moderator = await moderatorContext.newPage();
  await login(moderator, reviewer.email);
  await moderator.waitForURL("**/app/**");
  await moderator.goto("/admin");
  await expect(moderator.getByRole("heading", { name: "Appeals" })).toBeVisible();

  const appealsSection = moderator.locator(
    'section[aria-labelledby="appeals-heading"]',
  );
  const appealCard = appealsSection.locator("article", {
    hasText: "Review Target",
  });
  await appealCard
    .getByLabel("Internal review note")
    .fill("Identity details verified; the ban belonged to another account.");
  await appealCard.getByRole("button", { name: "Restore account" }).click();
  await expect(appealCard).toHaveCount(0);

  await appealingPage.goto("/app/lobby");
  await expect(
    appealingPage.getByRole("heading", { name: /Review Target/ }),
  ).toBeVisible();

  const upheldCard = appealsSection.locator("article", {
    hasText: "Upheld Target",
  });
  await upheldCard
    .getByLabel("Internal review note")
    .fill("The reviewed evidence supports keeping the ban in place.");
  await upheldCard
    .getByRole("button", { name: "Uphold restriction" })
    .click();
  await expect(upheldCard).toHaveCount(0);

  await upheldPage.reload();
  await expect(
    upheldPage.getByRole("heading", { name: "Restriction upheld" }),
  ).toBeVisible();
  await expect(upheldPage.getByText(/reviewed evidence supports/i)).toHaveCount(
    0,
  );
  await expect(
    upheldPage.getByRole("button", { name: "Submit appeal" }),
  ).toHaveCount(0);
  await expect(upheldPage.getByText(/submit a new appeal after/i)).toBeVisible();

  const search = moderator.getByLabel("Search restricted accounts");
  await search.fill("Direct Target");
  const restrictedSection = moderator.locator(
    'section[aria-labelledby="restricted-accounts-heading"]',
  );
  const directCard = restrictedSection.locator("article", {
    hasText: "Direct Target",
  });
  await directCard
    .getByLabel("Restoration reason")
    .fill("A separate human review found no basis for this ban.");
  await directCard.getByRole("button", { name: "Restore account" }).click();
  await expect(directCard).toHaveCount(0);

  const { data: directProfile } = await admin
    .from("profiles")
    .select("account_status")
    .eq("user_id", directUser.id)
    .single();
  expect(directProfile!.account_status).toBe("active");

  await moderator.setViewportSize({ width: 320, height: 640 });
  const overflows = await moderator.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflows).toBe(false);

  await appealingContext.close();
  await upheldContext.close();
  await moderatorContext.close();
});
