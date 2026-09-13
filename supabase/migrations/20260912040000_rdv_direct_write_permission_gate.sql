-- PRODUCTION HARDENING AUDIT — critical finding: rdv had only tenant-scoped
-- PERMISSIVE ALL policies ("Clinic members can access their rdv",
-- "cabinet_rdv_isolation", "rdv_tenant_isolation") and no permission gate at
-- all. confirm_appointment_v2/cancel_appointment_v2/mm_mark_appointment_arrived
-- do their own mm_assert_permission/mm_assert_same_clinic checks, but those
-- checks are trivially bypassed because src/lib/api.ts's createRdv/updateRdv
-- (used live by AppointmentFormModal.jsx for every appointment create/edit)
-- write to public.rdv directly via supabase.from('rdv').insert/update — not
-- through any RPC. Any authenticated clinic member, any permission level,
-- could INSERT/UPDATE/DELETE any rdv row in their clinic with zero
-- permission or state-machine check. Tenant isolation itself was NOT
-- bypassable (existing WITH CHECK already pins cabinet_id to
-- get_user_cabinet_id()), only the permission/state layer was.
--
-- These RESTRICTIVE policies AND with the existing PERMISSIVE tenant-scoped
-- ones (same pattern as patients_insert_permission_gate /
-- patients_update_permission_gate already in migration 20260912010000) —
-- they narrow access, they do not replace tenant isolation.
--
-- UPDATE additionally blocks editing a cancelled/completed appointment
-- through this direct path for non-doctor/admin callers, so a secretary
-- can't resurrect/mutate a closed appointment by skipping the RPCs that
-- already enforce that. Doctor/admin are not state-restricted here (existing
-- product trust boundary, unchanged).

drop policy if exists rdv_insert_permission_gate on public.rdv;
create policy rdv_insert_permission_gate on public.rdv as restrictive for insert to authenticated with check (
  public.is_admin()
  or public.current_role() = 'doctor'
  or public.mm_has_permission('appointments.create')
);

drop policy if exists rdv_update_permission_gate on public.rdv;
create policy rdv_update_permission_gate on public.rdv as restrictive for update to authenticated using (
  public.is_admin()
  or public.current_role() = 'doctor'
  or (
    public.mm_has_permission('appointments.update')
    and status not in ('cancelled', 'completed')
  )
);

drop policy if exists rdv_delete_permission_gate on public.rdv;
create policy rdv_delete_permission_gate on public.rdv as restrictive for delete to authenticated using (
  public.is_admin()
  or public.current_role() = 'doctor'
);
