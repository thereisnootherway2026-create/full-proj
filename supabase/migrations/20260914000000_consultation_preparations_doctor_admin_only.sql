-- FINAL PRE-PRODUCTION CLOSURE — consultation_preparations authorization gap.
--
-- Schema: consultation_preparations(id, cabinet_id, visit_id, text, status,
-- created_at, completed_at, created_by). `text` is a free-text pre-
-- consultation checklist item (e.g. "check blood pressure", "review last
-- labs"), created and read exclusively via src/lib/preparationService.js,
-- which is used only by PreparationChecklist.jsx, which is only rendered
-- from PatientWorkspace.jsx — a route already gated to doctor-only
-- (RoleGuard role="docteur", App.tsx). So today there is no live UI path
-- for a secretary to reach this table at all.
--
-- Despite that, the existing policies were tenant-scoped only for SELECT
-- (`preparation_select`: cabinet_id = current_clinic_id(), no role check),
-- meaning a secretary could still read this table directly via the client
-- SDK/REST, bypassing the route guard entirely — exactly the
-- "don't solve this only in React" gap this pass was told to close. write
-- (`preparation_write`) was already admin/doctor-only.
--
-- This content is consultation-context clinical preparation, not
-- administrative cabinet data (no evidence otherwise), so it gets the same
-- hard-coded, non-permission-configurable doctor/admin-only treatment
-- already applied to clinical_notes/patient_vitals/patient_problems/
-- patient_medications/patient_lab_results — a RESTRICTIVE policy layered
-- under the existing tenant-scoped permissive ones, not a replacement.

drop policy if exists consultation_preparations_doctor_admin_only on public.consultation_preparations;
create policy consultation_preparations_doctor_admin_only on public.consultation_preparations as restrictive for all to authenticated using (
  public.is_admin() or public.current_role() = 'doctor'
) with check (
  public.is_admin() or public.current_role() = 'doctor'
);
