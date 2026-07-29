/**
 * Nothing may be cut off on a phone. Checks the public pages at the
 * narrowest widths people actually browse on: no horizontal scrolling, and
 * — the subtler failure — no text clipped by an overflow-hidden ancestor,
 * which looks identical to a rendering bug but scrolls nowhere.
 */
import { test, expect } from "@playwright/test";

const WIDTHS = [320, 375, 390, 430];
const PAGES = ["/", "/safety", "/terms", "/privacy", "/login", "/signup"];

/** Elements that carry content; decorative art is allowed to bleed off-frame. */
const CONTENT_SELECTOR = "h1, h2, h3, p, li, a, button, label, input, summary";

test("public pages fit narrow phone screens", async ({ page }) => {
  test.setTimeout(180_000);
  const failures: string[] = [];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 780 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const result = await page.evaluate((selector) => {
        const vw = document.documentElement.clientWidth;
        const clipped: { text: string; right: number }[] = [];
        document.querySelectorAll(selector).forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          // Ignore anything intentionally hidden off-canvas.
          if (getComputedStyle(el).visibility === "hidden") return;
          if (r.right > vw + 1 || r.left < -1) {
            clipped.push({
              text: (el.textContent || el.tagName).trim().slice(0, 45),
              right: Math.round(r.right),
            });
          }
        });
        return {
          vw,
          scrollWidth: document.documentElement.scrollWidth,
          clipped: clipped.slice(0, 5),
        };
      }, CONTENT_SELECTOR);

      if (result.scrollWidth > result.vw + 1) {
        failures.push(
          `${path} @${width}: page scrolls horizontally (${result.scrollWidth} > ${result.vw})`,
        );
      }
      for (const c of result.clipped) {
        failures.push(
          `${path} @${width}: "${c.text}" extends to ${c.right}px (viewport ${result.vw})`,
        );
      }
    }
  }

  expect(failures.join("\n") || "none", "content must not be cut off").toBe(
    "none",
  );
});
