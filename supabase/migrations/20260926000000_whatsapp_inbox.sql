-- ============================================================================
-- WhatsApp Inbox Schema & Realtime Setup
-- ============================================================================

-- 1. Create Enums if they do not exist
DO $$ BEGIN
  CREATE TYPE public.whatsapp_request_type AS ENUM ('booking', 'reclamation', 'general');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.whatsapp_inbox_status AS ENUM ('pending', 'resolved', 'confirmed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create whatsapp_inbox Table
CREATE TABLE IF NOT EXISTS public.whatsapp_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_phone VARCHAR(50) NOT NULL,
  patient_name VARCHAR(255),
  patient_motif TEXT,
  request_type public.whatsapp_request_type NOT NULL DEFAULT 'general',
  raw_message TEXT NOT NULL,
  status public.whatsapp_inbox_status NOT NULL DEFAULT 'pending',
  extracted_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Ensure patient_motif column exists if table was already created
ALTER TABLE public.whatsapp_inbox ADD COLUMN IF NOT EXISTS patient_motif TEXT;

-- Index for speedy pending queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_status_created 
  ON public.whatsapp_inbox (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_patient_phone 
  ON public.whatsapp_inbox (patient_phone);

-- 3. Row Level Security (RLS) & Permissions
ALTER TABLE public.whatsapp_inbox ENABLE ROW LEVEL SECURITY;

-- Allow clinic staff and bot to read inbox
DROP POLICY IF EXISTS "whatsapp_inbox_staff_select" ON public.whatsapp_inbox;
DROP POLICY IF EXISTS "whatsapp_inbox_select" ON public.whatsapp_inbox;
CREATE POLICY "whatsapp_inbox_select" ON public.whatsapp_inbox
  FOR SELECT TO authenticated, anon
  USING (true);

-- Allow clinic staff and bot to update inbox (e.g. resolve / confirm)
DROP POLICY IF EXISTS "whatsapp_inbox_staff_update" ON public.whatsapp_inbox;
DROP POLICY IF EXISTS "whatsapp_inbox_update" ON public.whatsapp_inbox;
CREATE POLICY "whatsapp_inbox_update" ON public.whatsapp_inbox
  FOR UPDATE TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Allow bot (anon or service_role) to insert new inbox rows
DROP POLICY IF EXISTS "whatsapp_inbox_insert" ON public.whatsapp_inbox;
CREATE POLICY "whatsapp_inbox_insert" ON public.whatsapp_inbox
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Explicitly grant permissions to anon and authenticated
GRANT ALL ON TABLE public.whatsapp_inbox TO anon, authenticated, service_role;

-- 4. CRITICAL: Enable Supabase Realtime (Publication) specifically for whatsapp_inbox
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'whatsapp_inbox'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_inbox;
  END IF;
END $$;
