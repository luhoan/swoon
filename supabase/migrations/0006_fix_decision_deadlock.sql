-- Stress testing surfaced a deadlock: two concurrent submit_decision calls
-- each take an FK KEY SHARE on the video_sessions row via the date_decisions
-- insert, then both try to upgrade to FOR UPDATE inside resolve_decisions.
-- Fix: acquire the session row lock FIRST, so the insert's FK check and the
-- later resolve reuse a lock this transaction already holds.

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
  -- Lock up front (see header comment): consistent lock ordering prevents
  -- the KEY SHARE -> FOR UPDATE deadlock between partners.
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

revoke all on function public.submit_decision(uuid, text) from public, anon;
grant execute on function public.submit_decision(uuid, text) to authenticated;
