-- Hotfix for mm_get_my_pending_invitation(): its RETURNS TABLE declares
-- (status, email, role, clinic_name, expires_at) as implicit output
-- parameters. The function body then referenced bare `email` twice —
-- against auth.users and against public.invitations, both of which have a
-- real `email` column — causing PL/pgSQL to refuse to resolve it:
--   ERROR: 42702: column reference "email" is ambiguous
-- Reproduced live against the real, still-pending test invitation for
-- touryaya195@gmail.com by simulating the authenticated call
-- (set_config('request.jwt.claim.sub', ...)) — confirmed the RPC threw on
-- every call, which the frontend correctly (if confusingly) surfaced as the
-- generic "Lien invalide" terminal state. Exactly the same bug class already
-- fixed once for mm_create_invitation/mm_resend_invitation in
-- 20260902000000_secretary_invitation_hardening.sql (see its own comments)
-- — missed here because this function was written afterward, in a later
-- migration, without carrying the same defensive aliasing forward.
--
-- Fix: alias every table reference and qualify every column. No behavior
-- change otherwise — same authorization boundary (auth.uid()-derived email
-- only), same disclosed fields, same expiry-touch-up side effect.

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

  select i.* into v_row
  from public.invitations i
  where lower(i.email) = v_auth_email
  order by i.created_at desc
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
