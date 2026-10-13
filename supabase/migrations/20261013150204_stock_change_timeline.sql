-- Capture stock changes at the database boundary, including imports and removals.
-- This ledger is independent of the legacy request-linked events so each quantity
-- change is recorded once, and deleting an item cannot erase its audit snapshot.
create table public.swag_stock_changes (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null,
  category text not null,
  item_name text not null,
  color text not null default '',
  size text not null default '',
  previous_quantity integer not null check (previous_quantity >= 0),
  resulting_quantity integer not null check (resulting_quantity >= 0),
  quantity_change integer not null,
  action text not null check (action in ('adjusted','created','removed','restored','fulfillment')),
  actor_user_id uuid,
  actor_label text not null,
  created_at timestamptz not null default clock_timestamp(),
  check (quantity_change = resulting_quantity - previous_quantity)
);
create index swag_stock_changes_timeline_idx on public.swag_stock_changes (created_at desc, id desc);
alter table public.swag_stock_changes enable row level security;
revoke all on public.swag_stock_changes from public, anon, authenticated;
grant select on public.swag_stock_changes to authenticated;
create policy swag_stock_changes_admin_read on public.swag_stock_changes
  for select to authenticated using ((select public.is_swag_administrator()));

-- Keep existing recorded history. Current item labels are the only labels available
-- for these older events; no historical changes are inferred from current quantities.
insert into public.swag_stock_changes
  (inventory_id,category,item_name,color,size,previous_quantity,resulting_quantity,
   quantity_change,action,actor_user_id,actor_label,created_at)
select e.inventory_id,i.category,i.name,i.color,i.size,
  e.resulting_quantity-e.quantity_change,e.resulting_quantity,e.quantity_change,
  case when e.event_type='fulfillment' then 'fulfillment' else 'adjusted' end,
  e.actor_user_id,coalesce(u.email,'System'),e.created_at
from public.swag_inventory_events e
join public.swag_inventory i on i.id=e.inventory_id
left join auth.users u on u.id=e.actor_user_id
where e.quantity_change <> 0;

create or replace function private.record_swag_stock_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  item public.swag_inventory%rowtype;
  before_qty integer := 0;
  after_qty integer := 0;
  change_action text := 'adjusted';
  actor uuid := auth.uid();
  actor_name text;
begin
  -- Only callable as a trigger. The inventory's existing write permissions still
  -- govern the originating operation; system maintenance has no user JWT.
  if actor is not null and not public.is_swag_administrator() then
    raise exception using errcode='42501', message='BFZ administrator access is required.';
  end if;
  if tg_op = 'DELETE' then
    item := old;
    before_qty := case when old.archived_at is null then old.quantity else 0 end;
    change_action := 'removed';
  elsif tg_op = 'INSERT' then
    item := new;
    after_qty := case when new.archived_at is null then new.quantity else 0 end;
    change_action := 'created';
  else
    item := new;
    before_qty := case when old.archived_at is null then old.quantity else 0 end;
    after_qty := case when new.archived_at is null then new.quantity else 0 end;
    if old.archived_at is null and new.archived_at is not null then
      change_action := 'removed';
    elsif old.archived_at is not null and new.archived_at is null then
      change_action := 'restored';
    end if;
    if before_qty = after_qty and change_action = 'adjusted' then return null; end if;
  end if;
  -- Deleting an already archived row does not remove stock a second time.
  if tg_op = 'DELETE' and old.archived_at is not null then return null; end if;
  select email into actor_name from auth.users where id=actor;
  insert into public.swag_stock_changes
    (inventory_id,category,item_name,color,size,previous_quantity,resulting_quantity,
     quantity_change,action,actor_user_id,actor_label)
  values (item.id,item.category,item.name,item.color,item.size,before_qty,after_qty,
    after_qty-before_qty,change_action,actor,coalesce(actor_name,'System'));
  return null;
end;
$$;
revoke all on function private.record_swag_stock_change() from public, anon, authenticated, service_role;
create trigger swag_stock_change_audit
after insert or update or delete on public.swag_inventory
for each row execute function private.record_swag_stock_change();

comment on table public.swag_stock_changes is
  'Immutable stock snapshots for the administrator timeline. Read-only to clients; captured transactionally by an inventory trigger.';
