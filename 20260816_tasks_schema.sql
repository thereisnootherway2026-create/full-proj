-- ============================================================
-- MACROMEDICA — TASKS SCHEMA SETUP
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT,
  
  type TEXT NOT NULL CHECK (type IN ('patient_followup', 'clinical', 'prescription', 'results', 'administrative', 'appointment', 'other')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  
  due_date TIMESTAMPTZ,
  due_time TEXT,
  
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tasks_cabinet_id ON public.tasks(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_tasks_patient_id ON public.tasks(patient_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);

-- RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if any (to prevent conflicts)
DROP POLICY IF EXISTS "tasks_access" ON public.tasks;

-- Access based on cabinet_id link in profiles (same as patients/rdv)
CREATE POLICY "tasks_access" ON public.tasks
FOR ALL TO authenticated USING (
  cabinet_id IN (SELECT cabinet_id FROM public.profiles WHERE id = auth.uid())
);

-- TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION public.update_tasks_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;

CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_tasks_updated_at_column();
