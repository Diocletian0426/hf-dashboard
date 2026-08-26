-- APPLIED to the live database on 2026-08-26 (project fwuftjunybbxlhwauxta).
--
-- This file is a RECORD, not the source of truth: it belongs in hf-database as
-- a numbered migration alongside 0090-0092, and should be moved there. It is
-- kept here so the frontend change that depends on it (delivery-status.html
-- reading get_deliveries instead of a static file) is not the only trace of it.
--
-- Everything below is additive and re-runnable: if not exists / on conflict do
-- nothing throughout, wrapped in one transaction.
--
-- =============================================================================
-- DELIVERIES — what went out, where it went, who drove it, and whether it
-- landed. Moves the Delivery Status page off the static delivery-data.js file
-- and into the database, so the published dashboard can add records too and
-- the record stops being readable by anyone with the URL.
--
-- Follows the house pattern exactly:
--   * base tables get NO grants to anon/authenticated (same as public.machines)
--   * every read and write goes through a SECURITY DEFINER function that calls
--     fn_require_any() first and returns jsonb {ok:true,...} / {ok:false,code}
--   * row changes are audited by the generic fn_audit_row trigger
--   * updated_at is maintained by update_updated_at
--
-- Sites are TEXT, not project ids, on purpose: a load can come from a supplier
-- that is not one of our projects, and the page offers the site list as
-- suggestions rather than as a fence. Quantity is TEXT for the same reason —
-- "2", "2 sets" and "1 lot" are all real answers the office writes.
-- =============================================================================
begin;

-- ---------------------------------------------------------------- 1. module
insert into public.modules (module_code, name, description, sort_order, is_active)
values ('deliveries', 'Deliveries',
        'Loads on their way to site, and what has arrived.', 95, true)
on conflict (module_code) do nothing;

-- ----------------------------------------------------------- 2. permissions
insert into public.permissions
  (permission_code, module_code, action_code, name, description,
   is_project_scoped, is_sensitive, sort_order, is_active)
values
  ('deliveries.view',   'deliveries', 'view',   'See deliveries',
   'What is on its way to site, and what has arrived.',        false, false, 100, true),
  ('deliveries.create', 'deliveries', 'create', 'Add a delivery',
   'Write a new delivery line.',                               false, false, 100, true),
  ('deliveries.edit',   'deliveries', 'edit',   'Change a delivery',
   'Correct a line, tick it as arrived, edit the driver list.', false, false, 100, true),
  ('deliveries.delete', 'deliveries', 'delete', 'Delete a delivery',
   'Remove a delivery line.',                                  false, true,  100, true)
on conflict (permission_code) do nothing;

-- Whoever can already see or change the fleet gets the same over deliveries —
-- that is exactly what the frontend has been assuming while the page rode on
-- machines.view, so nobody gains or loses anything today.
insert into public.access_profile_permissions (access_profile_id, permission_code)
select app.access_profile_id, replace(app.permission_code, 'machines.', 'deliveries.')
  from public.access_profile_permissions app
 where app.permission_code in ('machines.view', 'machines.create',
                               'machines.edit', 'machines.delete')
on conflict do nothing;

-- --------------------------------------------------------------- 3. tables
create table if not exists public.delivery_drivers (
  driver_id   uuid primary key default gen_random_uuid(),
  name        text    not null,
  -- Loader / Cargo / Lorry today, but not a check constraint: the yard will
  -- have a vehicle nobody thought of before this table is next migrated.
  vehicle     text    not null default 'Lorry',
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists delivery_drivers_name_key
  on public.delivery_drivers (lower(name));

create table if not exists public.deliveries (
  delivery_id   uuid primary key default gen_random_uuid(),
  delivery_date date,
  item          text not null default '',
  from_site     text not null default '',
  to_site       text not null default '',
  qty           text not null default '',
  driver        text not null default '',
  do_number     text not null default '',
  remark        text not null default '',
  arrived       boolean not null default false,
  arrived_at    timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index if not exists deliveries_date_idx
  on public.deliveries (delivery_date desc nulls first);

-- Nothing reaches these tables except the functions below. RLS on with no
-- policy is belt and braces on top of the missing grants.
alter table public.deliveries       enable row level security;
alter table public.delivery_drivers enable row level security;
revoke all on public.deliveries       from anon, authenticated;
revoke all on public.delivery_drivers from anon, authenticated;

-- ------------------------------------------------------------- 4. triggers
drop trigger if exists trg_deliveries_updated_at on public.deliveries;
create trigger trg_deliveries_updated_at
  before update on public.deliveries
  for each row execute function public.update_updated_at();

drop trigger if exists trg_audit_deliveries on public.deliveries;
create trigger trg_audit_deliveries
  after insert or update or delete on public.deliveries
  for each row execute function public.fn_audit_row('delivery_id', 'item');

drop trigger if exists trg_delivery_drivers_updated_at on public.delivery_drivers;
create trigger trg_delivery_drivers_updated_at
  before update on public.delivery_drivers
  for each row execute function public.update_updated_at();

drop trigger if exists trg_audit_delivery_drivers on public.delivery_drivers;
create trigger trg_audit_delivery_drivers
  after insert or update or delete on public.delivery_drivers
  for each row execute function public.fn_audit_row('driver_id', 'name');

-- ----------------------------------------------------------------- 5. reads
-- One call gives the page everything it draws: the lines and the driver list.
-- Two round trips to say "here is a table and its dropdown" is one more chance
-- for the page to render half of itself.
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
           'item',     d.item,
           'from',     d.from_site,
           'to',       d.to_site,
           'qty',      d.qty,
           'driver',   d.driver,
           'doNum',    d.do_number,
           'remark',   d.remark,
           'received', d.arrived)
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
                            -- the office profile may delete a line, the admin
                            -- profile may not (it mirrors machines.*) — so the
                            -- page is told, rather than offering a ✕ that fails
                            'can_delete', public.fn_has('deliveries.delete', null));
end;
$function$;

-- ---------------------------------------------------------------- 6. writes
-- Send the whole line every time: this is an upsert, not a merge. A new line
-- has no id yet, which is also what decides whether create or edit is required.
create or replace function public.save_delivery(
  p_delivery_id uuid    default null,
  p_date        date    default null,
  p_item        text    default null,
  p_from        text    default null,
  p_to          text    default null,
  p_qty         text    default null,
  p_driver      text    default null,
  p_do          text    default null,
  p_remark      text    default null,
  p_arrived     boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid;
  v_old   public.deliveries;
  v_new   public.deliveries;
  v_item  text := btrim(coalesce(p_item, ''));
  v_do    text := btrim(coalesce(p_do, ''));
begin
  if p_delivery_id is null then
    perform public.fn_require_any('deliveries.create');
  else
    perform public.fn_require_any('deliveries.edit');
  end if;
  v_actor := public.fn_my_staff_id();

  -- an empty line pressed by accident is not a delivery
  if v_item = '' and v_do = '' then
    return jsonb_build_object('ok', false, 'code', 'nothing_to_save',
      'message', 'Say what was delivered, or give the D.O. number.');
  end if;

  if p_date is not null
     and p_date > ((now() at time zone 'Asia/Kuala_Lumpur')::date + 365) then
    return jsonb_build_object('ok', false, 'code', 'date_too_far',
      'message', 'That date is more than a year away — check the year.');
  end if;

  if p_delivery_id is not null then
    select * into v_old from public.deliveries where delivery_id = p_delivery_id;
    if v_old.delivery_id is null then
      return jsonb_build_object('ok', false, 'code', 'not_found',
        'message', 'That delivery line is no longer there — reload the page.');
    end if;
  end if;

  insert into public.deliveries as d
    (delivery_id, delivery_date, item, from_site, to_site, qty, driver,
     do_number, remark, arrived, arrived_at, created_by, updated_by)
  values
    (coalesce(p_delivery_id, gen_random_uuid()), p_date, v_item,
     btrim(coalesce(p_from, '')), btrim(coalesce(p_to, '')),
     btrim(coalesce(p_qty, '')), btrim(coalesce(p_driver, '')),
     v_do, btrim(coalesce(p_remark, '')), coalesce(p_arrived, false),
     case when coalesce(p_arrived, false) then now() end, v_actor, v_actor)
  on conflict (delivery_id) do update
    set delivery_date = excluded.delivery_date,
        item          = excluded.item,
        from_site     = excluded.from_site,
        to_site       = excluded.to_site,
        qty           = excluded.qty,
        driver        = excluded.driver,
        do_number     = excluded.do_number,
        remark        = excluded.remark,
        arrived       = excluded.arrived,
        -- when it landed is stamped the first time the tick goes on, and
        -- cleared if somebody unticks it: a date for an arrival that did not
        -- happen is worse than no date
        arrived_at    = case when excluded.arrived and not d.arrived then now()
                             when not excluded.arrived then null
                             else d.arrived_at end,
        updated_by    = excluded.updated_by
  returning * into v_new;

  return jsonb_build_object('ok', true, 'id', v_new.delivery_id,
                            'created', p_delivery_id is null);
end;
$function$;

create or replace function public.delete_delivery(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_old public.deliveries;
begin
  perform public.fn_require_any('deliveries.delete');

  select * into v_old from public.deliveries where delivery_id = p_delivery_id;
  if v_old.delivery_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'That delivery line is already gone.');
  end if;

  delete from public.deliveries where delivery_id = p_delivery_id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ---------------------------------------------------------- 7. the crew list
-- Adding somebody who was taken off before puts them back rather than failing
-- on the unique index — "add Zul" means "Zul drives for us", not "insert a row".
create or replace function public.save_delivery_driver(
  p_name    text,
  p_vehicle text default 'Lorry')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_veh  text := btrim(coalesce(p_vehicle, ''));
begin
  perform public.fn_require_any('deliveries.edit');

  if v_name = '' then
    return jsonb_build_object('ok', false, 'code', 'name_required',
      'message', 'A driver needs a name.');
  end if;
  if v_veh = '' then v_veh := 'Lorry'; end if;

  update public.delivery_drivers
     set vehicle = v_veh, is_active = true
   where lower(name) = lower(v_name);

  if not found then
    insert into public.delivery_drivers (name, vehicle) values (v_name, v_veh);
  end if;

  return jsonb_build_object('ok', true, 'name', v_name, 'vehicle', v_veh);
end;
$function$;

-- Taking a driver off the list does NOT touch the deliveries they already
-- drove — those lines keep the name they were written with. Hence is_active,
-- not a delete.
create or replace function public.delete_delivery_driver(p_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_require_any('deliveries.edit');

  update public.delivery_drivers
     set is_active = false
   where lower(name) = lower(btrim(coalesce(p_name, '')));

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'That name is not on the list.');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ----------------------------------------------------------------- 8. grants
-- The functions are the door; anon never gets a key. The permission check
-- inside each one is what decides the rest.
revoke all on function public.get_deliveries(date, date)                    from public, anon;
revoke all on function public.save_delivery(uuid, date, text, text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.delete_delivery(uuid)                         from public, anon;
revoke all on function public.save_delivery_driver(text, text)              from public, anon;
revoke all on function public.delete_delivery_driver(text)                  from public, anon;

grant execute on function public.get_deliveries(date, date)                 to authenticated;
grant execute on function public.save_delivery(uuid, date, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_delivery(uuid)                      to authenticated;
grant execute on function public.save_delivery_driver(text, text)           to authenticated;
grant execute on function public.delete_delivery_driver(text)               to authenticated;

-- ------------------------------------------------- 9. the crew we already have
-- The five names the page is carrying today, in the order the office reads
-- them: loader, cargo, then the lorries.
insert into public.delivery_drivers (name, vehicle, sort_order) values
  ('Syamizie', 'Loader', 10),
  ('Sudin',    'Cargo',  20),
  ('Zul',      'Lorry',  30),
  ('Wan',      'Lorry',  40),
  ('Din',      'Lorry',  50)
on conflict do nothing;

commit;
