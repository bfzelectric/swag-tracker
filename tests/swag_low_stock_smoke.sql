-- Roll back all stock changes and alert records. No email is dispatched here.
begin;
do $test$
declare
  item_id uuid;
  other_id uuid;
  alert public.swag_stock_alerts;
begin
  select id into strict item_id from public.swag_inventory where name = 'Camo Beanies' and archived_at is null;
  select id into other_id from public.swag_inventory where name <> 'Camo Beanies' and archived_at is null limit 1;
  update public.swag_inventory set quantity = 11, minimum_quantity = 10 where id = item_id;
  if exists(select 1 from public.swag_stock_alerts where inventory_id = item_id and resolved_at is null) then
    raise exception 'Above minimum must not have an open alert';
  end if;
  update public.swag_inventory set quantity = 10 where id = item_id;
  if (select count(*) from public.swag_stock_alerts where inventory_id = item_id and resolved_at is null and status = 'pending') <> 1 then
    raise exception 'Equality must queue one alert';
  end if;
  update public.swag_inventory set quantity = 9 where id = item_id;
  update public.swag_inventory set quantity = quantity where id = item_id;
  if (select count(*) from public.swag_stock_alerts where inventory_id = item_id and resolved_at is null) <> 1 then
    raise exception 'Remaining low must not duplicate alerts';
  end if;
  select * into alert from public.claim_swag_stock_alert();
  if alert.inventory_id is distinct from item_id or alert.quantity is distinct from 9 or alert.sender is distinct from 'theog@bfzelectric.com' or alert.recipient is distinct from 'artiem@bfzelectric.com' then
    raise exception 'Wrong alert payload';
  end if;
  if public.finish_swag_stock_alert(alert.id, gen_random_uuid(), 'sent') then raise exception 'Wrong lease accepted'; end if;
  if exists(select 1 from public.claim_swag_stock_alert()) then raise exception 'In-flight alert was claimed twice'; end if;
  if not public.finish_swag_stock_alert(alert.id, alert.lease_token, 'sent') then raise exception 'Could not complete alert'; end if;
  if exists(select 1 from public.claim_swag_stock_alert()) then raise exception 'Sent alert was claimed twice'; end if;
  update public.swag_inventory set quantity = 12 where id = item_id;
  update public.swag_inventory set quantity = 8 where id = item_id;
  if (select count(*) from public.swag_stock_alerts where inventory_id = item_id and resolved_at is null and status = 'pending') <> 1 then
    raise exception 'Restock must rearm alert';
  end if;
  update public.swag_inventory set quantity = 0, minimum_quantity = 10 where id = other_id;
  if exists(select 1 from public.swag_stock_alerts where inventory_id = other_id) then raise exception 'Other item queued'; end if;
  update public.swag_inventory set archived_at = now() where id = item_id;
  if exists(select 1 from public.claim_swag_stock_alert()) then raise exception 'Archived item was claimed'; end if;
  update public.swag_inventory set archived_at = null, quantity = 11, minimum_quantity = 10 where id = item_id;
  update public.swag_inventory set minimum_quantity = 11 where id = item_id;
  if not exists(select 1 from public.swag_stock_alerts where inventory_id = item_id and resolved_at is null and status = 'pending') then
    raise exception 'Minimum increase must trigger alert';
  end if;
  select * into alert from public.claim_swag_stock_alert();
  update public.swag_stock_alerts set lease_expires_at = now() - interval '1 minute' where id = alert.id;
  perform public.claim_swag_stock_alert();
  if (select status from public.swag_stock_alerts where id = alert.id) is distinct from 'unknown' then raise exception 'Expired send must not be retried blindly'; end if;
  update public.swag_inventory set quantity = 12 where id = item_id;
  update public.swag_inventory set quantity = 0 where id = item_id;
  select * into alert from public.claim_swag_stock_alert();
  if alert.quantity is distinct from 0 then raise exception 'Zero stock must alert'; end if;
  perform public.finish_swag_stock_alert(alert.id, alert.lease_token, 'retry', 'Provider temporarily unavailable');
  if (select status from public.swag_stock_alerts where id = alert.id) is distinct from 'pending' then raise exception 'Definite failure must be retryable'; end if;
  if exists(select 1 from public.claim_swag_stock_alert()) then raise exception 'Retry ignored backoff'; end if;
  update public.swag_inventory set quantity = 12 where id = item_id;
  if (select status from public.swag_stock_alerts where id = alert.id) is distinct from 'cancelled' then raise exception 'Restock must cancel pending retry'; end if;
  if has_function_privilege('anon', 'public.claim_swag_stock_alert()', 'execute')
    or has_function_privilege('authenticated', 'public.claim_swag_stock_alert()', 'execute')
    or has_table_privilege('anon', 'public.swag_stock_alerts', 'select')
    or has_table_privilege('authenticated', 'public.swag_stock_alerts', 'insert') then
    raise exception 'Alert queue exposed to browser roles';
  end if;
end;
$test$;
rollback;
