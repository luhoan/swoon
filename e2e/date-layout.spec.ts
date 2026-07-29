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

  // Extreme camera geometries must not change the layout at all. Swap in
  // canvas-backed streams with absurd intrinsic sizes (tall portrait, wide
  // cinema, huge 4K) and re-measure.
  await alice.setViewportSize({ width: 1366, height: 620 });
  const RESOLUTIONS = [
    { w: 1440, h: 2560 }, // very tall portrait phone
    { w: 3840, h: 2160 }, // 4K landscape
    { w: 5120, h: 1440 }, // ultrawide
    { w: 480, h: 640 }, // small portrait webcam
  ];

  for (const res of RESOLUTIONS) {
    const m = await alice.evaluate(async ({ w, h }) => {
      const video = document.querySelector("main video") as HTMLVideoElement;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#888";
      ctx.fillRect(0, 0, w, h);
      // Keep painting so the stream produces frames.
      const timer = setInterval(() => {
        ctx.fillRect(0, 0, w, h);
      }, 100);
      video.srcObject = (
        canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }
      ).captureStream(10);
      await video.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
      clearInterval(timer);

      const rect = video.getBoundingClientRect();
      return {
        intrinsic: `${video.videoWidth}x${video.videoHeight}`,
        rendered: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        pageScrolls:
          document.documentElement.scrollHeight > window.innerHeight + 1 ||
          document.documentElement.scrollWidth > window.innerWidth + 1,
        withinViewport:
          rect.bottom <= window.innerHeight + 1 &&
          rect.right <= window.innerWidth + 1,
      };
    }, res);

    expect(
      m.pageScrolls,
      `camera ${res.w}x${res.h} (intrinsic ${m.intrinsic}, rendered ${m.rendered}) must not cause scrolling`,
    ).toBe(false);
    expect(
      m.withinViewport,
      `camera ${res.w}x${res.h} must stay inside the viewport`,
    ).toBe(true);
  }

  await alice.getByRole("button", { name: "Leave date" }).click();
  await alice.waitForURL("**/app/decision/**", { timeout: 30_000 });

  await contextA.close();
  await contextB.close();
});
