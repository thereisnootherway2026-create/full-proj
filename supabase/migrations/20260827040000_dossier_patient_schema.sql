-- ============================================================
-- MACROMEDICA - DOSSIER PATIENT STRUCTURED DATA SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. PATIENT VITALS
CREATE TABLE IF NOT EXISTS public.patient_vitals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
  date_mesure TIMESTAMPTZ DEFAULT now(),
  blood_pressure TEXT, -- e.g. "135/85"
  heart_rate INTEGER, -- bpm
  temperature NUMERIC(4,1), -- °C
  spo2 INTEGER, -- %
  weight NUMERIC(5,1), -- kg
  height NUMERIC(5,1), -- cm
  blood_sugar NUMERIC(5,2), -- g/L
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 2. PATIENT PROBLEMS (Medical History / Active Issues)
CREATE TABLE IF NOT EXISTS public.patient_problems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Actif', -- Actif, Stable, Résolu, À surveiller
  diagnosed_date DATE,
  severity TEXT DEFAULT 'normal', -- normal, warning, critical
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 3. PATIENT MEDICATIONS (Treatments)
CREATE TABLE IF NOT EXISTS public.patient_medications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  posology TEXT,
  status TEXT DEFAULT 'Actif', -- Actif, Arrêté, Si besoin
  observance TEXT DEFAULT 'Bonne', -- Excellente, Bonne, Variable, Mauvaise
  start_date DATE,
  end_date DATE,
  prescribed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 4. PATIENT LAB RESULTS (Biology)
CREATE TABLE IF NOT EXISTS public.patient_lab_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  exam_name TEXT NOT NULL,
  result_value NUMERIC(10,2),
  result_text TEXT,
  unit TEXT,
  norm_min NUMERIC(10,2),
  norm_max NUMERIC(10,2),
  status TEXT DEFAULT 'normal', -- normal, slightly_high, slightly_low, critical
  date_exam DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 5. CLINICAL NOTES (Summaries & Vigilance)
CREATE TABLE IF NOT EXISTS public.clinical_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  note_type TEXT DEFAULT 'summary', -- summary, vigilance, conclusion
  content TEXT NOT NULL,
  date_note TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- RLS POLICIES
ALTER TABLE public.patient_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_vitals_select" ON public.patient_vitals
FOR SELECT TO authenticated
USING (cabinet_id = public.current_clinic_id());

CREATE POLICY "patient_vitals_write" ON public.patient_vitals
FOR ALL TO authenticated
USING (cabinet_id = public.current_clinic_id())
WITH CHECK (cabinet_id = public.current_clinic_id());

CREATE POLICY "patient_problems_select" ON public.patient_problems
FOR SELECT TO authenticated
USING (cabinet_id = public.current_clinic_id());

CREATE POLICY "patient_problems_write" ON public.patient_problems
FOR ALL TO authenticated
USING (cabinet_id = public.current_clinic_id())
WITH CHECK (cabinet_id = public.current_clinic_id());

CREATE POLICY "patient_medications_select" ON public.patient_medications
FOR SELECT TO authenticated
USING (cabinet_id = public.current_clinic_id());

CREATE POLICY "patient_medications_write" ON public.patient_medications
FOR ALL TO authenticated
USING (cabinet_id = public.current_clinic_id())
WITH CHECK (cabinet_id = public.current_clinic_id());

CREATE POLICY "patient_lab_results_select" ON public.patient_lab_results
FOR SELECT TO authenticated
USING (cabinet_id = public.current_clinic_id());

CREATE POLICY "patient_lab_results_write" ON public.patient_lab_results
FOR ALL TO authenticated
USING (cabinet_id = public.current_clinic_id())
WITH CHECK (cabinet_id = public.current_clinic_id());

CREATE POLICY "clinical_notes_select" ON public.clinical_notes
FOR SELECT TO authenticated
USING (cabinet_id = public.current_clinic_id());

CREATE POLICY "clinical_notes_write" ON public.clinical_notes
FOR ALL TO authenticated
USING (cabinet_id = public.current_clinic_id())
WITH CHECK (cabinet_id = public.current_clinic_id());
