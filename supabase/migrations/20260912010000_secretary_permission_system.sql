-- Server-enforced, granular secretary permission system.
--
-- AUDIT SUMMARY (see final report for full detail): the app already has a
-- solid role/tenant primitive layer — mm_assert_role(), mm_assert_same_clinic(),
-- current_role(), current_clinic_id(), is_admin(), mm_role_key(),
-- write_audit_log() — and most "v1" operational RPCs (confirm_appointment,
-- cancel_appointment, reschedule_appointment, create_visit_from_rdv,
-- cancel_visit, process_visit_payment) already call mm_assert_role(['secretary'])
-- or (['secretary','admin']) + mm_assert_same_clinic(). This migration
-- generalizes that from coarse role-gating to granular permission-gating
-- without touching the tenant-isolation half of those checks.
--
-- CRITICAL FINDING, fixed here: four "v2"/legacy RPCs that the app's
-- /dashboard page actually calls today — confirm_appointment_v2,
-- cancel_appointment_v2, record_payment, add_to_waiting_room — have NO
-- role or tenant check at all. Confirmed live by reading their bodies:
-- none call mm_assert_role/mm_assert_role or mm_assert_same_clinic. Any
-- authenticated user, any role, any clinic, can currently call these
-- against any appointment/visit in the entire database. This is a
-- pre-existing, live cross-tenant vulnerability, not something introduced
-- by this migration — it is fixed here because it sits exactly on the
-- actions this task is about (confirm/cancel/mark-paid/add-to-waiting-room).
--
-- Also confirmed live: patient_vitals, patient_problems, patient_medications,
-- patient_lab_results, and clinical_notes currently allow ANY same-clinic
-- authenticated user (including secretaries) full read/write access via
-- permissive ALL-command RLS policies with no role restriction — unlike
-- `consultations`, which already correctly blocks secretaries. This
-- contradicts the explicit clinical-data boundary and is fixed here with
-- restrictive policies, not exposed as a configurable permission (clinical
-- access is a hard boundary, never grantable to a secretary).

-- ---------------------------------------------------------------------
-- 1. Permission catalogue, role defaults, per-user overrides
-- ---------------------------------------------------------------------

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  "group" text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role text not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role, permission_id)
);

-- Per-user overrides on top of the role default. granted=true grants a
-- permission the role wouldn't normally have; granted=false revokes a
-- permission the role would normally have. No row = pure role default.
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, permission_id)
);

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;

-- Catalogue/defaults are not sensitive (keys + descriptions only) — safe to
-- expose broadly so the frontend can render a full permission-management
-- UI without needing a service-role call.
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- user_permissions: a user can read their own row; a doctor/admin can read
-- rows for secretaries in their own clinic. No direct client write at all —
-- every mutation must go through mm_set_user_permission (SECURITY DEFINER),
-- same "_no_direct_write" pattern already used for visits/payments/consultations.
drop policy if exists user_permissions_read on public.user_permissions;
create policy user_permissions_read on public.user_permissions for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = user_permissions.user_id
      and coalesce(p.clinic_id, p.cabinet_id) = public.current_clinic_id()
      and public.current_role() in ('doctor', 'admin')
  )
);

drop policy if exists user_permissions_no_direct_write on public.user_permissions;
create policy user_permissions_no_direct_write on public.user_permissions for all to authenticated using (false) with check (false);

-- ---------------------------------------------------------------------
-- 2. Core permission functions
-- ---------------------------------------------------------------------

create or replace function public.mm_has_permission(p_permission text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_override boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_role := public.current_role();
  if v_role = 'admin' then
    return true;
  end if;

  select up.granted into v_override
  from public.user_permissions up
  join public.permissions p on p.id = up.permission_id
  where up.user_id = auth.uid() and p.key = p_permission;

  if v_override is not null then
    return v_override;
  end if;

  return exists (
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role = v_role and p.key = p_permission
  );
end;
$$;

-- Mirrors mm_assert_role's exact pattern (same audit log event, same
-- exception message) so callers/log consumers see one consistent shape.
create or replace function public.mm_assert_permission(p_permission text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.mm_has_permission(p_permission) then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'security', null, null, null,
      jsonb_build_object('required_permission', p_permission, 'actual_role', public.current_role())
    );
    raise exception 'not authorized';
  end if;
end;
$$;

-- Bulk fetch for the frontend's permission cache (one round trip on load).
create or replace function public.mm_get_my_permissions()
returns table (permission_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return;
  end if;

  v_role := public.current_role();

  if v_role = 'admin' then
    return query select p.key from public.permissions p;
    return;
  end if;

  return query
  select p.key
  from public.permissions p
  where coalesce(
    (select up.granted from public.user_permissions up where up.user_id = auth.uid() and up.permission_id = p.id),
    exists (select 1 from public.role_permissions rp where rp.role = v_role and rp.permission_id = p.id)
  );
end;
$$;

-- Doctor/admin management read: effective permission list for one secretary,
-- tenant-scoped, distinguishing an explicit override from the role default.
create or replace function public.mm_get_user_permissions(p_user_id uuid)
returns table (permission_key text, "group" text, granted boolean, is_override boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_clinic uuid;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);

  select coalesce(pr.clinic_id, pr.cabinet_id) into v_target_clinic
  from public.profiles pr where pr.id = p_user_id;

  if v_target_clinic is distinct from public.current_clinic_id() then
    raise exception 'cross-clinic access denied';
  end if;

  return query
  select p.key,
         p."group",
         coalesce(up.granted, exists (
           select 1 from public.role_permissions rp where rp.role = 'secretary' and rp.permission_id = p.id
         )) as granted,
         (up.id is not null) as is_override
  from public.permissions p
  left join public.user_permissions up on up.permission_id = p.id and up.user_id = p_user_id
  order by p."group", p.key;
end;
$$;

-- Doctor/admin management write: the only way user_permissions rows are
-- ever created/changed. Hard-restricted to doctor/admin regardless of any
-- permission flag — permission management is never itself permission-
-- configurable, which would otherwise allow a self-escalation loophole.
create or replace function public.mm_set_user_permission(p_user_id uuid, p_permission_key text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permission_id uuid;
  v_target_clinic uuid;
  v_target_role text;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);

  if p_user_id = auth.uid() then
    raise exception 'cannot modify your own permissions';
  end if;

  select id into v_permission_id from public.permissions where key = p_permission_key;
  if v_permission_id is null then
    raise exception 'unknown permission';
  end if;

  select coalesce(pr.clinic_id, pr.cabinet_id), public.mm_role_key(pr.role)
    into v_target_clinic, v_target_role
  from public.profiles pr where pr.id = p_user_id;

  if v_target_clinic is distinct from public.current_clinic_id() then
    raise exception 'cross-clinic access denied';
  end if;

  if v_target_role <> 'secretary' then
    raise exception 'permissions can only be configured for secretary accounts';
  end if;

  insert into public.user_permissions (user_id, permission_id, granted)
  values (p_user_id, v_permission_id, p_granted)
  on conflict (user_id, permission_id) do update set granted = excluded.granted, updated_at = now();

  perform public.write_audit_log(
    'SECRETARY_PERMISSION_CHANGED', 'user_permission', p_user_id, null,
    jsonb_build_object('permission', p_permission_key, 'granted', p_granted), null
  );
end;
$$;

grant execute on function public.mm_has_permission(text) to authenticated;
grant execute on function public.mm_assert_permission(text) to authenticated;
grant execute on function public.mm_get_my_permissions() to authenticated;
grant execute on function public.mm_get_user_permissions(uuid) to authenticated;
grant execute on function public.mm_set_user_permission(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Seed the permission catalogue + secretary defaults
-- ---------------------------------------------------------------------
-- Keys follow the existing product's domain naming (appointments/rdv,
-- waiting_room/visits, billing/payments, patients, tasks) rather than
-- inventing new vocabulary. Only keys with a real, discovered enforcement
-- point are wired to an RPC/RLS check below; the rest (billing.refund,
-- settings.*, staff.*) are seeded for a complete, future-proof catalogue
-- but have no behavior change today, since no such capability currently
-- exists to protect.

insert into public.permissions (key, description, "group") values
  ('appointments.view', 'Voir les rendez-vous', 'appointments'),
  ('appointments.create', 'Créer un rendez-vous', 'appointments'),
  ('appointments.update', 'Modifier un rendez-vous', 'appointments'),
  ('appointments.confirm', 'Confirmer un rendez-vous', 'appointments'),
  ('appointments.cancel', 'Annuler un rendez-vous', 'appointments'),
  ('appointments.mark_arrived', 'Marquer un patient comme arrivé', 'appointments'),
  ('waiting_room.view', 'Voir la salle d''attente', 'waiting_room'),
  ('waiting_room.add_patient', 'Ajouter un patient à la salle d''attente', 'waiting_room'),
  ('waiting_room.remove_patient', 'Retirer un patient de la salle d''attente', 'waiting_room'),
  ('waiting_room.call_next', 'Appeler le prochain patient', 'waiting_room'),
  ('waiting_room.change_status', 'Modifier le statut d''un patient en salle', 'waiting_room'),
  ('patients.view', 'Voir les patients', 'patients'),
  ('patients.create', 'Créer un patient', 'patients'),
  ('patients.update', 'Modifier un patient', 'patients'),
  ('dossiers.view', 'Consulter le dossier administratif', 'dossiers'),
  ('dossiers.update', 'Modifier le dossier administratif', 'dossiers'),
  ('billing.view', 'Voir la facturation', 'billing'),
  ('billing.collect', 'Encaisser un paiement', 'billing'),
  ('billing.mark_paid', 'Marquer une consultation comme payée', 'billing'),
  ('billing.refund', 'Rembourser un paiement', 'billing'),
  ('tasks.view', 'Voir les tâches', 'tasks'),
  ('tasks.create', 'Créer une tâche', 'tasks'),
  ('tasks.update', 'Modifier une tâche', 'tasks'),
  ('tasks.complete', 'Terminer une tâche', 'tasks'),
  ('staff.view', 'Voir le personnel', 'staff'),
  ('staff.manage', 'Gérer le personnel', 'staff'),
  ('settings.view', 'Voir les paramètres du cabinet', 'settings'),
  ('settings.manage', 'Gérer les paramètres du cabinet', 'settings')
on conflict (key) do nothing;

-- Secure default secretary permission set — matches the explicit product
-- baseline. Deliberately excludes anything clinical (dossiers.update,
-- staff.*, settings.*, billing.refund) — see clinical boundary note above.
insert into public.role_permissions (role, permission_id)
select 'secretary', p.id from public.permissions p
where p.key in (
  'appointments.view', 'appointments.create', 'appointments.update',
  'appointments.confirm', 'appointments.cancel', 'appointments.mark_arrived',
  'waiting_room.view', 'waiting_room.add_patient', 'waiting_room.remove_patient',
  'waiting_room.call_next', 'waiting_room.change_status',
  'patients.view', 'patients.create', 'patients.update',
  'dossiers.view',
  'billing.view', 'billing.collect', 'billing.mark_paid',
  'tasks.view', 'tasks.create', 'tasks.update', 'tasks.complete'
)
on conflict do nothing;

-- Reasonable doctor defaults (view-oriented + tasks + waiting-room call).
-- Doctors are not newly *restricted* by anything in this migration — this
-- only matters for the one place a doctor's access is now permission-
-- checked instead of role-checked (call_patient, see below), where
-- current_role() = 'doctor' already short-circuits the check anyway, so
-- these rows are for forward-compatibility/consistency rather than a
-- behavior change today.
insert into public.role_permissions (role, permission_id)
select 'doctor', p.id from public.permissions p
where p.key in (
  'appointments.view', 'waiting_room.view', 'waiting_room.call_next',
  'patients.view', 'dossiers.view',
  'tasks.view', 'tasks.create', 'tasks.update', 'tasks.complete'
)
on conflict do nothing;

-- No backfill of user_permissions is needed: with no override row, every
-- existing role='secretaire' profile automatically receives the
-- role_permissions default above the moment this migration lands —
-- existing secretaries lose no capability.

-- ---------------------------------------------------------------------
-- 4. Upgrade already-role-gated RPCs from coarse role to granular permission
-- ---------------------------------------------------------------------
-- Tenant isolation (mm_assert_same_clinic) and every other existing check
-- in these functions is preserved byte-for-byte; only the role gate changes.

create or replace function public.confirm_appointment(p_rdv_id uuid)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  perform public.mm_assert_permission('appointments.confirm');

  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if coalesce(rdv_before.status, rdv_before.statut) in ('annule', 'cancelled') then
    raise exception 'cannot confirm a cancelled appointment';
  end if;

  update public.rdv
  set status = 'confirme'
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log(
    'APPOINTMENT_CONFIRMED', 'rdv', p_rdv_id,
    to_jsonb(rdv_before), to_jsonb(rdv_after), null
  );

  return rdv_after;
end;
$$;

create or replace function public.cancel_appointment(p_rdv_id uuid, p_reason text default null::text)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
  active_visit_id uuid;
begin
  perform public.mm_assert_permission('appointments.cancel');

  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  select v.id into active_visit_id
  from public.visits v
  where v.rdv_id = p_rdv_id
    and v.status not in ('completed', 'cancelled')
  limit 1;

  if active_visit_id is not null then
    raise exception 'cannot cancel appointment with an active visit';
  end if;

  update public.rdv
  set status = 'annule'
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log(
    'APPOINTMENT_CANCELLED', 'rdv', p_rdv_id,
    to_jsonb(rdv_before), to_jsonb(rdv_after),
    jsonb_build_object('reason', p_reason)
  );

  return rdv_after;
end;
$$;

create or replace function public.reschedule_appointment(p_rdv_id uuid, p_scheduled_at timestamptz)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  perform public.mm_assert_permission('appointments.update');

  if p_scheduled_at is null then
    raise exception 'scheduled_at is required';
  end if;

  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  update public.rdv
  set date_rdv = p_scheduled_at
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log(
    'APPOINTMENT_RESCHEDULED', 'rdv', p_rdv_id,
    to_jsonb(rdv_before), to_jsonb(rdv_after),
    jsonb_build_object('scheduled_at', p_scheduled_at)
  );

  return rdv_after;
end;
$$;

create or replace function public.create_visit_from_rdv(p_rdv_id uuid, p_doctor_id uuid)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_row public.rdv%rowtype;
  doctor_clinic uuid;
  visit_row public.visits%rowtype;
  qn integer;
begin
  perform public.mm_assert_permission('waiting_room.add_patient');

  select * into rdv_row
  from public.rdv
  where id = p_rdv_id;

  if not found then
    raise exception 'appointment not found';
  end if;

  perform public.mm_assert_same_clinic(rdv_row.cabinet_id);

  select coalesce(clinic_id, cabinet_id) into doctor_clinic
  from public.profiles
  where id = p_doctor_id
    and public.mm_role_key(role) = 'doctor'
    and status = 'active';

  if doctor_clinic is distinct from rdv_row.cabinet_id then
    raise exception 'doctor must belong to the same clinic';
  end if;

  select * into visit_row
  from public.visits
  where rdv_id = p_rdv_id
    and status <> 'cancelled'
  order by created_at desc
  limit 1;

  if found then
    if visit_row.status in ('consultation', 'billing', 'completed') then
      raise exception 'visit already advanced';
    end if;

    if visit_row.doctor_id is distinct from p_doctor_id then
      qn := public.mm_next_queue_number(rdv_row.cabinet_id, p_doctor_id, current_date);
    else
      qn := visit_row.queue_number;
    end if;

    update public.visits
    set doctor_id = p_doctor_id,
        status = 'waiting',
        queue_date = current_date,
        queue_number = coalesce(qn, public.mm_next_queue_number(rdv_row.cabinet_id, p_doctor_id, current_date)),
        queued_at = coalesce(queued_at, now()),
        waiting_at = coalesce(waiting_at, now()),
        queue_sort_at = coalesce(queue_sort_at, now()),
        updated_by = auth.uid(),
        updated_at = now()
    where id = visit_row.id
    returning * into visit_row;
  else
    qn := public.mm_next_queue_number(rdv_row.cabinet_id, p_doctor_id, current_date);

    insert into public.visits (
      clinic_id, patient_id, rdv_id, source, doctor_id, status,
      queue_date, queue_number, queue_sort_at, queued_at, waiting_at,
      created_by, updated_by
    )
    values (
      rdv_row.cabinet_id, rdv_row.patient_id, rdv_row.id, 'appointment', p_doctor_id, 'waiting',
      current_date, qn, now(), now(), now(), auth.uid(), auth.uid()
    )
    returning * into visit_row;
  end if;

  update public.rdv
  set status = 'en_attente'
  where id = p_rdv_id;

  perform public.write_audit_log(
    'PATIENT_WAITING',
    'visit',
    visit_row.id,
    null,
    to_jsonb(visit_row),
    jsonb_build_object('rdv_id', p_rdv_id, 'doctor_id', p_doctor_id)
  );

  return visit_row;
end;
$$;

create or replace function public.cancel_visit(p_visit_id uuid, p_reason text default null::text)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
begin
  perform public.mm_assert_permission('waiting_room.remove_patient');

  select * into visit_before from public.visits where id = p_visit_id for update;
  if not found then raise exception 'visit not found'; end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status not in ('scheduled', 'arrived', 'waiting', 'called') then
    raise exception 'cancellation is only allowed before consultation';
  end if;

  update public.visits
  set status = 'cancelled',
      cancelled_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  if visit_after.rdv_id is not null then
    update public.rdv set status = 'annule' where id = visit_after.rdv_id;
  end if;

  perform public.write_audit_log('PATIENT_CANCELLED', 'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), jsonb_build_object('reason', p_reason));

  return visit_after;
end;
$$;

create or replace function public.process_visit_payment(p_visit_id uuid, p_method text, p_amount numeric default null::numeric)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  payment_before public.payments%rowtype;
  payment_after public.payments%rowtype;
begin
  perform public.mm_assert_permission('billing.collect');

  if p_method not in ('cash', 'card', 'transfer', 'insurance', 'package', 'free') then
    raise exception 'invalid payment method';
  end if;

  select * into visit_before from public.visits where id = p_visit_id for update;
  if not found then raise exception 'visit not found'; end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status <> 'billing' then
    raise exception 'visit is not in billing';
  end if;

  select * into payment_before
  from public.payments
  where visit_id = p_visit_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then raise exception 'pending payment not found'; end if;

  update public.payments
  set status = 'paid',
      method = p_method,
      amount = coalesce(p_amount, amount),
      received_by = auth.uid(),
      paid_at = now(),
      updated_at = now()
  where id = payment_before.id
  returning * into payment_after;

  update public.visits
  set status = 'completed',
      completed_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  update public.consultations
  set statut = 'paye',
      updated_at = now()
  where id = payment_after.consultation_id;

  if visit_after.rdv_id is not null then
    update public.rdv set status = 'termine' where id = visit_after.rdv_id;
  end if;

  perform public.write_audit_log('PAYMENT_PROCESSED', 'payment', payment_after.id, to_jsonb(payment_before), to_jsonb(payment_after), null);
  perform public.write_audit_log('PATIENT_PAID', 'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null);

  return visit_after;
end;
$$;

-- call_patient is doctor-clinical-workflow-first (a doctor calling their own
-- queued patient), extended so a secretary holding waiting_room.call_next
-- can also do it (matches the explicit product requirement), without
-- weakening the existing "a doctor may only call patients assigned to
-- them" restriction — that restriction only ever applied to doctors and
-- continues to apply only to doctors.
create or replace function public.call_patient(p_visit_id uuid)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  v_role text;
begin
  v_role := public.current_role();
  if v_role <> 'doctor' and not public.mm_has_permission('waiting_room.call_next') then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'security', null, null, null,
      jsonb_build_object('required_permission', 'waiting_room.call_next', 'actual_role', v_role)
    );
    raise exception 'not authorized';
  end if;

  select * into visit_before from public.visits where id = p_visit_id;
  if not found then
    raise exception 'visit not found';
  end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if v_role = 'doctor' and not public.is_admin() and visit_before.doctor_id is distinct from auth.uid() then
    raise exception 'doctor can only call patients assigned to them';
  end if;

  if visit_before.status <> 'waiting' then
    raise exception 'only waiting patients can be called';
  end if;

  update public.visits
  set status = 'called',
      called_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  perform public.write_audit_log('PATIENT_CALLED', 'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null);

  return visit_after;
end;
$$;

-- New: the one explicitly-required action ("Arrivé") with no existing RPC —
-- confirmed live it was a raw, ungated `rdv.update({status:'arrive'})` from
-- the client. Same pattern as confirm_appointment/cancel_appointment.
create or replace function public.mm_mark_appointment_arrived(p_rdv_id uuid)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  perform public.mm_assert_permission('appointments.mark_arrived');

  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  update public.rdv
  set status = 'arrive'
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log('APPOINTMENT_ARRIVED', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), null);

  return rdv_after;
end;
$$;

grant execute on function public.mm_mark_appointment_arrived(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Fix the four RPCs with NO existing role/tenant check at all
-- ---------------------------------------------------------------------
-- Confirmed live (see migration header): these had zero mm_assert_role /
-- mm_assert_same_clinic calls — any authenticated user of any role in any
-- clinic could call them against any rdv/visit row. Fixed by adding the
-- same permission + tenant checks their "v1" counterparts already have,
-- with no other behavior change.

create or replace function public.confirm_appointment_v2(p_rdv_id uuid, p_method text default 'PHONE'::text)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('appointments.confirm');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if exists (select 1 from information_schema.columns where table_name = 'rdv' and column_name = 'status') then
    if rdv_before.status in ('cancelled', 'completed') then
      raise exception 'cannot confirm a cancelled or completed appointment';
    end if;
    update public.rdv set status = 'confirme', confirmed_at = now(), confirmed_by_user_id = auth.uid(), confirmation_method = p_method where id = p_rdv_id returning * into rdv_after;
  else
    update public.rdv set statut = 'confirme', confirmed_at = now(), confirmed_by_user_id = auth.uid(), confirmation_method = p_method where id = p_rdv_id returning * into rdv_after;
  end if;

  perform public.write_audit_log('APPOINTMENT_CONFIRMED', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), jsonb_build_object('method', p_method));

  return rdv_after;
end;
$$;

create or replace function public.cancel_appointment_v2(p_rdv_id uuid, p_reason text default null::text)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('appointments.cancel');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.arrival_status in ('WAITING', 'IN_CONSULTATION') then
    raise exception 'cannot cancel an appointment while patient is waiting or in consultation';
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'rdv' and column_name = 'status') then
    update public.rdv set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason where id = p_rdv_id returning * into rdv_after;
  else
    update public.rdv set statut = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason where id = p_rdv_id returning * into rdv_after;
  end if;

  perform public.write_audit_log('APPOINTMENT_CANCELLED', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), jsonb_build_object('reason', p_reason));

  return rdv_after;
end;
$$;

create or replace function public.record_payment(p_rdv_id uuid, p_amount numeric, p_method text)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('billing.mark_paid');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.payment_status = 'PAID' then
    raise exception 'appointment is already paid';
  end if;

  update public.rdv
  set payment_status = 'PAID'
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log('PATIENT_PAID', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), jsonb_build_object('amount', p_amount, 'method', p_method));

  return rdv_after;
end;
$$;

create or replace function public.add_to_waiting_room(p_rdv_id uuid)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('waiting_room.add_patient');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.arrival_status != 'NOT_ARRIVED' then
    raise exception 'patient has already arrived or left';
  end if;

  update public.rdv
  set arrival_status = 'WAITING',
      arrived_at = now()
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log('PATIENT_WAITING', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), null);

  return rdv_after;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Tighten patients INSERT/UPDATE to require the granular permission
-- ---------------------------------------------------------------------
-- Additive/restrictive only — the existing permissive tenant-isolation
-- policies (cabinet_patients_isolation, "Clinic members can access their
-- patients", patients_tenant_isolation) are untouched, so SELECT access
-- (patients.view, implicitly granted to everyone same-clinic today) is
-- unaffected. A RESTRICTIVE policy is AND-ed on top, narrowing INSERT/UPDATE
-- specifically to doctor/admin/permission-holder. Every default secretary
-- already has patients.create + patients.update, so this is not a
-- regression for the standard case — it only stops a secretary a doctor has
-- explicitly revoked patients.create/update from bypassing that revocation
-- via a direct client call.

drop policy if exists patients_insert_permission_gate on public.patients;
create policy patients_insert_permission_gate
on public.patients as restrictive for insert to authenticated
with check (public.is_admin() or public.current_role() = 'doctor' or public.mm_has_permission('patients.create'));

drop policy if exists patients_update_permission_gate on public.patients;
create policy patients_update_permission_gate
on public.patients as restrictive for update to authenticated
using (public.is_admin() or public.current_role() = 'doctor' or public.mm_has_permission('patients.update'));

-- ---------------------------------------------------------------------
-- 7. Clinical data boundary — hard restriction, not a configurable permission
-- ---------------------------------------------------------------------
-- Confirmed live: these five tables currently allow ANY same-clinic
-- authenticated user (secretaries included) full read/write via permissive
-- ALL policies with no role check — unlike `consultations`, which already
-- correctly restricts to doctor/admin. This closes that gap. Intentionally
-- NOT wired to mm_has_permission: clinical access must never be grantable
-- to a secretary via the permission-management UI.

do $$
declare
  t text;
begin
  foreach t in array array['patient_vitals','patient_problems','patient_medications','patient_lab_results','clinical_notes']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_doctor_admin_only', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.is_admin() or public.current_role() = ''doctor'') with check (public.is_admin() or public.current_role() = ''doctor'')',
      t || '_doctor_admin_only', t
    );
  end loop;
end $$;
