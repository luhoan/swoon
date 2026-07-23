-- Row Level Security for every table, Realtime channel authorization, and
-- the private profile-photo bucket.
--
-- Discipline: RLS default-denies anything without a policy. Tables whose
-- writes must be atomic/validated get NO write policies — their only write
-- path is the SECURITY DEFINER functions in 0003 (which run as table owner).

alter table public.app_config enable row level security;
alter table public.profiles enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.video_sessions enable row level security;
alter table public.video_session_participants enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.date_decisions enable row level security;
alter table public.matches enable row level security;
alter table public.match_members enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.audit_events enable row level security;
alter table public.rate_limits enable row level security;

-- app_config, rate_limits, audit_events, moderation_actions: no policies at
-- all — invisible to authenticated users. Service role bypasses RLS.

-- profiles ------------------------------------------------------------------
-- Own row only. Other people's profiles are reachable exclusively through
-- get_partner_profile(), which strips DOB and moderation fields.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Updates go through save_profile() so validation and onboarding state stay
-- consistent; no direct update policy.

-- terms_acceptances ---------------------------------------------------------
create policy terms_select_own on public.terms_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy terms_insert_own on public.terms_acceptances
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- video_sessions ------------------------------------------------------------
create policy sessions_select_participant on public.video_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.video_session_participants p
      where p.session_id = video_sessions.id
        and p.user_id = (select auth.uid())
    )
  );

-- video_session_participants ------------------------------------------------
-- A participant may see both participant rows of their own sessions (needed
-- for role/peer discovery), but nothing else.
create policy participants_select_same_session on public.video_session_participants
  for select to authenticated
  using (
    exists (
      select 1 from public.video_session_participants me
      where me.session_id = video_session_participants.session_id
        and me.user_id = (select auth.uid())
    )
  );

-- matchmaking_queue ---------------------------------------------------------
create policy queue_select_own on public.matchmaking_queue
  for select to authenticated
  using (user_id = (select auth.uid()));

-- date_decisions ------------------------------------------------------------
-- You can NEVER read your partner's decision row. Resolution is exposed only
-- as the aggregate video_sessions.resolution.
create policy decisions_select_own on public.date_decisions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- matches / match_members ---------------------------------------------------
create policy matches_select_member on public.matches
  for select to authenticated
  using (
    exists (
      select 1 from public.match_members mm
      where mm.match_id = matches.id
        and mm.user_id = (select auth.uid())
    )
  );

create policy match_members_select_same_match on public.match_members
  for select to authenticated
  using (
    exists (
      select 1 from public.match_members me
      where me.match_id = match_members.match_id
        and me.user_id = (select auth.uid())
    )
  );

-- messages ------------------------------------------------------------------
-- Read requires active-match membership and no block in either direction.
-- Writes go through send_message() (rate limit + validation); the WAL feed
-- for postgres_changes re-checks this select policy per subscriber.
create policy messages_select_member on public.messages
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.match_members me
      join public.matches m on m.id = me.match_id
      where me.match_id = messages.match_id
        and me.user_id = (select auth.uid())
        and m.status = 'active'
    )
    and not exists (
      select 1
      from public.match_members other
      join public.blocks b
        on (b.blocker_id = other.user_id and b.blocked_id = (select auth.uid()))
        or (b.blocked_id = other.user_id and b.blocker_id = (select auth.uid()))
      where other.match_id = messages.match_id
        and other.user_id <> (select auth.uid())
    )
  );

-- blocks --------------------------------------------------------------------
-- Blocker manages their own blocks; the blocked user has no policy path to
-- learn a block exists.
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));
-- Insert flows through create_block() so live sessions/matches get closed
-- atomically.

-- reports -------------------------------------------------------------------
-- Reporters can see that their own report exists (not moderation state).
create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));
-- Insert flows through create_report() (rate limit + quarantine side effect).

-- ---------------------------------------------------------------------------
-- Realtime channel authorization (private channels).
-- Topics:
--   user:{userId}     server->client notifications; no client writes
--   session:{id}      WebRTC signaling between the two participants
create policy realtime_session_read on realtime.messages
  for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and exists (
      select 1
      from public.video_session_participants p
      join public.video_sessions s on s.id = p.session_id
      where p.user_id = (select auth.uid())
        and s.status <> 'ended'
        and realtime.topic() = 'session:' || p.session_id::text
    )
  );

create policy realtime_session_write on realtime.messages
  for insert to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and exists (
      select 1
      from public.video_session_participants p
      join public.video_sessions s on s.id = p.session_id
      where p.user_id = (select auth.uid())
        and s.status <> 'ended'
        and realtime.topic() = 'session:' || p.session_id::text
    )
  );

-- Receive-only: no insert policy on user:* topics means clients cannot forge
-- match_found / decision_resolved events; only realtime.send() from the
-- SECURITY DEFINER functions writes there.
create policy realtime_user_channel_read on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() = 'user:' || (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Storage: private bucket for profile photos. Object names are
-- {user_id}/{random}.{ext}; owners manage their own folder. Partners see
-- photos only via short-lived signed URLs minted server-side after a
-- session-membership check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos', 'profile-photos', false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy photo_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy photo_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy photo_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy photo_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
