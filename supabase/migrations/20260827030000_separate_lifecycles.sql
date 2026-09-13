-- ==========================================
-- MIGRATION: MacroMedica Separate Lifecycles
-- ==========================================

-- 1. Add new columns to rdv for separate lifecycles
ALTER TABLE public.rdv 
ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS arrival_status TEXT DEFAULT 'NOT_ARRIVED' CHECK (arrival_status IN ('NOT_ARRIVED', 'WAITING', 'IN_CONSULTATION', 'LEFT')),
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'UNPAID' CHECK (payment_status IN ('NOT_REQUIRED', 'UNPAID', 'PAID')),
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmed_by_user_id UUID,
ADD COLUMN IF NOT EXISTS confirmation_method TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_by UUID,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS consultation_completed_at TIMESTAMPTZ;

-- 2. Backfill start_time and end_time from date_rdv if they don't exist
UPDATE public.rdv 
SET start_time = date_rdv,
    end_time = date_rdv + interval '30 minutes'
WHERE start_time IS NULL;

-- 2b. Backfill payment_status for already-paid appointments before status gets remapped
UPDATE public.rdv
SET payment_status = 'PAID'
WHERE status IN ('paye', 'paid', 'credit');

-- 3. Relax rdv_status_check or drop and recreate it for the new simplified appointment status
ALTER TABLE public.rdv DROP CONSTRAINT IF EXISTS rdv_status_check;

-- Map legacy statuses back to the Appointment Lifecycle (ignoring 'statut' since the table is rdv and column is 'status' or 'statut' depending on the migration)
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rdv' AND column_name='status') THEN
    UPDATE public.rdv
    SET status = 
      CASE 
        WHEN status IN ('confirme', 'arrive', 'arrived', 'en_attente', 'en_consultation', 'in_consultation', 'a_encaisser', 'en_attente_paiement') THEN 'confirme'
        WHEN status IN ('termine', 'paye', 'paid', 'credit') THEN 'completed'
        WHEN status = 'absent' THEN 'no_show'
        WHEN status = 'annule' THEN 'cancelled'
        WHEN status = 'scheduled' THEN 'scheduled'
        ELSE 'scheduled'
      END;

    UPDATE public.rdv
    SET arrival_status = 
      CASE 
        WHEN status IN ('arrive', 'arrived', 'en_attente') THEN 'WAITING'
        WHEN status IN ('en_consultation', 'in_consultation') THEN 'IN_CONSULTATION'
        WHEN status IN ('a_encaisser', 'en_attente_paiement', 'termine', 'paye', 'paid', 'credit') THEN 'LEFT'
        ELSE 'NOT_ARRIVED'
      END;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rdv' AND column_name='statut') THEN
    UPDATE public.rdv
    SET statut = 
      CASE 
        WHEN statut IN ('confirme', 'arrive', 'arrived', 'en_attente', 'en_consultation', 'in_consultation', 'a_encaisser', 'en_attente_paiement') THEN 'confirme'
        WHEN statut IN ('termine', 'paye', 'paid', 'credit') THEN 'completed'
        WHEN statut = 'absent' THEN 'no_show'
        WHEN statut = 'annule' THEN 'cancelled'
        WHEN statut = 'scheduled' THEN 'scheduled'
        ELSE 'scheduled'
      END;

    UPDATE public.rdv
    SET arrival_status = 
      CASE 
        WHEN statut IN ('arrive', 'arrived', 'en_attente') THEN 'WAITING'
        WHEN statut IN ('en_consultation', 'in_consultation') THEN 'IN_CONSULTATION'
        WHEN statut IN ('a_encaisser', 'en_attente_paiement', 'termine', 'paye', 'paid', 'credit') THEN 'LEFT'
        ELSE 'NOT_ARRIVED'
      END;
  END IF;
END $$;

-- Depending on if column is 'status' or 'statut', we might want to check
-- For now, let's just make sure both can accept the new values if they exist
-- The previous constraint was on 'status' per unified workflow migration

DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rdv' AND column_name='status') THEN
    ALTER TABLE public.rdv ADD CONSTRAINT rdv_status_check CHECK (status IN ('scheduled', 'confirme', 'cancelled', 'no_show', 'completed'));
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rdv' AND column_name='statut') THEN
    ALTER TABLE public.rdv DROP CONSTRAINT IF EXISTS rdv_statut_check;
    -- Just leave statut unconstrained if we rely on status, or constrain it if it's the main column
  END IF;
END $$;


-- 4. RPCs for Lifecycle Management

CREATE OR REPLACE FUNCTION public.confirm_appointment_v2(p_rdv_id uuid, p_method text default 'PHONE')
RETURNS public.rdv
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
  col_name text;
BEGIN
  SELECT * INTO rdv_before FROM public.rdv WHERE id = p_rdv_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found'; END IF;

  -- Support both status and statut
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rdv' AND column_name='status') THEN
    IF rdv_before.status IN ('cancelled', 'completed') THEN
      RAISE EXCEPTION 'cannot confirm a cancelled or completed appointment';
    END IF;
    UPDATE public.rdv SET status = 'confirme', confirmed_at = NOW(), confirmed_by_user_id = auth.uid(), confirmation_method = p_method WHERE id = p_rdv_id RETURNING * INTO rdv_after;
  ELSE
    UPDATE public.rdv SET statut = 'confirme', confirmed_at = NOW(), confirmed_by_user_id = auth.uid(), confirmation_method = p_method WHERE id = p_rdv_id RETURNING * INTO rdv_after;
  END IF;

  RETURN rdv_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_v2(p_rdv_id uuid, p_reason text default null)
RETURNS public.rdv
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
BEGIN
  SELECT * INTO rdv_before FROM public.rdv WHERE id = p_rdv_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found'; END IF;

  IF rdv_before.arrival_status IN ('WAITING', 'IN_CONSULTATION') THEN
    RAISE EXCEPTION 'cannot cancel an appointment while patient is waiting or in consultation';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rdv' AND column_name='status') THEN
    UPDATE public.rdv SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = auth.uid(), cancellation_reason = p_reason WHERE id = p_rdv_id RETURNING * INTO rdv_after;
  ELSE
    UPDATE public.rdv SET statut = 'cancelled', cancelled_at = NOW(), cancelled_by = auth.uid(), cancellation_reason = p_reason WHERE id = p_rdv_id RETURNING * INTO rdv_after;
  END IF;

  RETURN rdv_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_to_waiting_room(p_rdv_id uuid)
RETURNS public.rdv
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
BEGIN
  SELECT * INTO rdv_before FROM public.rdv WHERE id = p_rdv_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found'; END IF;

  IF rdv_before.arrival_status != 'NOT_ARRIVED' THEN
    RAISE EXCEPTION 'patient has already arrived or left';
  END IF;

  UPDATE public.rdv
  SET arrival_status = 'WAITING',
      arrived_at = NOW()
  WHERE id = p_rdv_id
  RETURNING * INTO rdv_after;

  RETURN rdv_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_consultation(p_rdv_id uuid)
RETURNS public.rdv
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
BEGIN
  SELECT * INTO rdv_before FROM public.rdv WHERE id = p_rdv_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found'; END IF;

  IF rdv_before.arrival_status != 'WAITING' THEN
    RAISE EXCEPTION 'patient must be in WAITING state to start consultation';
  END IF;

  UPDATE public.rdv
  SET arrival_status = 'IN_CONSULTATION',
      consultation_started_at = NOW()
  WHERE id = p_rdv_id
  RETURNING * INTO rdv_after;

  RETURN rdv_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_consultation(p_rdv_id uuid)
RETURNS public.rdv
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
BEGIN
  SELECT * INTO rdv_before FROM public.rdv WHERE id = p_rdv_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found'; END IF;

  IF rdv_before.arrival_status != 'IN_CONSULTATION' THEN
    RAISE EXCEPTION 'patient must be IN_CONSULTATION to complete';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rdv' AND column_name='status') THEN
    UPDATE public.rdv SET arrival_status = 'LEFT', status = 'completed', consultation_completed_at = NOW(), payment_status = 'UNPAID' WHERE id = p_rdv_id RETURNING * INTO rdv_after;
  ELSE
    UPDATE public.rdv SET arrival_status = 'LEFT', statut = 'completed', consultation_completed_at = NOW(), payment_status = 'UNPAID' WHERE id = p_rdv_id RETURNING * INTO rdv_after;
  END IF;

  RETURN rdv_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment(p_rdv_id uuid, p_amount numeric, p_method text)
RETURNS public.rdv
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
BEGIN
  SELECT * INTO rdv_before FROM public.rdv WHERE id = p_rdv_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found'; END IF;

  IF rdv_before.payment_status = 'PAID' THEN
    RAISE EXCEPTION 'appointment is already paid';
  END IF;

  UPDATE public.rdv
  SET payment_status = 'PAID'
  WHERE id = p_rdv_id
  RETURNING * INTO rdv_after;

  RETURN rdv_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_appointment_v2(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_v2(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_to_waiting_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text) TO authenticated;
