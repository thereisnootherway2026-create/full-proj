-- Phase 4: make clinic_id the canonical tenant identity.
-- Preserve existing valid clinic_id values; only backfill legacy profiles.
-- Only copy an ID when it is a valid FK in the deployed schema. Some
-- environments use a separate clinics table, so an arbitrary cabinet UUID
-- must never be written into profiles.clinic_id.
UPDATE public.profiles p
SET clinic_id = p.cabinet_id
WHERE p.clinic_id IS NULL
  AND p.cabinet_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = p.cabinet_id);

-- If cabinet and clinic UUIDs differ, resolve the clinic owned by the profile.
UPDATE public.profiles p
SET clinic_id = c.id
FROM public.clinics c
WHERE p.clinic_id IS NULL
  AND p.cabinet_id IS NOT NULL
  AND c.owner_id = p.id;

-- Guarantee future profiles created with only cabinet_id receive clinic_id.
CREATE OR REPLACE FUNCTION public.ensure_profile_clinic_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.clinic_id IS NULL
     AND NEW.cabinet_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = NEW.cabinet_id) THEN
    NEW.clinic_id := NEW.cabinet_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_profile_clinic_id ON public.profiles;
CREATE TRIGGER ensure_profile_clinic_id
BEFORE INSERT OR UPDATE OF cabinet_id, clinic_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_clinic_id();
