-- Reproduce PostgREST GET semantics, including authenticated RLS enforcement.
-- Session settings only: no account, inventory, or alert writes.
begin read only;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', u.id, 'email', u.email, 'role', 'authenticated')::text, true),
  set_config('request.jwt.claim.sub', u.id::text, true)
from auth.users u join public.platform_user_roles r on r.user_id = u.id
where r.is_active and r.role = 'administrator'
  and u.raw_app_meta_data->>'provider' = 'azure'
  and u.email_confirmed_at is not null
  and lower(btrim(u.email)) <> 'foreman@bfzelectric.com'
limit 1;
set local role authenticated;
do $test$
begin
  if not public.is_swag_administrator() then raise exception 'An existing BFZ administrator is required'; end if;
  perform id from public.swag_inventory limit 1;
  perform id from public.swag_requests limit 1;
  perform id from public.swag_request_items limit 1;
  perform id from public.swag_inventory_events limit 1;
  perform id from public.swag_inventory_imports limit 1;
end;
$test$;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $test$
begin
  if public.is_swag_administrator() then raise exception 'Unauthenticated access was granted'; end if;
  if exists(select 1 from public.swag_inventory) then raise exception 'Inventory exposed without authenticated identity'; end if;
end;
$test$;
rollback;
