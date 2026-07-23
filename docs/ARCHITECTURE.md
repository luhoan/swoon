# Architecture

## Stance

- **Postgres is the source of truth.** Every state transition is a
  `SECURITY DEFINER` SQL function (RPC) executing under the caller's JWT
  (`auth.uid()`), so authorization, validation, rate limiting, and atomicity
  live where no client can bypass them.
- **Realtime is transport, not truth.** Private channels deliver signaling
  and server events; every event has a refetch fallback (heartbeat RPC,
  lazy expiry on page load), so a lost broadcast delays UX but never
  corrupts state.
- **Service-role key is server-only** (route handlers / server actions that
  have already authorized the caller). Browsers hold only the anon key +
  user JWT; RLS does the rest.

## The date lifecycle

```
lobby → preflight (getUserMedia) → join_queue()
  └─ try_match(): advisory lock, FIFO partner, blocks excluded,
     one live session per user (partial unique indexes),
     roles assigned: lower uuid = callee/polite, higher = caller/impolite
     → video_sessions('matched') + notify both user channels
date page: subscribe session channel → participant_ready()
  └─ both ready → status 'active', starts_at/ends_at = now()+duration,
     server_now returned for clock-skew offset
WebRTC: perfect negotiation over the session channel
  (sdp/ice/peer_hello/media_state/bye), ICE watchdog, 20s partner-grace,
  25s connect timeout → end_session('connect_failed') → no decision phase
end: countdown hits 0 → end_session('timer') (server clamps to ends_at−2s),
  or Leave/block/stale → participants freed, session_ended broadcast
decision: submit_decision() first-write-wins → resolve_decisions()
  both match → matches + match_members atomically → decision_resolved
  any pass or 60s timeout → no_match; only the aggregate is ever exposed
chat: send_message() (membership+block+rate limit), postgres_changes feed
  gated by can_read_messages() RLS
```

## Channel topology

| Channel (private) | Who | Carries |
| --- | --- | --- |
| `user:{id}` | that user | `match_found`, `decision_resolved` — server-sent only; clients have no INSERT policy, so these events are unforgeable |
| `session:{id}` | both participants | WebRTC signaling + presence (`userId:tabId`, duplicate-tab detection) + server `session_started` / `session_ended` |
| `chat:{matchId}` | match members | `postgres_changes` INSERTs on `messages`, RLS-filtered per subscriber |

Channel access is enforced with RLS on `realtime.messages` through
`is_session_participant()` (0005).

## Security model

- RLS on every table; deny-by-default (no policy = no access). Tables with
  invariants (queue, sessions, decisions, matches, messages, blocks,
  reports) have **no client write policies at all** — writes only through
  RPCs.
- Membership checks in policies use SECURITY DEFINER boolean predicates to
  avoid RLS recursion and blocked-row invisibility pitfalls.
- Cross-user data flows through exactly two sanitized paths:
  `get_partner_profile(session)` and `get_my_matches()` — name, derived age,
  city, photo reference. DOB, email, and moderation state never leave the row.
- Photos live in a private bucket (`{userId}/…`); owners manage their folder
  via storage RLS; partners get 60s signed URLs from `/api/photo` only after
  a fresh membership check.
- Rate limits are a Postgres token bucket consumed inside RPCs (queue joins,
  messages, reports) plus an IP bucket in the signup route.
- Safety: report categories per the product brief; an `underage` report
  auto-quarantines the reported account from queueing; blocks end live
  sessions, freeze matches, prevent re-pairing, and are invisible to the
  blocked user; `audit_events` is append-only and admin actions are recorded.
- Next.js hardening: `X-Frame-Options: DENY`, `nosniff`,
  camera/mic Permissions-Policy scoped to self, no `poweredByHeader`.

## Client structure

- `src/lib/call/signaling.ts` — typed envelope protocol over the session
  channel; distinguishes peer events from server-sent events.
- `src/lib/call/webrtc.ts` — `PeerCall`: perfect negotiation (polite/impolite
  from DB roles, stable across refresh), trickle ICE with pre-remote queue,
  disconnect watchdog with ICE restart (impolite side only).
- `src/lib/session/use-date-session.ts` — orchestrates: authoritative row
  fetch → media → channel → `participant_ready` → PeerCall; handles refresh
  mid-call, duplicate tabs, partner grace, media denial, teardown on
  `pagehide`.
- `src/lib/session/use-countdown.ts` — `ends_at − (now + serverOffset)`,
  fires expiry exactly once.
- `src/lib/queue/use-queue.ts` — subscribe-then-join ordering so a fast
  match can't be missed; 10s heartbeat doubles as match-discovery fallback.

## Testing

- `tests/db-security.test.ts` (Vitest, live project): pairing atomicity,
  double-queue rejection, third-party denial, early-timer rejection,
  sanitized profiles, decision no-leak, block semantics, quarantine,
  privileged-table invisibility.
- `e2e/core-loop.spec.ts` (Playwright, two contexts, fake media): the
  definition-of-done run — signup → onboarding → pairing → live video both
  ways → synchronized timer → mutual match → realtime chat. Global setup
  shortens the timer via `app_config`; teardown restores it.
- Fake media doesn't validate real cameras/NAT — a two-machine manual smoke
  test over the public internet is still required before demo day.

## Replacing pieces later

- **TURN/LiveKit**: add TURN URLs to `NEXT_PUBLIC_ICE_SERVERS`, or implement
  a LiveKit-backed `PeerCall` equivalent behind the same events.
- **Matchmaking worker**: move `try_match` calls from request-time RPCs to a
  queue-consuming worker; clients keep the same `join_queue`/heartbeat API.
- **Billing/ID verification**: `verification_status` + `entitlement`-shaped
  columns are provider-neutral; webhook handlers slot into `src/app/api`.
