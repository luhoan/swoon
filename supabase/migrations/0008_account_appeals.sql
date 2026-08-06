-- First-class account appeals and transactional moderator restoration.
-- Restricted members receive only a safe projection through an RPC; the
-- underlying review table and internal notes remain private.

create table public.account_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  restriction_status text not null
    check (restriction_status in ('suspended', 'banned')),
  statement text not null
    check (char_length(btrim(statement)) between 20 and 4000),
  status text not null default 'open'
    check (status in ('open', 'restored', 'upheld')),
  reviewer_id uuid references auth.users (id) on delete set null,
  review_note text
    check (
      review_note is null
      or char_length(btrim(review_note)) between 1 and 2000
    ),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (
    (
      status = 'open'
      and reviewer_id is null
      and review_note is null
      and reviewed_at is null
    )
    or
    (
      status <> 'open'
      and review_note is not null
      and reviewed_at is not null
    )
  )
);

create unique index one_open_account_appeal
  on public.account_appeals (user_id)
  where status = 'open';
create index account_appeals_review_queue
  on public.account_appeals (status, created_at);

alter table public.account_appeals enable row level security;

-- Internal role gate used by the two moderator-facing RPCs. This helper is
-- deliberately not executable by API roles on its own.
create or replace function public.assert_moderator()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select role into v_role
  from public.profiles
  where user_id = v_uid;

  if v_role is null or v_role not in ('moderator', 'admin') then
    raise exception 'not_moderator' using errcode = '42501';
  end if;

  return v_uid;
end;
$$;

-- Safe member projection. In particular, reviewer_id and review_note never
-- cross this interface.
create or replace function public.get_my_account_appeals()
returns table (
  id uuid,
  restriction_status text,
  statement text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  return query
  select
    a.id,
    a.restriction_status,
    a.statement,
    a.status,
    a.created_at,
    a.reviewed_at
  from public.account_appeals a
  where a.user_id = v_uid
  order by a.created_at desc;
end;
$$;

create or replace function public.submit_account_appeal(p_statement text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_statement text := btrim(coalesce(p_statement, ''));
  v_appeal uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select account_status into v_status
  from public.profiles
  where user_id = v_uid
  for update;

  if v_status is null or v_status not in ('suspended', 'banned') then
    raise exception 'appeal_not_allowed';
  end if;

  if char_length(v_statement) not between 20 and 4000 then
    raise exception 'appeal_statement_invalid';
  end if;

  if exists (
    select 1 from public.account_appeals
    where user_id = v_uid and status = 'open'
  ) then
    raise exception 'appeal_already_open';
  end if;

  if exists (
    select 1 from public.account_appeals
    where user_id = v_uid
      and status = 'upheld'
      and reviewed_at > now() - interval '7 days'
  ) then
    raise exception 'appeal_cooldown';
  end if;

  if not public.consume_token(
    'appeal:' || v_uid::text,
    2,
    1.0 / 43200.0
  ) then
    raise exception 'appeal_rate_limited';
  end if;

  insert into public.account_appeals (
    user_id,
    restriction_status,
    statement
  ) values (
    v_uid,
    v_status,
    v_statement
  )
  returning id into v_appeal;

  perform public.audit(
    v_uid,
    'appeal_submitted',
    v_uid::text,
    jsonb_build_object(
      'appeal_id', v_appeal,
      'restriction_status', v_status
    )
  );

  return v_appeal;
end;
$$;

create or replace function public.resolve_account_appeal(
  p_appeal uuid,
  p_decision text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.assert_moderator();
  v_appeal public.account_appeals%rowtype;
  v_current_status text;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_decision not in ('restore', 'uphold') then
    raise exception 'appeal_decision_invalid';
  end if;

  if char_length(v_note) not between 1 and 2000 then
    raise exception 'review_note_invalid';
  end if;

  select * into v_appeal
  from public.account_appeals
  where id = p_appeal
  for update;

  if not found then
    raise exception 'appeal_not_found';
  end if;

  if v_appeal.status <> 'open' then
    raise exception 'appeal_already_resolved';
  end if;

  select account_status into v_current_status
  from public.profiles
  where user_id = v_appeal.user_id
  for update;

  if v_current_status is null
     or v_current_status not in ('suspended', 'banned') then
    raise exception 'account_not_restricted';
  end if;

  if p_decision = 'restore' then
    update public.profiles
    set account_status = 'active'
    where user_id = v_appeal.user_id;

    insert into public.moderation_actions (
      report_id,
      target_user_id,
      actor_user_id,
      action,
      reason
    ) values (
      null,
      v_appeal.user_id,
      v_actor,
      'reinstate',
      v_note
    );

    update public.account_appeals
    set
      status = 'restored',
      reviewer_id = v_actor,
      review_note = v_note,
      reviewed_at = now()
    where id = v_appeal.id;

    perform public.audit(
      v_actor,
      'appeal_restored',
      v_appeal.user_id::text,
      jsonb_build_object(
        'appeal_id', v_appeal.id,
        'previous_status', v_current_status,
        'reason', v_note
      )
    );
  else
    update public.account_appeals
    set
      status = 'upheld',
      reviewer_id = v_actor,
      review_note = v_note,
      reviewed_at = now()
    where id = v_appeal.id;

    perform public.audit(
      v_actor,
      'appeal_upheld',
      v_appeal.user_id::text,
      jsonb_build_object(
        'appeal_id', v_appeal.id,
        'restriction_status', v_current_status,
        'reason', v_note
      )
    );
  end if;
end;
$$;

create or replace function public.restore_restricted_account(
  p_target uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.assert_moderator();
  v_current_status text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_appeal uuid;
begin
  if char_length(v_reason) not between 1 and 2000 then
    raise exception 'review_note_invalid';
  end if;

  select account_status into v_current_status
  from public.profiles
  where user_id = p_target
  for update;

  if v_current_status is null
     or v_current_status not in ('suspended', 'banned') then
    raise exception 'account_not_restricted';
  end if;

  update public.profiles
  set account_status = 'active'
  where user_id = p_target;

  insert into public.moderation_actions (
    report_id,
    target_user_id,
    actor_user_id,
    action,
    reason
  ) values (
    null,
    p_target,
    v_actor,
    'reinstate',
    v_reason
  );

  update public.account_appeals
  set
    status = 'restored',
    reviewer_id = v_actor,
    review_note = v_reason,
    reviewed_at = now()
  where user_id = p_target and status = 'open'
  returning id into v_appeal;

  if v_appeal is not null then
    perform public.audit(
      v_actor,
      'appeal_restored',
      p_target::text,
      jsonb_build_object(
        'appeal_id', v_appeal,
        'previous_status', v_current_status,
        'reason', v_reason,
        'source', 'direct_restoration'
      )
    );
  end if;

  perform public.audit(
    v_actor,
    'moderation_reinstate',
    p_target::text,
    jsonb_build_object(
      'appeal_id', v_appeal,
      'previous_status', v_current_status,
      'reason', v_reason
    )
  );
end;
$$;

revoke all on function public.assert_moderator() from public;
revoke all on function public.get_my_account_appeals() from public;
revoke all on function public.submit_account_appeal(text) from public;
revoke all on function public.resolve_account_appeal(uuid, text, text) from public;
revoke all on function public.restore_restricted_account(uuid, text) from public;

grant execute on function public.get_my_account_appeals() to authenticated;
grant execute on function public.submit_account_appeal(text) to authenticated;
grant execute on function public.resolve_account_appeal(uuid, text, text) to authenticated;
grant execute on function public.restore_restricted_account(uuid, text) to authenticated;
