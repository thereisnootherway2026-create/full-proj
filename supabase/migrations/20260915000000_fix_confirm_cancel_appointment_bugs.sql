-- REGRESSION FIX — "Confirmer le RDV" and "Modifier l'heure" reported broken.
--
-- Traced live, not guessed. AppointmentsPage.tsx (the active agenda UI)
-- imports confirmAppointment/cancelAppointment from appointmentService.js,
-- which call the RPCs confirm_appointment/cancel_appointment (no "_v2"
-- suffix) — NOT confirm_appointment_v2/cancel_appointment_v2, which were
-- the ones hardened and fixed earlier in this project's RBAC work. These
-- two older, still-live functions had never been touched and carried two
-- independent, pre-existing bugs, each reproduced live before this fix:
--
-- 1. confirm_appointment: `coalesce(rdv_before.status, rdv_before.statut)`
--    references a `statut` field that does not exist on the rdv rowtype
--    (rdv has only `status`, confirmed against the live schema) — every
--    single call failed with SQLSTATE 42703
--    ("record rdv_before has no field statut"), regardless of caller role.
--    This is why an admin session failed identically to any other role —
--    it's not an authorization/RLS/privilege issue at all, it fails deep
--    inside the state-check logic after every permission/tenant check
--    already passed.
--
-- 2. cancel_appointment: sets `status = 'annule'`, but the live
--    rdv_status_check constraint only allows
--    ('scheduled','confirme','cancelled','no_show','completed') — 'annule'
--    is not a valid value. Every call failed with SQLSTATE 23514 (check
--    constraint violation). Not reported in this ticket, but found while
--    verifying "Annuler le RDV still works" per this fix's own regression
--    checklist — it currently does not, via this specific function.
--
-- Fixed in place (per "use the canonical existing RPC, don't duplicate
-- it") — permission checks (mm_assert_permission), tenant checks
-- (mm_assert_same_clinic), and audit logging are all unchanged. Only the
-- broken column reference and the invalid status literal are corrected.
-- confirm_appointment's guard is also brought up to the same standard as
-- its already-correct confirm_appointment_v2 sibling (blocks completed,
-- not just cancelled, appointments) — this is a genuine gap fix, not a new
-- restriction invented for this pass. Neither function touches
-- arrival_status: confirmation and arrival remain separate lifecycle
-- events, as required.

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

  if rdv_before.status in ('cancelled', 'completed') then
    raise exception 'cannot confirm a cancelled or completed appointment';
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
  set status = 'cancelled'
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
