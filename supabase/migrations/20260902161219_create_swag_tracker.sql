-- BFZ Swag Tracker: shared employee directory, public requests, and admin stock management.

create sequence public.swag_request_number_seq start with 1;

create table public.swag_inventory (
  id uuid primary key default gen_random_uuid(),
  category text not null check (btrim(category) <> ''),
  name text not null check (btrim(name) <> ''),
  color text not null default '',
  size text not null default '',
  quantity integer not null default 0 check (quantity >= 0),
  minimum_quantity integer not null default 0 check (minimum_quantity >= 0),
  orderable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, name, size)
);

create table public.swag_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint not null unique default nextval('public.swag_request_number_seq'),
  employee_id uuid not null references public.employees(id) on delete restrict,
  requested_for_name text not null check (btrim(requested_for_name) <> ''),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'open' check (status in ('open', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  fulfilled_by_user_id uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete restrict
);

create table public.swag_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.swag_requests(id) on delete cascade,
  inventory_id uuid not null references public.swag_inventory(id) on delete restrict,
  category text not null,
  item_name text not null,
  color text not null default '',
  size text not null default '',
  quantity integer not null check (quantity between 1 and 100),
  unique (request_id, inventory_id)
);

create table public.swag_inventory_events (
  id bigint generated always as identity primary key,
  inventory_id uuid not null references public.swag_inventory(id) on delete restrict,
  request_id uuid references public.swag_requests(id) on delete restrict,
  event_type text not null check (event_type in ('fulfillment', 'manual_adjustment')),
  quantity_change integer not null check (quantity_change <> 0),
  resulting_quantity integer not null check (resulting_quantity >= 0),
  note text not null default '' check (length(note) <= 1000),
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.swag_inventory_imports (
  id uuid primary key default gen_random_uuid(),
  source_exported_at timestamptz,
  record_count integer not null check (record_count > 0),
  imported_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index swag_inventory_orderable_catalog_idx
on public.swag_inventory (category, name, size)
where orderable and quantity > 0;
create index swag_requests_employee_created_idx on public.swag_requests (employee_id, created_at desc);
create index swag_requests_open_created_idx on public.swag_requests (created_at desc) where status = 'open';
create index swag_request_items_request_idx on public.swag_request_items (request_id);
create index swag_request_items_inventory_idx on public.swag_request_items (inventory_id);
create index swag_inventory_events_inventory_created_idx on public.swag_inventory_events (inventory_id, created_at desc);
create index swag_inventory_events_request_idx on public.swag_inventory_events (request_id) where request_id is not null;
create index swag_inventory_events_actor_idx on public.swag_inventory_events (actor_user_id) where actor_user_id is not null;
create index swag_requests_fulfilled_by_idx on public.swag_requests (fulfilled_by_user_id) where fulfilled_by_user_id is not null;
create index swag_requests_cancelled_by_idx on public.swag_requests (cancelled_by_user_id) where cancelled_by_user_id is not null;
create index swag_inventory_imports_actor_idx on public.swag_inventory_imports (imported_by_user_id) where imported_by_user_id is not null;

create or replace function public.set_swag_inventory_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger swag_inventory_set_updated_at
before update on public.swag_inventory
for each row execute function public.set_swag_inventory_updated_at();

create or replace function public.is_swag_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as account
    where account.id = (select auth.uid())
      and account.email_confirmed_at is not null
      and lower(btrim(account.email)) like '%@bfzelectric.com'
      and lower(btrim(account.email)) <> 'foreman@bfzelectric.com'
      and (
        account.raw_app_meta_data ->> 'provider' = 'azure'
        or account.raw_app_meta_data -> 'providers' ? 'azure'
      )
  );
$$;

create or replace function public.get_swag_employees()
returns table (id uuid, employee_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select employee.id, employee.employee_name
  from public.employees as employee
  where employee.archived_at is null
    and lower(btrim(employee.status)) = 'active'
  order by employee.employee_name, employee.id;
$$;

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
declare
  selected_employee public.employees%rowtype;
  new_request public.swag_requests%rowtype;
  supplied_count integer;
  inserted_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'Request items must be an array.';
  end if;
  supplied_count := jsonb_array_length(p_items);
  if supplied_count < 1 or supplied_count > 50 then
    raise exception using errcode = '22023', message = 'Choose between 1 and 50 request items.';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Notes must be 2,000 characters or fewer.';
  end if;

  select * into selected_employee
  from public.employees
  where id = p_employee_id
    and archived_at is null
    and lower(btrim(status)) = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'Choose an active BFZ employee.';
  end if;

  if supplied_count <> (
    select count(distinct item.inventory_id)
    from jsonb_to_recordset(p_items) as item(inventory_id uuid, quantity integer)
  ) then
    raise exception using errcode = '22023', message = 'Request items contain duplicates or invalid identifiers.';
  end if;

  insert into public.swag_requests (employee_id, requested_for_name, notes)
  values (selected_employee.id, selected_employee.employee_name, btrim(coalesce(p_notes, '')))
  returning * into new_request;

  insert into public.swag_request_items (
    request_id, inventory_id, category, item_name, color, size, quantity
  )
  select
    new_request.id, inventory.id, inventory.category, inventory.name,
    inventory.color, inventory.size, item.quantity
  from jsonb_to_recordset(p_items) as item(inventory_id uuid, quantity integer)
  join public.swag_inventory as inventory on inventory.id = item.inventory_id
  where item.quantity between 1 and 100
    and inventory.orderable
    and inventory.quantity > 0;
  get diagnostics inserted_count = row_count;
  if inserted_count <> supplied_count then
    raise exception using errcode = '22023', message = 'One or more requested items are unavailable.';
  end if;

  return query select new_request.id, new_request.request_number;
end;
$$;

create or replace function public.fulfill_swag_request(p_request_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_number bigint;
  line record;
  next_quantity integer;
begin
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;

  select request_number into ticket_number
  from public.swag_requests
  where id = p_request_id and status = 'open'
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'This request is no longer open.';
  end if;

  for line in
    select item.inventory_id, item.quantity as requested_quantity, inventory.quantity as stock_quantity
    from public.swag_request_items as item
    join public.swag_inventory as inventory on inventory.id = item.inventory_id
    where item.request_id = p_request_id
    order by inventory.id
    for update of inventory
  loop
    if line.stock_quantity < line.requested_quantity then
      raise exception using errcode = '23514', message = 'Not enough inventory is available to fulfill this request.';
    end if;
    next_quantity := line.stock_quantity - line.requested_quantity;
    update public.swag_inventory set quantity = next_quantity where id = line.inventory_id;
    insert into public.swag_inventory_events (
      inventory_id, request_id, event_type, quantity_change, resulting_quantity, actor_user_id
    ) values (
      line.inventory_id, p_request_id, 'fulfillment', -line.requested_quantity,
      next_quantity, (select auth.uid())
    );
  end loop;

  update public.swag_requests
  set status = 'fulfilled', fulfilled_at = now(), fulfilled_by_user_id = (select auth.uid())
  where id = p_request_id;
  return ticket_number;
end;
$$;

create or replace function public.set_swag_availability(
  p_category text,
  p_name text,
  p_orderable boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;
  update public.swag_inventory
  set orderable = p_orderable
  where category = p_category and (p_name is null or name = p_name);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.adjust_swag_inventory(
  p_inventory_id uuid,
  p_quantity integer,
  p_note text default ''
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare previous_quantity integer;
begin
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;
  if p_quantity < 0 or length(coalesce(p_note, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Inventory adjustment values are invalid.';
  end if;
  select quantity into previous_quantity from public.swag_inventory where id = p_inventory_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Inventory item was not found.'; end if;
  if previous_quantity = p_quantity then return p_quantity; end if;
  update public.swag_inventory set quantity = p_quantity where id = p_inventory_id;
  insert into public.swag_inventory_events (
    inventory_id, event_type, quantity_change, resulting_quantity, note, actor_user_id
  ) values (
    p_inventory_id, 'manual_adjustment', p_quantity - previous_quantity,
    p_quantity, btrim(coalesce(p_note, '')), (select auth.uid())
  );
  return p_quantity;
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
  if not (select public.is_swag_administrator()) then
    raise exception using errcode = '42501', message = 'BFZ administrator access is required.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'Inventory items must be an array.';
  end if;
  supplied_count := jsonb_array_length(p_items);
  if supplied_count < 1 or supplied_count > 5000 then
    raise exception using errcode = '22023', message = 'Inventory imports must contain between 1 and 5,000 records.';
  end if;
  if supplied_count <> (
    select count(distinct (btrim(source.category), btrim(source.name), coalesce(btrim(source.size), '')))
    from jsonb_to_recordset(p_items) as source(category text, name text, color text, size text, qty integer, min integer, orderable boolean)
    where btrim(coalesce(source.category, '')) <> '' and btrim(coalesce(source.name, '')) <> ''
      and source.qty >= 0 and source.min >= 0 and source.orderable is not null
  ) then
    raise exception using errcode = '22023', message = 'Inventory import contains invalid or duplicate records.';
  end if;

  insert into public.swag_inventory (category, name, color, size, quantity, minimum_quantity, orderable)
  select btrim(source.category), btrim(source.name), btrim(coalesce(source.color, '')),
    btrim(coalesce(source.size, '')), source.qty, source.min, source.orderable
  from jsonb_to_recordset(p_items) as source(category text, name text, color text, size text, qty integer, min integer, orderable boolean)
  on conflict (category, name, size) do update set
    color = excluded.color,
    quantity = excluded.quantity,
    minimum_quantity = excluded.minimum_quantity,
    orderable = excluded.orderable;

  insert into public.swag_inventory_imports (source_exported_at, record_count, imported_by_user_id)
  values (p_exported_at, supplied_count, (select auth.uid()));
  return supplied_count;
end;
$$;

alter table public.swag_inventory enable row level security;
alter table public.swag_requests enable row level security;
alter table public.swag_request_items enable row level security;
alter table public.swag_inventory_events enable row level security;
alter table public.swag_inventory_imports enable row level security;

create policy "Swag administrators manage inventory" on public.swag_inventory
for all to authenticated using ((select public.is_swag_administrator())) with check ((select public.is_swag_administrator()));
create policy "Swag administrators manage requests" on public.swag_requests
for all to authenticated using ((select public.is_swag_administrator())) with check ((select public.is_swag_administrator()));
create policy "Swag administrators manage request items" on public.swag_request_items
for all to authenticated using ((select public.is_swag_administrator())) with check ((select public.is_swag_administrator()));
create policy "Swag administrators view inventory events" on public.swag_inventory_events
for select to authenticated using ((select public.is_swag_administrator()));
create policy "Swag administrators view inventory imports" on public.swag_inventory_imports
for select to authenticated using ((select public.is_swag_administrator()));

revoke all on table public.swag_inventory, public.swag_requests, public.swag_request_items,
  public.swag_inventory_events, public.swag_inventory_imports from anon, authenticated;
grant select, insert, update, delete on table public.swag_inventory, public.swag_requests, public.swag_request_items to authenticated;
grant select on table public.swag_inventory_events, public.swag_inventory_imports to authenticated;

revoke execute on function public.set_swag_inventory_updated_at() from public, anon, authenticated;
revoke execute on function public.is_swag_administrator() from public, anon;
grant execute on function public.is_swag_administrator() to authenticated;
revoke execute on function public.get_swag_employees() from public;
grant execute on function public.get_swag_employees() to anon, authenticated;
revoke execute on function public.get_swag_catalog() from public;
grant execute on function public.get_swag_catalog() to anon, authenticated;
revoke execute on function public.create_swag_request(uuid, jsonb, text) from public;
grant execute on function public.create_swag_request(uuid, jsonb, text) to anon, authenticated;
revoke execute on function public.fulfill_swag_request(uuid) from public, anon;
grant execute on function public.fulfill_swag_request(uuid) to authenticated;
revoke execute on function public.set_swag_availability(text, text, boolean) from public, anon;
grant execute on function public.set_swag_availability(text, text, boolean) to authenticated;
revoke execute on function public.adjust_swag_inventory(uuid, integer, text) from public, anon;
grant execute on function public.adjust_swag_inventory(uuid, integer, text) to authenticated;
revoke execute on function public.import_swag_inventory(jsonb, timestamptz) from public, anon;
grant execute on function public.import_swag_inventory(jsonb, timestamptz) to authenticated;

comment on table public.swag_inventory is 'BFZ swag stock by category, product, and size.';
comment on table public.swag_requests is 'Employee swag requests submitted without requiring requester sign-in.';
comment on function public.get_swag_employees() is 'Public-safe active employee picker containing identifiers and names only.';
comment on function public.create_swag_request(uuid, jsonb, text) is 'Validated anonymous entry point for submitting a swag request.';

-- Initial snapshot supplied with the legacy application export.
with source as (
  select *
  from jsonb_to_recordset($swag_inventory$[{"category":"Tshirt","name":"Black Tee","color":"Black","size":"XXXXL","qty":6,"min":5,"orderable":true},{"category":"Tshirt","name":"Orange Tee Mesh","color":"Yellow","size":"S","qty":2,"min":15,"orderable":true},{"category":"Tshirt","name":"Orange Tee Mesh","color":"Yellow","size":"M","qty":0,"min":20,"orderable":true},{"category":"Tshirt","name":"Orange Tee Mesh","color":"Yellow","size":"XL","qty":13,"min":20,"orderable":true},{"category":"Tshirt","name":"Orange Tee Mesh","color":"Yellow","size":"XXL","qty":13,"min":15,"orderable":true},{"category":"Tshirt","name":"Orange Tee Mesh","color":"Yellow","size":"XXXXL","qty":4,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Yellow Long Sleeve","color":"Yellow","size":"S","qty":3,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Yellow Long Sleeve","color":"Yellow","size":"M","qty":8,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Yellow Long Sleeve","color":"Yellow","size":"XL","qty":0,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Yellow Long Sleeve","color":"Yellow","size":"XXL","qty":15,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Yellow Long Sleeve","color":"Yellow","size":"XXXXL","qty":5,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Gray Long Sleeve","color":"Gray","size":"S","qty":3,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Gray Long Sleeve","color":"Gray","size":"M","qty":4,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Gray Long Sleeve","color":"Gray","size":"XL","qty":16,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Gray Long Sleeve","color":"Gray","size":"XXL","qty":14,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Gray Long Sleeve","color":"Gray","size":"XXXL","qty":4,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Gray Long Sleeve","color":"Gray","size":"XXXXL","qty":5,"min":5,"orderable":true},{"category":"Tshirt","name":"Gray Tee","color":"Gray","size":"XXXXL","qty":8,"min":5,"orderable":true},{"category":"Tshirt","name":"Yellow Tee Mesh","color":"Yellow","size":"XXXL","qty":13,"min":5,"orderable":true},{"category":"Tshirt","name":"Gray Tee","color":"Gray","size":"XXXL","qty":10,"min":5,"orderable":true},{"category":"Tshirt","name":"Gray Tee","color":"Gray","size":"XXL","qty":40,"min":15,"orderable":true},{"category":"Tshirt","name":"Gray Tee","color":"Gray","size":"XL","qty":70,"min":20,"orderable":true},{"category":"Tshirt","name":"Gray Tee","color":"Gray","size":"M","qty":25,"min":20,"orderable":true},{"category":"Tshirt","name":"Gray Tee","color":"Gray","size":"S","qty":23,"min":15,"orderable":true},{"category":"Tshirt","name":"Black Tee","color":"Black","size":"XXXL","qty":12,"min":5,"orderable":true},{"category":"Tshirt","name":"Black Tee","color":"Black","size":"XXL","qty":38,"min":15,"orderable":true},{"category":"Tshirt","name":"Black Tee","color":"Black","size":"M","qty":13,"min":20,"orderable":true},{"category":"Tshirt","name":"Black Tee","color":"Black","size":"S","qty":25,"min":15,"orderable":true},{"category":"Tshirt","name":"Black Tee","color":"Black","size":"XL","qty":65,"min":20,"orderable":true},{"category":"Tshirt","name":"Yellow Tee Mesh","color":"Yellow","size":"XL","qty":74,"min":20,"orderable":true},{"category":"Tshirt","name":"Yellow Tee Mesh","color":"Yellow","size":"XXL","qty":36,"min":15,"orderable":true},{"category":"Tshirt","name":"Black Tee","color":"Black","size":"L","qty":48,"min":20,"orderable":true},{"category":"Tshirt","name":"Yellow Tee Mesh","color":"Yellow","size":"M","qty":32,"min":20,"orderable":true},{"category":"Tshirt","name":"Gray Tee","color":"Gray","size":"L","qty":58,"min":20,"orderable":true},{"category":"Tshirt","name":"Orange Tee Mesh","color":"Yellow","size":"L","qty":0,"min":20,"orderable":true},{"category":"Tshirt","name":"Yellow Tee Mesh","color":"Yellow","size":"L","qty":65,"min":20,"orderable":true},{"category":"Tshirt","name":"Yellow Tee Mesh","color":"Yellow","size":"S","qty":17,"min":15,"orderable":true},{"category":"Tshirt","name":"Yellow Tee Mesh","color":"Yellow","size":"XXXXL","qty":8,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Gray Long Sleeve","color":"Gray","size":"L","qty":10,"min":5,"orderable":true},{"category":"Long Sleeve Tshirt","name":"Yellow Long Sleeve","color":"Yellow","size":"L","qty":11,"min":5,"orderable":true},{"category":"Hoodie","name":"Black Hoodie","color":"Black","size":"L","qty":3,"min":5,"orderable":false},{"category":"Hoodie","name":"Black Hoodie","color":"Black","size":"M","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Black Hoodie","color":"Black","size":"S","qty":5,"min":5,"orderable":false},{"category":"Hoodie","name":"Black Hoodie","color":"Black","size":"XL","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Black Hoodie","color":"Black","size":"XXL","qty":1,"min":5,"orderable":false},{"category":"Long Sleeve Tshirt","name":"Yellow Long Sleeve","color":"Yellow","size":"XXXL","qty":3,"min":5,"orderable":true},{"category":"Tshirt","name":"Navy Tee","color":"Navy","size":"XL","qty":8,"min":5,"orderable":false},{"category":"Tshirt","name":"Navy Tee","color":"Navy","size":"L","qty":0,"min":5,"orderable":false},{"category":"Tshirt","name":"Navy Tee","color":"Navy","size":"M","qty":0,"min":5,"orderable":false},{"category":"Tshirt","name":"Navy Tee","color":"Navy","size":"S","qty":19,"min":5,"orderable":false},{"category":"Tshirt","name":"Orange Tee Mesh","color":"Yellow","size":"XXXL","qty":2,"min":5,"orderable":true},{"category":"Tshirt","name":"Navy Tee","color":"Navy","size":"XXL","qty":5,"min":5,"orderable":false},{"category":"Safety","name":"High-Vis Vest","color":"","size":"M","qty":15,"min":0,"orderable":true},{"category":"Safety","name":"High-Vis Vest","color":"","size":"XL","qty":15,"min":0,"orderable":true},{"category":"Tshirt","name":"Navy Tee","color":"Navy","size":"XXXXL","qty":11,"min":5,"orderable":false},{"category":"Tshirt","name":"Navy Tee","color":"Navy","size":"XXXL","qty":8,"min":5,"orderable":false},{"category":"Lifestyle","name":"Growler Water jug w/ Flag Logo","color":"Black","size":"","qty":17,"min":5,"orderable":true},{"category":"Hoodie","name":"Black Carhartt Hoodie","color":"Black","size":"XXL","qty":3,"min":5,"orderable":false},{"category":"Hoodie","name":"Gray Hoodie","color":"Gray","size":"M","qty":0,"min":5,"orderable":false},{"category":"Safety","name":"High-Vis Vest","color":"","size":"L","qty":15,"min":0,"orderable":true},{"category":"Safety","name":"High-Vis Vest","color":"","size":"XXL","qty":15,"min":0,"orderable":true},{"category":"Hoodie","name":"Black Carhartt Hoodie","color":"Black","size":"XXXXL","qty":1,"min":5,"orderable":false},{"category":"Beer","name":"Get Lit","color":"Not Applicable","size":"","qty":0,"min":100,"orderable":false},{"category":"Hoodie","name":"Black Carhartt Hoodie","color":"Black","size":"L","qty":3,"min":5,"orderable":false},{"category":"Lifestyle","name":"Black Travel Mugs w/ Flag Logo","color":"Black","size":"","qty":4,"min":10,"orderable":true},{"category":"Hoodie","name":"Black Carhartt Hoodie","color":"Black","size":"M","qty":16,"min":5,"orderable":false},{"category":"Hoodie","name":"Black Carhartt Hoodie","color":"Black","size":"S","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Black Carhartt Hoodie","color":"Black","size":"XXXL","qty":1,"min":5,"orderable":false},{"category":"Long Sleeve Tshirt","name":"Granite Long Sleeve","color":"Navy","size":"L","qty":3,"min":0,"orderable":false},{"category":"Long Sleeve Tshirt","name":"Granite Long Sleeve","color":"Navy","size":"M","qty":0,"min":0,"orderable":false},{"category":"Long Sleeve Tshirt","name":"Granite Long Sleeve","color":"Navy","size":"S","qty":0,"min":0,"orderable":false},{"category":"Long Sleeve Tshirt","name":"Granite Long Sleeve","color":"Navy","size":"XL","qty":16,"min":0,"orderable":false},{"category":"Long Sleeve Tshirt","name":"Granite Long Sleeve","color":"Navy","size":"XXL","qty":33,"min":0,"orderable":false},{"category":"Long Sleeve Tshirt","name":"Granite Long Sleeve","color":"Navy","size":"XXXL","qty":0,"min":0,"orderable":false},{"category":"Long Sleeve Tshirt","name":"Granite Long Sleeve","color":"Navy","size":"XXXXL","qty":0,"min":0,"orderable":false},{"category":"Jacket","name":"Eddie Bauer Navy","color":"Navy","size":"L","qty":5,"min":0,"orderable":false},{"category":"Jacket","name":"Eddie Bauer Navy","color":"Navy","size":"M","qty":0,"min":0,"orderable":false},{"category":"Jacket","name":"Eddie Bauer Navy","color":"Navy","size":"S","qty":1,"min":0,"orderable":false},{"category":"Jacket","name":"Eddie Bauer Navy","color":"Navy","size":"XL","qty":0,"min":0,"orderable":false},{"category":"Jacket","name":"Eddie Bauer Navy","color":"Navy","size":"XS","qty":1,"min":0,"orderable":false},{"category":"Jacket","name":"Eddie Bauer Navy","color":"Navy","size":"XXL","qty":2,"min":0,"orderable":false},{"category":"Jacket","name":"Eddie Bauer Navy","color":"Navy","size":"XXXL","qty":0,"min":0,"orderable":false},{"category":"Hats","name":"Black/Gray Snapbacks","color":"Yellow","size":"","qty":1,"min":10,"orderable":true},{"category":"Hoodie","name":"Gray Hoodie","color":"Gray","size":"L","qty":9,"min":5,"orderable":false},{"category":"Hoodie","name":"Black Carhartt Hoodie","color":"Black","size":"XL","qty":2,"min":5,"orderable":false},{"category":"Hats","name":"Black/Gray Flat Brim","color":"Yellow","size":"","qty":6,"min":10,"orderable":false},{"category":"Hats","name":"Black/White Snapbacks","color":"Yellow","size":"","qty":42,"min":10,"orderable":false},{"category":"Hats","name":"Camo Beanies","color":"Yellow","size":"","qty":19,"min":10,"orderable":false},{"category":"Hats","name":"Gray/Yellow Snapbacks","color":"Yellow","size":"","qty":44,"min":10,"orderable":true},{"category":"Hats","name":"Black/Red Flat Brim","color":"Yellow","size":"","qty":12,"min":10,"orderable":false},{"category":"Hoodie","name":"Black Hoodie","color":"Black","size":"XXXL","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Black Hoodie","color":"Black","size":"XXXXL","qty":3,"min":5,"orderable":false},{"category":"Hoodie","name":"Granite Hoodie","color":"Navy","size":"L","qty":5,"min":5,"orderable":false},{"category":"Hoodie","name":"Granite Hoodie","color":"Navy","size":"M","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Granite Hoodie","color":"Navy","size":"S","qty":1,"min":5,"orderable":false},{"category":"Hoodie","name":"Granite Hoodie","color":"Navy","size":"XL","qty":12,"min":5,"orderable":false},{"category":"Hoodie","name":"Granite Hoodie","color":"Navy","size":"XXL","qty":34,"min":5,"orderable":false},{"category":"Hoodie","name":"Granite Hoodie","color":"Navy","size":"XXXL","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Granite Hoodie","color":"Navy","size":"XXXXL","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Gray Hoodie","color":"Gray","size":"S","qty":10,"min":5,"orderable":false},{"category":"Hoodie","name":"Gray Hoodie","color":"Gray","size":"XL","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Gray Hoodie","color":"Gray","size":"XXL","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Light Pink Hoodie","color":"Pink","size":"L","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Light Pink Hoodie","color":"Pink","size":"M","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Light Pink Hoodie","color":"Pink","size":"S","qty":5,"min":5,"orderable":false},{"category":"Hoodie","name":"Light Pink Hoodie","color":"Pink","size":"XL","qty":8,"min":5,"orderable":false},{"category":"Hoodie","name":"Light Pink Hoodie","color":"Pink","size":"XXL","qty":4,"min":5,"orderable":false},{"category":"Hoodie","name":"Gray Hoodie","color":"Gray","size":"XXXL","qty":3,"min":5,"orderable":false},{"category":"Hoodie","name":"Gray Hoodie","color":"Gray","size":"XXXXL","qty":3,"min":5,"orderable":false},{"category":"Hoodie","name":"Light Pink Hoodie","color":"Pink","size":"XXXL","qty":1,"min":5,"orderable":false},{"category":"Hoodie","name":"Light Pink Hoodie","color":"Pink","size":"XXXXL","qty":2,"min":5,"orderable":false},{"category":"Hoodie","name":"Neon Pink Hoodie","color":"Pink","size":"M","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Neon Pink Hoodie","color":"Pink","size":"S","qty":0,"min":5,"orderable":false},{"category":"Hoodie","name":"Neon Pink Hoodie","color":"Pink","size":"XL","qty":2,"min":5,"orderable":false},{"category":"Hoodie","name":"Neon Pink Hoodie","color":"Pink","size":"XXL","qty":2,"min":5,"orderable":false},{"category":"Hoodie","name":"Neon Pink Hoodie","color":"Pink","size":"XXXL","qty":1,"min":5,"orderable":false},{"category":"Hoodie","name":"Neon Pink Hoodie","color":"Pink","size":"XXXXL","qty":2,"min":5,"orderable":false},{"category":"Hoodie","name":"Orange Hoodie","color":"Orange","size":"L","qty":24,"min":5,"orderable":false},{"category":"Hoodie","name":"Orange Hoodie","color":"Orange","size":"M","qty":5,"min":5,"orderable":false},{"category":"Hoodie","name":"Orange Hoodie","color":"Orange","size":"S","qty":26,"min":5,"orderable":false},{"category":"Hoodie","name":"Orange Hoodie","color":"Orange","size":"XL","qty":25,"min":5,"orderable":false},{"category":"Hoodie","name":"Orange Hoodie","color":"Orange","size":"XXXL","qty":3,"min":5,"orderable":false},{"category":"Hoodie","name":"Orange Hoodie","color":"Orange","size":"XXXXL","qty":3,"min":5,"orderable":false},{"category":"Hoodie","name":"Yellow Hoodie","color":"Yellow","size":"XL","qty":15,"min":5,"orderable":false},{"category":"Hoodie","name":"Yellow Hoodie","color":"Yellow","size":"XXXL","qty":2,"min":5,"orderable":false},{"category":"Hoodie","name":"Yellow Hoodie","color":"Yellow","size":"XXXXL","qty":2,"min":5,"orderable":false},{"category":"Hoodie","name":"Neon Pink Hoodie","color":"Pink","size":"L","qty":4,"min":5,"orderable":false},{"category":"Hoodie","name":"Orange Hoodie","color":"Orange","size":"XXL","qty":2,"min":5,"orderable":false},{"category":"Hoodie","name":"Yellow Hoodie","color":"Yellow","size":"S","qty":7,"min":5,"orderable":false},{"category":"Hoodie","name":"Yellow Hoodie","color":"Yellow","size":"M","qty":10,"min":5,"orderable":false},{"category":"Hoodie","name":"Yellow Hoodie","color":"Yellow","size":"L","qty":12,"min":5,"orderable":false},{"category":"Hoodie","name":"Yellow Hoodie","color":"Yellow","size":"XXL","qty":0,"min":5,"orderable":false}]$swag_inventory$::jsonb)
    as item(category text, name text, color text, size text, qty integer, min integer, orderable boolean)
)
insert into public.swag_inventory (category, name, color, size, quantity, minimum_quantity, orderable)
select btrim(category), btrim(name), btrim(coalesce(color, '')), btrim(coalesce(size, '')), qty, min, orderable
from source
on conflict (category, name, size) do update set
  color = excluded.color,
  quantity = excluded.quantity,
  minimum_quantity = excluded.minimum_quantity,
  orderable = excluded.orderable;

insert into public.swag_inventory_imports (source_exported_at, record_count)
values ('2026-09-02T11:45:50.314Z'::timestamptz, 132);
