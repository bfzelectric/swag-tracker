begin;
do $test$
declare admin_id uuid; item_id uuid; n integer; employee_id uuid; ticket record;
begin
 select u.id into admin_id from auth.users u join public.platform_user_roles r on r.user_id=u.id
 where r.is_active and r.role='administrator' and u.raw_app_meta_data->>'provider'='azure'
 and u.email_confirmed_at is not null and lower(btrim(u.email))<>'foreman@bfzelectric.com' limit 1;
 if admin_id is null then raise exception 'An administrator is required for the test'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 if not public.is_swag_administrator() then raise exception 'Admin authorization failed'; end if;
 item_id := public.upsert_swag_inventory_item('Test audit', 'Timeline transaction test', 'L',30,'Black');
 for n in 1..15 loop perform public.adjust_swag_inventory(item_id,30-n,'Timeline test'); end loop;
 if (select count(*) from public.swag_stock_changes where inventory_id=item_id)<>16 then raise exception 'Expected creation + 15 adjustments'; end if;
 if (select sum(quantity_change) from public.swag_stock_changes where inventory_id=item_id and action='adjusted')<>-15 then raise exception 'Incorrect removal total'; end if;
 perform public.adjust_swag_inventory(item_id,15,'No-op');
 update public.swag_inventory set minimum_quantity=4,orderable=false where id=item_id;
 if (select count(*) from public.swag_stock_changes where inventory_id=item_id)<>16 then raise exception 'No-op/settings added stock events'; end if;
 perform public.import_swag_inventory(jsonb_build_array(jsonb_build_object('category','Test audit','name','Timeline transaction test','color','Black','size','L','qty',20,'min',4,'orderable',true)));
 if not exists (select 1 from public.swag_stock_changes where inventory_id=item_id and previous_quantity=15 and resulting_quantity=20 and quantity_change=5) then raise exception 'Import missing'; end if;
 select id into employee_id from public.employees where archived_at is null and lower(btrim(status))='active' limit 1;
 select * into ticket from public.admin_create_swag_request(employee_id,jsonb_build_array(jsonb_build_object('inventory_id',item_id,'quantity',2)),'Transaction-only stock history test');
 perform public.fulfill_swag_request(ticket.request_id);
 if (select count(*) from public.swag_stock_changes where inventory_id=item_id)<>18 then raise exception 'Fulfillment missing or duplicated'; end if;
 perform public.remove_swag_inventory_item(item_id);
 if not exists(select 1 from public.swag_stock_changes where inventory_id=item_id and action='removed' and quantity_change=-18) then raise exception 'Archive missing'; end if;
 perform public.upsert_swag_inventory_item('Test audit','Timeline transaction test','L',1,'Black');
 if not exists(select 1 from public.swag_stock_changes where inventory_id=item_id and action='restored' and quantity_change=19) then raise exception 'Restore missing'; end if;
 if exists(select 1 from public.swag_stock_changes where inventory_id=item_id and (actor_user_id<>admin_id or actor_label='System')) then raise exception 'Actor not captured'; end if;
 -- Physical deletion of an item without legacy request/event references preserves the snapshot.
 item_id := public.upsert_swag_inventory_item('Test audit','Delete audit test','',3,'');
 perform public.remove_swag_inventory_item(item_id);
 if exists(select 1 from public.swag_inventory where id=item_id) then raise exception 'Expected deletion'; end if;
 if (select count(*) from public.swag_stock_changes where inventory_id=item_id)<>2 then raise exception 'Deletion erased history'; end if;
end;
$test$;
set local role authenticated;
do $test$
begin
 if not exists(select 1 from public.swag_stock_changes) then raise exception 'Admin cannot read history'; end if;
 if has_table_privilege('authenticated','public.swag_stock_changes','INSERT,UPDATE,DELETE') then raise exception 'Ledger is writable by client'; end if;
 if has_table_privilege('anon','public.swag_stock_changes','SELECT') then raise exception 'Anonymous history exposure'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 if exists(select 1 from public.swag_stock_changes) then raise exception 'Missing identity exposed history'; end if;
end;
$test$;
rollback;
