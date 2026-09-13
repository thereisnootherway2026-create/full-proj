-- FINAL CLOSURE PASS — Section 8 (storage/document access) finding.
--
-- storage.objects had exactly one policy on the `documents` bucket
-- (cabinet_storage_isolation): tenant-folder-scoped only, with NO
-- role/classification check at all. The `documents` TABLE already blocks
-- secretary from reading `type_document='ordonnance'` ROWS
-- (documents_clinical_boundary, previous pass) — but that only protects the
-- metadata row. The actual file bytes in Storage are governed entirely by
-- this separate storage.objects policy, which had no knowledge of
-- type_document at all: any same-clinic authenticated user (secretary
-- included) could read/write/delete any file in the clinic's folder,
-- ordonnance or not, as long as they knew or could guess the object path —
-- exactly the bypass this audit was told to check for ("do not assume
-- database RLS protects Storage").
--
-- Confirmed live: storage.objects has ZERO rows in the documents bucket
-- today (nothing has ever actually been uploaded — createDocument() only
-- inserts the metadata row, no frontend code calls supabase.storage.upload
-- anywhere) and documents.storage_path values are placeholder seed strings
-- ("demo/<uuid>/..."), not real object paths. So this is currently inert,
-- not actively exploited — but the policy itself is a real, live structural
-- gap that would become exploitable the moment any future upload feature
-- (OrdonnanceFormModal already exists, just unrouted) starts writing real
-- files, so it's closed now rather than deferred.
--
-- Matches by storage.objects.name = documents.storage_path (the only join
-- key that exists). Mirrors the exact same "OR type_document IS DISTINCT
-- FROM 'ordonnance'" shape already used for the documents table policy: an
-- object with no matching documents row (or a non-ordonnance one) is left
-- alone by this policy — it only restricts a confirmed ordonnance match.

drop policy if exists storage_ordonnance_boundary on storage.objects;
create policy storage_ordonnance_boundary on storage.objects as restrictive for all to authenticated using (
  bucket_id is distinct from 'documents'
  or public.is_admin()
  or public.current_role() = 'doctor'
  or not exists (
    select 1 from public.documents d
    where d.storage_path = storage.objects.name
      and d.type_document = 'ordonnance'
  )
) with check (
  bucket_id is distinct from 'documents'
  or public.is_admin()
  or public.current_role() = 'doctor'
  or not exists (
    select 1 from public.documents d
    where d.storage_path = storage.objects.name
      and d.type_document = 'ordonnance'
  )
);
