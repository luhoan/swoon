# Swoon

Live video speed dating. Skip the swipe — meet on a three-minute video date,
then both privately choose **Match** or **Pass**. Mutual match? *It's a
Swoon!* and chat opens.

Pre-alpha web app: Next.js (App Router) + Supabase (Postgres, Auth, Storage,
Realtime) + pure P2P WebRTC (no media server).

## Running it

Prereqs: Node 22+, pnpm 10+, a Supabase project (free tier is fine).

```bash
pnpm install
cp .env.example .env.local     # fill in your Supabase project values
pnpm db:push                   # applies supabase/migrations to that project
pnpm dev                       # http://localhost:3000
```

`.env.local` needs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server-only), `SUPABASE_DB_URL` (migrations only).

To try the core loop locally: open two different browsers (or one normal +
one private window), create two accounts, and press **Start dating** in both.

### Moderation dashboard

Promote an account, then visit `/admin`:

```sql
update profiles set role = 'admin' where user_id = '<uuid>';
```

The dashboard handles member reports, account appeals, and direct restoration
of suspended or banned accounts after the original report has closed.
Restricted members are routed to `/appeal`, where they can submit a private
statement for human review. Apply migrations with `pnpm db:push` before
deploying UI changes so the appeal RPCs and review table exist first.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Develop / production build / serve |
| `pnpm lint` · `pnpm typecheck` | ESLint · strict tsc |
| `pnpm test` | Vitest integration suite against the live Supabase project (RLS allow/deny, matchmaking atomicity, decision no-leak, block/quarantine) |
| `pnpm test:e2e` | Playwright: two browser contexts run the complete loop with fake camera/mic (temporarily shortens the date timer via `app_config`) |
| `pnpm db:push` | Apply `supabase/migrations/*.sql` in order (tracked in `schema_migrations`) |

## Architecture in one paragraph

Postgres is the source of truth; every state transition (queue → session →
timer → decisions → match → chat → block/report) is a `SECURITY DEFINER`
function in `supabase/migrations/0003_functions.sql`, so validation, rate
limiting (Postgres token bucket), and atomicity (advisory-lock matchmaking)
cannot be bypassed by any client. Supabase Realtime is transport only:
private, RLS-authorized channels carry WebRTC signaling
(offer/answer/ICE, perfect-negotiation pattern — see `src/lib/call/`) and
server-pushed events (`match_found`, `session_ended`, `decision_resolved`)
sent from inside those SQL functions via `realtime.send()`. The 3:00
countdown derives from server `ends_at` with clock-skew correction; clients
can't shorten or extend a date. Longer version: `docs/ARCHITECTURE.md`.

## Repo map

```
src/app/(marketing)/    landing, safety, terms, privacy
src/app/(auth)/         login, signup
src/app/onboarding/     profile (18+ gate, photo), $5 verification (demo bypass)
src/app/app/(shell)/    lobby, preflight+queue, matches, chat, settings
src/app/app/date/…      the live date (full-bleed), decision, It's a Swoon
src/app/admin/          role-gated moderation dashboard
src/app/api/            signup (pre-confirmed create), photo (signed URLs), account delete
src/lib/call/           SignalingChannel + PeerCall (perfect negotiation, watchdog)
src/lib/session/        date session hook, skew-corrected countdown
supabase/migrations/    schema, RLS, functions — the real backend
docs/                   architecture, decisions, open questions
```

## Safety posture (pre-alpha)

18+ only (DOB checked at signup, only age ever displayed) · dates are never
recorded · Leave/Report on screen for the whole date · blocking is permanent,
mutual-invisible, and kills live sessions · an *underage* report immediately
quarantines the reported account from the queue pending human review ·
policy pages are drafts pending qualified legal review.

Brand assets: originals (`logo.png`, `title.png`) are preserved untouched;
web derivatives live in `public/brand/`.
