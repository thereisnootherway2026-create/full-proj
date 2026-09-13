-- PRODUCTION HARDENING AUDIT — critical, pre-existing bug found while
-- running the required state-transition tests: role_permissions for
-- 'doctor' only ever seeded view-ish permissions (appointments.view,
-- waiting_room.view/call_next, patients.view, dossiers.view, tasks.*).
-- mm_assert_permission()/mm_has_permission() has no doctor bypass (unlike
-- is_admin(), which short-circuits to true) — confirmed live: a doctor
-- account had mm_has_permission false for appointments.cancel, .confirm,
-- .create, .update, waiting_room.add_patient, billing.collect,
-- patients.create, patients.update. Every RPC added in 20260912010000 that
-- calls mm_assert_permission without also checking current_role()='doctor'
-- inline (confirm_appointment_v2, cancel_appointment_v2, add_to_waiting_room,
-- mm_mark_appointment_arrived, reschedule_appointment, process_visit_payment)
-- has therefore been rejecting doctors' own actions in their own clinic
-- since that migration — a functional regression across every clinic, not
-- something introduced by this pass but one that must be fixed as part of
-- it ("Do not weaken doctor/admin access").
--
-- Two ways to fix this: sprinkle `current_role() = 'doctor'` bypasses into
-- every affected RPC (inconsistent with the system's own design — the
-- patients RLS gates and call_patient already do this ad hoc, unevenly),
-- or fix it at the source by actually seeding the doctor role with the
-- full operational permission set the product's own spec describes
-- ("doctor: doctor permissions" meaning full control of her own clinic's
-- operations). The latter is simpler, auditable through the same table
-- used for everything else, and doesn't require touching six RPC bodies.
-- staff.manage/settings.manage are included too since mm_set_user_permission
-- already treats doctor as equivalent to admin for managing a secretary's
-- access, so excluding those here would just be a different inconsistency.
--
-- Purely additive: only inserts rows that don't already exist, changes
-- nothing for admin or secretary.

insert into public.role_permissions (role, permission_id)
select 'doctor', p.id from public.permissions p
where p.key not in (
  select p2.key from public.role_permissions rp2
  join public.permissions p2 on p2.id = rp2.permission_id
  where rp2.role = 'doctor'
)
on conflict do nothing;
