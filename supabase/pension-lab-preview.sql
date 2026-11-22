-- Run on a separate Supabase project after importing a backup of family_assets.
begin;

create table if not exists public.family_assets (
  family_key text primary key,
  data_json jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.pension_family_members (
  family_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (family_key, user_id)
);
create table if not exists public.pension_family_revisions (
  family_key text not null,
  updated_at timestamptz not null,
  data_json jsonb not null,
  primary key (family_key, updated_at)
);
alter table public.pension_family_members enable row level security;
alter table public.pension_family_revisions enable row level security;
revoke all on public.pension_family_members, public.pension_family_revisions from public, anon, authenticated;

-- Retain the existing documents before changing how clients access them.
insert into public.pension_family_revisions (family_key, updated_at, data_json)
  select family_key, updated_at, data_json from public.family_assets
  where updated_at is not null and data_json is not null
  on conflict do nothing;

create or replace function public.can_access_pension_family(requested_family text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pension_family_members
    where family_key = requested_family and user_id = auth.uid()
  );
$$;
revoke all on function public.can_access_pension_family(text) from public, anon;
grant execute on function public.can_access_pension_family(text) to authenticated;

alter table public.family_assets enable row level security;
revoke all on public.family_assets from public, anon, authenticated;
grant select, insert, update on public.family_assets to authenticated;
drop policy if exists pension_family_allow on public.family_assets;
drop policy if exists pension_family_guard on public.family_assets;
create policy pension_family_allow on public.family_assets
  for all to authenticated
  using (public.can_access_pension_family(family_key))
  with check (public.can_access_pension_family(family_key));
create policy pension_family_guard on public.family_assets as restrictive
  for all to authenticated
  using (public.can_access_pension_family(family_key))
  with check (public.can_access_pension_family(family_key));

create or replace function public.pension_backup_revision()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  snapshot record;
begin
  if old.family_key is distinct from new.family_key then
    raise exception 'Family key cannot change';
  end if;
  for snapshot in select * from jsonb_each(coalesce(old.data_json #> '{labAssetMetadata,snapshots}', '{}'::jsonb))
  loop
    if (new.data_json #> array['labAssetMetadata', 'snapshots', snapshot.key]) is distinct from snapshot.value then
      raise exception 'A confirmed month cannot change';
    end if;
  end loop;
  insert into public.pension_family_revisions (family_key, updated_at, data_json)
    values (old.family_key, old.updated_at, old.data_json)
    on conflict do nothing;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.pension_backup_revision() from public, anon, authenticated;
drop trigger if exists pension_backup_before_update on public.family_assets;
create trigger pension_backup_before_update before update on public.family_assets
  for each row execute function public.pension_backup_revision();

create or replace function public.pension_lab_ready(requested_family text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pension_family_members where family_key = requested_family
  );
$$;
revoke all on function public.pension_lab_ready(text) from public;
grant execute on function public.pension_lab_ready(text) to anon, authenticated;
commit;
