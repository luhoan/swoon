# Appeal email notifications and shared reviewer access

## Goal

Notify `info@tryswoon.live` whenever a suspended or banned member submits an
appeal, while keeping every moderation decision inside Swoon's authenticated,
audited `/admin` workflow. The same address will be used for a shared Swoon
moderator login.

## User experience

After an appeal is committed successfully, Swoon sends one notification to
`info@tryswoon.live`. The message identifies the restriction type and
submission time and links to the Appeals section of `/admin`. It does not copy
the member's appeal statement into email.

The recipient must sign in as the shared `info@tryswoon.live` Swoon account.
Existing server-side role checks continue to require that account's profile to
have the `moderator` or `admin` role before the appeal queue or its restore and
uphold actions can be used. Email possession never bypasses authentication.
All decisions are attributed to the shared account in existing moderation and
audit records.

## Delivery architecture

The existing `submitAppeal` server action remains the only application entry
point. The database RPC first commits and returns the appeal ID. Only after
that succeeds does a server-only notification module call Resend. Delivery
uses the appeal ID as a 24-hour idempotency key so a repeated server request
does not generate duplicate messages.

The notification module owns configuration validation, message construction,
and provider interaction. It accepts a small delivery dependency so tests can
exercise behavior without network calls. Production configuration uses:

- `RESEND_API_KEY`
- `APPEAL_REVIEW_EMAIL`, defaulting to `info@tryswoon.live`
- `APPEAL_EMAIL_FROM`, expected to be a sender on a verified domain such as
  `Swoon Appeals <appeals@updates.tryswoon.live>`
- `NEXT_PUBLIC_APP_URL`, already used as the canonical application origin

Email failure is fail-open: the appeal remains submitted and the member sees
the normal success state. The server records a sanitized error without API
keys, member statements, or provider response bodies. The appeal remains
visible in `/admin`, which is the source of truth.

## Shared reviewer provisioning

A one-time `reviewer:setup` script locates the exact configured reviewer email
through the Supabase service-role API and promotes its existing profile to
`moderator`. It refuses to create an account or accept arbitrary CLI email
input. This prevents the app's pre-alpha auto-confirming signup flow from
silently granting moderation rights to an unverified claimant.

The operator must first create the `info@tryswoon.live` Swoon account with a
password controlled by the mailbox owner, then run the setup script. The
script verifies the final role and exits nonzero when the account or profile
does not exist. `/admin` remains the final enforcement boundary.

## Security and privacy

- The appeal statement stays in Supabase and is never sent by email.
- No restore, uphold, session, or magic-link token appears in the message.
- Resend credentials are server-only and never included in client bundles.
- The recipient address is configuration-controlled, not member input.
- The review URL is constructed from the configured canonical application URL.
- Provider failures cannot roll back or conceal an already committed appeal.
- Shared-login attribution is intentionally less granular than individual
  reviewer accounts; the audit log will identify the shared account.

## Testing

Unit tests cover message content, statement exclusion, configuration errors,
idempotency keys, and provider failures. Action-level tests verify that a
successful database submission attempts notification and that delivery failure
does not turn a saved appeal into a member-visible failure. Provisioning tests
cover missing accounts and successful moderator promotion without contacting
production services.

The existing database, Playwright, lint, typecheck, and production build suites
remain required. Browser tests do not send real email; provider calls are
disabled or replaced in test environments.

## Deployment

1. Create the shared `info@tryswoon.live` account through Swoon signup.
2. Run the reviewer setup command against the intended Supabase project.
3. Verify an isolated sending subdomain in Resend using its SPF and DKIM DNS
   records.
4. Configure the Resend key, sender, recipient, and canonical app URL in the
   deployment environment.
5. Send a controlled test appeal and confirm the message links to a role-gated
   dashboard where restore and uphold both work.
