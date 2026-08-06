# Appeal Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email `info@tryswoon.live` after each committed account appeal and ensure notifications are sent only when that shared Swoon account has moderator access.

**Architecture:** A server-only coordinator validates optional Resend configuration, verifies the configured recipient maps to a `moderator` or `admin` profile, and posts a privacy-minimized message to Resend with the appeal ID as its idempotency key. The existing appeal action awaits this coordinator after the database RPC commits, but treats delivery failure as non-fatal. A one-time script promotes the existing shared account and verifies its final access.

**Tech Stack:** Next.js 15 server actions, TypeScript, Supabase Admin API, Resend HTTPS API via native `fetch`, Zod, Vitest, Playwright.

## Global Constraints

- Send notifications to `info@tryswoon.live` by default.
- Never include the member's appeal statement or an authentication/action token in email.
- `/admin` and its existing `moderator`/`admin` role checks remain the only decision boundary.
- Never grant moderation rights automatically during signup.
- A committed appeal must remain successful when email is disabled or delivery fails.
- Use the appeal UUID as the Resend idempotency key.
- Keep Resend credentials server-only.

---

### Task 1: Server-only appeal notification service

**Files:**
- Create: `src/lib/appeals/notification.ts`
- Test: `tests/appeal-notification.test.ts`

**Interfaces:**
- Produces: `notifyAppealReviewer(input, dependencies?) => Promise<NotificationResult>`
- Input: `{ appealId: string; restrictionStatus: "suspended" | "banned"; submittedAt: string }`
- Result: `{ status: "sent" | "skipped" | "failed"; reason?: string }`
- Dependencies: optional `env`, `fetch`, and `reviewerHasAccess(email)` overrides for deterministic tests.

- [ ] **Step 1: Write failing configuration, privacy, access, delivery, and idempotency tests**

Create tests that supply a complete in-memory environment and mocked fetch:

```ts
const input = {
  appealId: "11111111-1111-4111-8111-111111111111",
  restrictionStatus: "banned" as const,
  submittedAt: "2026-08-06T12:00:00.000Z",
};

expect(request.to).toBe("info@tryswoon.live");
expect(request.text).not.toContain("member statement");
expect(headers["Idempotency-Key"]).toBe(`appeal-${input.appealId}`);
expect(result.status).toBe("sent");
```

Also assert that missing configuration returns `skipped`, denied reviewer access returns `skipped` without calling fetch, and HTTP 500 returns `failed` without exposing the response body.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx --yes pnpm@10.15.1 vitest run tests/appeal-notification.test.ts`

Expected: FAIL because `@/lib/appeals/notification` does not exist.

- [ ] **Step 3: Implement configuration and message construction**

Use a Zod schema with optional delivery:

```ts
const notificationEnvSchema = z.object({
  RESEND_API_KEY: z.string().min(1).optional(),
  APPEAL_REVIEW_EMAIL: z.string().email().default("info@tryswoon.live"),
  APPEAL_EMAIL_FROM: z.string().min(3).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});
```

Build the review URL with `new URL("/admin#appeals-heading", appUrl)`. The input type deliberately contains no appeal statement. Send JSON to `https://api.resend.com/emails` with `Authorization: Bearer ...`, `Content-Type: application/json`, and `Idempotency-Key: appeal-${appealId}`. Return sanitized result objects rather than throwing provider response bodies.

- [ ] **Step 4: Implement reviewer authorization dependency and production adapter**

The default verifier uses `supabaseAdmin().auth.admin.listUsers()` to find the exact lower-cased recipient email, reads that user's `profiles.role`, and returns true only for `moderator` or `admin`. Paginate until the user is found or the directory is exhausted. Do not mutate roles in request handling.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx --yes pnpm@10.15.1 vitest run tests/appeal-notification.test.ts`

Expected: all notification tests pass with no network calls.

- [ ] **Step 6: Commit notification service**

```powershell
git add src/lib/appeals/notification.ts tests/appeal-notification.test.ts
git commit -m "feat: notify authorized appeal reviewer by email"
```

### Task 2: Appeal submission integration

**Files:**
- Modify: `src/app/appeal/actions.ts`
- Test: `tests/appeal-action.test.ts`

**Interfaces:**
- Consumes: `notifyAppealReviewer({ appealId, restrictionStatus, submittedAt })`
- Existing public interface remains `submitAppeal(previous, formData)`.

- [ ] **Step 1: Write failing server-action tests**

Mock `supabaseServer`, `notifyAppealReviewer`, `revalidatePath`, and `redirect`. Make the submit RPC return an appeal UUID and `get_my_account_appeals` return the matching safe row. Assert the coordinator receives only ID, restriction status, and timestamp. Add a second test where the coordinator throws and assert the action still revalidates and redirects.

```ts
expect(notifyAppealReviewer).toHaveBeenCalledWith({
  appealId,
  restrictionStatus: "banned",
  submittedAt: "2026-08-06T12:00:00.000Z",
});
expect(redirect).toHaveBeenCalledWith("/appeal");
```

- [ ] **Step 2: Run the focused action test and verify RED**

Run: `npx --yes pnpm@10.15.1 vitest run tests/appeal-action.test.ts`

Expected: FAIL because submission does not invoke the notifier.

- [ ] **Step 3: Capture the RPC result and retrieve the matching safe appeal projection**

Change the submit call to retain `data` as `appealId`. After success, call `get_my_account_appeals`, find the matching ID, and use only its `restriction_status` and `created_at` fields.

- [ ] **Step 4: Await delivery without changing member success semantics**

Call the notifier inside a narrow `try/catch`. Log only the appeal ID and sanitized error category. Regardless of skipped, failed, or thrown delivery, continue to `revalidatePath("/appeal")` and `redirect("/appeal")`.

- [ ] **Step 5: Run focused action and notification tests**

Run: `npx --yes pnpm@10.15.1 vitest run tests/appeal-action.test.ts tests/appeal-notification.test.ts`

Expected: both files pass.

- [ ] **Step 6: Commit action integration**

```powershell
git add src/app/appeal/actions.ts tests/appeal-action.test.ts
git commit -m "feat: email staff after appeal submission"
```

### Task 3: Shared reviewer provisioning

**Files:**
- Create: `src/lib/admin/reviewer-provisioning.ts`
- Create: `scripts/setup-appeal-reviewer.ts`
- Modify: `package.json`
- Test: `tests/reviewer-provisioning.test.ts`

**Interfaces:**
- Produces: `provisionAppealReviewer(directory, email) => Promise<{ userId: string; role: "moderator" | "admin" }>`
- `directory` exposes `findUserByEmail`, `getProfileRole`, and `setProfileRole` so tests do not contact Supabase.
- Package command: `reviewer:setup`.

- [ ] **Step 1: Write failing provisioning tests**

Assert that a missing auth account or profile rejects, `member` is promoted to `moderator`, and existing `moderator` or `admin` access is preserved without a downgrade.

- [ ] **Step 2: Run the focused provisioning test and verify RED**

Run: `npx --yes pnpm@10.15.1 vitest run tests/reviewer-provisioning.test.ts`

Expected: FAIL because the provisioning module does not exist.

- [ ] **Step 3: Implement the pure provisioning coordinator**

Normalize the configured email, reject empty/non-email values, look up the exact auth user, verify its profile, update only a `member` profile to `moderator`, then re-read and return the final allowed role. Never create an auth user.

- [ ] **Step 4: Add the Supabase script adapter**

Load `.env.local` and `.env`, default `APPEAL_REVIEW_EMAIL` to `info@tryswoon.live`, create a service-role client, adapt auth/profile operations to the pure coordinator, and print only the email and resulting role. Exit nonzero with a concise setup instruction when the account is absent.

- [ ] **Step 5: Add and verify the package command**

Add `"reviewer:setup": "tsx scripts/setup-appeal-reviewer.ts"` to `package.json` and run the focused test. Do not run the production adapter until the shared account exists.

- [ ] **Step 6: Commit provisioning**

```powershell
git add src/lib/admin/reviewer-provisioning.ts scripts/setup-appeal-reviewer.ts tests/reviewer-provisioning.test.ts package.json
git commit -m "feat: provision shared appeal reviewer"
```

### Task 4: Configuration and operating documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Documents: `RESEND_API_KEY`, `APPEAL_REVIEW_EMAIL`, `APPEAL_EMAIL_FROM`, `reviewer:setup`.

- [ ] **Step 1: Add server-only email variables**

Document values without secrets:

```dotenv
RESEND_API_KEY=
APPEAL_REVIEW_EMAIL=info@tryswoon.live
APPEAL_EMAIL_FROM=Swoon Appeals <appeals@updates.tryswoon.live>
```

- [ ] **Step 2: Document the exact production runbook**

Add ordered steps: create the shared Swoon account, run `pnpm reviewer:setup`, verify the Resend sending subdomain, configure production environment variables, submit a controlled appeal, follow the email link, sign in as the shared account, and verify restore/uphold access. State that email failure never loses the dashboard appeal.

- [ ] **Step 3: Run documentation and diff checks**

Run: `git diff --check`

Expected: no errors or credential values.

- [ ] **Step 4: Commit documentation**

```powershell
git add .env.example README.md
git commit -m "docs: add appeal email operations runbook"
```

### Task 5: Full verification and publication

**Files:**
- Verify all changed files and existing suites.

**Interfaces:**
- Produces a fully verified feature branch ready for `main`.

- [ ] **Step 1: Run static and integration checks**

Run: `npx --yes pnpm@10.15.1 typecheck`

Run: `npx --yes pnpm@10.15.1 lint`

Run: `npx --yes pnpm@10.15.1 test`

Expected: all commands exit 0.

- [ ] **Step 2: Run the complete browser suite**

Start `npx --yes pnpm@10.15.1 dev --port 3210`, then run `node_modules/.bin/playwright test`, then stop that exact server process tree.

Expected: all Playwright journeys pass and no real appeal email is sent without complete email configuration.

- [ ] **Step 3: Run the production build**

Run: `npx --yes pnpm@10.15.1 build`

Expected: optimized production build succeeds.

- [ ] **Step 4: Inspect final scope and generated files**

Restore only generated `tsconfig.tsbuildinfo`, leave `.vscode/` untouched, run `git diff --check`, and verify no secrets or unrelated files are tracked.

- [ ] **Step 5: Merge and publish**

Merge the feature branch into `main`, push `main` to `origin`, and verify the remote SHA matches local `HEAD`.
