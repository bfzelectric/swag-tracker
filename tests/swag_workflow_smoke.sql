begin;

do $test$
declare
  admin_id text;
  employee_id uuid;
  inventory_id uuid;
  created record;
  fulfillment jsonb;
begin
  select id::text into admin_id
  from auth.users
  where email_confirmed_at is not null
    and lower(btrim(email)) like '%@bfzelectric.com'
    and lower(btrim(email)) <> 'foreman@bfzelectric.com'
    and (raw_app_meta_data ->> 'provider' = 'azure' or raw_app_meta_data -> 'providers' ? 'azure')
  limit 1;
  if admin_id is null then raise exception 'No Microsoft BFZ administrator exists for the smoke test.'; end if;
  perform set_config('request.jwt.claim.sub', admin_id, true);
  if not public.is_swag_administrator() then raise exception 'Administrator authorization failed.'; end if;

  select id into employee_id from public.employees
  where archived_at is null and lower(btrim(status)) = 'active' limit 1;
  select id into inventory_id from public.swag_inventory
  where archived_at is null and orderable limit 1;

  select * into created from public.admin_create_swag_request(employee_id,
    jsonb_build_array(
      jsonb_build_object('inventory_id', inventory_id, 'quantity', 1),
      jsonb_build_object('inventory_id', null, 'category', 'Custom', 'name', 'Smoke test custom item', 'size', '', 'quantity', 1)
    ), 'Smoke test');
  perform public.adjust_swag_request(created.request_id, employee_id,
    jsonb_build_array(jsonb_build_object('inventory_id', inventory_id, 'quantity', 2)),
    'Adjusted smoke test', 'Changed quantity');
  fulfillment := public.fulfill_swag_request(created.request_id);
  if fulfillment ->> 'request_number' is null then raise exception 'Fulfillment result is missing its ticket number.'; end if;
  perform public.reopen_swag_request(created.request_id);
  perform public.delete_swag_request(created.request_id);
  perform public.restore_swag_request(created.request_id);
  perform public.delete_swag_request(created.request_id);
  perform public.purge_swag_request(created.request_id);
end;
$test$;

rollback;
