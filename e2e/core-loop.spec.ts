/**
 * The definition-of-done run: two independent browser contexts sign up,
 * onboard, queue, share one live WebRTC date with a synchronized timer,
 * both choose Match, land on "It's a Swoon!", and chat in real time.
 */
import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

const PASSWORD = "e2e-swoon-pass-1!";

async function signupAndOnboard(page: Page, name: string, avatar: string) {
  const email = `e2e-${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@test.tryswoon.live`;

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/onboarding/profile", { timeout: 30_000 });
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add profile photo" }).click();
  (await fileChooserPromise).setFiles(
    join(process.cwd(), "e2e", ".fixtures", avatar),
  );
  await page.getByLabel("First name").fill(name);
  await page.getByLabel("Date of birth").fill("1998-02-14");
  await page.getByLabel("City").fill("Testville");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/onboarding/verification", { timeout: 30_000 });
  await page.getByRole("button", { name: /Verify me/ }).click();
  await page.waitForURL("**/app/lobby", { timeout: 30_000 });
  return email;
}

test("two people complete the full Swoon loop", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const alice = await contextA.newPage();
  const bob = await contextB.newPage();

  // ---- Sign up + onboard both (serial: Supabase Auth throttles admin
  // create bursts) ---------------------------------------------------------
  await signupAndOnboard(alice, "Alice", "avatar-a.jpg");
  await signupAndOnboard(bob, "Bob", "avatar-b.jpg");

  // ---- Queue both; they must pair into the same session ------------------
  await alice.goto("/app/preflight");
  await expect(alice.getByRole("button", { name: "Start dating" })).toBeEnabled();
  await alice.getByRole("button", { name: "Start dating" }).click();

  await bob.goto("/app/preflight");
  await expect(bob.getByRole("button", { name: "Start dating" })).toBeEnabled();
  await bob.getByRole("button", { name: "Start dating" }).click();

  await alice.waitForURL("**/app/date/**", { timeout: 45_000 });
  await bob.waitForURL("**/app/date/**", { timeout: 45_000 });

  const sessionA = alice.url().split("/date/")[1];
  const sessionB = bob.url().split("/date/")[1];
  expect(sessionA).toBeTruthy();
  expect(sessionA).toBe(sessionB);

  // ---- Live video: remote stream flowing on both sides -------------------
  for (const page of [alice, bob]) {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const remote = document.querySelector("main video");
            return remote instanceof HTMLVideoElement ? remote.videoWidth : 0;
          }),
        { timeout: 40_000, message: "remote video should start flowing" },
      )
      .toBeGreaterThan(0);
  }

  // Synchronized countdown is visible on both.
  await expect(alice.locator("header")).toContainText(/\d:\d\d/);
  await expect(bob.locator("header")).toContainText(/\d:\d\d/);

  // Partner identity chips show the sanitized profile.
  await expect(alice.getByText(/Bob, \d\d/)).toBeVisible();
  await expect(bob.getByText(/Alice, \d\d/)).toBeVisible();

  // ---- Timer expiry (15s in test config) ends the date for both ----------
  await alice.waitForURL("**/app/decision/**", { timeout: 60_000 });
  await bob.waitForURL("**/app/decision/**", { timeout: 60_000 });

  // ---- Both choose Match -> It's a Swoon ---------------------------------
  await alice.getByRole("button", { name: /Match/ }).click();
  // Alice sees the private waiting state, nothing about Bob's answer.
  await expect(alice.getByText(/Waiting for Bob/)).toBeVisible();

  await bob.getByRole("button", { name: /Match/ }).click();

  await alice.waitForURL("**/app/match/**", { timeout: 30_000 });
  await bob.waitForURL("**/app/match/**", { timeout: 30_000 });
  await expect(alice.getByText("Swoon!")).toBeVisible();

  const matchA = alice.url().split("/match/")[1];
  const matchB = bob.url().split("/match/")[1];
  expect(matchA).toBe(matchB);

  // ---- Chat flows in real time ------------------------------------------
  await alice.getByRole("link", { name: "Send a message" }).click();
  await alice.waitForURL("**/app/chat/**");
  await bob.goto(`/app/chat/${matchB}`);
  await expect(bob.getByText(/You matched with Alice/)).toBeVisible();

  await alice.getByLabel("Message").fill("Three minutes was not enough ♥");
  await alice.getByRole("button", { name: "Send" }).click();

  await expect(alice.getByText("Three minutes was not enough ♥")).toBeVisible();
  await expect(bob.getByText("Three minutes was not enough ♥")).toBeVisible({
    timeout: 15_000,
  });

  await contextA.close();
  await contextB.close();
});
