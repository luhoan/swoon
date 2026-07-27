/**
 * Whole-site walkthrough: marketing pages, auth validation, and a long
 * two-user journey covering both decision outcomes, early leave, re-queue,
 * chat, report -> admin moderation, settings + password change + re-login,
 * block, and account deletion.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { PASSWORD, signupAndOnboard, startDating } from "./helpers";

config({ path: [".env.local", ".env"] });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

test("marketing site: landing, FAQ, and policy pages render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Skip the Swipe/ })).toBeVisible();
  await expect(page.getByText("How it works", { exact: false }).first()).toBeVisible();

  // FAQ accordion opens
  await page.getByText("Why is there a $5 verification?").click();
  await expect(page.getByText(/no subscription/i)).toBeVisible();

  for (const [path, marker] of [
    ["/safety", "Safety at Swoon"],
    ["/terms", "Terms of Service"],
    ["/privacy", "Privacy Policy"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: marker })).toBeVisible();
  }
});

test("auth guards: validation errors and route protection", async ({ page }) => {
  // Signup form validation
  await page.goto("/signup");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("different");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email")).toBeVisible();
  await expect(page.getByText("Use at least 10 characters")).toBeVisible();

  // Wrong login
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@test.tryswoon.live");
  await page.getByLabel("Password").fill("definitely-wrong-1!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/didn't match/)).toBeVisible();

  // Authenticated areas bounce to login
  await page.goto("/app/lobby");
  await page.waitForURL("**/login**");
  await page.goto("/admin");
  await page.waitForURL("**/login**");
});

test("full two-user journey across the whole product", async ({ browser }) => {
  test.setTimeout(420_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const alice = await contextA.newPage();
  const bob = await contextB.newPage();

  const aliceEmail = await signupAndOnboard(alice, "Alice", "avatar-a.jpg");
  const bobEmail = await signupAndOnboard(bob, "Bob", "avatar-b.jpg");
  void aliceEmail;

  // ===== Round 1: early leave, then Match vs Pass -> no match, no leak ====
  const [s1a, s1b] = await Promise.all([startDating(alice), startDating(bob)]);
  expect(s1a).toBe(s1b);

  // Video up on both sides before we leave
  for (const page of [alice, bob]) {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const remote = document.querySelector("main video");
            return remote instanceof HTMLVideoElement ? remote.videoWidth : 0;
          }),
        { timeout: 40_000 },
      )
      .toBeGreaterThan(0);
  }

  // Alice leaves early -> both land on the decision screen
  await alice.getByRole("button", { name: "Leave date" }).click();
  await alice.waitForURL("**/app/decision/**", { timeout: 30_000 });
  await bob.waitForURL("**/app/decision/**", { timeout: 30_000 });

  // Alice says Match, Bob says Pass -> Alice must only ever see "no match"
  await alice.getByRole("button", { name: /Match/ }).click();
  await expect(alice.getByText(/Waiting for Bob/)).toBeVisible();
  await bob.getByRole("button", { name: "Pass" }).click();

  await expect(alice.getByText("Not this time")).toBeVisible({ timeout: 20_000 });
  await expect(bob.getByText("Not this time")).toBeVisible({ timeout: 20_000 });
  // No hint of who passed
  await expect(alice.getByText(/Bob (passed|said)/)).toHaveCount(0);

  // ===== Round 2: full date to timer end, mutual match, chat =============
  await alice.getByRole("button", { name: "Find another date" }).click();
  await alice.waitForURL("**/app/preflight");
  const [s2a, s2b] = await Promise.all([startDating(alice), startDating(bob)]);
  expect(s2a).toBe(s2b);
  expect(s2a).not.toBe(s1a);

  // Timer (15s test config) runs out on its own
  await alice.waitForURL("**/app/decision/**", { timeout: 90_000 });
  await bob.waitForURL("**/app/decision/**", { timeout: 90_000 });
  await alice.getByRole("button", { name: /Match/ }).click();
  await bob.getByRole("button", { name: /Match/ }).click();
  await alice.waitForURL("**/app/match/**", { timeout: 30_000 });
  await bob.waitForURL("**/app/match/**", { timeout: 30_000 });
  await expect(alice.getByText("Swoon!")).toBeVisible();
  const matchId = alice.url().split("/match/")[1]!;

  // Chat both directions
  await alice.getByRole("link", { name: "Send a message" }).click();
  await alice.waitForURL("**/app/chat/**");
  await bob.goto(`/app/chat/${matchId}`);
  await alice.getByLabel("Message").fill("Hi Bob, again!");
  await alice.getByRole("button", { name: "Send" }).click();
  await expect(bob.getByText("Hi Bob, again!")).toBeVisible({ timeout: 15_000 });
  await bob.getByLabel("Message").fill("Twice is fate");
  await bob.getByRole("button", { name: "Send" }).click();
  await expect(alice.getByText("Twice is fate")).toBeVisible({ timeout: 15_000 });

  // Matches list shows the match
  await alice.goto("/app/matches");
  await expect(alice.getByText(/Bob, \d\d/)).toBeVisible();

  // ===== Report -> admin reviews and dismisses ===========================
  await bob.getByRole("button", { name: "Conversation options" }).click();
  await bob.getByRole("button", { name: "Report" }).click();
  await bob.getByText("Spam").click();
  await bob.getByRole("button", { name: "Submit report" }).click();
  await expect(bob.getByText("Report received")).toBeVisible();
  await bob.getByRole("button", { name: "Done" }).click();

  // Promote a fresh moderator account via the service role, then use /admin
  const carolEmail = `e2e-carol-${Date.now()}@test.tryswoon.live`;
  const { data: carolUser } = await admin.auth.admin.createUser({
    email: carolEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("user_id", carolUser!.user!.id);

  const contextC = await browser.newContext();
  const carol = await contextC.newPage();
  await carol.goto("/login");
  await carol.getByLabel("Email").fill(carolEmail);
  await carol.getByLabel("Password").fill(PASSWORD);
  await carol.getByRole("button", { name: "Log in" }).click();
  await carol.waitForURL("**/app/**");
  await carol.goto("/admin");
  await expect(carol.getByRole("heading", { name: "Report queue" })).toBeVisible();
  await expect(carol.getByText("Spam").first()).toBeVisible();

  const reportCard = carol.locator("article", { hasText: "Spam" }).first();
  await reportCard.getByPlaceholder(/Reason/).fill("e2e walkthrough dismissal");
  await reportCard.getByRole("button", { name: "Dismiss" }).click();
  await expect(carol.getByText("Recently handled")).toBeVisible({ timeout: 15_000 });
  await expect(carol.getByText("moderation_dismiss").first()).toBeVisible();

  // ===== Settings: profile edit + password change + re-login =============
  await alice.goto("/app/settings");
  await alice.getByLabel("First name").fill("Alicia");
  await alice.getByRole("button", { name: "Save changes" }).click();
  await expect(alice.getByText("Saved.")).toBeVisible();

  const newPassword = `${PASSWORD}-rotated`;
  await alice.getByLabel("New password").fill(newPassword);
  await alice.getByRole("button", { name: "Update password" }).click();
  await expect(alice.getByText("Password updated.")).toBeVisible();

  await alice.getByRole("button", { name: "Log out" }).click();
  await alice.waitForURL((url) => !url.pathname.startsWith("/app"), {
    timeout: 20_000,
  });
  await alice.goto("/login");
  await alice.getByLabel("Email").fill(aliceEmail);
  await alice.getByLabel("Password").fill(newPassword);
  await alice.getByRole("button", { name: "Log in" }).click();
  await alice.waitForURL("**/app/lobby", { timeout: 30_000 });
  await expect(alice.getByText(/Alicia/)).toBeVisible();

  // ===== Block: chat dies for both, match disappears ======================
  await alice.goto(`/app/chat/${matchId}`);
  await alice.getByRole("button", { name: "Conversation options" }).click();
  await alice.getByRole("button", { name: "Block" }).click();
  await alice
    .locator("div")
    .filter({ hasText: /Block Bob\?/ })
    .getByRole("button", { name: "Block", exact: true })
    .last()
    .click();
  await alice.waitForURL("**/app/matches");
  await expect(alice.getByText("No matches yet")).toBeVisible();

  // Bob can't use the dead chat either (match is frozen)
  await bob.goto(`/app/chat/${matchId}`);
  await bob.waitForURL("**/app/matches", { timeout: 20_000 });

  // ===== Account deletion =================================================
  await bob.goto("/app/settings");
  await bob.getByRole("button", { name: "Delete my account" }).click();
  await bob.getByRole("button", { name: "Delete", exact: true }).click();
  await bob.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });

  // Deleted credentials are dead
  await bob.goto("/login");
  await bob.getByLabel("Email").fill(bobEmail);
  await bob.getByLabel("Password").fill(PASSWORD);
  await bob.getByRole("button", { name: "Log in" }).click();
  await expect(bob.getByText(/didn't match/)).toBeVisible({ timeout: 15_000 });

  await contextA.close();
  await contextB.close();
  await contextC.close();
});
