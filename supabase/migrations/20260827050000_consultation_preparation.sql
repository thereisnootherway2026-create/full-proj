-- ==========================================
-- MIGRATION: Consultation Preparation
-- ==========================================

CREATE TABLE IF NOT EXISTS public.consultation_preparations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_consultation_preparations_visit_id 
ON public.consultation_preparations(visit_id);

ALTER TABLE public.consultation_preparations ENABLE ROW LEVEL SECURITY;

CREATE POLICY preparation_select ON public.consultation_preparations
FOR SELECT TO authenticated
USING (
  cabinet_id = public.current_clinic_id()
);

CREATE POLICY preparation_write ON public.consultation_preparations
FOR ALL TO authenticated
USING (
  cabinet_id = public.current_clinic_id()
  and public.current_role() in ('admin', 'doctor')
)
WITH CHECK (
  cabinet_id = public.current_clinic_id()
  and public.current_role() in ('admin', 'doctor')
);
