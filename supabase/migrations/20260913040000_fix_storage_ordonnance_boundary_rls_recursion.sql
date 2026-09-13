-- FINAL CLOSURE PASS — bug fix for the previous migration in this same pass
-- (20260913030000). Verified live: the storage.objects RESTRICTIVE policy's
-- `not exists (select 1 from public.documents d where ...)` subquery is
-- itself subject to documents' OWN RLS for the calling session — and
-- documents_clinical_boundary (previous pass) already hides
-- type_document='ordonnance' rows from a secretary. So for a secretary the
-- subquery always found zero rows (not because the row didn't exist, but
-- because she isn't allowed to see it), making "not exists" true and
-- silently defeating the whole policy — confirmed live, a secretary could
-- still read a test ordonnance storage object after the previous migration.
--
-- Fix: check the classification through a SECURITY DEFINER function, which
-- runs as its owner and is unaffected by documents' RLS, mirroring
-- mm_get_patient_clinical's approach to the same class of problem.

create or replace function public.mm_is_ordonnance_storage_path(p_path text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_path
      and d.type_document = 'ordonnance'
  );
$$;

drop policy if exists storage_ordonnance_boundary on storage.objects;
create policy storage_ordonnance_boundary on storage.objects as restrictive for all to authenticated using (
  bucket_id is distinct from 'documents'
  or public.is_admin()
  or public.current_role() = 'doctor'
  or not public.mm_is_ordonnance_storage_path(storage.objects.name)
) with check (
  bucket_id is distinct from 'documents'
  or public.is_admin()
  or public.current_role() = 'doctor'
  or not public.mm_is_ordonnance_storage_path(storage.objects.name)
);
