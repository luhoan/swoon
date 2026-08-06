# Account Appeals and Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let suspended and banned members submit an appeal, and let human reviewers restore accounts from either the appeal queue or a persistent restricted-account list.

**Architecture:** PostgreSQL owns appeal eligibility, safe reads, moderation authorization, cooldowns, and atomic state transitions through four `SECURITY DEFINER` functions. Next.js server components and server actions expose those operations through a dedicated member page and additions to the existing moderation dashboard; Playwright and live-Supabase integration tests verify the complete flow.

**Tech Stack:** Next.js 15 App Router, React 19 server actions, TypeScript, Supabase/PostgreSQL with RLS, Tailwind CSS 4, Vitest, Playwright.

## Global Constraints

- Appeals are available only while `account_status` is `suspended` or `banned`; quarantines stay in the report-review flow.
- Member statements are required after trimming and contain 20–4,000 characters.
- Review notes are required after trimming and contain 1–2,000 characters.
- One open appeal is allowed per member; an upheld appeal starts a seven-day cooldown.
- Members never receive reviewer identity, internal notes, report details, or audit data.
- Restoring an account does not reverse blocks, unmatches, reports, or moderation history.
- All multi-row state transitions are transactional database functions, not client-side sequences.
- Existing user-owned `.vscode/` files must remain untouched.

---

## File Structure

- `supabase/migrations/0008_account_appeals.sql`: appeal table, indexes, RLS posture, safe member read RPC, submission RPC, moderator resolution RPC, and direct restoration RPC.
- `tests/account-appeals.test.ts`: live-database authorization, privacy, validation, cooldown, and atomic-transition coverage.
- `src/lib/domain/types.ts`: shared member-safe appeal and admin appeal/profile shapes.
- `src/app/appeal/actions.ts`: member server-action state and database error translation.
- `src/app/appeal/appeal-form.tsx`: accessible client form with pending and error states.
- `src/app/appeal/page.tsx`: restricted-account explanation and appeal status page.
- `src/app/app/layout.tsx`: global suspended/banned redirect.
- `src/middleware.ts`: authentication gate for `/appeal`.
- `src/app/admin/actions.ts`: typed appeal-resolution and direct-restoration server actions.
- `src/app/admin/moderation-forms.tsx`: client forms that surface pending, success, and actionable error states.
- `src/app/admin/restricted-accounts.tsx`: searchable restricted-member list and restoration controls.
- `src/app/admin/page.tsx`: server-loaded appeals and restricted accounts integrated with the report queue.
- `e2e/account-appeals.spec.ts`: browser-level restricted-member, appeal, restore, uphold, direct unban, privacy, and responsive checks.
- `README.md`: moderation dashboard capabilities and appeal-flow documentation.

### Task 1: Database Contract and Security

**Files:**
- Create: `tests/account-appeals.test.ts`
- Create: `supabase/migrations/0008_account_appeals.sql`

**Interfaces:**
- Produces: `submit_account_appeal(p_statement text) returns uuid`
- Produces: `get_my_account_appeals() returns table (id uuid, restriction_status text, statement text, status text, created_at timestamptz, reviewed_at timestamptz)`
- Produces: `resolve_account_appeal(p_appeal uuid, p_decision text, p_note text) returns void`
- Produces: `restore_restricted_account(p_target uuid, p_reason text) returns void`

- [ ] **Step 1: Write the failing database tests**

Create isolated users with real authenticated Supabase clients, promote one to moderator through the service-role client, and cover literal outcomes. The core assertions are:

```ts
await admin.from("profiles").update({ account_status: "banned" }).eq("user_id", banned.id);

const { data: appealId, error } = await banned.client.rpc(
  "submit_account_appeal",
  { p_statement: "I believe this ban was applied to the wrong account." },
);
expect(error).toBeNull();
expect(appealId).toMatch(/^[0-9a-f-]{36}$/);

const { data: safeRows } = await banned.client.rpc("get_my_account_appeals");
expect(safeRows).toEqual([
  expect.objectContaining({
    id: appealId,
    restriction_status: "banned",
    status: "open",
  }),
]);
expect(safeRows![0]).not.toHaveProperty("reviewer_id");
expect(safeRows![0]).not.toHaveProperty("review_note");

const { data: directRows, error: directError } = await banned.client
  .from("account_appeals")
  .select("*");
if (!directError) expect(directRows).toEqual([]);
```

Add separate tests for active/quarantined rejection, 19- and 4,001-character statements, duplicate open submissions, ordinary-member moderator RPC denial, uphold preserving `banned`, seven-day cooldown, restore activating the profile, direct restore closing an open appeal, immutable moderation/audit records, and double-resolution rejection. Each test name must identify the production break it catches.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/account-appeals.test.ts`

Expected: FAIL because `submit_account_appeal` and `account_appeals` do not exist.

- [ ] **Step 3: Implement the migration**

Create the table and indexes with explicit state consistency checks:

```sql
create table public.account_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  restriction_status text not null check (restriction_status in ('suspended', 'banned')),
  statement text not null check (char_length(btrim(statement)) between 20 and 4000),
  status text not null default 'open' check (status in ('open', 'restored', 'upheld')),
  reviewer_id uuid references auth.users (id) on delete set null,
  review_note text check (
    review_note is null or char_length(btrim(review_note)) between 1 and 2000
  ),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (
    (status = 'open' and reviewer_id is null and review_note is null and reviewed_at is null)
    or
    (status <> 'open' and review_note is not null and reviewed_at is not null)
  )
);

create unique index one_open_account_appeal
  on public.account_appeals (user_id) where status = 'open';
create index account_appeals_review_queue
  on public.account_appeals (status, created_at);
alter table public.account_appeals enable row level security;
```

Implement an internal `assert_moderator()` helper that checks `auth.uid()` and `profiles.role`. Implement all four public functions with fixed `search_path`, explicit row locks, trimmed text, exact errors (`appeal_not_allowed`, `appeal_statement_invalid`, `appeal_already_open`, `appeal_cooldown`, `appeal_rate_limited`, `appeal_not_found`, `appeal_already_resolved`, `appeal_decision_invalid`, `review_note_invalid`, `account_not_restricted`, `not_moderator`), and `public.audit(...)` calls. Revoke default execute and grant only the four public RPCs to `authenticated`; do not grant `assert_moderator` or direct table privileges.

- [ ] **Step 4: Apply the migration**

Run: `pnpm db:push`

Expected: `apply  0008_account_appeals.sql ... ok` followed by `migrations up to date`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm vitest run tests/account-appeals.test.ts`

Expected: all account-appeal tests pass, with created users removed in `afterAll`.

- [ ] **Step 6: Commit the database contract**

```powershell
git add -- supabase/migrations/0008_account_appeals.sql tests/account-appeals.test.ts
git commit -m "feat: add secure account appeal workflow"
```

### Task 2: Restricted-Member Appeal Page

**Files:**
- Modify: `src/lib/domain/types.ts`
- Create: `src/app/appeal/actions.ts`
- Create: `src/app/appeal/appeal-form.tsx`
- Create: `src/app/appeal/page.tsx`
- Modify: `src/app/app/layout.tsx`
- Modify: `src/middleware.ts`
- Create: `e2e/account-appeals.spec.ts`

**Interfaces:**
- Consumes: `submit_account_appeal` and `get_my_account_appeals` from Task 1.
- Produces: `AppealSummary` and `AppealActionState` TypeScript types.
- Produces: authenticated `/appeal` route and suspended/banned `/app` redirect.

- [ ] **Step 1: Write the failing member-flow E2E test**

Create a member with `signupAndOnboard`, use the service client to set `account_status: 'banned'`, and assert:

```ts
await member.goto("/app/lobby");
await member.waitForURL("**/appeal");
await expect(member.getByRole("heading", { name: "Your account is restricted" })).toBeVisible();

await member.getByLabel("Why should we review this decision?").fill(
  "I believe this ban belongs to a different account and would like a review.",
);
await member.getByRole("button", { name: "Submit appeal" }).click();
await expect(member.getByRole("heading", { name: "Appeal received" })).toBeVisible();
await expect(member.getByText(/internal review note/i)).toHaveCount(0);
```

Also assert a short statement shows an inline validation message, active members visiting `/appeal` return to `/app/lobby`, the page has a usable Log out button, and a 320×640 viewport has no horizontal overflow.

- [ ] **Step 2: Run the focused browser test and verify RED**

Run: `npx playwright test e2e/account-appeals.spec.ts --grep "member appeal"`

Expected: FAIL because `/app/lobby` does not redirect and `/appeal` is missing.

- [ ] **Step 3: Add the shared safe appeal type**

```ts
export interface AppealSummary {
  id: string;
  restriction_status: "suspended" | "banned";
  statement: string;
  status: "open" | "restored" | "upheld";
  created_at: string;
  reviewed_at: string | null;
}
```

- [ ] **Step 4: Implement the server action and client form**

The action trims the submitted statement, performs the same 20–4,000 character validation for immediate feedback, calls `submit_account_appeal`, maps exact database errors to member-safe copy, revalidates `/appeal`, and redirects there on success. The form uses `useActionState`, a labeled `<textarea minLength={20} maxLength={4000} required>`, `aria-describedby`, an error with `role="alert"`, and a pending-disabled **Submit appeal** button.

- [ ] **Step 5: Implement the restricted-account page and route gates**

In `/app/layout.tsx`, after onboarding checks:

```ts
if (
  profile.account_status === "suspended" ||
  profile.account_status === "banned"
) {
  redirect("/appeal");
}
```

Add `/appeal` to the middleware's `needsAuth` condition. The page loads the current profile and safe RPC rows, redirects active/quarantined members to the lobby, and renders one of three states: appeal form, open/received, or upheld/cooldown. Use existing brand tokens, `BrandLockup`, `Card`, and `SignOutButton`; do not expose fields outside `AppealSummary`.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `npx playwright test e2e/account-appeals.spec.ts --grep "member appeal"`

Expected: member appeal tests pass at desktop and 320px.

- [ ] **Step 7: Commit the member flow**

```powershell
git add -- src/lib/domain/types.ts src/app/appeal src/app/app/layout.tsx src/middleware.ts e2e/account-appeals.spec.ts
git commit -m "feat: let restricted members appeal"
```

### Task 3: Human Review and Direct Unban

**Files:**
- Modify: `src/app/admin/actions.ts`
- Create: `src/app/admin/moderation-forms.tsx`
- Create: `src/app/admin/restricted-accounts.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `e2e/account-appeals.spec.ts`

**Interfaces:**
- Consumes: `resolve_account_appeal` and `restore_restricted_account` from Task 1.
- Produces: `reviewAppeal(previousState, formData)` and `restoreAccount(previousState, formData)` server actions.
- Produces: appeal review queue and searchable restricted-account list on `/admin`.

- [ ] **Step 1: Extend the E2E test with failing moderator flows**

Promote a browser account to moderator and verify two independent behaviors:

```ts
const appealCard = moderator.locator("article", { hasText: memberName });
await appealCard.getByLabel("Internal review note").fill("Identity details verified.");
await appealCard.getByRole("button", { name: "Restore account" }).click();
await expect(appealCard).toHaveCount(0);

await member.goto("/app/lobby");
await expect(member.getByRole("heading", { name: new RegExp(memberName) })).toBeVisible();
```

For direct unban, ban a second account without creating an appeal, search by its display name in **Restricted accounts**, restore it with a required reason, and assert the service-role profile read is `active`. Add an uphold case that leaves a third profile `banned`, shows the upheld state to the member without internal notes, and rejects an immediate resubmission with cooldown copy.

- [ ] **Step 2: Run the focused moderator tests and verify RED**

Run: `npx playwright test e2e/account-appeals.spec.ts --grep "moderator"`

Expected: FAIL because `/admin` has no appeal or restricted-account sections.

- [ ] **Step 3: Implement typed moderator server actions**

Define:

```ts
export interface ModerationActionState {
  ok: boolean;
  error: string | null;
}

export async function reviewAppeal(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState>;

export async function restoreAccount(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState>;
```

Each action calls `requireModerator()` first, validates required IDs/decision/note, uses the cookie-bound `supabaseServer()` client to call the moderator RPC, maps exact stale/authorization/validation errors to actionable copy, and revalidates `/admin` plus `/appeal` on success.

- [ ] **Step 4: Implement accessible review forms and restricted search**

`AppealReviewForm` uses `useActionState(reviewAppeal, initialState)`, hidden appeal ID, one labeled internal-note field, and distinct **Restore account** and **Uphold restriction** submit buttons. `RestoreAccountForm` uses a labeled reason and explicit **Restore account** submit button. Both render `role="alert"` errors and disable all controls while pending.

`RestrictedAccounts` filters the server-provided suspended/banned rows by case-insensitive display name substring or exact/partial user ID. It renders an empty search result message rather than hiding the section.

- [ ] **Step 5: Load and render admin review data**

In `admin/page.tsx`, service-role queries load open appeals oldest first and up to 100 suspended/banned profiles. Render **Appeals** and **Restricted accounts** before the existing report queue. Keep the report queue's reinstate behavior only for quarantined profiles and label that button **Clear quarantine**; do not remove the underlying `reinstate` moderation verb.

- [ ] **Step 6: Run the focused moderator tests and verify GREEN**

Run: `npx playwright test e2e/account-appeals.spec.ts --grep "moderator"`

Expected: appeal restore, uphold, cooldown, direct unban, privacy, and search tests pass.

- [ ] **Step 7: Run the entire account-appeal E2E file**

Run: `npx playwright test e2e/account-appeals.spec.ts`

Expected: all member and moderator appeal tests pass.

- [ ] **Step 8: Commit the reviewer flow**

```powershell
git add -- src/app/admin/actions.ts src/app/admin/moderation-forms.tsx src/app/admin/restricted-accounts.tsx src/app/admin/page.tsx e2e/account-appeals.spec.ts
git commit -m "feat: add appeal review and account restoration"
```

### Task 4: Documentation and Full Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed member and moderator workflows.
- Produces: operator-facing documentation and verified release state.

- [ ] **Step 1: Document the operational flow**

Update the moderation dashboard section to state that `/admin` handles reports, account appeals, and direct restoration of suspended/banned accounts. Add that restricted members are routed to `/appeal`, and migrations must be applied with `pnpm db:push` before deploying the UI.

- [ ] **Step 2: Run static verification**

Run: `pnpm typecheck`

Expected: exit 0 with no TypeScript diagnostics.

Run: `pnpm lint`

Expected: exit 0 with no ESLint errors or warnings introduced by this change.

- [ ] **Step 3: Run all database integration tests**

Run: `pnpm test`

Expected: all existing and new Vitest tests pass.

- [ ] **Step 4: Run the full browser suite**

Run: `pnpm test:e2e`

Expected: all Playwright tests pass, including `account-appeals.spec.ts`.

- [ ] **Step 5: Build the production application**

Run: `pnpm build`

Expected: Next.js production build exits 0.

- [ ] **Step 6: Audit requirements and diff**

Run: `git diff --check HEAD~3..HEAD`

Run: `git status --short`

Confirm the current work proves: latest changes were pulled; suspended/banned members can submit a private appeal; human reviewers can restore from an appeal; human reviewers can directly unban after reports close; uphold leaves restrictions intact; quarantine recovery still exists; every state transition is audited; `.vscode/` remains untouched.

- [ ] **Step 7: Commit documentation if changed**

```powershell
git add -- README.md
git commit -m "docs: explain account appeal operations"
```
