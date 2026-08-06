# Account Appeals and Restoration Design

**Date:** 2026-08-05

## Goal

Give restricted Swoon members an in-product appeal form and give human reviewers a reliable way to restore suspended or banned accounts, including accounts whose original report is already closed.

## Scope

This change covers account-level suspensions and bans. A quarantined account is already waiting for human review of an open safety report, so it continues through the existing report queue and does not create a parallel appeal.

An appeal does not automatically change an account restriction. Only a moderator or administrator can restore an account. Existing matches and messages remain available after restoration according to their existing status; restoration does not recreate blocked or unmatched relationships.

## Member Experience

When an authenticated member has `account_status = 'suspended'` or `account_status = 'banned'`, every route under `/app` redirects to `/appeal`. The `/appeal` route is authenticated but lives outside `/app`, which avoids a redirect loop.

The page explains that the account cannot currently use Swoon, identifies the restriction as a suspension or ban, and offers a required explanation field of 20–4,000 characters. The member can submit one open appeal at a time.

After submission, the same page shows a received state and the submission date. While the appeal is open, the form is hidden. After a reviewer restores the account, the next visit redirects to `/app/lobby`. After a reviewer upholds the restriction, the page shows the decision and permits a new appeal only after a seven-day cooldown. This keeps the process available while preventing immediate resubmission loops.

The page always includes sign-out and `info@tryswoon.live` as an alternate contact for access problems. It never reveals moderator identity, internal notes, reporter identity, report details, or audit data.

Active and quarantined members who visit `/appeal` are redirected to `/app/lobby`.

## Data Model

A new `account_appeals` table stores:

- `id uuid primary key`
- `user_id uuid not null` referencing `auth.users` with cascade deletion
- `restriction_status text not null`, constrained to `suspended` or `banned`, as a submission-time snapshot
- `statement text not null`, constrained to 20–4,000 characters after trimming
- `status text not null`, constrained to `open`, `restored`, or `upheld`
- `reviewer_id uuid`, nullable, referencing `auth.users` with `on delete set null`
- `review_note text`, nullable, constrained to 1–2,000 characters when present
- `created_at timestamptz not null`
- `reviewed_at timestamptz`, nullable

A partial unique index on `user_id` where `status = 'open'` enforces one open appeal per member. An index on `(status, created_at)` supports the human-review queue.

Row-level security is enabled with no direct member policies. Members read a safe projection through `get_my_account_appeals()`, which returns only `id`, `restriction_status`, `statement`, `status`, `created_at`, and `reviewed_at` for `auth.uid()`. It never returns reviewer identity or internal notes. Direct selects, inserts, updates, and deletes are not granted; all access uses database functions. Moderation history and audit tables remain invisible to members.

## Database Operations

### `submit_account_appeal(statement text)`

This authenticated `SECURITY DEFINER` function:

1. Resolves the caller from `auth.uid()` and locks their profile row.
2. Requires the current account status to be `suspended` or `banned`.
3. Trims and validates the statement length.
4. Rejects an existing open appeal.
5. If the latest appeal was upheld less than seven days ago and the account remains restricted, rejects the submission with `appeal_cooldown`.
6. Inserts the appeal with a snapshot of the current restriction.
7. Appends an `appeal_submitted` audit event without copying the member's statement into the audit detail.
8. Returns the new appeal ID.

After validation, the function consumes from a two-submission token bucket that refills at one token every 12 hours. This database rate limit supplements the open-appeal and cooldown rules.

### `resolve_account_appeal(appeal_id uuid, decision text, note text)`

This authenticated `SECURITY DEFINER` function verifies that the caller has the `moderator` or `admin` role, then locks the appeal and target profile in a single transaction.

For `restore`, it changes the target profile to `active`, marks the appeal `restored`, records a `reinstate` moderation action with no report ID, and appends an `appeal_restored` audit event.

For `uphold`, it requires the target to still be suspended or banned, leaves the restriction unchanged, marks the appeal `upheld`, and appends an `appeal_upheld` audit event.

Both outcomes store the reviewer, trimmed review note, and review timestamp. The note is required and limited to 1–2,000 characters. The function rejects already-resolved appeals so double submissions cannot create duplicate decisions.

### `restore_restricted_account(target_user_id uuid, reason text)`

This authenticated `SECURITY DEFINER` function verifies the moderator role, locks the target profile, requires its current state to be `suspended` or `banned`, and sets it to `active`. It records a `reinstate` moderation action and `moderation_reinstate` audit event.

If the member has an open appeal, the same transaction marks that appeal `restored` with the moderator and reason. This prevents a direct restoration from leaving a stale open appeal behind.

## Human Review Experience

The existing `/admin` page gains two sections above recently handled reports:

1. **Appeals** lists open appeals oldest first. Each card shows the member's display name, current account status, restriction snapshot, submission time, and appeal statement. A required internal note accompanies **Restore account** and **Uphold restriction** actions.
2. **Restricted accounts** lists suspended and banned profiles even when they have no open report or appeal. Reviewers can search by display name or user ID and use **Restore account** with a required reason.

The report queue keeps its existing moderation actions. When an open report has automatically quarantined the reported account, its existing `Reinstate` control remains available but is labeled **Clear quarantine**. Suspended and banned restoration belongs in the restricted-account and appeal sections, where it remains available after a report closes.

Destructive-looking actions use explicit labels and status-dependent styling. Forms display actionable server errors instead of silently returning after failed database writes.

## Application Boundaries

- The root `/app` layout owns the suspended/banned redirect so every authenticated product screen is consistently gated.
- `/appeal` owns member-facing appeal status and submission.
- `/admin` owns human review and direct restoration controls.
- PostgreSQL owns eligibility, validation, authorization, concurrency, account-state changes, moderation records, and audit records.
- Server actions translate database outcomes into form states and revalidate the affected routes; they do not perform privileged multi-step mutations themselves.

## Error Handling

Member-facing errors distinguish invalid length, an appeal already being open, the seven-day cooldown, and a generic retryable failure. Reviewer-facing errors distinguish stale/already-reviewed appeals, an already-active account, invalid notes, and authorization failures.

All database functions fail before changing state when validation or authorization fails. Review resolution and restoration are transactional, so profile, appeal, moderation-action, and audit updates either all succeed or all roll back.

## Testing

Database integration tests will prove:

- active and quarantined members cannot submit appeals;
- suspended and banned members can submit a valid appeal;
- members receive only the safe fields from their own appeals and cannot query the table directly;
- blank, short, oversized, duplicate-open, and cooldown submissions fail;
- ordinary members cannot resolve appeals or restore accounts;
- restore resolution activates the account and records the appeal decision, moderation action, and audit event atomically;
- uphold resolution leaves the restriction unchanged and records the decision;
- direct restoration activates a restricted account and closes any open appeal;
- a resolved appeal cannot be resolved twice.

End-to-end tests will prove:

- a banned member is redirected from `/app` to `/appeal`;
- the member can submit the form and sees the received state;
- a moderator sees the appeal and restores the member;
- a moderator can restore a banned member with no open appeal from the restricted-account list;
- the restored member can enter the lobby and date again;
- the appeal and admin views fit existing mobile breakpoints and retain keyboard-visible focus states.

The final verification gate is `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.

## Non-Goals

- Email notifications or external ticketing integrations
- File attachments or evidence uploads
- Appeals for quarantines, warnings, individual blocks, or unmatched relationships
- Automatically reversing blocks, matches, reports, or moderation history
- Exposing internal reviewer notes to the appealing member
