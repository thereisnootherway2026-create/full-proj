-- Add audit logging to Facturation RPCs

CREATE OR REPLACE FUNCTION public.create_facture(p_draft jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid; v_cabinet uuid; v_numero text; v_ligne jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  
  v_cabinet := public.current_clinic_id();
  v_numero := (p_draft->>'numero');
  IF v_numero IS NULL OR v_numero = '' THEN v_numero := 'DRAFT-' || substr(md5(random()::text), 1, 8); END IF;

  INSERT INTO public.consultations (patient_id, doctor_id, clinic_id, cabinet_id, numero, date_consult, statut, remise, date_echeance)
  VALUES ((p_draft->>'patientId')::uuid, (p_draft->>'praticienId')::uuid, v_cabinet, v_cabinet, v_numero, 
          (p_draft->>'dateEmission')::timestamp, 'brouillon', COALESCE((p_draft->>'remise')::numeric, 0), (p_draft->>'dateEcheance')::date)
  RETURNING id INTO v_id;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_draft->'lignes') LOOP
    INSERT INTO public.facture_lignes (consultation_id, acte_id, description, qte, pu)
    VALUES (v_id, (v_ligne->>'acteId')::uuid, v_ligne->>'description', (v_ligne->>'qte')::numeric, (v_ligne->>'pu')::numeric);
  END LOOP;

  PERFORM public.write_audit_log('FACTURE_CREATED', 'consultation', v_id, NULL, jsonb_build_object('statut', 'brouillon', 'numero', v_numero), NULL);
  RETURN v_id;
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

  PERFORM public.write_audit_log('FACTURE_EMITTED', 'consultation', p_id, jsonb_build_object('statut', 'brouillon'), jsonb_build_object('statut', 'en_attente'), NULL);
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
  PERFORM public.write_audit_log('FACTURE_CANCELLED', 'consultation', p_id, jsonb_build_object('statut', v_facture.statut), jsonb_build_object('statut', 'annulee', 'reason', p_reason), NULL);
END;
$$;

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

  PERFORM public.write_audit_log('PAYMENT_RECORDED', 'payment', v_new_id, NULL, jsonb_build_object('amount', p_amount, 'method', p_method, 'consultation_id', p_consultation_id), NULL);
  PERFORM public.write_audit_log('FACTURE_STATUS_UPDATED', 'consultation', p_consultation_id, jsonb_build_object('statut', v_facture.statut), jsonb_build_object('statut', v_new_statut), NULL);

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_payment_guarded(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payment public.payments%rowtype; v_facture public.consultations%rowtype;
  v_net numeric; v_paye numeric; v_new_statut text;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;

  SELECT * INTO v_facture FROM public.consultations WHERE id = v_payment.consultation_id FOR UPDATE;
  DELETE FROM public.payments WHERE id = p_payment_id;

  v_net := public.get_facture_net(v_facture.id);
  SELECT COALESCE(SUM(amount), 0) INTO v_paye FROM public.payments WHERE consultation_id = v_facture.id AND status != 'cancelled';

  IF v_paye = 0 THEN
    IF v_facture.date_echeance < CURRENT_DATE THEN v_new_statut := 'en_retard';
    ELSE v_new_statut := 'en_attente'; END IF;
  ELSIF v_paye < (v_net - 0.05) THEN
    v_new_statut := 'partielle';
  ELSE
    v_new_statut := 'payee';
  END IF;

  UPDATE public.consultations SET statut = v_new_statut WHERE id = v_facture.id;

  PERFORM public.write_audit_log('PAYMENT_DELETED', 'payment', p_payment_id, jsonb_build_object('amount', v_payment.amount, 'method', v_payment.method, 'consultation_id', v_payment.consultation_id), NULL, NULL);
  PERFORM public.write_audit_log('FACTURE_STATUS_UPDATED', 'consultation', v_facture.id, jsonb_build_object('statut', v_facture.statut), jsonb_build_object('statut', v_new_statut), NULL);
END;
$$;
