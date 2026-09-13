-- Supports re-inviting an email whose Supabase Auth account already exists
-- (e.g. she clicked an earlier ConfirmationURL — which confirms the Auth
-- account immediately, even if she never finished onboarding — and that
-- invitation was later revoked/expired) without deleting or recreating the
-- Auth user. This migration only closes a real, newly-load-bearing gap:
-- nothing here weakens any existing check.
--
-- 1) mm_create_invitation: the existing "already belongs to a member of
--    this clinic" check only looked at the SAME clinic. Add a check for a
--    profile that belongs to a DIFFERENT clinic, so the doctor gets an
--    immediate, controlled rejection instead of creating an invitation
--    that could only ever fail later at acceptance.
--
-- 2) mm_finalize_invitation_acceptance: `insert ... on conflict (id) do
--    update set clinic_id = excluded.clinic_id, ...` would silently
--    reassign ANY existing profile — including one that already belongs to
--    a different clinic — to the new clinic. This was always technically
--    possible but rarely reachable before (inviteUserByEmail simply failed
--    for a confirmed account, so few such acceptances ever got this far);
--    it becomes reachable now that existing accounts can be re-invited, so
--    it must be guarded explicitly rather than left as an implicit gap.

create or replace function public.mm_create_invitation(p_email text, p_role text default 'secretaire')
returns table (id uuid, raw_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_email text;
  v_role text;
  v_raw_token text;
  v_existing_id uuid;
  v_other_clinic_id uuid;
  v_row public.invitations%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'no clinic associated with this account';
  end if;

  v_email := lower(trim(p_email));
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid email';
  end if;

  v_role := public.mm_role_key(p_role);
  if v_role is distinct from 'secretary' then
    raise exception 'role not allowed for invitation';
  end if;
  v_role := 'secretaire';

  if exists (
    select 1 from public.profiles pr
    where pr.clinic_id = v_clinic_id and lower(pr.email) = v_email
  ) then
    raise exception 'email already belongs to a member of this clinic';
  end if;

  select pr.clinic_id into v_other_clinic_id
  from public.profiles pr
  where lower(pr.email) = v_email and pr.clinic_id is not null and pr.clinic_id is distinct from v_clinic_id
  limit 1;

  if v_other_clinic_id is not null then
    raise exception 'email already belongs to another clinic';
  end if;

  select inv.id into v_existing_id
  from public.invitations inv
  where inv.clinic_id = v_clinic_id and lower(inv.email) = v_email and inv.role = v_role and inv.status = 'pending';

  if v_existing_id is not null then
    raise exception 'duplicate pending invitation';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations (
    clinic_id, invited_by, first_name, last_name, email, role, token_hash, status, expires_at
  )
  values (
    v_clinic_id, auth.uid(), '', '', v_email, v_role,
    public.mm_hash_invitation_token(v_raw_token), 'pending', now() + interval '7 days'
  )
  returning * into v_row;

  perform public.write_audit_log(
    'INVITATION_CREATED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_email, 'role', v_role),
    null
  );

  return query select v_row.id, v_raw_token, v_row.expires_at;
end;
$$;

grant execute on function public.mm_create_invitation(text, text) to authenticated;

create or replace function public.mm_finalize_invitation_acceptance(v_row public.invitations)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_email text;
  v_full_name text;
  v_clinic_secretary uuid;
  v_existing_clinic_id uuid;
begin
  if v_row.status is distinct from 'pending' then
    raise exception 'invitation is % and cannot be accepted', v_row.status;
  end if;

  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    raise exception 'invitation has expired';
  end if;

  select lower(trim(email)) into v_auth_email from auth.users where id = auth.uid();
  if v_auth_email is distinct from lower(trim(v_row.email)) then
    raise exception 'authenticated email does not match invitation';
  end if;

  -- Never silently move an existing member from one clinic to another —
  -- the insert below's ON CONFLICT branch would otherwise do exactly that
  -- for any pre-existing profile row.
  select p.clinic_id into v_existing_clinic_id from public.profiles p where p.id = auth.uid();
  if v_existing_clinic_id is not null and v_existing_clinic_id is distinct from v_row.clinic_id then
    raise exception 'account already belongs to another clinic';
  end if;

  select secretary_id into v_clinic_secretary
  from public.clinics where id = v_row.clinic_id for update;

  if v_clinic_secretary is not null then
    raise exception 'clinic already has an active secretary';
  end if;

  select nom_complet into v_full_name from public.profiles where id = auth.uid();

  insert into public.profiles (id, email, cabinet_id, clinic_id, role, nom_complet)
  values (auth.uid(), v_auth_email, v_row.clinic_id, v_row.clinic_id, 'secretaire', coalesce(v_full_name, split_part(v_auth_email, '@', 1)))
  on conflict (id) do update
    set cabinet_id = excluded.cabinet_id,
        clinic_id = excluded.clinic_id,
        role = 'secretaire',
        email = excluded.email;

  update public.clinics set secretary_id = auth.uid() where id = v_row.clinic_id;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_row.id;

  perform public.write_audit_log(
    'INVITATION_ACCEPTED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_row.email, 'role', v_row.role), null
  );
end;
$$;
