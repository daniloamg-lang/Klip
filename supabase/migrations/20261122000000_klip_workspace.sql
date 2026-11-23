create table if not exists public.klip_workspace_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision integer not null check (revision > 0),
  key_salt text not null check (length(key_salt) = 24),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint klip_workspace_payload_is_envelope check ((
    payload ->> 'formatVersion' = '1'
    and jsonb_typeof(payload -> 'iv') = 'string'
    and jsonb_typeof(payload -> 'ciphertext') = 'string'
  ) is true)
);

alter table public.klip_workspace_state enable row level security;

revoke all on table public.klip_workspace_state from anon, authenticated;
grant select on table public.klip_workspace_state to authenticated;

drop policy if exists "aal2 users can read their Klip workspace" on public.klip_workspace_state;
create policy "aal2 users can read their Klip workspace"
  on public.klip_workspace_state
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );

create or replace function public.save_klip_workspace(
  p_payload jsonb,
  p_expected_revision integer,
  p_key_salt text
)
returns table (revision integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_revision integer;
  v_current_salt text;
  v_next_revision integer;
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if (auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception using errcode = '42501', message = 'mfa_required';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'invalid_workspace_revision';
  end if;

  if p_key_salt is null or length(p_key_salt) <> 24 then
    raise exception using errcode = '22023', message = 'invalid_workspace_key_salt';
  end if;

  if p_payload is null
    or p_payload ->> 'formatVersion' is distinct from '1'
    or pg_catalog.jsonb_typeof(p_payload -> 'iv') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'ciphertext') is distinct from 'string'
    or pg_catalog.octet_length(p_payload::text) > 8388608
  then
    raise exception using errcode = '22023', message = 'invalid_workspace_envelope';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_user_id::text));
  v_updated_at := pg_catalog.clock_timestamp();

  select state.revision, state.key_salt
    into v_current_revision, v_current_salt
    from public.klip_workspace_state as state
    where state.user_id = v_user_id
    for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception using errcode = '40001', message = 'klip_workspace_conflict';
    end if;
    v_next_revision := 1;
  else
    if v_current_revision <> p_expected_revision then
      raise exception using errcode = '40001', message = 'klip_workspace_conflict';
    end if;
    if v_current_salt <> p_key_salt then
      raise exception using errcode = '42501', message = 'workspace_key_mismatch';
    end if;
    v_next_revision := v_current_revision + 1;
  end if;

  insert into public.klip_workspace_state (user_id, revision, key_salt, payload, updated_at)
    values (v_user_id, v_next_revision, p_key_salt, p_payload, v_updated_at)
    on conflict (user_id) do update
      set revision = excluded.revision,
          key_salt = excluded.key_salt,
          payload = excluded.payload,
          updated_at = excluded.updated_at;

  return query select v_next_revision, v_updated_at;
end;
$$;

revoke all on function public.save_klip_workspace(jsonb, integer, text) from public, anon;
grant execute on function public.save_klip_workspace(jsonb, integer, text) to authenticated;
