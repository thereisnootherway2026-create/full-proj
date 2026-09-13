-- FINAL PRODUCTION HARDENING PASS — Phase 15 finding: update_patient_statut
-- is the ONLY SECURITY DEFINER function in the schema without a pinned
-- search_path (checked every SECURITY DEFINER function live). Every sibling
-- function already sets `search_path = public`; this one didn't, which is a
-- schema-injection risk for SECURITY DEFINER functions per Postgres's own
-- documented guidance. Pinning it changes no behavior for any legitimate
-- caller (all referenced objects — salle_attente, profiles — already live in
-- public). Not touching its authorization logic: this operates on
-- `salle_attente`, a superseded/legacy waiting-room table (the live product
-- uses `visits` via add_to_waiting_room/call_patient/cancel_visit) that
-- confirmed live has zero callers anywhere in the current frontend — left
-- as documented residual risk rather than reworked, per the explicit
-- instruction not to blindly modify existing RPCs or expand scope.

alter function public.update_patient_statut(uuid, text, integer) set search_path = public;
