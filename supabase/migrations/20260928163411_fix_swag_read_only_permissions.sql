-- RLS SELECTs run in PostgREST read-only transactions. Do not call the
-- provisioning RPC get_my_platform_access() from an inventory read policy.
create or replace function private.swag_access_snapshot()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  account auth.users%rowtype;
  subject private.platform_access_subjects%rowtype;
  matched_employee uuid;
  department_name text;
  administrator_access boolean;
  override_access boolean;
begin
  if (select auth.uid()) is null then return false; end if;
  select * into account from auth.users where id = (select auth.uid());
  if account.id is null or account.raw_app_meta_data->>'provider' is distinct from 'azure'
    or coalesce(account.is_anonymous, false)
    or (account.banned_until is not null and account.banned_until > now())
    or lower(account.email) not like '%@bfzelectric.com' then return false; end if;

  select * into subject from private.platform_access_subjects where user_id = account.id;
  if subject.id is null then
    select * into subject from private.platform_access_subjects
      where login_email = lower(btrim(account.email));
    if subject.user_id is not null and subject.user_id <> account.id then return false; end if;
  end if;

  -- Resolve the same unique, active directory match without persisting the FK.
  select (array_agg(id))[1] into matched_employee from public.employees
    where lower(btrim(work_email)) = lower(btrim(account.email))
      and status = 'Active' and archived_at is null having count(*) = 1;
  select lower(btrim(department)) into department_name from public.employees where id = matched_employee;
  select exists(select 1 from public.platform_user_roles r where r.is_active
    and r.role in ('administrator', 'read_only_administrator')
    and (r.user_id = account.id or (r.user_id is null and r.role = 'read_only_administrator'
      and lower(btrim(r.email)) = lower(btrim(account.email))))) into administrator_access;
  if administrator_access then return true; end if;
  select allowed into override_access from private.platform_app_overrides
    where subject_id = subject.id and app_id = 'swag';
  return coalesce(override_access, not coalesce(subject.field_only, false) and department_name = 'employee relations', false);
end;
$$;
revoke all on function private.swag_access_snapshot() from public, anon, authenticated;

create or replace function public.is_swag_administrator()
returns boolean language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is not null and private.swag_access_snapshot()
    then private.swag_existing_edit_permission() else false end;
$$;
-- Preserve the existing public RPC/policy grants; only its implementation changes.
