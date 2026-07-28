-- protect_profile_privileged_fields() blocked role/status changes made via
-- the service-role client too, since auth.uid() is null outside a user
-- session and the trigger only special-cased public.is_admin(). That made
-- it impossible to ever bootstrap the first admin account (chicken-and-egg:
-- promoting someone to admin required already being one). Service-role is
-- inherently trusted elsewhere in this schema (it bypasses RLS entirely) —
-- this makes the trigger consistent with that.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Only admins may change role or status.';
    end if;
  end if;
  return new;
end;
$$;
