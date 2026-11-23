begin;

create or replace function public.pension_shared_document(input_doc jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(input_doc)
  where key in (
    'schemaVersion', 'serverStateVersion', 'savedAt', 'assetRows', 'assetPeriods',
    'assetFutureBackup', 'assetArchivedPeriods', 'investmentData', 'labAssetMetadata',
    'pension', 'housePlan', 'realEstatePlan', 'retirementPlan', 'retirementPlanDefaultVersion'
  );
$$;
revoke all on function public.pension_shared_document(jsonb) from public, anon, authenticated;

create or replace function public.pension_shared_read()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('data_json', public.pension_shared_document(data_json), 'updated_at', updated_at)
  from public.family_assets where family_key = 'kim_family';
$$;

create or replace function public.pension_shared_write(expected_revision timestamptz, next_data jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare saved_at timestamptz;
begin
  if expected_revision is null or jsonb_typeof(next_data) is distinct from 'object'
     or pg_column_size(next_data) > 4000000
     or jsonb_typeof(next_data->'assetRows') is distinct from 'array'
     or jsonb_typeof(next_data->'assetPeriods') is distinct from 'array'
     or jsonb_typeof(next_data->'investmentData') is distinct from 'object' then
    raise invalid_parameter_value using message = 'Invalid shared asset document';
  end if;
  if exists (
    select from jsonb_array_elements(next_data->'assetRows') as item
    where jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'id', '') !~ '^[a-zA-Z0-9_-]{1,120}$'
      or jsonb_typeof(item->'label') is distinct from 'string'
      or jsonb_typeof(item->'category') is distinct from 'string'
      or jsonb_typeof(item->'values') is distinct from 'object'
  ) then raise invalid_parameter_value using message = 'Invalid asset row'; end if;
  update public.family_assets
  set data_json = data_json || public.pension_shared_document(next_data)
  where family_key = 'kim_family' and updated_at = expected_revision
  returning updated_at into saved_at;
  if not found then return null; end if;
  return jsonb_build_object('updated_at', saved_at);
end;
$$;
revoke all on function public.pension_shared_read(), public.pension_shared_write(timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.pension_shared_read(), public.pension_shared_write(timestamptz,jsonb)
  to anon, authenticated;

commit;
