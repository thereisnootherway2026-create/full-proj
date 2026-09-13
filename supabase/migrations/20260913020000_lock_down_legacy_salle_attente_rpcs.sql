-- FINAL CLOSURE PASS — legacy waiting-room RPC audit.
--
-- update_patient_statut(uuid, text, integer):
--   - operates on salle_attente, a superseded waiting-room table (the live
--     product uses visits via add_to_waiting_room/call_patient/cancel_visit)
--   - zero callers in src/ (grepped), zero Edge Function references, no
--     triggers reference salle_attente
--   - salle_attente holds 12 rows, all in a single clinic, none created
--     since 2026-03-25 — stale test data, not active production use
--   - referenced by one other function: start_consultation_safe (below)
--
-- start_consultation_safe(uuid) — found while tracing salle_attente's other
-- referrers:
--   - also zero callers anywhere in src/ or Edge Functions
--   - NOT security definer (plain invoker-rights), so it runs subject to
--     RLS like any other client call — not even a privilege-bypass concern
--   - sets rdv.status = 'en_consultation', a value the live
--     rdv_status_check constraint does not allow
--     ('scheduled','confirme','cancelled','no_show','completed') — this
--     function cannot succeed against the current schema at all, confirming
--     it predates that constraint and is unreachably broken today
--
-- Both are definitively dead: no frontend, Edge Function, RPC, or trigger
-- depends on either. Per the "definitively dead" branch of this audit:
-- preserve the functions (historical/schema compatibility) but revoke
-- client EXECUTE so they're no longer part of the live attack surface.
-- Not deleting either function or the salle_attente table, not adding a
-- permission check to functionality nothing in the product exercises —
-- that would be inventing a permission around dead functionality, which
-- this pass was explicitly told not to do.

revoke execute on function public.update_patient_statut(uuid, text, integer) from anon, authenticated, public;
revoke execute on function public.start_consultation_safe(uuid) from anon, authenticated, public;

comment on function public.update_patient_statut(uuid, text, integer) is
  'LEGACY/UNUSED: operates on the superseded salle_attente table. The live product uses visits (add_to_waiting_room/call_patient/cancel_visit). Client EXECUTE revoked 2026-09-13 — confirmed zero callers in frontend, Edge Functions, or other RPCs.';
comment on function public.start_consultation_safe(uuid) is
  'LEGACY/UNUSED/BROKEN: sets rdv.status to a value (''en_consultation'') the current rdv_status_check constraint rejects — cannot succeed against the live schema. Client EXECUTE revoked 2026-09-13 — confirmed zero callers anywhere.';
