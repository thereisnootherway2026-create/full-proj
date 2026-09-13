CREATE OR REPLACE FUNCTION pg_temp.run_smoke() RETURNS TABLE(step text, result jsonb) AS $$
DECLARE
  v_clinic_id uuid;
  v_doctor_id uuid := '4c79d39b-d2e0-4502-9b91-f3c9fe6f9f79';
  v_patient_id uuid;
  v_f1 uuid; v_f2 uuid; v_f3 uuid; v_f1_pay uuid;
  v_stats jsonb; v_deb jsonb; v_statuts jsonb;
  v_jwt jsonb;
BEGIN
  SELECT id INTO v_clinic_id FROM public.cabinets LIMIT 1;
  IF v_clinic_id IS NULL THEN INSERT INTO public.cabinets (nom) VALUES ('Cabinet Test') RETURNING id INTO v_clinic_id; END IF;

  INSERT INTO public.profiles (id, role, cabinet_id, clinic_id) VALUES (v_doctor_id, 'doctor', v_clinic_id, v_clinic_id)
  ON CONFLICT (id) DO UPDATE SET role = 'doctor', cabinet_id = v_clinic_id, clinic_id = v_clinic_id;

  SELECT id INTO v_patient_id FROM public.patients LIMIT 1;
  IF v_patient_id IS NULL THEN INSERT INTO public.patients (nom, prenom, cabinet_id, clinic_id) VALUES ('Doe', 'John', v_clinic_id, v_clinic_id) RETURNING id INTO v_patient_id; END IF;

  v_jwt := jsonb_build_object('sub', v_doctor_id, 'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'doctor'));
  PERFORM set_config('request.jwt.claims', v_jwt::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  step := '1_Fixtures';
  v_f1 := public.create_facture(v_patient_id, v_doctor_id, 0, '[{"acte_id": null, "libelle_snapshot": "F1", "prix_unitaire_snapshot": 500, "quantite": 1}]'::jsonb);
  v_f2 := public.create_facture(v_patient_id, v_doctor_id, 10, '[{"acte_id": null, "libelle_snapshot": "F2", "prix_unitaire_snapshot": 1000, "quantite": 1}]'::jsonb);
  v_f3 := public.create_facture(v_patient_id, v_doctor_id, 0, '[{"acte_id": null, "libelle_snapshot": "F3", "prix_unitaire_snapshot": 2000, "quantite": 1}]'::jsonb);
  result := jsonb_build_object('f1', v_f1, 'f2', v_f2, 'f3', v_f3);
  RETURN NEXT;

  step := '2_Emit';
  PERFORM public.emit_facture(v_f1); PERFORM public.emit_facture(v_f2); PERFORM public.emit_facture(v_f3);
  UPDATE public.consultations SET date_echeance = CURRENT_DATE - interval '100 days', statut = 'en_retard' WHERE id = v_f3;
  SELECT jsonb_object_agg(id, statut) INTO v_statuts FROM public.consultations WHERE id IN (v_f1, v_f2, v_f3);
  result := v_statuts;
  RETURN NEXT;

  step := '3_Pay';
  v_f1_pay := public.record_payment_guarded(v_f1, 600, 'cash');
  PERFORM public.record_payment_guarded(v_f2, 500, 'card');
  SELECT jsonb_object_agg(id, statut) INTO v_statuts FROM public.consultations WHERE id IN (v_f1, v_f2, v_f3);
  result := v_statuts;
  RETURN NEXT;

  step := '4_Overpay_Attempt';
  BEGIN
    PERFORM public.record_payment_guarded(v_f2, 600, 'cash');
  EXCEPTION WHEN OTHERS THEN
    result := jsonb_build_object('error', SQLERRM);
  END;
  RETURN NEXT;

  step := '5_Delete_Pay';
  PERFORM public.delete_payment_guarded(v_f1_pay);
  SELECT jsonb_object_agg(id, statut) INTO v_statuts FROM public.consultations WHERE id IN (v_f1, v_f2, v_f3);
  result := v_statuts;
  RETURN NEXT;

  step := '6_Cancel';
  PERFORM public.cancel_facture(v_f1, 'Test cancel');
  SELECT jsonb_object_agg(id, statut) INTO v_statuts FROM public.consultations WHERE id IN (v_f1, v_f2, v_f3);
  result := v_statuts;
  RETURN NEXT;

  step := '7_Stats';
  result := public.get_facturation_stats(NULL, NULL, NULL);
  RETURN NEXT;
  
  step := '8_Debiteurs';
  result := public.get_debiteurs();
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

SELECT * FROM pg_temp.run_smoke();
