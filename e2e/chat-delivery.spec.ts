/**
 * Messages must never be lost in the gap between a chat opening and its
 * realtime subscription going live. Sends the instant the recipient lands
 * on the page — the exact window where a message used to vanish.
 */
import { test, expect } from "@playwright/test";
import { signupAndOnboard, startDating } from "./helpers";

test("no message is lost while the recipient's chat is opening", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const alice = await contextA.newPage();
  const bob = await contextB.newPage();

  await signupAndOnboard(alice, "Nia", "avatar-a.jpg");
  await signupAndOnboard(bob, "Omar", "avatar-b.jpg");

  await Promise.all([startDating(alice), startDating(bob)]);
  await alice.getByRole("button", { name: "Leave date" }).click();
  await alice.waitForURL("**/app/decision/**", { timeout: 30_000 });
  await bob.waitForURL("**/app/decision/**", { timeout: 30_000 });
  await alice.getByRole("button", { name: /Match/ }).click();
  await bob.getByRole("button", { name: /Match/ }).click();
  await alice.waitForURL("**/app/match/**", { timeout: 30_000 });
  const matchId = alice.url().split("/match/")[1]!;

  await alice.goto(`/app/chat/${matchId}`);
  await expect(alice.getByLabel("Message")).toBeVisible();

  // Force the race deterministically: let Bob's history query hit the server
  // (so its snapshot predates the message), then hold the response open while
  // Alice sends. Any client that only subscribes after history resolves will
  // never see this message.
  let historyFetched = false;
  await bob.route(/\/rest\/v1\/messages\?.*select/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    historyFetched = true;
    await new Promise((r) => setTimeout(r, 4000));
    // The page may have navigated on by now; that is not a test failure.
    await route.fulfill({ response }).catch(() => {});
  });

  const bobOpening = bob.goto(`/app/chat/${matchId}`);
  await expect
    .poll(() => historyFetched, { timeout: 20_000 })
    .toBe(true);

  await alice.getByLabel("Message").fill("Sent during your page load");
  await alice.getByRole("button", { name: "Send" }).click();
  await bobOpening;
  await bob.unroute(/\/rest\/v1\/messages\?.*select/);

  // Bob must end up with the message, whether via history or realtime.
  await expect(
    bob.getByText("Sent during your page load"),
    "message sent while the chat was loading must still arrive",
  ).toBeVisible({ timeout: 20_000 });

  // And a plainly-live message must arrive too.
  await alice.getByLabel("Message").fill("And this one after");
  await alice.getByRole("button", { name: "Send" }).click();
  await expect(bob.getByText("And this one after")).toBeVisible({
    timeout: 20_000,
  });

  // Order is preserved after the history/live merge.
  const order = await bob.evaluate(() =>
    [...document.querySelectorAll("div")]
      .map((d) => d.textContent?.trim())
      .filter(
        (t) => t === "Sent during your page load" || t === "And this one after",
      ),
  );
  expect(order[0]).toBe("Sent during your page load");

  await contextA.close();
  await contextB.close();
});
