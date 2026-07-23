-- Swoon core schema. Postgres is the source of truth for every state
-- transition; Realtime is only a notification/signaling transport.
-- All tables get RLS in 0002; all mutations flow through the SECURITY
-- DEFINER functions in 0003.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- app_config: single-row runtime knobs the server owns. No client access.
-- date_duration_seconds exists so E2E tests can shorten the date; production
-- keeps 180.
create table public.app_config (
  id boolean primary key default true check (id), -- enforce single row
  date_duration_seconds integer not null default 180
    check (date_duration_seconds between 10 and 600),
  decision_window_seconds integer not null default 60
    check (decision_window_seconds between 10 and 600),
  queue_heartbeat_ttl_seconds integer not null default 30
    check (queue_heartbeat_ttl_seconds between 10 and 300)
);
insert into public.app_config default values;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger on signup.
-- date_of_birth is private; age is derived server-side and only exposed
-- through get_partner_profile.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text
    check (display_name is null or char_length(display_name) between 1 and 40),
  date_of_birth date
    check (
      date_of_birth is null
      or date_of_birth <= (current_date - interval '18 years')
    ),
  city text check (city is null or char_length(city) between 1 and 80),
  photo_path text,
  role text not null default 'member'
    check (role in ('member', 'moderator', 'admin')),
  account_status text not null default 'active'
    check (account_status in ('active', 'quarantined', 'suspended', 'banned')),
  verification_status text not null default 'none'
    check (verification_status in ('none', 'demo_bypass', 'verified')),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy', 'guidelines')),
  version text not null,
  accepted_at timestamptz not null default now()
);
create index terms_acceptances_by_user on public.terms_acceptances (user_id);

-- ---------------------------------------------------------------------------
-- Video sessions come before the queue because queue rows point at them.
create table public.video_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'matched'
    check (status in ('matched', 'active', 'ended')),
  -- Timer starts only when BOTH participants report ready.
  starts_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  end_reason text
    check (
      end_reason in (
        'timer', 'left', 'partner_left', 'connect_timeout',
        'connect_failed', 'stale', 'blocked'
      )
    ),
  resolution text not null default 'pending'
    check (resolution in ('pending', 'mutual', 'no_match')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.video_session_participants (
  session_id uuid not null references public.video_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- caller = impolite peer (initiates offers); callee = polite. Assigned
  -- deterministically at match time so refresh keeps roles stable.
  role text not null check (role in ('caller', 'callee')),
  ready_at timestamptz,
  connected_at timestamptz,
  left_at timestamptz,
  primary key (session_id, user_id)
);
-- One live session per user; end_session clears left_at to free this.
create unique index one_active_session_per_user
  on public.video_session_participants (user_id)
  where left_at is null;
create index participants_by_session on public.video_session_participants (session_id);

create table public.matchmaking_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting', 'matched', 'cancelled', 'expired')),
  joined_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  matched_session_id uuid references public.video_sessions (id),
  created_at timestamptz not null default now()
);
create unique index one_live_queue_entry
  on public.matchmaking_queue (user_id)
  where status = 'waiting';
create index queue_fifo
  on public.matchmaking_queue (joined_at)
  where status = 'waiting';

create table public.date_decisions (
  session_id uuid not null references public.video_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  choice text not null check (choice in ('match', 'pass')),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.video_sessions (id),
  status text not null default 'active'
    check (status in ('active', 'unmatched', 'blocked')),
  created_at timestamptz not null default now()
);

create table public.match_members (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (match_id, user_id)
);
create index match_members_by_user on public.match_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references auth.users (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index messages_by_match on public.messages (match_id, created_at);

create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_by_blocked on public.blocks (blocked_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.video_sessions (id) on delete set null,
  category text not null
    check (
      category in (
        'sexual_content', 'harassment', 'underage', 'impersonation',
        'violence', 'spam', 'other'
      )
    ),
  narrative text check (narrative is null or char_length(narrative) <= 4000),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
create index reports_open on public.reports (created_at) where status = 'open';
create index reports_by_reported on public.reports (reported_id);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports (id) on delete set null,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id),
  action text not null
    check (action in ('warn', 'quarantine', 'suspend', 'ban', 'reinstate', 'dismiss')),
  reason text not null check (char_length(reason) between 1 and 2000),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Append-only. No update/delete is ever granted, and RLS has no policies
-- for authenticated users at all.
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  event text not null,
  subject text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Postgres token bucket used inside RPCs, so rate limits hold no matter how
-- an endpoint is reached. Never client-accessible.
create table public.rate_limits (
  bucket_key text primary key,
  tokens numeric not null,
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh on profiles
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create an empty profile row the moment an auth user exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chat updates reach clients via postgres_changes, which enforces the
-- messages RLS policies per subscriber.
alter publication supabase_realtime add table public.messages;
