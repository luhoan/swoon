import { type Page } from "@playwright/test";
import { join } from "node:path";

export const PASSWORD = "e2e-swoon-pass-1!";

/** UI signup + onboarding through to the lobby. Returns the email used. */
export async function signupAndOnboard(page: Page, name: string, avatar: string) {
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

/** Queue from preflight and wait until the date screen is reached. */
export async function startDating(page: Page) {
  await page.goto("/app/preflight");
  const start = page.getByRole("button", { name: "Start dating" });
  await start.waitFor({ state: "visible" });
  await start.click();
  await page.waitForURL("**/app/date/**", { timeout: 45_000 });
  return page.url().split("/date/")[1]!;
}
