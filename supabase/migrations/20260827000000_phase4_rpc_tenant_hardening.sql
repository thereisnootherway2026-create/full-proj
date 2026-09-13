-- Phase 4: ensure RPC tenant checks use the canonical profile clinic identity.
-- current_clinic_id() already resolves clinic_id first and cabinet_id only for
-- legacy profiles; all operational RPCs call mm_assert_same_clinic(target).
-- This migration intentionally does not weaken RLS or change queue lifecycle.
CREATE OR REPLACE FUNCTION public.current_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.clinic_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.clinic_id IS NOT NULL
  LIMIT 1
$$;
