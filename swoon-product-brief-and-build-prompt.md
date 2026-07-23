# Swoon product brief and full-app build prompt

Prepared July 23, 2026 from:

- The supplied team chat from July 21-23, 2026
- `C:\Users\JiewenHuang\Downloads\swoon\swoon-mvp-scope.pdf`
- `C:\Users\JiewenHuang\Downloads\swoon\logo.png`
- `C:\Users\JiewenHuang\Downloads\swoon\title.png`

## 1. What exists locally

The `Downloads\swoon` folder is an initialized but empty Git repository. It has no commits and no application code. Its remote is configured as `git@github.com:luhoan/swoon.git`.

The folder contains:

- `swoon-mvp-scope.pdf`: a legible three-page pre-alpha scope document created July 23, 2026.
- `logo.png`: a 1254 x 1254 opaque PNG with a rounded-square cream background, a pink swan, curved "Swoon" wordmark, and heart.
- `title.png`: a 1254 x 1254 opaque PNG with the pink swan, thin black "Swoon" wordmark, and the tagline "LIVE VIDEO CHAT SPEED DATING."

## 2. Product requirements summary

### Product concept

Swoon is an adults-only live-video speed-dating product. Its core loop is:

1. A user signs up and creates a basic profile.
2. The user moves through a verification/paywall screen.
3. The user enters a live dating queue.
4. Two users are connected for a timed three-minute video date.
5. Each privately chooses Match or Pass.
6. A mutual Match creates "It's a Swoon!" and unlocks text chat.
7. A Pass returns the user to the lobby without revealing the other person's choice.

The product is closer to Omegle/OmeTV/Azar in interaction speed, but dating is the core loop rather than an added feature. The team wants very low friction and a fast repeat loop.

### Confirmed pre-alpha P0

- Web app, usable by two people on separate machines.
- Email/password sign-up and login.
- Session persistence.
- Basic profile: name, age, photo, and manually entered city. No GPS.
- A visible $5 verification screen.
- In demo mode, the Verify action skips payment and ID verification.
- A Start Dating lobby action and waiting state.
- Stubbed matchmaking that reliably pairs the two demo accounts after a three-to-five-second delay.
- Two-way WebRTC audio/video.
- Prominent 3:00 countdown.
- Automatic end at 0:00.
- Leave Date ends the session early and sends both users back to the lobby.
- Private Match or Pass decision.
- Mutual Match creates an "It's a Swoon!" screen.
- Either person passing returns both to the lobby.
- Basic send/receive text chat after a mutual match, without read receipts.
- Brand treatment on the demo flow.
- One unbroken recorded run of sign-up -> queue -> video -> decisions -> mutual match.

### Confirmed pre-alpha P1

After P0 works, implement the rest of the site.

## 4. UX and visual direction

- Avoid the dark, technical "hacking into the mainframe" feeling called out in the team chat.
- Use a light, romantic, calm, modern UI with generous whitespace and fast transitions.
- Primary palette:
  - blush `#f4cccc`
  - stronger pink `#ffc2c2`
  - charcoal `#2d2727`
  - cream `#eeeeee`
  - restrained blue accent `#4d779d`
- Use the supplied pink swan and wordmark assets, preserving the originals. Create optimized web/mobile derivatives and transparent variants if needed.
- Keep the demo journey short and legible in a 60-second screen recording.
- Desktop date layout: remote video dominant, local picture-in-picture or compact side panel, timer centered and highly visible.
- Mobile date layout: remote video full-height, draggable or fixed local picture-in-picture, thumb-reachable mic/camera controls, distinct Leave and Report actions.
- Show camera/microphone permission and device preview before entering the queue.
- Use soft motion for queueing and matching; respect reduced-motion preferences.
- Meet accessible contrast, keyboard, focus, label, and screen-reader requirements.

## 5. Safety, privacy, and moderation requirements

The team chat mentions the Omegle litigation risk, but the local scope does not yet define a safety program. That is a major missing requirement for a stranger-video dating product.

Before any real-user alpha:

- Treat the service as 18+ unless the founders explicitly decide otherwise. Collect date of birth, store it privately, derive displayed age server-side, and reject under-18 sign-up.
- Require acceptance of Terms, Privacy Policy, Community Guidelines, and explicit camera/mic consent.
- Keep city manual and coarse. Do not expose exact location or GPS in early releases.
- Make Leave, Report, and Block functional and always visible during a date.
- Blocking immediately ends contact, prevents future matching, hides chat/profile access, and does not notify the blocked person.
- Support report categories for nudity/sexual behavior, harassment/hate, underage concern, impersonation/scam, threats/violence, spam, and other.
- Create a restricted moderator dashboard with case status, notes, action history, suspension/ban tools, and immutable audit events.
- Immediately quarantine accounts reported as potentially underage pending human review.
- Do not record dates or capture frames by default. Any future automated live-media moderation or evidence capture needs explicit user disclosure, retention rules, security review, and legal/privacy review.
- Do not store government ID media in the Swoon database. Use a specialized verification provider and retain only provider IDs, status, reason codes, and necessary audit timestamps.
- Rate-limit auth, queue entry, token generation, messages, and reports by user and IP; validate all input.
- Keep analytics free of raw chat, profile photos, date of birth, precise location, LiveKit tokens, and audio/video.
- Add data retention, account deletion, support escalation, appeal, and incident-response procedures before public launch.

The founders should obtain qualified legal advice on age assurance, child-safety escalation/reporting, privacy/biometrics, recording consent, content moderation, app-store rules, and payment treatment before public launch. This brief is a product/engineering plan, not legal advice.

# Copy-paste prompt for a coding AI

You are the principal engineer, product designer, security engineer, and delivery owner for Swoon, an adults-only live-video speed-dating app. Work directly in the existing Swoon repository. Deliver working software, not just a plan or scaffolding.

## Mission and delivery strategy

There are two scopes. They must not be confused:

1. Phase 0 is a deadline-driven, web-only YC demo that must work end to end 
2. Later phases turn that demo into a safe, production-shaped responsive web app and native iOS/Android apps.

Complete and verify Phase 0 before working on later features. Do not allow mobile, real billing, real verification, analytics, advanced matching, or infrastructure work to endanger the demo. Use feature flags and provider interfaces so demo shortcuts are isolated and replaceable.

The YC deadline is Monday, July 27, 2026. Target a usable pre-alpha by Wednesday, July 29, with Monday, August 3 as the fallback. "100% complete" means 100% of the agreed milestone, not every roadmap feature.

## Repository context and source assets

The repository currently contains no application code and no commits. It contains:

- `swoon-mvp-scope.pdf`
- `logo.png`
- `title.png`

Inspect those files before implementation. Preserve the original image files. Create appropriately cropped, compressed, responsive, and transparent derivatives as needed, but never destructively overwrite the source assets.

The source palette is:

- blush: `#f4cccc`
- pink: `#ffc2c2`
- charcoal: `#2d2727`
- cream: `#eeeeee`
- blue accent: `#4d779d`

The visual direction is romantic, calm, light, modern, and fast. Avoid a dark cyberpunk or "hacking into the mainframe" aesthetic. The title asset uses the tagline "LIVE VIDEO CHAT SPEED DATING."

Create `docs/DECISIONS.md`, `docs/OPEN_QUESTIONS.md`, and `docs/ARCHITECTURE.md`. Record all assumptions below. Do not block Phase 0 waiting for unanswered business questions; proceed with the safe working defaults in this prompt.

## Required stack

Use the latest stable, mutually compatible releases available at implementation time. Pin exact versions in the lockfile and document them. Do not use release candidates.

- Package manager/monorepo: pnpm workspaces with Turborepo.
- Language: TypeScript with strict mode and no unexplained `any`.
- Web: Next.js App Router, React, Tailwind CSS, accessible headless components, React Hook Form, and Zod.
- Native mobile: Expo Router and React Native in a later milestone. Use Expo development builds, not Expo Go, because LiveKit's React Native WebRTC support requires native modules.
- Database/backend: Supabase Postgres, Auth, Storage, and Realtime, managed through checked-in SQL migrations and seed scripts.
- Realtime video: LiveKit Cloud using its WebRTC web and React Native SDKs. Do not build raw signaling or self-host TURN for Phase 0.
- Tests: Vitest, React Testing Library, Playwright, Supabase/RLS integration tests, and later React Native Testing Library plus Maestro.
- Observability: provider interfaces with Sentry and PostHog implementations disabled in demo unless credentials are supplied.
- Billing: a provider-neutral entitlement service; later Stripe/RevenueCat adapters, disabled in Phase 0.
- Identity verification: a provider interface and webhook contract only until a vendor is selected.

Use this structure unless repository inspection gives a compelling reason not to:

```text
apps/
  web/                    Next.js marketing site, authenticated app, and restricted admin routes
  mobile/                 Expo app, added only after the web pre-alpha is stable
packages/
  domain/                 domain types, Zod schemas, state machines, permissions, event names
  api-client/             typed clients shared by web and mobile
  design-tokens/          colors, spacing, typography, radii, motion
  analytics/              typed provider-neutral analytics contract and no-op provider
  config/                 environment parsing and feature flags
supabase/
  migrations/
  seed.sql
  tests/
docs/
```

Share domain rules, schemas, API clients, analytics events, and tokens. Do not force web DOM components to be reused in native mobile.

## Feature flags and environments

Implement typed, server-validated environment configuration with at least:

- `DEMO_MODE`
- `REAL_MATCHING_ENABLED`
- `BILLING_ENABLED`
- `IDENTITY_VERIFICATION_ENABLED`
- `ANALYTICS_ENABLED`
- `ERROR_REPORTING_ENABLED`
- `PUSH_NOTIFICATIONS_ENABLED`
- `ADMIN_TOOLS_ENABLED`

Use separate local, preview/staging, and production configurations. `DEMO_MODE` must fail closed in production and must never confer a real verified status or paid entitlement.

Provide `.env.example` with names and descriptions only. Never commit secrets or hardcoded demo passwords. Fail at startup with a clear message when required configuration is absent.

## Phase 0: YC demo requirements

Build this complete path first:

1. Email/password sign-up and login.
2. Persistent authenticated session.
3. Profile onboarding with display name, date of birth/derived age, one photo, and manually entered city. Never use GPS.
4. An 18+ gate. Reject under-18 dates of birth.
5. Verification/paywall screen showing the intended $5 verification concept.
6. In `DEMO_MODE`, the verification action clearly says no charge is taken, writes only a `demo_bypass` state, and continues. It must never create a production verified badge.
7. Lobby with a prominent Start Dating button.
8. Queue/waiting state with "Finding your date..." animation and a deliberate three-to-five-second delay.
9. Stub matching that deterministically pairs the two authenticated demo participants in the same demo cohort. Do not hardcode credentials or expose account IDs in client code.
10. Camera/microphone permission and device preview.
11. A two-person LiveKit WebRTC room with video and audio in separate browsers/machines.
12. Prominent synchronized 3:00 timer derived from server `starts_at`/`ends_at`.
13. Automatic date end at 0:00.
14. Leave Date ends the session for both participants and returns both to the lobby.
15. A private Match or Pass decision screen.
16. If both choose Match, atomically create one match and show "It's a Swoon!"
17. If either chooses Pass, return both users to the lobby without revealing who passed or whether the other person matched.
18. Text-only send/receive chat after mutual match. No attachments, read receipts, typing indicators, or push notifications in Phase 0.
19. Apply the Swoon brand to the lobby, date, decision, and match/chat screens.
20. Produce a repeatable one-unbroken-take demo run on two machines.

If P0 works early, then:

- Deploy the responsive web flow.
- Add always-visible Report and Block controls. These may open clearly marked demo dialogs in the private YC demo, but real side effects are mandatory before inviting real users.

Do not implement real payment, real ID verification, real geographic matching, premium tiers, game modes, analytics collection, native store builds, or push notifications during Phase 0.

## Routes and UX

Use marketing at `/` and the authenticated product under `/app`.

Expected routes:

```text
/
/login
/signup
/onboarding/profile
/onboarding/verification
/app/lobby
/app/date/[sessionId]
/app/decision/[sessionId]
/app/match/[matchId]
/app/chat/[matchId]
/safety
/terms
/privacy
/admin                    later and role-restricted
```

Model the date journey as an explicit state machine:

```text
idle -> preflight -> queued -> matched -> connecting -> active
active -> ending -> decision_pending -> matched | passed -> lobby
```

Handle cancellation, token failure, permission denial, partner disconnect, reconnect, timeout, duplicate tabs, and stale sessions explicitly. UI state must derive from authoritative backend state, not from route changes alone.

Date screen:

- Remote participant video is dominant.
- Local video is a compact picture-in-picture.
- Timer is centered, large, and accessible.
- Mic and camera toggles are thumb reachable.
- Leave and Report are visually distinct and always available.
- Partner disconnect shows a short reconnect grace period, then ends safely.
- The UI never traps a user in a call.

Use accessible labels, focus handling, keyboard navigation, contrast, live announcements for state changes, responsive layout, and reduced-motion support.

## Data model

Implement migrations with UUID primary keys, timestamps, constrained status enums/checks, indexes, foreign keys, and explicit deletion behavior. Include at least:

- `profiles`
  - `user_id`, `display_name`, private `date_of_birth`, derived/display-safe age access, `city`, `photo_path`, onboarding state, timestamps
- `terms_acceptances`
  - user, document type/version, accepted timestamp, source metadata
- `verification_attempts`
  - user, provider, external reference, status including `demo_bypass`, amount/currency concept, reason code, timestamps
- `matchmaking_queue`
  - user, cohort, state, joined/heartbeat/expiry timestamps, future preference snapshot
- `video_sessions`
  - room name, status, starts/ends/ended timestamps, end reason, created by mode
- `video_session_participants`
  - session, user, role, join/leave timestamps
- `date_decisions`
  - session, user, `match` or `pass`, timestamp; unique per participant/session
- `matches`
  - immutable pair/session identity and status
- `match_members`
  - match, user, joined/unmatched/blocked timestamps
- `messages`
  - match, sender, text body, created/edited/deleted timestamps; text only initially
- `blocks`
  - blocker, blocked, reason, timestamp; unique pair
- `reports`
  - reporter, reported user, optional session/match, category, narrative, workflow status, timestamps
- `moderation_cases`
  - case status, priority, assignee, disposition
- `moderation_actions`
  - warn/suspend/ban/quarantine/unban with actor, reason, expiry
- `audit_events`
  - append-only security/moderation/admin actions
- `entitlements`
  - provider-neutral access grants such as `verification_access` or future premium features
- `billing_customers` and `billing_events`
  - provider IDs and idempotent webhook state only; no card data
- `device_push_tokens`
  - later mobile phase, encrypted/protected and revocable

Add a sanitized partner-profile view or server function. Do not expose date of birth, email, exact storage paths, moderation state, internal IDs that are not needed, or private preferences to another user.

## Authorization and Row Level Security

Enable RLS on every table in a client-exposed schema. Add tests for allowed and denied access.

At minimum:

- Users may read/update only their own private profile fields.
- A current session participant may read only the sanitized public profile and session state of the other participant.
- Queue rows are visible only to their owner and trusted matching code.
- A user may mint/join LiveKit only for an active session in which they are a participant.
- Decisions may be inserted/updated only by their owner and must not reveal the other person's decision before resolution.
- Match and message rows are accessible only to active match members and only when no block invalidates access.
- Reports may be created by the reporter; ordinary users cannot read moderation notes or other people's reports.
- Blocks are managed by the blocker. Never reveal to the blocked user who blocked them.
- Moderation and audit data is available only to authorized roles, with server-side role checks in addition to RLS.
- The service-role key is server-only and is never used from a browser or mobile client.

Write explicit negative tests for object-ID guessing and cross-user access.

## Matchmaking

### Demo matcher

In `DEMO_MODE`, match only users in the same explicitly configured demo cohort. Use an atomic database function/transaction so two clients cannot create duplicate sessions. Apply the visible three-to-five-second waiting delay without making it the source of truth.

### Real matcher, later

Implement later behind `REAL_MATCHING_ENABLED`:

- Atomic queue claiming with expiry/heartbeat.
- Exclude self, blocks in either direction, active/suspended/banned accounts, recent partners if configured, and incompatible future preferences.
- Prevent duplicate active sessions.
- Use configurable matching filters and weights; do not invent gender/orientation/radius business rules.
- Maintain fairness metrics such as wait time without exposing private attributes.
- Return unmatched users to queue safely after timeout/disconnect.

Document how a dedicated matchmaking worker can replace the initial database-driven matcher without changing client APIs.

## WebRTC and session synchronization

Use LiveKit Cloud.

- Generate LiveKit access tokens only on the authenticated backend.
- Before minting, verify the user is a participant in an active session.
- Scope each token to exactly one room and participant identity, with the minimum publish/subscribe permissions and short TTL.
- Never expose the LiveKit API secret.
- Use unique non-guessable room names.
- Do not enable recording/egress.
- Use LiveKit webhooks or trusted server reconciliation for join/leave/end metadata; verify webhook signatures.
- Derive the countdown from server timestamps and correct for clock skew.
- When time expires, make end-session idempotent, disconnect/disable media, and transition both participants.
- Support reconnect and network changes without extending the date unintentionally.
- Clean up abandoned queue entries and stale sessions.

For the YC run, provide deterministic synthetic/fake-media support for automated browser tests and clear manual instructions for two real devices.

## Auth and profile lifecycle

Phase 0:

- Supabase email/password auth with session persistence.
- Validate and normalize all fields.
- Photo type/size limits and safe object names.
- Private or tightly policy-controlled profile-photo storage.

Closed alpha:

- Email confirmation.
- Password reset.
- Account deletion/export.
- Session/device revocation.
- Optional phone verification and abuse controls only after product review.

Never store a static "age" as the source of truth; store private date of birth and derive age server-side. Never expose date of birth to dates or matches.

## Safety and moderation gate

Swoon must not invite real users until all items in this section are functional.

- Adults-only gate and versioned policy consent.
- Pre-call camera/mic consent and community-guideline reminder.
- One-tap Leave, Report, and Block during and after dates.
- Report categories:
  - nudity or sexual behavior
  - harassment or hate
  - possible minor/underage person
  - impersonation, scam, or solicitation
  - threat or violence
  - spam
  - other
- Blocking ends the current connection/contact, prevents rematching in both directions, and removes chat/profile access without notifying the blocked user.
- A possible-minor report immediately quarantines the reported account from queueing pending human review.
- Restricted moderator dashboard with queues, filters, case detail, notes, warn/suspend/ban/quarantine actions, expiration, appeal status, and immutable audit log.
- Separate moderator and super-admin roles; require reauthentication/MFA before sensitive actions when the auth platform supports it.
- No automatic video recording or frame capture.
- Store only the minimum report/session metadata and a user narrative by default.
- Add retention/deletion configuration and document operational ownership.
- Rate-limit report spam while never preventing an in-session emergency leave.

Create community-guideline, terms, privacy, moderator-runbook, and incident-response placeholders clearly marked for qualified legal/operations review. Do not fabricate legal claims or policies.

## Chat

- Chat exists only after a mutual match.
- Text only initially.
- Authorize every read/write against current match membership and block state.
- Sanitize/validate length and content.
- Rate-limit sending.
- Support soft deletion/redaction for moderation while preserving necessary audit integrity.
- Do not implement read receipts or attachments until explicitly requested.
- Add an unmatch/block path in the later closed-alpha milestone.

## Analytics and observability

Create a typed analytics interface in Phase 0 with a no-op provider. Enable collection only later with consent/configuration.

Define events without PII, including:

- `signup_started`, `signup_completed`
- `profile_completed`
- `verification_screen_viewed`, `verification_demo_continued`, later `verification_completed`
- `queue_joined`, `queue_matched`, `queue_abandoned`
- `media_permission_result`
- `date_connected`, `date_ended`, `date_disconnect`
- `decision_submitted`
- `mutual_match_created`
- `message_sent`
- `report_submitted`, `block_created`
- `paywall_viewed`, `purchase_started`, `entitlement_granted`

Include duration, platform, app version, experiment/cohort, and anonymous session identifiers where appropriate. Never send names, email, DOB, city, photos, raw messages, report narratives, tokens, or media.

Add structured server logs, request IDs, health checks, uptime monitoring, and error reporting with PII scrubbing. Define dashboards for queue-to-connect conversion, connection success, early exits, mutual-match rate, report rate, and crash/error rate.

## Monetization hooks

The only source evidence is a $5 verification screen. It is not yet clear whether this is a one-time fee, deposit, or another model.

- Model a provider-neutral `verification_access` entitlement.
- Phase 0: demo no-charge adapter only.
- Later web: Stripe/RevenueCat-web adapter behind `BILLING_ENABLED`.
- Later mobile: RevenueCat/App Store/Google Play adapter with the same internal entitlement names.
- Verify webhook signatures and make event processing idempotent.
- The server, not client UI, grants entitlements.
- Provide restore/manage-purchase flows where the platform supports them.
- Do not ship real charging until founders confirm price/treatment, required policies/refunds/taxes, and mobile store compliance.
- Do not make safety-critical Report, Block, Leave, or account deletion features paid.

## Identity verification hooks

Create a provider contract for:

- start verification
- receive and verify provider webhook
- query current status
- handle retry/expiry/manual review
- revoke status

Store provider reference, status, timestamps, and minimal reason codes only. Do not store government ID images or biometric templates. Do not equate a demo bypass with a real verification. The final vendor and disclosure/retention requirements remain an explicit open decision.

## Native mobile scope

Do not start native work until the responsive web pre-alpha is stable.

When authorized:

- Add Expo Router apps for iOS and Android.
- Use an Expo development build because LiveKit requires native WebRTC modules.
- Reuse API/domain/schema/event/design-token packages, not DOM UI.
- Implement native camera/mic permissions, audio routing, background/foreground behavior, call interruptions, safe-area layouts, and network handoff.
- Add push-notification plumbing for matches/messages only after consent.
- Add deep links.
- Use RevenueCat/app-store billing adapters only after commercial approval.
- Add React Native unit/component tests and Maestro end-to-end smoke tests.
- Prepare app icons/splash screens from the supplied brand, accessibility metadata, privacy manifests/disclosures, store screenshots, and release checklists.

## Deployment

Use:

- Vercel for Next.js web.
- Supabase managed projects for local/staging/production database, auth, storage, and realtime.
- LiveKit Cloud projects separated for staging and production.
- EAS development/release builds later for mobile.

The team chat says `tryswoon.live` was purchased, while the PDF mentions `tryswoon.com` as a placeholder. Do not assume DNS authority. Make `APP_URL` configuration-driven, use a preview URL immediately, and document exact DNS records for the owner to apply after confirming the domain.

Provide:

- reproducible local setup
- local Supabase/migration instructions
- preview/staging/prod environment matrix
- seed command for two demo users without committed passwords
- one-command lint/typecheck/test/build
- deployment and rollback runbooks
- backup/migration/restore notes

Do not deploy unreviewed real-user functionality or mutate DNS/billing settings without explicit owner authorization.

## Testing and quality gates

Every milestone must pass:

- formatting/lint
- strict TypeScript
- unit tests
- integration tests
- production build
- migration validation
- secret scan

Phase 0 acceptance tests:

1. Two independent authenticated browser contexts complete onboarding.
2. Both enter the queue and are paired exactly once.
3. Both grant media and see/hear one another over LiveKit.
4. Timers stay synchronized and end the same session once.
5. Early leave returns both to the lobby.
6. Match/Match creates exactly one mutual match.
7. Match/Pass creates no match and does not leak the other choice.
8. Only mutual-match members can send/read chat.
9. A third user cannot fetch a session, decision, match, photo, or message by guessing IDs.
10. Refresh/reconnect and duplicate-tab behavior are deterministic.
11. The full path can be recorded in one unbroken take on separate machines.

Use Playwright with two browser contexts and fake media streams for automated E2E. Make the timer duration configurable only in test so tests do not wait three minutes. Also perform a real two-machine manual smoke test because fake media does not validate microphones, cameras, NAT/TURN, or real network behavior.

Closed-alpha gates:

- RLS allow/deny suite.
- Functional report/block and moderator workflow.
- Auth confirmation/reset/deletion.
- Rate-limit tests.
- Webhook signature/idempotency tests.
- Accessibility scan and keyboard test.
- Cross-browser/mobile-responsive smoke tests.
- Matchmaking concurrency tests.
- Basic load tests for queue join, matching, token issuance, and chat.
- Error monitoring and rollback drill.

## Phased milestones and required outputs

### Milestone 0A: foundation

- Monorepo, strict tooling, CI, typed env config, feature flags.
- Next.js app shell and Swoon design tokens/assets.
- Supabase local setup, migrations, RLS baseline, and seed tooling.
- README and architecture/decision/open-question docs.

### Milestone 0B: YC core loop

- Auth/profile/demo verification.
- Lobby and deterministic demo pairing.
- LiveKit token endpoint, room, media preflight, synchronized timer, leave/end behavior.
- Decision resolution, mutual match, basic chat.
- Branded responsive demo screens.
- Two-browser automated E2E and real-device runbook.

Stop and report Phase 0 verification evidence before moving on.

### Milestone 1: deployed pre-alpha

- Preview/public deployment to the confirmed domain.
- Responsive hardening and cross-browser fixes.
- Functional Report/Block.
- Error handling, structured logs, health checks.
- Password reset, settings, account deletion basics.

### Milestone 2: closed alpha

- Real atomic queueing behind a flag.
- Moderator dashboard and enforcement workflows.
- Email verification, policy consent, session/device security.
- Analytics/observability providers with privacy-safe events.
- Chat lifecycle/unmatch.
- Provider-neutral verification and entitlement contracts.

### Milestone 3: native mobile

- Expo iOS/Android development builds.
- LiveKit native calls, permissions, audio routing, interruptions, network transitions.
- Push/deep-link plumbing.
- Native testing and store-preparation checklist.

### Milestone 4: monetization and verification pilot

- Selected identity-verification vendor.
- Approved web/mobile billing providers.
- Signed/idempotent webhooks and server-authoritative entitlements.
- Sandbox end-to-end tests.
- Policies, disclosures, support, refund/appeal flows reviewed by qualified owners.

### Milestone 5: production beta

- Reliability/load targets.
- Abuse/fraud controls.
- On-call and incident runbooks.
- Retention/deletion/export operations.
- Security/privacy review.
- Store submissions and staged rollout.

Roadmap-only features such as Love Island, balloon pop, 20v1, premium/swipe limits, or sophisticated recommendations must remain out until the core loop, safety, and reliability metrics support them.

## Definition of done and working style

Do not stop at generated files or a happy-path UI. A milestone is done only when its acceptance tests pass and the README tells a new engineer exactly how to run it.

For every milestone:

1. Inspect existing work and preserve good decisions.
2. Write/update the decision and open-question records.
3. Implement the smallest complete vertical slice.
4. Add authorization and failure handling with the feature.
5. Test it.
6. Run lint, typecheck, tests, and build.
7. Report commands run, results, remaining risks, and exact manual setup steps.

If an external credential is unavailable, build and test the adapter boundary, provide a safe local/demo implementation, document the exact credential/setup needed, and continue all work that does not require the credential. Do not hardcode secrets, fake a passing test, silently weaken safety, or claim a live integration works when it was not exercised.

Start now by inspecting the repository and assets, creating the decision/open-question documents, and implementing Milestone 0A followed immediately by Milestone 0B.
