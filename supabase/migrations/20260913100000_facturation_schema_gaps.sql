-- =================================================================================
-- Migration: Facturation Schema Gaps, Guaranteed RPCs, and Stats
-- Fills structural gaps, enforces status rules, adds safe RPCs.
-- =================================================================================

-- 1. UTILITIES & SCHEMA
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.facturation_tva() RETURNS numeric IMMUTABLE AS $$
BEGIN
  RETURN 0.20;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remise NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relance BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS emitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 2. LEGACY STATUS MIGRATION & ENFORCEMENT
-- ---------------------------------------------------------------------------------
ALTER TABLE public.consultations DROP CONSTRAINT IF EXISTS consultations_statut_check;

UPDATE public.consultations
SET statut = CASE 
  WHEN statut = 'paye' THEN 'payee'
  WHEN statut = 'annule' THEN 'annulee'
  WHEN statut = 'credit' THEN 
    CASE 
      WHEN EXISTS (SELECT 1 FROM public.payments WHERE consultation_id = consultations.id AND status != 'cancelled') THEN 'partielle'
      WHEN date_echeance < CURRENT_DATE THEN 'en_retard'
      ELSE 'en_attente'
    END
  ELSE statut
END
WHERE statut IN ('paye', 'credit', 'annule');

ALTER TABLE public.consultations ADD CONSTRAINT consultations_statut_check 
  CHECK (statut IN ('brouillon', 'en_attente', 'partielle', 'payee', 'en_retard', 'annulee'));

CREATE INDEX IF NOT EXISTS idx_consultations_statut ON public.consultations(statut);
CREATE INDEX IF NOT EXISTS idx_consultations_emitted_at ON public.consultations(emitted_at);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON public.consultations(patient_id);


-- 3. PAYMENTS & SOURCE OF TRUTH (Facture Net is derived from Lignes)
-- ---------------------------------------------------------------------------------
ALTER TABLE public.payments ALTER COLUMN visit_id DROP NOT NULL;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check 
  CHECK (method IN ('cash', 'card', 'transfer', 'insurance', 'package', 'free', 'cheque'));

CREATE OR REPLACE FUNCTION public.get_facture_net(p_consultation_id uuid) RETURNS numeric AS $$
DECLARE
  v_ht numeric;
  v_remise numeric;
BEGIN
  SELECT COALESCE(SUM(prix_unitaire_snapshot * quantite), 0) INTO v_ht
  FROM public.facture_lignes WHERE consultation_id = p_consultation_id;
  SELECT COALESCE(remise, 0) INTO v_remise FROM public.consultations WHERE id = p_consultation_id;
  RETURN (v_ht * (1 - (v_remise / 100.0))) * (1 + public.facturation_tva());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 4. TRUE SEQUENCE NUMBERING
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_sequences (
  clinic_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  sequence_type TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (clinic_id, sequence_type)
);
ALTER TABLE public.clinic_sequences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mm_next_facture_numero(p_clinic_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_next_val integer;
BEGIN
  INSERT INTO public.clinic_sequences (clinic_id, sequence_type, last_value)
  VALUES (p_clinic_id, 'facture', 1)
  ON CONFLICT (clinic_id, sequence_type) DO UPDATE
    SET last_value = clinic_sequences.last_value + 1, updated_at = now()
  RETURNING last_value INTO v_next_val;
  RETURN 'FAC-' || LPAD(v_next_val::text, 4, '0');
END;
$$;


-- 5. STATE MACHINE MUTATIONS (CREATE, EMIT, CANCEL)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_facture(p_patient_id uuid, p_doctor_id uuid, p_remise numeric, p_lignes jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_consultation_id uuid;
  v_ligne record;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;

  INSERT INTO public.consultations (cabinet_id, patient_id, doctor_id, statut, remise, date_consult)
  VALUES (public.current_clinic_id(), p_patient_id, p_doctor_id, 'brouillon', COALESCE(p_remise, 0), CURRENT_DATE)
  RETURNING id INTO v_consultation_id;

  FOR v_ligne IN SELECT * FROM jsonb_to_recordset(p_lignes) AS x(acte_id uuid, libelle_snapshot text, prix_unitaire_snapshot numeric, quantite integer) LOOP
    INSERT INTO public.facture_lignes (consultation_id, acte_id, libelle_snapshot, prix_unitaire_snapshot, quantite)
    VALUES (v_consultation_id, v_ligne.acte_id, v_ligne.libelle_snapshot, v_ligne.prix_unitaire_snapshot, v_ligne.quantite);
  END LOOP;
  RETURN v_consultation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.emit_facture(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_facture public.consultations%rowtype;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  SELECT * INTO v_facture FROM public.consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF v_facture.statut != 'brouillon' THEN RAISE EXCEPTION 'Seul un brouillon peut etre emis'; END IF;

  UPDATE public.consultations
  SET statut = 'en_attente', numero = public.mm_next_facture_numero(COALESCE(clinic_id, cabinet_id)),
      emitted_at = now(), date_echeance = CURRENT_DATE + interval '30 days'
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_facture(p_id uuid, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_facture public.consultations%rowtype;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  SELECT * INTO v_facture FROM public.consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF v_facture.statut IN ('payee', 'annulee') THEN RAISE EXCEPTION 'Transition invalide'; END IF;

  UPDATE public.consultations SET statut = 'annulee', cancelled_at = now(), cancel_reason = p_reason WHERE id = p_id;
END;
$$;


-- 6. GUARDED PAYMENTS (RECORD & DELETE)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payment_guarded(p_consultation_id uuid, p_amount numeric, p_method text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_facture public.consultations%rowtype;
  v_total_net numeric; v_total_paye numeric; v_reste numeric; v_new_id uuid; v_new_statut text;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;

  SELECT * INTO v_facture FROM public.consultations WHERE id = p_consultation_id FOR UPDATE;
  IF v_facture.statut IN ('brouillon', 'annulee') THEN RAISE EXCEPTION 'Paiement impossible'; END IF;

  v_total_net := public.get_facture_net(p_consultation_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paye FROM public.payments WHERE consultation_id = p_consultation_id AND status != 'cancelled';
  v_reste := v_total_net - v_total_paye;

  IF p_amount > (v_reste + 0.05) THEN RAISE EXCEPTION 'Le montant depasse le reste a payer'; END IF;

  INSERT INTO public.payments (clinic_id, consultation_id, patient_id, amount, method, status, received_by, paid_at)
  VALUES (COALESCE(v_facture.clinic_id, v_facture.cabinet_id), p_consultation_id, v_facture.patient_id, p_amount, p_method, 'paid', auth.uid(), now())
  RETURNING id INTO v_new_id;

  v_total_paye := v_total_paye + p_amount;
  IF (v_total_net - v_total_paye) <= 0.05 THEN v_new_statut := 'payee'; ELSE v_new_statut := 'partielle'; END IF;
  UPDATE public.consultations SET statut = v_new_statut WHERE id = p_consultation_id;
  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_payment_guarded(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payment public.payments%rowtype; v_facture public.consultations%rowtype;
  v_net numeric; v_paye numeric;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;

  SELECT * INTO v_facture FROM public.consultations WHERE id = v_payment.consultation_id FOR UPDATE;
  DELETE FROM public.payments WHERE id = p_payment_id;

  v_net := public.get_facture_net(v_facture.id);
  SELECT COALESCE(SUM(amount), 0) INTO v_paye FROM public.payments WHERE consultation_id = v_facture.id AND status != 'cancelled';

  IF v_paye = 0 THEN
    IF v_facture.date_echeance < CURRENT_DATE THEN UPDATE public.consultations SET statut = 'en_retard' WHERE id = v_facture.id;
    ELSE UPDATE public.consultations SET statut = 'en_attente' WHERE id = v_facture.id; END IF;
  ELSIF v_paye < (v_net - 0.05) THEN
    UPDATE public.consultations SET statut = 'partielle' WHERE id = v_facture.id;
  ELSE
    UPDATE public.consultations SET statut = 'payee' WHERE id = v_facture.id;
  END IF;
END;
$$;


-- 7. STATS & DEBITEURS
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_facturation_stats(p_periode integer, p_praticien uuid, p_assureur text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic uuid := public.current_clinic_id();
  v_result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;

  WITH factures AS (
    SELECT c.id, c.statut, c.date_echeance, c.date_consult, c.emitted_at, c.doctor_id, p.mutuelle,
           public.get_facture_net(c.id) AS net,
           COALESCE((SELECT SUM(amount) FROM public.payments WHERE consultation_id = c.id AND status != 'cancelled'), 0) AS paye
    FROM public.consultations c
    LEFT JOIN public.patients p ON p.id = c.patient_id
    WHERE COALESCE(c.clinic_id, c.cabinet_id) = v_clinic
      AND c.statut != 'brouillon'
      AND (p_periode IS NULL OR c.emitted_at >= (now() - (p_periode || ' days')::interval))
      AND (p_praticien IS NULL OR c.doctor_id = p_praticien)
      AND (p_assureur IS NULL OR p.mutuelle::text = p_assureur)
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
       'caNet', COALESCE(SUM(net), 0),
       'encaisse', COALESCE(SUM(paye), 0),
       'reste', COALESCE(SUM(net - paye), 0),
       'panier', CASE WHEN COUNT(*) > 0 THEN SUM(net)/COUNT(*) ELSE 0 END,
       'count', COUNT(*)
    ),
    'ageing', jsonb_build_object(
       '0_30', COALESCE(SUM(net - paye) FILTER (WHERE CURRENT_DATE - date_echeance BETWEEN 0 AND 30 AND statut NOT IN ('payee','annulee')), 0),
       '31_60', COALESCE(SUM(net - paye) FILTER (WHERE CURRENT_DATE - date_echeance BETWEEN 31 AND 60 AND statut NOT IN ('payee','annulee')), 0),
       '61_90', COALESCE(SUM(net - paye) FILTER (WHERE CURRENT_DATE - date_echeance BETWEEN 61 AND 90 AND statut NOT IN ('payee','annulee')), 0),
       '90_plus', COALESCE(SUM(net - paye) FILTER (WHERE CURRENT_DATE - date_echeance > 90 AND statut NOT IN ('payee','annulee')), 0)
    ),
    'statutDistribution', (
       SELECT COALESCE(jsonb_object_agg(st.statut, st.cnt), '{}'::jsonb) FROM (
         SELECT statut, COUNT(*) as cnt FROM factures GROUP BY statut
       ) st
    ),
    'dso', (
       SELECT COALESCE(AVG(EXTRACT(DAY FROM (p.paid_at - c.emitted_at))), 0)
       FROM public.payments p
       JOIN public.consultations c ON p.consultation_id = c.id
       WHERE c.id IN (SELECT id FROM factures) AND p.status != 'cancelled'
    )
  ) INTO v_result
  FROM factures;
  
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_debiteurs()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic uuid := public.current_clinic_id();
  v_result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;

  WITH deb_factures AS (
    SELECT c.id, c.patient_id, p.nom, p.prenom, c.numero, c.date_echeance, c.relance,
           public.get_facture_net(c.id) AS net,
           COALESCE((SELECT SUM(amount) FROM public.payments WHERE consultation_id = c.id AND status != 'cancelled'), 0) AS paye
    FROM public.consultations c
    JOIN public.patients p ON p.id = c.patient_id
    WHERE COALESCE(c.clinic_id, c.cabinet_id) = v_clinic
      AND c.statut NOT IN ('payee', 'annulee', 'brouillon')
  ),
  deb_patients AS (
    SELECT patient_id, nom, prenom,
           SUM(net - paye) AS reste_du,
           COUNT(id) AS nb_factures,
           MAX(CURRENT_DATE - date_echeance) AS retard_max,
           jsonb_agg(jsonb_build_object(
             'id', id, 'numero', numero, 'echeance', date_echeance, 'reste', (net - paye), 'relance', relance
           )) AS factures
    FROM deb_factures
    WHERE (net - paye) > 0
    GROUP BY patient_id, nom, prenom
  )
  SELECT COALESCE(jsonb_agg(row_to_json(deb_patients)), '[]'::jsonb) INTO v_result FROM deb_patients;
  RETURN v_result;
END;
$$;
