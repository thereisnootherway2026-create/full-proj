-- Bug: an invited person whose *first-ever* invitation is later revoked (e.g. sent to the wrong
-- clinic, or the doctor re-invites elsewhere) can never accept any later, legitimate invitation.
--
-- handle_new_user() creates the auth.users row's profiles stub at invite time, bound to whichever
-- clinic sent that first invite (cabinet_id from raw_user_meta_data). If she never finished
-- accepting it (onboarding_completed_at stays null) and is later invited to a different clinic,
-- mm_finalize_invitation_acceptance's cross-clinic guard saw that stub's clinic_id, differing from
-- the new invitation's clinic, and raised 'account already belongs to another clinic' — even though
-- she was never actually a member anywhere. SecretaryWelcomePage shows this as its generic fallback
-- ("Impossible de finaliser votre inscription…") since the message text doesn't match either of the
-- two cases it recognizes.
--
-- Reproduced live: hhy716259@gmail.com, invited 2026-09-09 to clinic 02b6620f (now revoked, never
-- completed), invited again 2026-09-22 to clinic 5c2bd5b4 (pending) — accepting the second invite
-- raised the guard.
--
-- Fix: the guard only protects a genuine existing member (onboarding_completed_at is not null,
-- set exclusively by this function on a successful accept) from being silently reassigned. An
-- incomplete stub from an abandoned/revoked invite is not a membership and no longer blocks.

create or replace function public.mm_finalize_invitation_acceptance(v_row invitations)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auth_email text;
  v_meta_first text;
  v_meta_last text;
  v_meta_nom text;
  v_meta_telephone text;
  v_existing_first text;
  v_existing_last text;
  v_existing_nom text;
  v_existing_telephone text;
  v_final_first text;
  v_final_last text;
  v_final_nom text;
  v_final_telephone text;
  v_clinic_secretary uuid;
  v_existing_clinic_id uuid;
  v_existing_onboarded timestamptz;
begin
  if v_row.status is distinct from 'pending' then
    raise exception 'invitation is % and cannot be accepted', v_row.status;
  end if;

  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    raise exception 'invitation has expired';
  end if;

  select lower(trim(u.email)),
         nullif(trim(u.raw_user_meta_data->>'first_name'), ''),
         nullif(trim(u.raw_user_meta_data->>'last_name'), ''),
         nullif(trim(u.raw_user_meta_data->>'nom_complet'), ''),
         nullif(trim(u.raw_user_meta_data->>'telephone'), '')
    into v_auth_email, v_meta_first, v_meta_last, v_meta_nom, v_meta_telephone
  from auth.users u where u.id = auth.uid();

  if v_auth_email is distinct from lower(trim(v_row.email)) then
    raise exception 'authenticated email does not match invitation';
  end if;

  -- Never silently move a genuine existing member from one clinic to another. A profile row that
  -- never finished onboarding (onboarding_completed_at null) is a leftover stub from an earlier,
  -- abandoned invite, not a membership, and does not block this one.
  select p.clinic_id, p.onboarding_completed_at into v_existing_clinic_id, v_existing_onboarded
  from public.profiles p where p.id = auth.uid();
  if v_existing_onboarded is not null and v_existing_clinic_id is distinct from v_row.clinic_id then
    raise exception 'account already belongs to another clinic';
  end if;

  select secretary_id into v_clinic_secretary
  from public.clinics where id = v_row.clinic_id for update;

  if v_clinic_secretary is not null then
    raise exception 'clinic already has an active secretary';
  end if;

  select p.first_name, p.last_name, p.nom_complet, p.telephone
    into v_existing_first, v_existing_last, v_existing_nom, v_existing_telephone
  from public.profiles p where p.id = auth.uid();

  v_final_first := coalesce(v_meta_first, v_existing_first);
  v_final_last := coalesce(v_meta_last, v_existing_last);
  v_final_telephone := coalesce(v_meta_telephone, v_existing_telephone);

  v_final_nom := case
    when v_meta_first is not null and v_meta_last is not null then trim(v_meta_first || ' ' || v_meta_last)
    when v_meta_first is not null then v_meta_first
    when v_meta_last is not null then v_meta_last
    when v_meta_nom is not null then v_meta_nom
    when v_existing_nom is not null and lower(v_existing_nom) is distinct from v_auth_email then v_existing_nom
    else split_part(v_auth_email, '@', 1)
  end;

  insert into public.profiles (
    id, email, cabinet_id, clinic_id, role, nom_complet, first_name, last_name, telephone, onboarding_completed_at
  )
  values (
    auth.uid(), v_auth_email, v_row.clinic_id, v_row.clinic_id, 'secretaire',
    v_final_nom, v_final_first, v_final_last, v_final_telephone, now()
  )
  on conflict (id) do update
    set cabinet_id = excluded.cabinet_id,
        clinic_id = excluded.clinic_id,
        role = 'secretaire',
        email = excluded.email,
        nom_complet = excluded.nom_complet,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        telephone = excluded.telephone,
        onboarding_completed_at = now();

  update public.clinics set secretary_id = auth.uid() where id = v_row.clinic_id;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_row.id;

  perform public.write_audit_log(
    'INVITATION_ACCEPTED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_row.email, 'role', v_row.role), null
  );
end;
$function$;
