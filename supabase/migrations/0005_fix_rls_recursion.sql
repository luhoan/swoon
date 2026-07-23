-- RLS policies that subquery their own table (or a table whose policy loops
-- back) hit Postgres's infinite-recursion guard; and a block-check written
-- inside a policy is silently defeated by the blocks table's own RLS (the
-- blocked user can't see the row that should exclude them). Fix: boolean
-- SECURITY DEFINER predicates that bypass RLS for these membership checks.

create or replace function public.is_session_participant(p_session uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.video_session_participants
    where session_id = p_session and user_id = p_user
  );
$$;

create or replace function public.is_match_member(p_match uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.match_members
    where match_id = p_match and user_id = p_user
  );
$$;

-- Full visibility rule for chat: member, match active, and no block in
-- either direction between the two members.
create or replace function public.can_read_messages(p_match uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match and m.status = 'active'
  )
  and exists (
    select 1 from public.match_members
    where match_id = p_match and user_id = p_user
  )
  and not exists (
    select 1
    from public.match_members other
    join public.blocks b
      on (b.blocker_id = other.user_id and b.blocked_id = p_user)
      or (b.blocked_id = other.user_id and b.blocker_id = p_user)
    where other.match_id = p_match and other.user_id <> p_user
  );
$$;

revoke all on function public.is_session_participant(uuid, uuid) from public, anon;
revoke all on function public.is_match_member(uuid, uuid) from public, anon;
revoke all on function public.can_read_messages(uuid, uuid) from public, anon;
grant execute on function public.is_session_participant(uuid, uuid) to authenticated;
grant execute on function public.is_match_member(uuid, uuid) to authenticated;
grant execute on function public.can_read_messages(uuid, uuid) to authenticated;

drop policy sessions_select_participant on public.video_sessions;
create policy sessions_select_participant on public.video_sessions
  for select to authenticated
  using (public.is_session_participant(id, (select auth.uid())));

drop policy participants_select_same_session on public.video_session_participants;
create policy participants_select_same_session on public.video_session_participants
  for select to authenticated
  using (public.is_session_participant(session_id, (select auth.uid())));

drop policy matches_select_member on public.matches;
create policy matches_select_member on public.matches
  for select to authenticated
  using (public.is_match_member(id, (select auth.uid())));

drop policy match_members_select_same_match on public.match_members;
create policy match_members_select_same_match on public.match_members
  for select to authenticated
  using (public.is_match_member(match_id, (select auth.uid())));

drop policy messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated
  using (
    deleted_at is null
    and public.can_read_messages(match_id, (select auth.uid()))
  );

-- The realtime channel policies subquery the participants table as the
-- requesting user; route them through the definer predicate too.
drop policy realtime_session_read on realtime.messages;
create policy realtime_session_read on realtime.messages
  for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and realtime.topic() like 'session:%'
    and public.is_session_participant(
      nullif(split_part(realtime.topic(), ':', 2), '')::uuid,
      (select auth.uid())
    )
  );

drop policy realtime_session_write on realtime.messages;
create policy realtime_session_write on realtime.messages
  for insert to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and realtime.topic() like 'session:%'
    and public.is_session_participant(
      nullif(split_part(realtime.topic(), ':', 2), '')::uuid,
      (select auth.uid())
    )
  );
