-- Pilot rule: only Camo Beanies; send once per low-stock episode.
create schema if not exists swag_private;
revoke all on schema swag_private from public, anon, authenticated;

create table public.swag_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid references public.swag_inventory(id) on delete set null,
  item_name text not null,
  quantity integer not null,
  minimum_quantity integer not null,
  sender text not null default 'theog@bfzelectric.com' check (sender = 'theog@bfzelectric.com'),
  recipient text not null default 'artiem@bfzelectric.com' check (recipient = 'artiem@bfzelectric.com'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'unknown', 'cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  resolved_at timestamptz
);
alter table public.swag_stock_alerts enable row level security;
revoke all on public.swag_stock_alerts from public, anon, authenticated;
grant select, insert, update, delete on public.swag_stock_alerts to service_role;
create unique index swag_stock_alerts_open_item_idx on public.swag_stock_alerts(inventory_id) where resolved_at is null;
create index swag_stock_alerts_pending_idx on public.swag_stock_alerts(available_at, created_at) where status = 'pending';
create index swag_stock_alerts_inventory_idx on public.swag_stock_alerts(inventory_id);

create function swag_private.capture_low_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- This private trigger runs only after an authorized inventory write. Email
  -- transport is deliberately outside the inventory transaction.
  if new.name = 'Camo Beanies' and new.archived_at is null and new.quantity <= new.minimum_quantity then
    insert into public.swag_stock_alerts(inventory_id, item_name, quantity, minimum_quantity)
      values(new.id, new.name, new.quantity, new.minimum_quantity)
      on conflict (inventory_id) where resolved_at is null do nothing;
  else
    update public.swag_stock_alerts
      set resolved_at = now(), status = case when status = 'pending' then 'cancelled' else status end
      where inventory_id = new.id and resolved_at is null;
  end if;
  return new;
end;
$$;
revoke all on function swag_private.capture_low_stock() from public, anon, authenticated;
create trigger swag_inventory_low_stock_email
  after insert or update of quantity, minimum_quantity, name, archived_at on public.swag_inventory
  for each row execute function swag_private.capture_low_stock();

-- Service-role-only RPCs are the worker's narrow database interface.
create function public.claim_swag_stock_alert()
returns setof public.swag_stock_alerts language plpgsql set search_path = '' as $$
declare selected_id uuid;
begin
  -- A lost worker may already have submitted the email. Do not blindly resend.
  update public.swag_stock_alerts set status = 'unknown', last_error = 'Worker lease expired; inspect sender Sent Items before retrying.'
    where status = 'processing' and lease_expires_at < now();
  update public.swag_stock_alerts a set status = 'cancelled', resolved_at = coalesce(a.resolved_at, now())
    where a.status = 'pending' and (a.resolved_at is not null or not exists (
      select 1 from public.swag_inventory i where i.id = a.inventory_id and i.name = 'Camo Beanies'
        and i.archived_at is null and i.quantity <= i.minimum_quantity));
  select a.id into selected_id from public.swag_stock_alerts a
    where a.status = 'pending' and a.available_at <= now() and a.resolved_at is null
    order by a.created_at for update skip locked limit 1;
  if selected_id is null then return; end if;
  return query update public.swag_stock_alerts a
    set status = 'processing', attempts = a.attempts + 1, lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '5 minutes', quantity = i.quantity, minimum_quantity = i.minimum_quantity
    from public.swag_inventory i where a.id = selected_id and i.id = a.inventory_id returning a.*;
end;
$$;

create function public.finish_swag_stock_alert(p_id uuid, p_lease_token uuid, p_result text, p_error text default null)
returns boolean language plpgsql set search_path = '' as $$
declare changed integer;
begin
  if p_result not in ('sent','retry','failed','unknown') then raise exception 'Invalid result'; end if;
  update public.swag_stock_alerts set
    status = case when p_result = 'retry' and resolved_at is not null then 'cancelled'
      when p_result = 'retry' and attempts < 5 then 'pending'
      when p_result = 'retry' then 'failed' else p_result end,
    sent_at = case when p_result = 'sent' then now() else sent_at end,
    available_at = now() + interval '5 minutes' * greatest(attempts, 1),
    lease_expires_at = null, last_error = left(p_error, 500)
    where id = p_id and lease_token = p_lease_token and status = 'processing';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.claim_swag_stock_alert() from public, anon, authenticated;
revoke all on function public.finish_swag_stock_alert(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_swag_stock_alert() to service_role;
grant execute on function public.finish_swag_stock_alert(uuid,uuid,text,text) to service_role;

-- No stock edits are needed to initialize the rule for an already-low item.
insert into public.swag_stock_alerts(inventory_id,item_name,quantity,minimum_quantity)
select id,name,quantity,minimum_quantity from public.swag_inventory
where name = 'Camo Beanies' and archived_at is null and quantity <= minimum_quantity;
