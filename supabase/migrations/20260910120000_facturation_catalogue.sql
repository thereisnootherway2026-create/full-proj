-- ============================================================
-- Facturation: acts catalogue + itemized invoice lines
-- ============================================================

-- 1. Catalogue of billable medical acts, per clinic
CREATE TABLE IF NOT EXISTS public.actes_catalogue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  categorie TEXT,
  prix NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (cabinet_id, code)
);

ALTER TABLE public.actes_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY actes_catalogue_select ON public.actes_catalogue
FOR SELECT TO authenticated
USING (cabinet_id = public.current_clinic_id());

CREATE POLICY actes_catalogue_write ON public.actes_catalogue
FOR ALL TO authenticated
USING (cabinet_id = public.current_clinic_id() AND public.current_role() IN ('admin', 'doctor'))
WITH CHECK (cabinet_id = public.current_clinic_id() AND public.current_role() IN ('admin', 'doctor'));

-- 2. Itemized invoice lines, tied to a consultation (= "facture")
CREATE TABLE IF NOT EXISTS public.facture_lignes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  acte_id UUID REFERENCES public.actes_catalogue(id) ON DELETE SET NULL,
  libelle_snapshot TEXT NOT NULL,
  prix_unitaire_snapshot NUMERIC(10,2) NOT NULL,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facture_lignes_consultation_id ON public.facture_lignes(consultation_id);

ALTER TABLE public.facture_lignes ENABLE ROW LEVEL SECURITY;

-- Lines are only ever written by the create_manual_invoice RPC (SECURITY DEFINER, bypasses RLS).
-- Direct client writes are blocked, matching the pattern already established on
-- consultations/visits/payments — read access is scoped through the parent consultation's clinic.
CREATE POLICY facture_lignes_no_direct_write ON public.facture_lignes
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY facture_lignes_select ON public.facture_lignes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.consultations c
    WHERE c.id = facture_lignes.consultation_id
      AND COALESCE(c.clinic_id, c.cabinet_id) = public.current_clinic_id()
  )
);

-- 3. New columns on consultations: due date + sequential invoice number
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS date_echeance DATE,
  ADD COLUMN IF NOT EXISTS numero TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_numero_per_clinic
  ON public.consultations (COALESCE(clinic_id, cabinet_id), numero)
  WHERE numero IS NOT NULL;

-- 4. Helper: next sequential invoice number for a clinic, e.g. FAC-0001
CREATE OR REPLACE FUNCTION public.mm_next_facture_numero(p_clinic_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('facture_numero:' || p_clinic_id::text));

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero, '\D', '', 'g'), '')::integer
  ), 0) + 1
  INTO next_num
  FROM public.consultations
  WHERE COALESCE(clinic_id, cabinet_id) = p_clinic_id
    AND numero IS NOT NULL;

  RETURN 'FAC-' || LPAD(next_num::text, 4, '0');
END;
$$;
