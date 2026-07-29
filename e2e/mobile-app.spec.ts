/**
 * Mobile compatibility across the whole product, not just the marketing
 * pages: two emulated iPhones complete signup, onboarding, a live video
 * date, the decision, the match and chat — with every screen audited for
 * clipped content, horizontal scrolling, and tappable controls.
 */
import { test, expect, devices, type Page } from "@playwright/test";
import { signupAndOnboard, startDating } from "./helpers";

const PHONE = devices["iPhone 13"];
const CONTENT = "h1, h2, h3, p, li, a, button, label, input, summary, textarea";
/** Apple HIG / Material both land around 44px for a comfortable tap target. */
const MIN_TAP = 40;

interface Audit {
  horizontalScroll: boolean;
  clipped: { text: string; right: number }[];
  smallTargets: { text: string; size: string }[];
  viewport: number;
}

async function auditScreen(page: Page, label: string) {
  const result: Audit = await page.evaluate((selector) => {
    const vw = document.documentElement.clientWidth;
    const clipped: { text: string; right: number }[] = [];
    const smallTargets: { text: string; size: string }[] = [];

    document.querySelectorAll(selector).forEach((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0) return;
      if (style.visibility === "hidden" || style.display === "none") return;
      // Screen-reader-only helpers (sr-only) are 1x1 and clipped; the real
      // affordance is the visible control that proxies to them.
      if (r.width <= 2 && r.height <= 2) return;

      if (r.right > vw + 1 || r.left < -1) {
        clipped.push({
          text: (el.textContent || el.tagName).trim().slice(0, 45),
          right: Math.round(r.right),
        });
      }

      // Only standalone interactive controls need a comfortable tap target.
      // WCAG 2.5.8 exempts links that sit inline in a sentence, where the
      // line-height of the surrounding prose constrains the height.
      const tag = el.tagName.toLowerCase();
      const isInlineProseLink = tag === "a" && style.display === "inline";
      const interactive =
        tag === "button" ||
        (tag === "a" && (el as HTMLAnchorElement).href && !isInlineProseLink) ||
        (tag === "input" &&
          !["hidden", "checkbox", "radio"].includes(
            (el as HTMLInputElement).type,
          ));
      if (interactive && (r.height < 40 || r.width < 24)) {
        smallTargets.push({
          text: (el.textContent || (el as HTMLInputElement).name || tag)
            .trim()
            .slice(0, 35),
          size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        });
      }
    });

    return {
      horizontalScroll: document.documentElement.scrollWidth > vw + 1,
      clipped: clipped.slice(0, 6),
      smallTargets: smallTargets.slice(0, 6),
      viewport: vw,
    };
  }, CONTENT);

  expect(
    result.horizontalScroll,
    `${label}: must not scroll sideways on a phone`,
  ).toBe(false);
  expect(
    result.clipped.map((c) => `"${c.text}" → ${c.right}px`).join("; ") || "none",
    `${label}: content cut off (viewport ${result.viewport}px)`,
  ).toBe("none");
  expect(
    result.smallTargets.map((t) => `"${t.text}" ${t.size}`).join("; ") || "none",
    `${label}: controls too small to tap comfortably (min ${MIN_TAP}px tall)`,
  ).toBe("none");
}

test("the whole product works on a phone", async ({ browser }) => {
  test.setTimeout(420_000);

  const contextA = await browser.newContext({
    ...PHONE,
    permissions: ["camera", "microphone"],
  });
  const contextB = await browser.newContext({
    ...PHONE,
    permissions: ["camera", "microphone"],
  });
  const alice = await contextA.newPage();
  const bob = await contextB.newPage();

  // ---- Marketing + policy pages -----------------------------------------
  for (const path of ["/", "/safety", "/terms", "/privacy"]) {
    await alice.goto(path);
    await alice.waitForLoadState("networkidle");
    await auditScreen(alice, `marketing ${path}`);
  }

  // ---- Signup and onboarding on a phone ----------------------------------
  await alice.goto("/signup");
  await auditScreen(alice, "signup");
  await alice.goto("/login");
  await auditScreen(alice, "login");

  await signupAndOnboard(alice, "Mia", "avatar-a.jpg");
  await auditScreen(alice, "lobby");

  await signupAndOnboard(bob, "Leo", "avatar-b.jpg");

  // ---- Preflight: camera check ------------------------------------------
  await alice.goto("/app/preflight");
  await expect(
    alice.getByRole("button", { name: "Start dating" }),
  ).toBeEnabled();
  await auditScreen(alice, "preflight");

  // ---- The live date on two phones ---------------------------------------
  // Both must be in the queue before either can pair — waiting on Alice
  // first would deadlock.
  await Promise.all([
    (async () => {
      await alice.getByRole("button", { name: "Start dating" }).click();
      await alice.waitForURL("**/app/date/**", { timeout: 45_000 });
    })(),
    startDating(bob),
  ]);

  await expect
    .poll(
      () =>
        alice.evaluate(() => {
          const v = document.querySelector("main video") as HTMLVideoElement;
          return v?.videoWidth ?? 0;
        }),
      { timeout: 40_000, message: "remote video should flow on mobile" },
    )
    .toBeGreaterThan(0);

  // The date screen is the one that must never scroll or trap the user.
  const dateFit = await alice.evaluate(() => {
    const video = document.querySelector("main video") as HTMLVideoElement;
    const leave = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Leave date"),
    )!;
    const vr = video.getBoundingClientRect();
    const lr = leave.getBoundingClientRect();
    return {
      scrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      videoInside:
        vr.bottom <= window.innerHeight + 1 && vr.right <= window.innerWidth + 1,
      leaveReachable: lr.bottom <= window.innerHeight + 1 && lr.height >= 40,
      timerVisible: !!document.querySelector("header")?.textContent?.match(/\d:\d\d/),
    };
  });
  expect(dateFit.scrolls, "date must not scroll on a phone").toBe(false);
  expect(dateFit.videoInside, "video must fit the phone screen").toBe(true);
  expect(dateFit.leaveReachable, "Leave date must be reachable by thumb").toBe(
    true,
  );
  expect(dateFit.timerVisible, "timer must be visible on a phone").toBe(true);

  // ---- Decision, match, chat ---------------------------------------------
  await alice.getByRole("button", { name: "Leave date" }).click();
  await alice.waitForURL("**/app/decision/**", { timeout: 30_000 });
  await bob.waitForURL("**/app/decision/**", { timeout: 30_000 });
  await auditScreen(alice, "decision");

  await alice.getByRole("button", { name: /Match/ }).click();
  await bob.getByRole("button", { name: /Match/ }).click();
  await alice.waitForURL("**/app/match/**", { timeout: 30_000 });
  await auditScreen(alice, "match celebration");

  await alice.getByRole("link", { name: "Send a message" }).click();
  await alice.waitForURL("**/app/chat/**");
  await alice.getByLabel("Message").fill("Typing this from a phone");
  await alice.getByRole("button", { name: "Send" }).click();
  await expect(alice.getByText("Typing this from a phone")).toBeVisible();
  await auditScreen(alice, "chat");

  // ---- Remaining app screens ---------------------------------------------
  const APP_SCREENS = [
    ["/app/matches", "matches"],
    ["/app/settings", "settings"],
    ["/app/lobby", "lobby with matches"],
    [`/app/chat/${alice.url().split("/chat/")[1] ?? ""}`, "chat"],
  ] as const;

  for (const [path, label] of APP_SCREENS) {
    await alice.goto(path);
    await alice.waitForLoadState("networkidle");
    await auditScreen(alice, label);
  }

  // Re-audit the signed-in screens on the narrowest phone people still use,
  // where the public pages were previously clipping.
  await alice.setViewportSize({ width: 320, height: 568 });
  for (const [path, label] of APP_SCREENS) {
    await alice.goto(path);
    await alice.waitForLoadState("networkidle");
    await auditScreen(alice, `${label} @320`);
  }

  await contextA.close();
  await contextB.close();
});
