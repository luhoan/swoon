/**
 * The date screen must fit the viewport at every window size — including
 * short laptop screens and phones — regardless of camera resolution.
 */
import { test, expect } from "@playwright/test";
import { signupAndOnboard, startDating } from "./helpers";

const VIEWPORTS = [
  { name: "short laptop", width: 1366, height: 620 },
  { name: "laptop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

test("date screen fits the viewport at every size", async ({ browser }) => {
  test.setTimeout(240_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const alice = await contextA.newPage();
  const bob = await contextB.newPage();

  await signupAndOnboard(alice, "Ana", "avatar-a.jpg");
  await signupAndOnboard(bob, "Ben", "avatar-b.jpg");

  await Promise.all([startDating(alice), startDating(bob)]);

  // Wait for media to actually attach before measuring.
  await expect
    .poll(
      () =>
        alice.evaluate(() => {
          const v = document.querySelector("main video") as HTMLVideoElement;
          return v?.videoWidth ?? 0;
        }),
      { timeout: 40_000 },
    )
    .toBeGreaterThan(0);

  for (const vp of VIEWPORTS) {
    await alice.setViewportSize({ width: vp.width, height: vp.height });
    // Let layout settle after the resize.
    await alice.waitForTimeout(300);

    const m = await alice.evaluate(() => {
      const video = document.querySelector("main video") as HTMLVideoElement;
      const leave = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Leave date"),
      )!;
      const r = video.getBoundingClientRect();
      const l = leave.getBoundingClientRect();
      return {
        verticalScroll:
          document.documentElement.scrollHeight > window.innerHeight + 1,
        horizontalScroll:
          document.documentElement.scrollWidth > window.innerWidth + 1,
        videoWithinViewport: r.bottom <= window.innerHeight + 1 && r.top >= -1,
        leaveVisible:
          l.bottom <= window.innerHeight + 1 && l.top >= 0 && l.width > 0,
      };
    });

    expect(m.verticalScroll, `${vp.name}: must not scroll vertically`).toBe(false);
    expect(m.horizontalScroll, `${vp.name}: must not scroll horizontally`).toBe(false);
    expect(m.videoWithinViewport, `${vp.name}: video inside viewport`).toBe(true);
    expect(m.leaveVisible, `${vp.name}: Leave date always reachable`).toBe(true);
  }

  await alice.getByRole("button", { name: "Leave date" }).click();
  await alice.waitForURL("**/app/decision/**", { timeout: 30_000 });

  await contextA.close();
  await contextB.close();
});
