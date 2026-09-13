-- Click-to-activate secretary invitation flow: the email CTA now uses
-- Supabase's {{ .ConfirmationURL }} instead of a custom ?token= link, so
-- SecretaryWelcomePage.tsx no longer has a token to validate on load — the
-- only thing it has is an authenticated session (established by GoTrue
-- before the redirect). It still needs a safe, read-only way to show the
-- invitation summary (cabinet/role/status/expiry) for whoever is now
-- authenticated, before she commits to setting a password.
--
-- public.invitations has no RLS policy letting a non-doctor read it at all
-- (confirmed live: the only SELECT policy is
-- "clinic_id = current_clinic_id() AND has_any_role(['doctor'])"), so this
-- must be a SECURITY DEFINER function, exactly like mm_validate_invitation_token
-- was for the token-based path. This is the read-only counterpart to
-- mm_accept_invitation_by_email() — same auth.uid()-derived email lookup,
-- same "most recent invitation for this email" selection, but returns the
-- safe summary fields instead of finalizing acceptance. Deliberately still
-- excludes clinic_id/invited_by, matching mm_validate_invitation_token's
-- existing disclosure boundary.

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

  select lower(trim(email)) into v_auth_email from auth.users where id = auth.uid();
  if v_auth_email is null then
    return;
  end if;

  select * into v_row
  from public.invitations
  where lower(email) = v_auth_email
  order by created_at desc
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
