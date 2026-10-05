-- Vault credentials remain server-only. No mailbox token enters the web app.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'swag_mail_worker_secret')
where not exists(select 1 from vault.secrets where name = 'swag_mail_worker_secret');

create function swag_private.mail_config()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
  return (select jsonb_object_agg(replace(name, 'swag_mail_', ''), decrypted_secret)
    from vault.decrypted_secrets where name in ('swag_mail_worker_secret', 'swag_mail_tenant_id', 'swag_mail_client_id', 'swag_mail_refresh_token'));
end;
$$;
create function swag_private.rotate_mail_token(p_old text, p_new text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if p_new is null or length(p_new) < 20 then raise exception 'Invalid refresh token'; end if;
  perform pg_advisory_xact_lock(hashtext('swag_mail_refresh_token'));
  select id into secret_id from vault.decrypted_secrets where name = 'swag_mail_refresh_token' and decrypted_secret = p_old;
  if secret_id is null then return false; end if;
  perform vault.update_secret(secret_id, p_new);
  return true;
end;
$$;
create function public.get_swag_mail_config()
returns jsonb language sql set search_path = '' as $$ select swag_private.mail_config(); $$;
create function public.rotate_swag_mail_token(p_old text, p_new text)
returns boolean language sql set search_path = '' as $$ select swag_private.rotate_mail_token(p_old, p_new); $$;
revoke all on function swag_private.mail_config(), swag_private.rotate_mail_token(text,text), public.get_swag_mail_config(), public.rotate_swag_mail_token(text,text) from public, anon, authenticated;
grant usage on schema swag_private to service_role;
grant execute on function swag_private.mail_config(), swag_private.rotate_mail_token(text,text), public.get_swag_mail_config(), public.rotate_swag_mail_token(text,text) to service_role;

-- Inactive until the sender has signed in and the worker is verified.
select cron.schedule('swag-camo-beanies-low-stock-email', '* * * * *', $job$
  select net.http_post(
    url := 'https://muptxzwjzrzqynjlpaer.supabase.co/functions/v1/swag-stock-email',
    headers := jsonb_build_object('Content-Type','application/json','x-swag-worker-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'swag_mail_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  );
$job$);
select cron.alter_job((select jobid from cron.job where jobname = 'swag-camo-beanies-low-stock-email'), active := false);
