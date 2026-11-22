begin;

create table if not exists public.pension_family_links (
  family_key text primary key,
  token_hash bytea not null
);
alter table public.pension_family_links enable row level security;
revoke all on public.pension_family_links from public, anon, authenticated;

create or replace function public.pension_issue_family_link(requested_family text)
returns text language plpgsql security definer set search_path = ''
as $$
declare access_token text;
begin
  if not public.can_access_pension_family(requested_family) then
    raise insufficient_privilege using message = 'Family access required';
  end if;
  access_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.pension_family_links (family_key, token_hash)
  values (requested_family, sha256(convert_to(access_token, 'UTF8')))
  on conflict (family_key) do update set token_hash = excluded.token_hash;
  return access_token;
end;
$$;
revoke all on function public.pension_issue_family_link(text) from public, anon;
grant execute on function public.pension_issue_family_link(text) to authenticated;

create or replace function public.pension_family_link_valid(requested_family text, access_token text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select length(access_token) = 64 and exists (
    select 1 from public.pension_family_links
    where family_key = requested_family and token_hash = sha256(convert_to(access_token, 'UTF8'))
  );
$$;
revoke all on function public.pension_family_link_valid(text, text) from public, anon, authenticated;

create or replace function public.pension_family_link_read(requested_family text, access_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.pension_family_link_valid(requested_family, access_token), false) then
    raise insufficient_privilege using message = 'Invalid family link';
  end if;
  return (select jsonb_build_object('data_json', data_json, 'updated_at', updated_at)
          from public.family_assets where family_key = requested_family);
end;
$$;

create or replace function public.pension_family_link_write(
  requested_family text, access_token text, expected_revision timestamptz, next_data jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare saved_at timestamptz;
begin
  if not coalesce(public.pension_family_link_valid(requested_family, access_token), false) then
    raise insufficient_privilege using message = 'Invalid family link';
  end if;
  if jsonb_typeof(next_data) is distinct from 'object'
     or jsonb_typeof(next_data->'assetRows') is distinct from 'array' then
    raise invalid_parameter_value using message = 'Invalid asset document';
  end if;
  update public.family_assets set data_json = next_data
    where family_key = requested_family and updated_at is not distinct from expected_revision
      and public.pension_family_link_valid(requested_family, access_token)
    returning updated_at into saved_at;
  if not found then return null; end if;
  return jsonb_build_object('updated_at', saved_at);
end;
$$;
revoke all on function public.pension_family_link_read(text,text),
  public.pension_family_link_write(text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.pension_family_link_read(text,text),
  public.pension_family_link_write(text,text,timestamptz,jsonb) to anon, authenticated;

commit;
