begin;

-- Public projection. Keep raw asset rows and write permissions private.
create or replace function public.pension_public_summary()
returns jsonb language sql stable security definer set search_path = ''
as $$
  with family as (
    select data_json as data
    from public.family_assets where family_key = 'kim_family'
  ), rows as (
    select item, data
    from family cross join lateral jsonb_array_elements(
      case when jsonb_typeof(data->'assetRows') = 'array' then data->'assetRows' else '[]'::jsonb end
    ) item
  ), periods as (
    select max(period_key) as period
    from rows cross join lateral jsonb_object_keys(
      case when jsonb_typeof(item->'values') = 'object' then item->'values' else '{}'::jsonb end
    ) period_key
    where period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and period_key <= to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')
  ), amounts as (
    select coalesce(item->>'labAccountingKind', item->>'category') as kind,
      case when item->>'retiredFrom' <= period then 0
           when (item->'values'->>period) ~ '^-?[0-9]+([.][0-9]+)?$'
           then (item->'values'->>period)::numeric
           when (data #>> array['assetArchivedPeriods','rows',item->>'id',period]) ~ '^-?[0-9]+([.][0-9]+)?$'
           then (data #>> array['assetArchivedPeriods','rows',item->>'id',period])::numeric
           else 0 end as amount
    from rows cross join periods
  ), categories as (
    select case when kind in ('부동산','주식','현금','연금','금') then kind
                when kind = '금/비트' then '금'
                else '기타' end as label,
      sum(amount) as amount
    from amounts where amount > 0 group by 1
  ), totals as (
    select coalesce(sum(greatest(amount, 0)), 0) as assets,
      coalesce(sum(greatest(-amount, 0)), 0) as debt from amounts
  )
  select case when period is null then null else jsonb_build_object(
    'period', period, 'assets', assets, 'debt', debt, 'net', assets-debt,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'amount', amount) order by amount desc, label) from categories), '[]'::jsonb)
  ) end
  from periods cross join totals;
$$;

revoke all on function public.pension_public_summary() from public, anon, authenticated;
grant execute on function public.pension_public_summary() to anon, authenticated;
commit;
