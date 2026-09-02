-- Complete the legacy Swag Tracker workflows while keeping all writes behind
-- administrator-checked RPCs.

alter table public.swag_inventory
  add column archived_at timestamptz;

alter table public.swag_requests
  add column adjusted_at timestamptz,
  add column adjustment_note text not null default '' check (length(adjustment_note) <= 1000),
  add column original_items jsonb,
  add column deleted_from_status text check (deleted_from_status in ('open', 'fulfilled'));

alter table public.swag_request_items
  alter column inventory_id drop not null,
  add column fulfilled_quantity integer check (fulfilled_quantity between 0 and 100);

create index swag_inventory_active_category_idx
on public.swag_inventory (category, name, size)
where archived_at is null;

create index swag_requests_cancelled_created_idx
on public.swag_requests (cancelled_at desc)
where status = 'cancelled';

create or replace function public.get_swag_catalog()
returns table (id uuid, category text, name text, color text, size text)
language sql
stable
security definer
set search_path = ''
as $$
  select inventory.id, inventory.category, inventory.name, inventory.color, inventory.size
  from public.swag_inventory as inventory
  where inventory.orderable
    and inventory.quantity > 0
    and inventory.archived_at is null
  order by inventory.category, inventory.name, inventory.size;
$$;

create or replace function public.create_swag_request(
  p_employee_id uuid,
  p_items jsonb,
  p_notes text default ''
)
returns table (request_id uuid, request_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare selected_employee public.employees%rowtype;
declare new_request public.swag_requests%rowtype;
declare supplied_count integer;
declare inserted_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception using errcode = '22023', message = 'Request items must be an array.'; end if;
  supplied_count := jsonb_array_length(p_items);
  if supplied_count < 1 or supplied_count > 50 then raise exception using errcode = '22023', message = 'Choose between 1 and 50 request items.'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'Notes must be 2,000 characters or fewer.'; end if;
  select * into selected_employee from public.employees
  where id = p_employee_id and archived_at is null and lower(btrim(status)) = 'active';
  if not found then raise exception using errcode = '22023', message = 'Choose an active BFZ employee.'; end if;
  if supplied_count <> (
    select count(distinct item.inventory_id)
    from jsonb_to_recordset(p_items) as item(inventory_id uuid, quantity integer)
  ) then raise exception using errcode = '22023', message = 'Request items contain duplicates or invalid identifiers.'; end if;
  insert into public.swag_requests (employee_id, requested_for_name, notes)
  values (selected_employee.id, selected_employee.employee_name, btrim(coalesce(p_notes, '')))
  returning * into new_request;
  insert into public.swag_request_items
    (request_id, inventory_id, category, item_name, color, size, quantity)
  select new_request.id, inventory.id, inventory.category, inventory.name,
    inventory.color, inventory.size, item.quantity
  from jsonb_to_recordset(p_items) as item(inventory_id uuid, quantity integer)
  join public.swag_inventory as inventory on inventory.id = item.inventory_id
  where item.quantity between 1 and 100 and inventory.orderable
    and inventory.quantity > 0 and inventory.archived_at is null;
  get diagnostics inserted_count = row_count;
  if inserted_count <> supplied_count then raise exception using errcode = '22023', message = 'One or more requested items are unavailable.'; end if;
  return query select new_request.id, new_request.request_number;
end;
$$;

create or replace function public.upsert_swag_inventory_item(
  p_category text,
  p_name text,
  p_size text default '',
  p_quantity integer default 1,
  p_color text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare item_id uuid;
begin
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_category, '')) = ''
     or p_quantity < 0 or p_quantity > 100000 then
    raise exception using errcode = '22023', message = 'Enter a category, item name, and valid quantity.';
  end if;

  insert into public.swag_inventory (category, name, color, size, quantity, minimum_quantity, orderable)
  values (btrim(p_category), btrim(p_name), btrim(coalesce(p_color, '')),
    btrim(coalesce(p_size, '')), p_quantity, 0, true)
  on conflict (category, name, size) do update set
    quantity = public.swag_inventory.quantity + excluded.quantity,
    color = case when excluded.color = '' then public.swag_inventory.color else excluded.color end,
    archived_at = null
  returning id into item_id;
  return item_id;
end;
$$;

create or replace function public.remove_swag_inventory_item(p_inventory_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare has_history boolean;
begin
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;
  select exists (
    select 1 from public.swag_request_items where inventory_id = p_inventory_id
    union all
    select 1 from public.swag_inventory_events where inventory_id = p_inventory_id
  ) into has_history;
  if not exists (select 1 from public.swag_inventory where id = p_inventory_id) then
    raise exception using errcode = 'P0002', message = 'Inventory item was not found.';
  end if;
  if has_history then
    update public.swag_inventory
    set archived_at = now(), orderable = false
    where id = p_inventory_id;
  else
    delete from public.swag_inventory where id = p_inventory_id;
  end if;
  return true;
end;
$$;

create or replace function public.admin_create_swag_request(
  p_employee_id uuid,
  p_items jsonb,
  p_notes text default ''
)
returns table (request_id uuid, request_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare selected_employee public.employees%rowtype;
declare new_request public.swag_requests%rowtype;
declare supplied_count integer;
declare inserted_count integer;
begin
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'Request items must be an array.';
  end if;
  supplied_count := jsonb_array_length(p_items);
  if supplied_count < 1 or supplied_count > 50 or length(coalesce(p_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Add between 1 and 50 items and keep notes under 2,000 characters.';
  end if;
  select * into selected_employee from public.employees
  where id = p_employee_id and archived_at is null and lower(btrim(status)) = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'Choose an active BFZ employee.';
  end if;

  insert into public.swag_requests (employee_id, requested_for_name, notes)
  values (selected_employee.id, selected_employee.employee_name, btrim(coalesce(p_notes, '')))
  returning * into new_request;

  insert into public.swag_request_items
    (request_id, inventory_id, category, item_name, color, size, quantity)
  select new_request.id, inventory.id,
    case when inventory.id is null then btrim(coalesce(item.category, 'Custom')) else inventory.category end,
    case when inventory.id is null then btrim(coalesce(item.name, '')) else inventory.name end,
    case when inventory.id is null then btrim(coalesce(item.color, '')) else inventory.color end,
    case when inventory.id is null then btrim(coalesce(item.size, '')) else inventory.size end,
    item.quantity
  from jsonb_to_recordset(p_items) as item(inventory_id uuid, category text, name text, color text, size text, quantity integer)
  left join public.swag_inventory as inventory
    on inventory.id = item.inventory_id and inventory.archived_at is null
  where item.quantity between 1 and 100
    and ((item.inventory_id is not null and inventory.id is not null)
      or (item.inventory_id is null and btrim(coalesce(item.name, '')) <> ''));
  get diagnostics inserted_count = row_count;
  if inserted_count <> supplied_count then
    raise exception using errcode = '22023', message = 'One or more order items are invalid.';
  end if;
  return query select new_request.id, new_request.request_number;
end;
$$;

create or replace function public.adjust_swag_request(
  p_request_id uuid,
  p_employee_id uuid,
  p_items jsonb,
  p_notes text default '',
  p_adjustment_note text default ''
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare selected_employee public.employees%rowtype;
declare current_request public.swag_requests%rowtype;
declare supplied_count integer;
declare inserted_count integer;
declare original_snapshot jsonb;
begin
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;
  select * into current_request from public.swag_requests
  where id = p_request_id and status = 'open' for update;
  if not found then
    raise exception using errcode = '55000', message = 'Only open tickets can be adjusted.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'Request items must be an array.';
  end if;
  supplied_count := jsonb_array_length(p_items);
  if supplied_count < 1 or supplied_count > 50 or length(coalesce(p_notes, '')) > 2000
     or length(coalesce(p_adjustment_note, '')) > 1000 then
    raise exception using errcode = '22023', message = 'The adjusted request values are invalid.';
  end if;
  select * into selected_employee from public.employees
  where id = p_employee_id and archived_at is null and lower(btrim(status)) = 'active';
  if not found then raise exception using errcode = '22023', message = 'Choose an active BFZ employee.'; end if;

  if current_request.original_items is null then
    select jsonb_agg(jsonb_build_object(
      'inventory_id', item.inventory_id, 'category', item.category, 'name', item.item_name,
      'color', item.color, 'size', item.size, 'quantity', item.quantity
    ) order by item.id) into original_snapshot
    from public.swag_request_items as item where item.request_id = p_request_id;
  else
    original_snapshot := current_request.original_items;
  end if;

  delete from public.swag_request_items where request_id = p_request_id;
  insert into public.swag_request_items
    (request_id, inventory_id, category, item_name, color, size, quantity)
  select p_request_id, inventory.id,
    case when inventory.id is null then btrim(coalesce(item.category, 'Custom')) else inventory.category end,
    case when inventory.id is null then btrim(coalesce(item.name, '')) else inventory.name end,
    case when inventory.id is null then btrim(coalesce(item.color, '')) else inventory.color end,
    case when inventory.id is null then btrim(coalesce(item.size, '')) else inventory.size end,
    item.quantity
  from jsonb_to_recordset(p_items) as item(inventory_id uuid, category text, name text, color text, size text, quantity integer)
  left join public.swag_inventory as inventory
    on inventory.id = item.inventory_id and inventory.archived_at is null
  where item.quantity between 1 and 100
    and ((item.inventory_id is not null and inventory.id is not null)
      or (item.inventory_id is null and btrim(coalesce(item.name, '')) <> ''));
  get diagnostics inserted_count = row_count;
  if inserted_count <> supplied_count then
    raise exception using errcode = '22023', message = 'One or more adjusted items are invalid.';
  end if;

  update public.swag_requests set
    employee_id = selected_employee.id,
    requested_for_name = selected_employee.employee_name,
    notes = btrim(coalesce(p_notes, '')),
    adjusted_at = now(),
    adjustment_note = btrim(coalesce(p_adjustment_note, '')),
    original_items = original_snapshot
  where id = p_request_id;
  return current_request.request_number;
end;
$$;

drop function public.fulfill_swag_request(uuid);
create function public.fulfill_swag_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare ticket_number bigint;
declare line record;
declare take_quantity integer;
declare next_quantity integer;
declare current_stock integer;
declare shortages jsonb := '[]'::jsonb;
begin
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;
  select request_number into ticket_number from public.swag_requests
  where id = p_request_id and status = 'open' for update;
  if not found then raise exception using errcode = '55000', message = 'This request is no longer open.'; end if;

  for line in
    select item.id as line_id, item.inventory_id, item.item_name, item.size,
      item.quantity as requested_quantity, inventory.quantity as stock_quantity
    from public.swag_request_items as item
    left join public.swag_inventory as inventory on inventory.id = item.inventory_id
    where item.request_id = p_request_id
    order by item.inventory_id nulls last
  loop
    if line.inventory_id is null then
      update public.swag_request_items set fulfilled_quantity = 0 where id = line.line_id;
      continue;
    end if;
    select quantity into current_stock
    from public.swag_inventory where id = line.inventory_id for update;
    take_quantity := least(line.requested_quantity, greatest(0, current_stock));
    next_quantity := current_stock - take_quantity;
    update public.swag_inventory set quantity = next_quantity where id = line.inventory_id;
    update public.swag_request_items set fulfilled_quantity = take_quantity where id = line.line_id;
    if take_quantity > 0 then
      insert into public.swag_inventory_events
        (inventory_id, request_id, event_type, quantity_change, resulting_quantity, actor_user_id)
      values (line.inventory_id, p_request_id, 'fulfillment', -take_quantity,
        next_quantity, (select auth.uid()));
    end if;
    if take_quantity < line.requested_quantity then
      shortages := shortages || jsonb_build_array(jsonb_build_object(
        'name', line.item_name, 'size', line.size,
        'requested', line.requested_quantity, 'deducted', take_quantity
      ));
    end if;
  end loop;
  update public.swag_requests set status = 'fulfilled', fulfilled_at = now(),
    fulfilled_by_user_id = (select auth.uid()), cancelled_at = null,
    cancelled_by_user_id = null, deleted_from_status = null
  where id = p_request_id;
  return jsonb_build_object('request_number', ticket_number, 'shortages', shortages);
end;
$$;

create or replace function public.reopen_swag_request(p_request_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare ticket_number bigint;
begin
  if not (select public.is_swag_administrator()) then raise exception using errcode = '42501', message = 'BFZ administrator access is required.'; end if;
  update public.swag_requests set status = 'open', fulfilled_at = null, fulfilled_by_user_id = null
  where id = p_request_id and status = 'fulfilled'
  returning request_number into ticket_number;
  if not found then raise exception using errcode = '55000', message = 'Only fulfilled tickets can be reopened.'; end if;
  update public.swag_request_items set fulfilled_quantity = null where request_id = p_request_id;
  return ticket_number;
end;
$$;

create or replace function public.delete_swag_request(p_request_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare ticket_number bigint;
begin
  if not (select public.is_swag_administrator()) then raise exception using errcode = '42501', message = 'BFZ administrator access is required.'; end if;
  update public.swag_requests set deleted_from_status = status, status = 'cancelled',
    cancelled_at = now(), cancelled_by_user_id = (select auth.uid())
  where id = p_request_id and status in ('open', 'fulfilled')
  returning request_number into ticket_number;
  if not found then raise exception using errcode = '55000', message = 'This ticket is already deleted.'; end if;
  return ticket_number;
end;
$$;

create or replace function public.restore_swag_request(p_request_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare ticket_number bigint;
begin
  if not (select public.is_swag_administrator()) then raise exception using errcode = '42501', message = 'BFZ administrator access is required.'; end if;
  update public.swag_requests set status = coalesce(deleted_from_status, 'open'),
    cancelled_at = null, cancelled_by_user_id = null, deleted_from_status = null
  where id = p_request_id and status = 'cancelled'
  returning request_number into ticket_number;
  if not found then raise exception using errcode = '55000', message = 'Only deleted tickets can be restored.'; end if;
  return ticket_number;
end;
$$;

create or replace function public.purge_swag_request(p_request_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare ticket_number bigint;
begin
  if not (select public.is_swag_administrator()) then raise exception using errcode = '42501', message = 'BFZ administrator access is required.'; end if;
  select request_number into ticket_number from public.swag_requests where id = p_request_id and status = 'cancelled' for update;
  if not found then raise exception using errcode = '55000', message = 'Move the ticket to Deleted before permanently removing it.'; end if;
  update public.swag_inventory_events set request_id = null where request_id = p_request_id;
  delete from public.swag_requests where id = p_request_id;
  return ticket_number;
end;
$$;

create or replace function public.import_swag_inventory(
  p_items jsonb,
  p_exported_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare supplied_count integer;
begin
  if not (select public.is_swag_administrator()) then raise exception using errcode = '42501', message = 'BFZ administrator access is required.'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception using errcode = '22023', message = 'Inventory items must be an array.'; end if;
  supplied_count := jsonb_array_length(p_items);
  if supplied_count < 1 or supplied_count > 5000 then raise exception using errcode = '22023', message = 'Inventory imports must contain between 1 and 5,000 records.'; end if;
  if supplied_count <> (
    select count(distinct (btrim(source.category), btrim(source.name), coalesce(btrim(source.size), '')))
    from jsonb_to_recordset(p_items) as source(category text, name text, color text, size text, qty integer, min integer, orderable boolean)
    where btrim(coalesce(source.category, '')) <> '' and btrim(coalesce(source.name, '')) <> ''
      and source.qty >= 0 and source.min >= 0 and source.orderable is not null
  ) then raise exception using errcode = '22023', message = 'Inventory import contains invalid or duplicate records.'; end if;
  insert into public.swag_inventory (category, name, color, size, quantity, minimum_quantity, orderable)
  select btrim(source.category), btrim(source.name), btrim(coalesce(source.color, '')),
    btrim(coalesce(source.size, '')), source.qty, source.min, source.orderable
  from jsonb_to_recordset(p_items) as source(category text, name text, color text, size text, qty integer, min integer, orderable boolean)
  on conflict (category, name, size) do update set color = excluded.color,
    quantity = excluded.quantity, minimum_quantity = excluded.minimum_quantity,
    orderable = excluded.orderable, archived_at = null;
  insert into public.swag_inventory_imports (source_exported_at, record_count, imported_by_user_id)
  values (p_exported_at, supplied_count, (select auth.uid()));
  return supplied_count;
end;
$$;

revoke execute on function public.upsert_swag_inventory_item(text, text, text, integer, text) from public, anon;
grant execute on function public.upsert_swag_inventory_item(text, text, text, integer, text) to authenticated;
revoke execute on function public.remove_swag_inventory_item(uuid) from public, anon;
grant execute on function public.remove_swag_inventory_item(uuid) to authenticated;
revoke execute on function public.admin_create_swag_request(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_create_swag_request(uuid, jsonb, text) to authenticated;
revoke execute on function public.adjust_swag_request(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.adjust_swag_request(uuid, uuid, jsonb, text, text) to authenticated;
revoke execute on function public.fulfill_swag_request(uuid) from public, anon;
grant execute on function public.fulfill_swag_request(uuid) to authenticated;
revoke execute on function public.reopen_swag_request(uuid) from public, anon;
grant execute on function public.reopen_swag_request(uuid) to authenticated;
revoke execute on function public.delete_swag_request(uuid) from public, anon;
grant execute on function public.delete_swag_request(uuid) to authenticated;
revoke execute on function public.restore_swag_request(uuid) from public, anon;
grant execute on function public.restore_swag_request(uuid) to authenticated;
revoke execute on function public.purge_swag_request(uuid) from public, anon;
grant execute on function public.purge_swag_request(uuid) to authenticated;

comment on column public.swag_inventory.archived_at is 'Removes an inventory variant from the active manager without breaking historical request references.';
comment on column public.swag_requests.original_items is 'First pre-adjustment item snapshot retained for legacy parity and auditability.';
comment on function public.reopen_swag_request(uuid) is 'Reopens a fulfilled ticket without returning its previously deducted quantities to inventory.';
