-- APPLIED to the live database on 2026-08-28 (project fwuftjunybbxlhwauxta),
-- straight after DELIVERIES-DB.sql. Same caveat: this is a RECORD, and both
-- files belong in hf-database as numbered migrations, in this order.
--
-- =============================================================================
-- A delivery carries MANY items.
--
-- The first cut had item and qty as columns on the delivery itself, which said
-- one lorry-load = one thing. A real trip is one D.O. with a list on it, and
-- typing the same date, driver and D.O. number five times to record five things
-- is both tedious and a lie: it reads as five deliveries, so "how many loads
-- went to Rawang" answers five when the truth is one.
--
-- So: deliveries becomes the HEADER (when, from, to, who drove, D.O., arrived)
-- and delivery_items carries the list. Arrived stays on the header — a lorry
-- turns up or it does not, it does not half-arrive.
-- =============================================================================
begin;

create table if not exists public.delivery_items (
  item_id     uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(delivery_id) on delete cascade,
  item        text not null default '',
  -- text, like the header's was: "2", "2 sets" and "1 lot" are all real answers
  qty         text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists delivery_items_delivery_idx
  on public.delivery_items (delivery_id, sort_order);

alter table public.delivery_items enable row level security;
revoke all on public.delivery_items from anon, authenticated;

drop trigger if exists trg_delivery_items_updated_at on public.delivery_items;
create trigger trg_delivery_items_updated_at
  before update on public.delivery_items
  for each row execute function public.update_updated_at();

drop trigger if exists trg_audit_delivery_items on public.delivery_items;
create trigger trg_audit_delivery_items
  after insert or update or delete on public.delivery_items
  for each row execute function public.fn_audit_row('item_id', 'item');

-- ------------------------------------------------- what is already recorded
-- Every existing delivery becomes a one-item delivery. Nothing is lost and
-- nothing needs re-typing.
insert into public.delivery_items (delivery_id, item, qty, sort_order)
select d.delivery_id, d.item, d.qty, 0
  from public.deliveries d
 where (btrim(coalesce(d.item, '')) <> '' or btrim(coalesce(d.qty, '')) <> '')
   and not exists (select 1 from public.delivery_items i
                    where i.delivery_id = d.delivery_id);

-- The audit trigger labelled a delivery by its item; the header has no item of
-- its own any more, so it labels by the D.O. number instead.
drop trigger if exists trg_audit_deliveries on public.deliveries;
create trigger trg_audit_deliveries
  after insert or update or delete on public.deliveries
  for each row execute function public.fn_audit_row('delivery_id', 'do_number');

alter table public.deliveries drop column if exists item;
alter table public.deliveries drop column if exists qty;

-- ------------------------------------------------------------------- reads
create or replace function public.get_deliveries(
  p_from date default null,
  p_to   date default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rows jsonb;
  v_drv  jsonb;
begin
  perform public.fn_require_any('deliveries.view');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',       d.delivery_id,
           'date',     d.delivery_date,
           'from',     d.from_site,
           'to',       d.to_site,
           'driver',   d.driver,
           'doNum',    d.do_number,
           'remark',   d.remark,
           'received', d.arrived,
           'items',    coalesce((
             select jsonb_agg(jsonb_build_object('item', i.item, 'qty', i.qty)
                    order by i.sort_order, i.created_at)
               from public.delivery_items i
              where i.delivery_id = d.delivery_id), '[]'::jsonb))
         order by d.delivery_date desc nulls first, d.created_at desc), '[]'::jsonb)
    into v_rows
    from public.deliveries d
   where (p_from is null or d.delivery_date >= p_from)
     and (p_to   is null or d.delivery_date <= p_to);

  select coalesce(jsonb_agg(jsonb_build_object('name', dr.name, 'vehicle', dr.vehicle)
         order by dr.sort_order, dr.name), '[]'::jsonb)
    into v_drv
    from public.delivery_drivers dr
   where dr.is_active;

  return jsonb_build_object('ok', true, 'deliveries', v_rows, 'drivers', v_drv,
                            'can_edit',   public.fn_has('deliveries.edit', null),
                            'can_delete', public.fn_has('deliveries.delete', null));
end;
$function$;

-- ------------------------------------------------------------------ writes
-- The old signature carried p_item / p_qty. Dropped rather than left beside the
-- new one: two functions of the same name, one of which quietly ignores the
-- item list, is a trap for whoever calls it next.
drop function if exists public.save_delivery(uuid, date, text, text, text, text, text, text, text, boolean);

-- Send the WHOLE delivery every time — header and the full item list. The items
-- are replaced, not merged: the list on screen IS the list on the lorry, and a
-- line the office deleted must not survive because the payload forgot to
-- mention it.
create or replace function public.save_delivery(
  p_delivery_id uuid    default null,
  p_date        date    default null,
  p_from        text    default null,
  p_to          text    default null,
  p_driver      text    default null,
  p_do          text    default null,
  p_remark      text    default null,
  p_arrived     boolean default false,
  p_items       jsonb   default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid;
  v_id    uuid;
  v_do    text := btrim(coalesce(p_do, ''));
  v_kept  jsonb;
  v_n     integer;
begin
  if p_delivery_id is null then
    perform public.fn_require_any('deliveries.create');
  else
    perform public.fn_require_any('deliveries.edit');
  end if;
  v_actor := public.fn_my_staff_id();

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'bad_items',
      'message', 'The item list is missing.');
  end if;

  -- an item line with no name is somebody's half-finished typing, not cargo
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_kept
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
   where btrim(coalesce(e->>'item', '')) <> '';
  v_n := jsonb_array_length(v_kept);

  if v_n = 0 and v_do = '' then
    return jsonb_build_object('ok', false, 'code', 'nothing_to_save',
      'message', 'Add at least one item, or give the D.O. number.');
  end if;
  if v_n > 200 then
    return jsonb_build_object('ok', false, 'code', 'too_many_items',
      'message', 'That is more items than one lorry-load should hold.');
  end if;

  if p_date is not null
     and p_date > ((now() at time zone 'Asia/Kuala_Lumpur')::date + 365) then
    return jsonb_build_object('ok', false, 'code', 'date_too_far',
      'message', 'That date is more than a year away — check the year.');
  end if;

  if p_delivery_id is not null
     and not exists (select 1 from public.deliveries where delivery_id = p_delivery_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'That delivery is no longer there — reload the page.');
  end if;

  insert into public.deliveries as d
    (delivery_id, delivery_date, from_site, to_site, driver,
     do_number, remark, arrived, arrived_at, created_by, updated_by)
  values
    (coalesce(p_delivery_id, gen_random_uuid()), p_date,
     btrim(coalesce(p_from, '')), btrim(coalesce(p_to, '')),
     btrim(coalesce(p_driver, '')), v_do, btrim(coalesce(p_remark, '')),
     coalesce(p_arrived, false),
     case when coalesce(p_arrived, false) then now() end, v_actor, v_actor)
  on conflict (delivery_id) do update
    set delivery_date = excluded.delivery_date,
        from_site     = excluded.from_site,
        to_site       = excluded.to_site,
        driver        = excluded.driver,
        do_number     = excluded.do_number,
        remark        = excluded.remark,
        arrived       = excluded.arrived,
        -- stamped the first time the tick goes on, cleared if it comes off: a
        -- time for an arrival that did not happen is worse than no time
        arrived_at    = case when excluded.arrived and not d.arrived then now()
                             when not excluded.arrived then null
                             else d.arrived_at end,
        updated_by    = excluded.updated_by
  returning d.delivery_id into v_id;

  delete from public.delivery_items where delivery_id = v_id;
  insert into public.delivery_items (delivery_id, item, qty, sort_order)
  select v_id, btrim(e->>'item'), btrim(coalesce(e->>'qty', '')), (ord - 1)::int
    from jsonb_array_elements(v_kept) with ordinality as t(e, ord);

  return jsonb_build_object('ok', true, 'id', v_id, 'items', v_n,
                            'created', p_delivery_id is null);
end;
$function$;

revoke all on function public.save_delivery(uuid, date, text, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.save_delivery(uuid, date, text, text, text, text, text, boolean, jsonb) to authenticated;

commit;
