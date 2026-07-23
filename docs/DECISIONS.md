# Decisions

Dated record of engineering/product decisions and their reasoning.
(Owner sign-offs from the July 23, 2026 build conversation.)

## 2026-07-23

- **P2P WebRTC over LiveKit.** Owner chose pure peer-to-peer WebRTC with
  Supabase Realtime as signaling (no LiveKit account needed). STUN-only —
  ~10–15% of restrictive networks can't form a direct path; mitigated with a
  25s connect watchdog and a "Skip & requeue" flow (`connect_failed` ends the
  session with no decision phase). `PeerCall` sits behind a small interface so
  LiveKit/TURN can be added without touching screens.
- **Hosted personal Supabase instead of local stack.** No Docker on the dev
  machine; owner supplied a personal Supabase project. Migrations applied by
  `scripts/db-push.ts` (plain `pg`, tracked in `schema_migrations`) instead of
  the Supabase CLI.
- **Single Next.js app, not the monorepo from the brief.** Web-only scope for
  this phase; module boundaries under `src/lib` keep the future
  mobile/LiveKit seams. Revisit when native mobile starts.
- **Signup creates the user pre-confirmed** via the admin API (server route,
  IP rate-limited, one transient-error retry) so the demo flow has no email
  round-trip. Closed alpha must switch to real email confirmation + password
  reset.
- **Real FIFO matchmaking from day one** (no demo-cohort stub): advisory-lock
  serialized, excludes blocked pairs and users with live sessions. A
  dedicated worker can replace it later without changing the client API.
- **Timer authority is the database.** `starts_at`/`ends_at` set when both
  participants are ready; `end_session('timer')` is rejected before
  `ends_at − 2s`; stale sessions expire lazily on the next queue/lobby touch
  (no cron dependency).
- **Decision privacy:** decisions resolve only when both exist or 60s after
  session end (missing = pass). Payloads and RPC results only ever contain
  the aggregate resolution, so timing can't reveal who passed.
- **RLS membership checks moved into SECURITY DEFINER predicates**
  (`is_session_participant`, `is_match_member`, `can_read_messages`) after
  tests showed self-referential policies recurse and a blocks check inside a
  policy is defeated by the blocks table's own RLS (0005).
- **No fabricated content on the landing page.** Replaced the mockup's
  testimonials with a manifesto + FAQ; no fake app-store badges; phone
  mockups are hand-built UI vignettes, not stock photos of fake couples.
- **Test-only timer override** lives in `app_config` (service-role writable
  only); Playwright's global setup shortens it and teardown restores it.
- **DB password/keys were shared in-chat** during setup — rotate the
  database password and service key before inviting anyone else.
