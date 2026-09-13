-- PRODUCTION HARDENING AUDIT
--
-- tasks: the only policy was "tasks_access" (cabinet-scoped ALL, no
-- permission check at all). Inspected the actual workflow (taskService.js):
-- tasks are a shared clinic to-do list — assigned_to defaults to the
-- creator but fetchTasks() pulls every cabinet task for every viewer and
-- there is no "private task" concept anywhere in the schema or frontend.
-- So this does NOT add ownership/assignment restrictions (that would
-- invent a restriction the product doesn't have today) — it only adds the
-- permission gate that was missing entirely, matching the tasks.view/
-- create/update/complete keys that already exist in the permission
-- catalogue but were never actually enforced anywhere.
--
-- documents: mixes clinical documents (type_document = 'ordonnance', a
-- prescription — confirmed live, joined with consultations.notes in
-- getOrdonnances()) with administrative ones (fiche_cnss, recu_consultation)
-- in one table with zero classification enforcement (both existing
-- policies are cabinet-scoped ALL, no role/type check). Hard-restrict
-- 'ordonnance' rows to doctor/admin, same treatment as the clinical tables
-- in 20260912010000 — not permission-configurable, since prescriptions are
-- explicitly out of bounds for a secretary regardless of what permissions
-- a doctor might otherwise grant her.

drop policy if exists tasks_select_permission_gate on public.tasks;
create policy tasks_select_permission_gate on public.tasks as restrictive for select to authenticated using (
  public.is_admin() or public.current_role() = 'doctor' or public.mm_has_permission('tasks.view')
);

drop policy if exists tasks_insert_permission_gate on public.tasks;
create policy tasks_insert_permission_gate on public.tasks as restrictive for insert to authenticated with check (
  public.is_admin() or public.current_role() = 'doctor' or public.mm_has_permission('tasks.create')
);

drop policy if exists tasks_update_permission_gate on public.tasks;
create policy tasks_update_permission_gate on public.tasks as restrictive for update to authenticated using (
  public.is_admin() or public.current_role() = 'doctor'
  or public.mm_has_permission('tasks.update') or public.mm_has_permission('tasks.complete')
);

drop policy if exists tasks_delete_permission_gate on public.tasks;
create policy tasks_delete_permission_gate on public.tasks as restrictive for delete to authenticated using (
  public.is_admin() or public.current_role() = 'doctor'
);

drop policy if exists documents_clinical_boundary on public.documents;
create policy documents_clinical_boundary on public.documents as restrictive for all to authenticated using (
  public.is_admin() or public.current_role() = 'doctor' or type_document is distinct from 'ordonnance'
) with check (
  public.is_admin() or public.current_role() = 'doctor' or type_document is distinct from 'ordonnance'
);
