-- PRODUCTION HARDENING AUDIT — visits_select/payments_select check
-- current_role() = 'secretary' but never mm_has_permission('waiting_room.view')
-- or mm_has_permission('billing.view'). Revoking those permissions from a
-- secretary (via the Permissions UI) had no actual effect on what she could
-- query directly — role-based, not permission-based, same class of gap
-- already closed for tasks in the previous migration. visits serves both
-- the waiting room and billing (status='billing' rows feed BillingPage), so
-- either permission is accepted; payments is billing-only.

drop policy if exists visits_view_permission_gate on public.visits;
create policy visits_view_permission_gate on public.visits as restrictive for select to authenticated using (
  public.is_admin()
  or (public.current_role() = 'doctor' and doctor_id = auth.uid())
  or public.mm_has_permission('waiting_room.view')
  or public.mm_has_permission('billing.view')
);

drop policy if exists payments_view_permission_gate on public.payments;
create policy payments_view_permission_gate on public.payments as restrictive for select to authenticated using (
  public.is_admin() or public.mm_has_permission('billing.view')
);
