-- Establishes a trustworthy, server-controlled "secretary onboarding is
-- complete" signal, replacing the client-writable user_metadata.onboarding_complete
-- flag and fixing the underlying profile data-persistence bug it was papering
-- over.
--
-- Root cause (traced against live data, not assumed): mm_finalize_invitation_acceptance
-- read the secretary's name from the EXISTING public.profiles row
-- (`select nom_complet into v_full_name from public.profiles where id = auth.uid()`)
-- instead of from auth.users.raw_user_meta_data, which is where
-- SecretaryWelcomePage.tsx's updateUser() call actually puts the real,
-- freshly-typed name moments earlier in the same submission. A pre-existing
-- trigger (handle_new_user, fires on auth.users INSERT at invite time)
-- always creates a profiles stub first, with nom_complet defaulted to the
-- email address (no real name is known yet at invite time) — so
-- `coalesce(v_full_name, split_part(v_auth_email, '@', 1))` never reached
-- its intended fallback, because v_full_name was never actually null. The
-- real name/first_name/last_name/telephone the secretary typed were
-- discarded. Confirmed live and reproduced independently against a second,
-- unrelated test account.

-- ---------------------------------------------------------------------
-- 1. New columns on public.profiles
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists telephone text;

comment on column public.profiles.onboarding_completed_at is
  'Server-set only (see protect_onboarding_completed_at trigger). NULL = onboarding not finished. Non-null = mm_finalize_invitation_acceptance successfully finalized secretary onboarding at this timestamp. Never an authorization signal — only an onboarding-state signal.';

-- ---------------------------------------------------------------------
-- 2. Protect onboarding_completed_at from direct client writes
-- ---------------------------------------------------------------------
-- public.profiles already has broad pre-existing self-service RLS policies
-- (`auth.uid() = id`, no column restriction) that let any authenticated
-- user UPDATE their own row, e.g. to edit their phone number. Without this
-- guard, a client could call
-- supabase.from('profiles').update({ onboarding_completed_at: ... }) and
-- have it succeed under RLS — exactly what must not be possible. RLS alone
-- has no per-column write restriction, so this is enforced with a trigger
-- instead: mm_finalize_invitation_acceptance (and handle_new_user) are
-- SECURITY DEFINER functions owned by `postgres`, so their internal writes
-- run with current_user = 'postgres'; any other role (in particular
-- `authenticated`, which is what a direct client REST/SDK call runs as)
-- attempting to set or change this column has that change silently
-- reverted — other fields in the same statement are unaffected.

create or replace function public.protect_onboarding_completed_at()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'postgres' then
    if TG_OP = 'INSERT' then
      NEW.onboarding_completed_at := null;
    elsif NEW.onboarding_completed_at is distinct from OLD.onboarding_completed_at then
      NEW.onboarding_completed_at := OLD.onboarding_completed_at;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists protect_onboarding_completed_at on public.profiles;
create trigger protect_onboarding_completed_at
  before insert or update on public.profiles
  for each row execute function public.protect_onboarding_completed_at();

-- ---------------------------------------------------------------------
-- 3. Fix mm_finalize_invitation_acceptance
-- ---------------------------------------------------------------------
-- All pre-existing security properties are preserved unchanged: pending/
-- expiry validation, auth.uid()-derived email match against the invitation,
-- the cross-clinic guard, the one-secretary-per-clinic row lock, role
-- hardcoded to 'secretaire', clinic_id sourced only from the locked
-- invitation row, and the audit log call. The only change is *what data*
-- gets written to profiles, and adding onboarding_completed_at = now() to
-- the same transaction (so a failure anywhere above never leaves it set).

create or replace function public.mm_finalize_invitation_acceptance(v_row public.invitations)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
begin
  if v_row.status is distinct from 'pending' then
    raise exception 'invitation is % and cannot be accepted', v_row.status;
  end if;

  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    raise exception 'invitation has expired';
  end if;

  -- Canonical identity input: auth.users.raw_user_meta_data, freshly
  -- written by SecretaryWelcomePage's updateUser() call moments before
  -- this RPC runs — not the (possibly stub) profiles row.
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

  select p.first_name, p.last_name, p.nom_complet, p.telephone
    into v_existing_first, v_existing_last, v_existing_nom, v_existing_telephone
  from public.profiles p where p.id = auth.uid();

  -- Prefer what was actually typed this session; fall back to whatever
  -- was already on the profile (e.g. a re-run), never overwriting good
  -- data with nulls just because this particular field wasn't resent.
  v_final_first := coalesce(v_meta_first, v_existing_first);
  v_final_last := coalesce(v_meta_last, v_existing_last);
  v_final_telephone := coalesce(v_meta_telephone, v_existing_telephone);

  v_final_nom := case
    when v_meta_first is not null and v_meta_last is not null then trim(v_meta_first || ' ' || v_meta_last)
    when v_meta_first is not null then v_meta_first
    when v_meta_last is not null then v_meta_last
    when v_meta_nom is not null then v_meta_nom
    -- Only trust a pre-existing profile name if it isn't itself the
    -- email-derived stub value from an earlier incomplete attempt.
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
$$;

-- ---------------------------------------------------------------------
-- 4. Backfill existing accepted secretaries — conservative, no invented data
-- ---------------------------------------------------------------------
-- Only touches profiles that (a) are role='secretaire', (b) have a
-- matching invitation already accepted, and (c) have not already been
-- backfilled. Only sets onboarding_completed_at when auth.users metadata
-- actually contains a name that is not itself just the email address —
-- otherwise the row is left untouched with onboarding_completed_at NULL,
-- which correctly routes that secretary back through onboarding to supply
-- the missing information, per the explicit instruction not to invent
-- names or mark completion when the data is genuinely missing.

do $$
declare
  r record;
  v_meta_first text;
  v_meta_last text;
  v_meta_nom text;
  v_meta_telephone text;
  v_final_nom text;
begin
  for r in
    select distinct on (p.id)
      p.id, p.email as profile_email, p.nom_complet, p.first_name, p.last_name, p.telephone,
      i.accepted_at
    from public.profiles p
    join public.invitations i on lower(i.email) = lower(p.email) and i.status = 'accepted'
    where p.role = 'secretaire' and p.onboarding_completed_at is null
    order by p.id, i.accepted_at desc
  loop
    select nullif(trim(u.raw_user_meta_data->>'first_name'), ''),
           nullif(trim(u.raw_user_meta_data->>'last_name'), ''),
           nullif(trim(u.raw_user_meta_data->>'nom_complet'), ''),
           nullif(trim(u.raw_user_meta_data->>'telephone'), '')
      into v_meta_first, v_meta_last, v_meta_nom, v_meta_telephone
    from auth.users u where u.id = r.id;

    if (v_meta_first is not null and lower(v_meta_first) is distinct from lower(coalesce(r.profile_email, '')))
       or (v_meta_nom is not null and lower(v_meta_nom) is distinct from lower(coalesce(r.profile_email, ''))) then

      v_final_nom := case
        when v_meta_first is not null and v_meta_last is not null then trim(v_meta_first || ' ' || v_meta_last)
        when v_meta_first is not null then v_meta_first
        when v_meta_last is not null then v_meta_last
        when v_meta_nom is not null then v_meta_nom
        else r.nom_complet
      end;

      update public.profiles
      set first_name = coalesce(v_meta_first, r.first_name),
          last_name = coalesce(v_meta_last, r.last_name),
          nom_complet = coalesce(v_final_nom, r.nom_complet),
          telephone = coalesce(v_meta_telephone, r.telephone),
          onboarding_completed_at = coalesce(r.accepted_at, now())
      where id = r.id;
    end if;
    -- Otherwise: deliberately left untouched — onboarding_completed_at
    -- stays NULL, so the existing gate correctly asks this secretary to
    -- complete her profile.
  end loop;
end $$;
