-- Fix the post-login "Invitation révoquée" trap for active users.
--
-- Root cause: almost every existing profile has onboarding_completed_at = NULL
-- (the column was added after most accounts were created). Combined with
-- needsSecretaryOnboarding() checking only this column, any secretary-role
-- account — even one that's been active for weeks — got redirected to
-- /bienvenue-secretaire, where mm_get_my_pending_invitation() found an old
-- revoked invitation and displayed the blocking "Invitation révoquée" screen.
--
-- Two fixes here:
--
-- 1. Backfill onboarding_completed_at for every profile that already belongs
--    to a clinic (cabinet_id IS NOT NULL). Uses a SECURITY DEFINER wrapper
--    because the protect_onboarding_completed_at trigger blocks direct writes
--    from non-postgres roles.
--
-- 2. Fix mm_get_my_pending_invitation() to prefer pending invitations over
--    revoked ones, and to return nothing if the caller already belongs to a
--    clinic (so active members are never shown stale invitation states).

-- ---------------------------------------------------------------------------
-- 1. Backfill onboarding_completed_at for all active profiles
-- ---------------------------------------------------------------------------
-- The protect_onboarding_completed_at trigger only allows writes from
-- current_user = 'postgres'. This DO block runs as the migration owner
-- (postgres), so the trigger allows it.

do $$
begin
  update public.profiles
     set onboarding_completed_at = coalesce(updated_at, created_at, now())
   where cabinet_id is not null
     and onboarding_completed_at is null;

  raise notice 'Backfilled onboarding_completed_at for % profiles',
    (select count(*) from public.profiles
      where cabinet_id is not null and onboarding_completed_at is not null);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Fix mm_get_my_pending_invitation() — prefer pending, skip active members
-- ---------------------------------------------------------------------------

create or replace function public.mm_get_my_pending_invitation()
returns table (
  status text,
  email text,
  role text,
  clinic_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_email text;
  v_has_clinic boolean;
  v_row public.invitations%rowtype;
  v_clinic_name text;
  v_effective_status text;
begin
  if auth.uid() is null then
    return;
  end if;

  select lower(trim(u.email)) into v_auth_email
  from auth.users u where u.id = auth.uid();

  if v_auth_email is null then
    return;
  end if;

  -- If the caller already belongs to a clinic, they are an active member.
  -- Don't show them stale invitation states — return nothing so the
  -- welcome page redirects them to the dashboard instead of displaying
  -- a confusing "revoked" or "expired" screen.
  select exists(
    select 1 from public.profiles p
     where p.id = auth.uid()
       and (p.cabinet_id is not null or p.clinic_id is not null)
  ) into v_has_clinic;

  if v_has_clinic then
    return;
  end if;

  -- Prefer pending invitations over revoked/expired/accepted ones.
  -- The old query just did ORDER BY created_at DESC LIMIT 1, which meant
  -- a revoked invitation created AFTER a pending one would shadow it.
  select i.* into v_row
  from public.invitations i
  where lower(i.email) = v_auth_email
  order by
    case i.status
      when 'pending' then 0
      when 'accepted' then 1
      else 2
    end,
    i.created_at desc
  limit 1;

  if v_row is null then
    return;
  end if;

  v_effective_status := v_row.status;
  if v_effective_status = 'pending' and v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    v_effective_status := 'expired';
  end if;

  select c.nom into v_clinic_name
  from public.cabinets c where c.id = v_row.clinic_id;

  return query select
    v_effective_status,
    v_row.email,
    v_row.role,
    coalesce(v_clinic_name, 'votre cabinet'),
    v_row.expires_at;
end;
$$;

grant execute on function public.mm_get_my_pending_invitation() to authenticated;
