-- The whole-site E2E caught this: deleting an account failed once the user
-- had sent any chat message, because messages.sender_id had no ON DELETE
-- rule (NO ACTION blocks auth.users deletion).
--
-- messages: delete the departed user's messages with them (their content
-- leaves when they do; the partner's own messages remain).
alter table public.messages
  drop constraint messages_sender_id_fkey;
alter table public.messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references auth.users (id) on delete cascade;

-- moderation_actions: keep the action record for audit continuity even if
-- the acting moderator's account is later deleted.
alter table public.moderation_actions
  alter column actor_user_id drop not null;
alter table public.moderation_actions
  drop constraint moderation_actions_actor_user_id_fkey;
alter table public.moderation_actions
  add constraint moderation_actions_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users (id) on delete set null;
