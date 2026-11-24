create or replace function public.replace_klip_workspace(
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
  select state.revision
    into v_current_revision
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
    v_next_revision := v_current_revision + 1;
  end if;

  v_updated_at := pg_catalog.clock_timestamp();
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

revoke all on function public.replace_klip_workspace(jsonb, integer, text) from public, anon;
grant execute on function public.replace_klip_workspace(jsonb, integer, text) to authenticated;
