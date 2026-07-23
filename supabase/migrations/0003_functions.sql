-- All state transitions live here as SECURITY DEFINER functions so that
-- auth.uid(), validation, rate limiting, and atomicity cannot be bypassed by
-- any client. Every public function revokes default EXECUTE and grants it
-- back to authenticated only; internal helpers are never granted.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Token bucket. Returns false when the caller is out of tokens.
create or replace function public.consume_token(
  p_key text, p_capacity numeric, p_refill_per_sec numeric
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tokens numeric;
begin
  insert into public.rate_limits as rl (bucket_key, tokens, updated_at)
  values (p_key, p_capacity - 1, now())
  on conflict (bucket_key) do update
    set tokens = least(
          p_capacity,
          rl.tokens + p_refill_per_sec * extract(epoch from (now() - rl.updated_at))
        ) - 1,
        updated_at = now()
  returning tokens into v_tokens;

  if v_tokens < 0 then
    -- Undo the debit so a starved bucket doesn't go ever more negative.
    update public.rate_limits set tokens = tokens + 1 where bucket_key = p_key;
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.audit(
  p_actor uuid, p_event text, p_subject text, p_detail jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_events (actor_user_id, event, subject, detail)
  values (p_actor, p_event, p_subject, p_detail);
$$;

create or replace function public.notify_user(
  p_user uuid, p_event text, p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform realtime.send(p_payload, p_event, 'user:' || p_user::text, true);
end;
$$;

-- Caller identity + account gate used by every user-facing function.
create or replace function public.assert_member(p_require_dating boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where user_id = v_uid;
  if not found then
    raise exception 'profile_missing';
  end if;
  if v_profile.account_status in ('suspended', 'banned') then
    raise exception 'account_restricted';
  end if;
  if p_require_dating then
    if v_profile.account_status <> 'active' then
      -- quarantined accounts keep chat/settings but cannot queue
      raise exception 'account_restricted';
    end if;
    if not v_profile.onboarding_complete
       or v_profile.verification_status = 'none' then
      raise exception 'onboarding_incomplete';
    end if;
  end if;
  return v_uid;
end;
$$;

-- Shared teardown used by timer/leave/block/stale paths. p_reason is trusted
-- here; the public wrapper validates client-supplied reasons.
create or replace function public.end_session_internal(
  p_session uuid, p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.video_sessions%rowtype;
begin
  select * into v_session from public.video_sessions
  where id = p_session for update;
  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.status = 'ended' then
    return jsonb_build_object(
      'status', 'ended',
      'end_reason', v_session.end_reason,
      'resolution', v_session.resolution
    );
  end if;

  update public.video_sessions
  set status = 'ended',
      ended_at = now(),
      end_reason = p_reason,
      -- Dates that never connected get no decision phase: nothing to judge.
      resolution = case
        when p_reason in ('connect_timeout', 'connect_failed', 'stale', 'blocked')
          then 'no_match'
        else resolution
      end,
      resolved_at = case
        when p_reason in ('connect_timeout', 'connect_failed', 'stale', 'blocked')
          then now()
        else resolved_at
      end
  where id = p_session
  returning * into v_session;

  -- Frees the one-active-session-per-user partial index for both users.
  update public.video_session_participants
  set left_at = coalesce(left_at, now())
  where session_id = p_session;

  perform realtime.send(
    jsonb_build_object('reason', p_reason, 'resolution', v_session.resolution),
    'session_ended',
    'session:' || p_session::text,
    true
  );

  return jsonb_build_object(
    'status', 'ended',
    'end_reason', v_session.end_reason,
    'resolution', v_session.resolution
  );
end;
$$;

-- FIFO pairing under one advisory lock: correctness first, scale later.
create or replace function public.try_match(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ttl integer;
  v_my_queue public.matchmaking_queue%rowtype;
  v_partner public.matchmaking_queue%rowtype;
  v_session uuid;
  v_caller uuid;
  v_callee uuid;
begin
  perform pg_advisory_xact_lock(hashtext('swoon_matchmaking'));

  select queue_heartbeat_ttl_seconds into v_ttl from public.app_config;

  update public.matchmaking_queue
  set status = 'expired'
  where status = 'waiting'
    and heartbeat_at < now() - make_interval(secs => v_ttl);

  select * into v_my_queue from public.matchmaking_queue
  where user_id = p_user and status = 'waiting'
  for update;
  if not found then
    return null;
  end if;

  select q.* into v_partner
  from public.matchmaking_queue q
  where q.status = 'waiting'
    and q.user_id <> p_user
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p_user and b.blocked_id = q.user_id)
         or (b.blocker_id = q.user_id and b.blocked_id = p_user)
    )
    and not exists (
      select 1 from public.video_session_participants vp
      where vp.user_id = q.user_id and vp.left_at is null
    )
    and exists (
      select 1 from public.profiles pr
      where pr.user_id = q.user_id and pr.account_status = 'active'
    )
  order by q.joined_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  insert into public.video_sessions (status) values ('matched')
  returning id into v_session;

  -- Deterministic peer roles: lower uuid is the polite callee, higher the
  -- impolite caller. Stable across refreshes because it derives from ids.
  if p_user < v_partner.user_id then
    v_callee := p_user; v_caller := v_partner.user_id;
  else
    v_callee := v_partner.user_id; v_caller := p_user;
  end if;

  insert into public.video_session_participants (session_id, user_id, role)
  values (v_session, v_caller, 'caller'), (v_session, v_callee, 'callee');

  update public.matchmaking_queue
  set status = 'matched', matched_session_id = v_session
  where id in (v_my_queue.id, v_partner.id);

  perform public.notify_user(
    p_user, 'match_found',
    jsonb_build_object('session_id', v_session,
      'role', case when p_user = v_caller then 'caller' else 'callee' end)
  );
  perform public.notify_user(
    v_partner.user_id, 'match_found',
    jsonb_build_object('session_id', v_session,
      'role', case when v_partner.user_id = v_caller then 'caller' else 'callee' end)
  );

  return v_session;
end;
$$;

-- Resolve the post-date decision. Idempotent; safe for either client (or a
-- lazy page load) to call. Never returns or leaks an individual choice.
create or replace function public.resolve_decisions(p_session uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.video_sessions%rowtype;
  v_window integer;
  v_total integer;
  v_matches integer;
  v_resolution text;
  v_match uuid;
  v_users uuid[];
begin
  -- Client-callable for lazy timeout resolution; participants only. Internal
  -- calls arrive with the same user context, so the check holds everywhere.
  if auth.uid() is not null and not exists (
    select 1 from public.video_session_participants
    where session_id = p_session and user_id = auth.uid()
  ) then
    raise exception 'session_not_found';
  end if;
  select * into v_session from public.video_sessions
  where id = p_session for update;
  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.resolution <> 'pending' then
    return v_session.resolution;
  end if;
  if v_session.status <> 'ended' then
    return 'pending';
  end if;

  select decision_window_seconds into v_window from public.app_config;

  select count(*), count(*) filter (where choice = 'match')
  into v_total, v_matches
  from public.date_decisions where session_id = p_session;

  if v_total = 2 then
    v_resolution := case when v_matches = 2 then 'mutual' else 'no_match' end;
  elsif v_session.ended_at < now() - make_interval(secs => v_window) then
    -- Missing decisions past the window count as passes.
    v_resolution := 'no_match';
  else
    return 'pending';
  end if;

  update public.video_sessions
  set resolution = v_resolution, resolved_at = now()
  where id = p_session;

  select array_agg(user_id) into v_users
  from public.video_session_participants where session_id = p_session;

  if v_resolution = 'mutual' then
    insert into public.matches (session_id) values (p_session)
    returning id into v_match;
    insert into public.match_members (match_id, user_id)
    select v_match, unnest(v_users);
  end if;

  perform public.notify_user(
    u, 'decision_resolved',
    jsonb_build_object('session_id', p_session, 'resolution', v_resolution,
                       'match_id', v_match)
  ) from unnest(v_users) as u;

  return v_resolution;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API (granted to authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.save_profile(
  p_display_name text, p_date_of_birth date, p_city text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_profile public.profiles%rowtype;
begin
  if p_display_name is null or btrim(p_display_name) = ''
     or char_length(btrim(p_display_name)) > 40 then
    raise exception 'invalid_display_name';
  end if;
  if p_date_of_birth is null
     or p_date_of_birth > (current_date - interval '18 years')
     or p_date_of_birth < date '1900-01-01' then
    -- 18+ is a hard product rule; the client repeats this check for UX only.
    raise exception 'must_be_adult';
  end if;
  if p_city is null or btrim(p_city) = '' or char_length(btrim(p_city)) > 80 then
    raise exception 'invalid_city';
  end if;

  update public.profiles
  set display_name = btrim(p_display_name),
      date_of_birth = p_date_of_birth,
      city = btrim(p_city),
      onboarding_complete = (photo_path is not null)
  where user_id = v_uid
  returning * into v_profile;

  return jsonb_build_object('onboarding_complete', v_profile.onboarding_complete);
end;
$$;

-- Called after a successful upload to the caller's own storage folder.
create or replace function public.save_profile_photo(p_photo_path text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_profile public.profiles%rowtype;
begin
  -- The path must sit inside the caller's own folder; storage RLS already
  -- guarantees they could only have uploaded there.
  if p_photo_path is null
     or p_photo_path not like (v_uid::text || '/%')
     or char_length(p_photo_path) > 300 then
    raise exception 'invalid_photo_path';
  end if;

  update public.profiles
  set photo_path = p_photo_path,
      onboarding_complete = (
        display_name is not null and date_of_birth is not null and city is not null
      )
  where user_id = v_uid
  returning * into v_profile;

  return jsonb_build_object('onboarding_complete', v_profile.onboarding_complete);
end;
$$;

create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
begin
  if p_version is null or char_length(p_version) > 20 then
    raise exception 'invalid_version';
  end if;
  insert into public.terms_acceptances (user_id, document, version)
  values (v_uid, 'terms', p_version),
         (v_uid, 'privacy', p_version),
         (v_uid, 'guidelines', p_version);
end;
$$;

-- Demo verification: explicitly NOT a real verified badge. Real identity
-- verification arrives later behind a provider interface.
create or replace function public.demo_verify()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
begin
  update public.profiles
  set verification_status = 'demo_bypass'
  where user_id = v_uid and verification_status = 'none';
  perform public.audit(v_uid, 'verification_demo_bypass', v_uid::text);
  return jsonb_build_object('verification_status', 'demo_bypass');
end;
$$;

create or replace function public.join_queue()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member(true);
  v_live record;
  v_session uuid;
begin
  if not public.consume_token('queue:' || v_uid::text, 10, 0.2) then
    raise exception 'rate_limited';
  end if;

  -- Lazy stale-session cleanup so a zombie row never wedges a user.
  select p.session_id, s.status, s.ends_at into v_live
  from public.video_session_participants p
  join public.video_sessions s on s.id = p.session_id
  where p.user_id = v_uid and p.left_at is null;

  if found then
    if v_live.status = 'active'
       and v_live.ends_at is not null
       and v_live.ends_at < now() - interval '2 minutes' then
      perform public.end_session_internal(v_live.session_id, 'stale');
    elsif v_live.status = 'matched'
       and not exists (
         select 1 from public.video_sessions s2
         where s2.id = v_live.session_id
           and s2.created_at > now() - interval '5 minutes'
       ) then
      -- matched but never started for 5 minutes: abandoned preflight
      perform public.end_session_internal(v_live.session_id, 'stale');
    else
      return jsonb_build_object('status', 'in_session',
                                'session_id', v_live.session_id);
    end if;
  end if;

  insert into public.matchmaking_queue (user_id)
  values (v_uid)
  on conflict (user_id) where status = 'waiting' do nothing;

  v_session := public.try_match(v_uid);

  if v_session is not null then
    return jsonb_build_object('status', 'matched', 'session_id', v_session);
  end if;
  return jsonb_build_object('status', 'queued');
end;
$$;

create or replace function public.queue_heartbeat()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member(true);
  v_row public.matchmaking_queue%rowtype;
  v_session uuid;
begin
  update public.matchmaking_queue
  set heartbeat_at = now()
  where user_id = v_uid and status = 'waiting'
  returning * into v_row;

  if not found then
    -- Maybe we were matched between heartbeats; surface it.
    select * into v_row from public.matchmaking_queue
    where user_id = v_uid and status = 'matched'
      and matched_session_id is not null
    order by created_at desc limit 1;
    if found and exists (
      select 1 from public.video_sessions s
      where s.id = v_row.matched_session_id and s.status <> 'ended'
    ) then
      return jsonb_build_object('status', 'matched',
                                'session_id', v_row.matched_session_id);
    end if;
    return jsonb_build_object('status', 'not_queued');
  end if;

  v_session := public.try_match(v_uid);
  if v_session is not null then
    return jsonb_build_object('status', 'matched', 'session_id', v_session);
  end if;
  return jsonb_build_object('status', 'queued');
end;
$$;

create or replace function public.leave_queue()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
begin
  update public.matchmaking_queue
  set status = 'cancelled'
  where user_id = v_uid and status = 'waiting';
end;
$$;

create or replace function public.participant_ready(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_session public.video_sessions%rowtype;
  v_duration integer;
  v_both_ready boolean;
begin
  select * into v_session from public.video_sessions
  where id = p_session for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if not exists (
    select 1 from public.video_session_participants
    where session_id = p_session and user_id = v_uid
  ) then
    raise exception 'not_a_participant';
  end if;
  if v_session.status = 'ended' then
    return jsonb_build_object('status', 'ended',
      'end_reason', v_session.end_reason, 'server_now', now());
  end if;

  update public.video_session_participants
  set ready_at = coalesce(ready_at, now())
  where session_id = p_session and user_id = v_uid;

  select bool_and(ready_at is not null) into v_both_ready
  from public.video_session_participants
  where session_id = p_session;

  if v_both_ready and v_session.starts_at is null then
    select date_duration_seconds into v_duration from public.app_config;
    update public.video_sessions
    set status = 'active',
        starts_at = now(),
        ends_at = now() + make_interval(secs => v_duration)
    where id = p_session
    returning * into v_session;

    perform realtime.send(
      jsonb_build_object('starts_at', v_session.starts_at,
                         'ends_at', v_session.ends_at),
      'session_started',
      'session:' || p_session::text,
      true
    );
  end if;

  return jsonb_build_object(
    'status', v_session.status,
    'starts_at', v_session.starts_at,
    'ends_at', v_session.ends_at,
    'server_now', now()
  );
end;
$$;

create or replace function public.mark_connected(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
begin
  update public.video_session_participants
  set connected_at = coalesce(connected_at, now())
  where session_id = p_session and user_id = v_uid;
end;
$$;

create or replace function public.end_session(p_session uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_session public.video_sessions%rowtype;
begin
  if p_reason not in ('timer', 'left', 'partner_left',
                      'connect_timeout', 'connect_failed') then
    raise exception 'invalid_reason';
  end if;
  select * into v_session from public.video_sessions where id = p_session;
  if not found then
    raise exception 'session_not_found';
  end if;
  if not exists (
    select 1 from public.video_session_participants
    where session_id = p_session and user_id = v_uid
  ) then
    raise exception 'not_a_participant';
  end if;
  -- A skewed clock cannot shorten the date: 'timer' is only honored at the
  -- server's own ends_at (minus a 2s grace).
  if p_reason = 'timer' then
    if v_session.ends_at is null or now() < v_session.ends_at - interval '2 seconds' then
      raise exception 'too_early';
    end if;
  end if;
  return public.end_session_internal(p_session, p_reason);
end;
$$;

create or replace function public.get_active_session()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_row record;
begin
  select s.*, p.role as my_role into v_row
  from public.video_session_participants p
  join public.video_sessions s on s.id = p.session_id
  where p.user_id = v_uid and p.left_at is null;

  if not found then
    return jsonb_build_object('status', 'none', 'server_now', now());
  end if;

  if v_row.status = 'active' and v_row.ends_at < now() - interval '2 minutes' then
    perform public.end_session_internal(v_row.id, 'stale');
    return jsonb_build_object('status', 'none', 'server_now', now());
  end if;

  return jsonb_build_object(
    'status', v_row.status,
    'session_id', v_row.id,
    'role', v_row.my_role,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'resolution', v_row.resolution,
    'server_now', now()
  );
end;
$$;

-- The ONLY road to another user's profile, and it is session-scoped and
-- sanitized: display name, derived age, city, photo path. Never DOB/email.
create or replace function public.get_partner_profile(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_partner uuid;
  v_profile public.profiles%rowtype;
begin
  select user_id into v_partner
  from public.video_session_participants
  where session_id = p_session and user_id <> v_uid;
  if not found then
    raise exception 'session_not_found';
  end if;
  if not exists (
    select 1 from public.video_session_participants
    where session_id = p_session and user_id = v_uid
  ) then
    raise exception 'not_a_participant';
  end if;

  select * into v_profile from public.profiles where user_id = v_partner;
  return jsonb_build_object(
    'user_id', v_profile.user_id,
    'display_name', v_profile.display_name,
    'age', date_part('year', age(v_profile.date_of_birth))::int,
    'city', v_profile.city,
    'photo_path', v_profile.photo_path
  );
end;
$$;

create or replace function public.submit_decision(p_session uuid, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_session public.video_sessions%rowtype;
  v_resolution text;
begin
  if p_choice not in ('match', 'pass') then
    raise exception 'invalid_choice';
  end if;
  select * into v_session from public.video_sessions where id = p_session;
  if not found then
    raise exception 'session_not_found';
  end if;
  if not exists (
    select 1 from public.video_session_participants
    where session_id = p_session and user_id = v_uid
  ) then
    raise exception 'not_a_participant';
  end if;
  if v_session.status <> 'ended'
     or v_session.end_reason not in ('timer', 'left', 'partner_left') then
    raise exception 'decision_not_open';
  end if;

  -- First write wins; no changing your mind, no probing the partner.
  insert into public.date_decisions (session_id, user_id, choice)
  values (p_session, v_uid, p_choice)
  on conflict (session_id, user_id) do nothing;

  v_resolution := public.resolve_decisions(p_session);
  return jsonb_build_object('resolution', v_resolution);
end;
$$;

create or replace function public.send_message(p_match uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_body text := btrim(p_body);
  v_partner uuid;
  v_msg public.messages%rowtype;
begin
  if v_body = '' or char_length(v_body) > 2000 then
    raise exception 'invalid_message';
  end if;
  if not public.consume_token('msg:' || v_uid::text, 20, 1) then
    raise exception 'rate_limited';
  end if;

  select mm.user_id into v_partner
  from public.match_members mm
  join public.matches m on m.id = mm.match_id
  where mm.match_id = p_match and mm.user_id <> v_uid
    and m.status = 'active';
  if not found then
    raise exception 'match_not_found';
  end if;
  if not exists (
    select 1 from public.match_members
    where match_id = p_match and user_id = v_uid
  ) then
    raise exception 'match_not_found';
  end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = v_uid and blocked_id = v_partner)
       or (blocker_id = v_partner and blocked_id = v_uid)
  ) then
    raise exception 'match_not_found'; -- indistinguishable from a gone match
  end if;

  insert into public.messages (match_id, sender_id, body)
  values (p_match, v_uid, v_body)
  returning * into v_msg;

  return jsonb_build_object(
    'id', v_msg.id, 'match_id', v_msg.match_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'created_at', v_msg.created_at
  );
end;
$$;

create or replace function public.get_my_matches()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row order by row->>'last_activity' desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'match_id', m.id,
      'created_at', m.created_at,
      'partner', jsonb_build_object(
        'user_id', pp.user_id,
        'display_name', pp.display_name,
        'age', date_part('year', age(pp.date_of_birth))::int,
        'city', pp.city,
        'photo_path', pp.photo_path
      ),
      'last_message', (
        select jsonb_build_object(
          'body', left(msg.body, 120),
          'sender_id', msg.sender_id,
          'created_at', msg.created_at
        )
        from public.messages msg
        where msg.match_id = m.id and msg.deleted_at is null
        order by msg.created_at desc limit 1
      ),
      'last_activity', coalesce(
        (select max(msg.created_at) from public.messages msg
         where msg.match_id = m.id), m.created_at
      )
    ) as row
    from public.matches m
    join public.match_members me on me.match_id = m.id and me.user_id = v_uid
    join public.match_members them on them.match_id = m.id and them.user_id <> v_uid
    join public.profiles pp on pp.user_id = them.user_id
    where m.status = 'active'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = v_uid and b.blocked_id = them.user_id)
           or (b.blocker_id = them.user_id and b.blocked_id = v_uid)
      )
  ) matches_rows;
  return v_result;
end;
$$;

create or replace function public.create_block(p_blocked uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_shared_session uuid;
begin
  if p_blocked is null or p_blocked = v_uid then
    raise exception 'invalid_target';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'invalid_reason';
  end if;

  insert into public.blocks (blocker_id, blocked_id, reason)
  values (v_uid, p_blocked, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (blocker_id, blocked_id) do nothing;

  -- End any live shared session immediately.
  select p1.session_id into v_shared_session
  from public.video_session_participants p1
  join public.video_session_participants p2
    on p2.session_id = p1.session_id and p2.user_id = p_blocked
  where p1.user_id = v_uid and p1.left_at is null;
  if found then
    perform public.end_session_internal(v_shared_session, 'blocked');
  end if;

  -- Freeze any shared match; chat access dies via RLS + send_message checks.
  update public.matches m
  set status = 'blocked'
  where m.status = 'active'
    and exists (select 1 from public.match_members
                where match_id = m.id and user_id = v_uid)
    and exists (select 1 from public.match_members
                where match_id = m.id and user_id = p_blocked);

  perform public.audit(v_uid, 'block_created', p_blocked::text);
end;
$$;

create or replace function public.create_report(
  p_reported uuid, p_session uuid, p_category text, p_narrative text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_member();
  v_report uuid;
begin
  if p_reported is null or p_reported = v_uid then
    raise exception 'invalid_target';
  end if;
  if p_category not in ('sexual_content', 'harassment', 'underage',
                        'impersonation', 'violence', 'spam', 'other') then
    raise exception 'invalid_category';
  end if;
  if p_narrative is not null and char_length(p_narrative) > 4000 then
    raise exception 'invalid_narrative';
  end if;
  -- Rate limit report spam, but generously — never blocks an emergency Leave,
  -- which is a separate action.
  if not public.consume_token('report:' || v_uid::text, 5, 1.0 / 60.0) then
    raise exception 'rate_limited';
  end if;
  if p_session is not null and not exists (
    select 1 from public.video_session_participants
    where session_id = p_session and user_id = v_uid
  ) then
    raise exception 'invalid_session';
  end if;

  insert into public.reports (reporter_id, reported_id, session_id, category, narrative)
  values (v_uid, p_reported, p_session, p_category,
          nullif(btrim(coalesce(p_narrative, '')), ''))
  returning id into v_report;

  -- Child-safety rule: a possible-minor report quarantines the reported
  -- account from the dating queue immediately, pending human review.
  if p_category = 'underage' then
    update public.profiles
    set account_status = 'quarantined'
    where user_id = p_reported and account_status = 'active';
    perform public.audit(null, 'auto_quarantine_underage_report',
                         p_reported::text,
                         jsonb_build_object('report_id', v_report));
  end if;

  perform public.audit(v_uid, 'report_created', p_reported::text,
                       jsonb_build_object('report_id', v_report,
                                          'category', p_category));
  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: default EXECUTE (PUBLIC) is revoked everywhere; user-facing
-- functions come back for authenticated only. Internal helpers stay
-- owner-only.
-- ---------------------------------------------------------------------------
revoke all on function public.consume_token(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.audit(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.assert_member(boolean) from public, anon, authenticated;
revoke all on function public.end_session_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.try_match(uuid) from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'save_profile(text, date, text)',
    'save_profile_photo(text)',
    'accept_terms(text)',
    'demo_verify()',
    'join_queue()',
    'queue_heartbeat()',
    'leave_queue()',
    'participant_ready(uuid)',
    'mark_connected(uuid)',
    'end_session(uuid, text)',
    'get_active_session()',
    'get_partner_profile(uuid)',
    'submit_decision(uuid, text)',
    'resolve_decisions(uuid)',
    'send_message(uuid, text)',
    'get_my_matches()',
    'create_block(uuid, text)',
    'create_report(uuid, uuid, text, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
