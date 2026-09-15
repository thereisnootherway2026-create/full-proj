-- Phase 2 addition: the timeline's click-to-expand detail needs "lignes"
-- (consultation line items) and "medicaments" (ordonnance drug list) inline
-- in each event's payload, so expanding a row is instant and doesn't add a
-- second round trip per click — keeps the "one query feeds everything"
-- property from Phase 1 instead of quietly reintroducing N+1 fetches.
--
-- safe_jsonb(): consultations.notes is free text for most rows and only a
-- JSON blob for ordonnance-linked consultations (see OrdonnanceFormModal.jsx
-- / PrescriptionsPage.jsx's identical ::jsonb parsing pattern). A bare
-- `notes::jsonb` cast raises and aborts the whole view query the moment any
-- one row's notes isn't valid JSON, so this wraps it to return null instead.
create or replace function public.safe_jsonb(p_text text)
returns jsonb
language plpgsql
immutable
as $$
begin
  return p_text::jsonb;
exception when others then
  return null;
end;
$$;

create or replace view public.patient_dossier_events
with (security_invoker = true) as
  -- Consultations, with their facture_lignes inlined as "lignes"
  select
    'consult-' || c.id::text as id,
    'consultation'::text as kind,
    c.patient_id,
    coalesce(c.clinic_id, c.cabinet_id) as cabinet_id,
    coalesce(c.completed_at, c.date_consult::timestamptz) as event_date,
    'Consultation'::text as titre,
    c.chief_complaint as sous_titre,
    c.numero as ref,
    c.statut as statut_facturation,
    jsonb_build_object(
      'diagnosis', c.diagnosis,
      'treatment', c.treatment,
      'chief_complaint', c.chief_complaint,
      'doctor_id', c.doctor_id,
      'montant', c.montant,
      'total_fee', c.total_fee,
      'lignes', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'libelle', fl.libelle_snapshot,
                 'prix', fl.prix_unitaire_snapshot,
                 'quantite', fl.quantite
               ) order by fl.created_at), '[]'::jsonb)
        from public.facture_lignes fl
        where fl.consultation_id = c.id
      )
    ) as payload
  from public.consultations c

  union all

  -- Analyses (lab results)
  select
    'lab-' || l.id::text,
    'analyse'::text,
    l.patient_id,
    l.cabinet_id,
    l.date_exam::timestamptz,
    l.exam_name,
    null::text,
    null::text,
    null::text,
    jsonb_build_object(
      'result_value', l.result_value,
      'result_text', l.result_text,
      'unit', l.unit,
      'status', l.status,
      'norm_min', l.norm_min,
      'norm_max', l.norm_max
    )
  from public.patient_lab_results l

  union all

  -- Ordonnances: documents of type 'ordonnance', with the linked
  -- consultation's parsed medicaments list inlined
  select
    'doc-' || doc.id::text,
    'ordonnance'::text,
    doc.patient_id,
    doc.cabinet_id,
    doc.created_at,
    coalesce(doc.nom_fichier, 'Ordonnance'),
    null::text,
    null::text,
    cc.statut,
    jsonb_build_object(
      'storage_path', doc.storage_path,
      'consultation_id', doc.consultation_id,
      'medicaments', coalesce(public.safe_jsonb(cc.notes) -> 'medicaments', '[]'::jsonb)
    )
  from public.documents doc
  left join public.consultations cc on cc.id = doc.consultation_id
  where doc.type_document = 'ordonnance'

  union all

  -- Other documents (fiche_cnss, recu_paiement, recu_consultation, ...)
  select
    'doc-' || doc.id::text,
    'document'::text,
    doc.patient_id,
    doc.cabinet_id,
    doc.created_at,
    coalesce(doc.nom_fichier, 'Document'),
    doc.type_document,
    null::text,
    null::text,
    jsonb_build_object('storage_path', doc.storage_path, 'type_document', doc.type_document)
  from public.documents doc
  where doc.type_document is distinct from 'ordonnance'

  union all

  -- Urgences: rdv rows whose __AGENDA_META__ type is 'Urgence'
  select
    'rdv-' || r.id::text,
    'urgence'::text,
    r.patient_id,
    r.cabinet_id,
    r.date_rdv,
    'Urgence'::text,
    null::text,
    null::text,
    null::text,
    jsonb_build_object('status', r.status, 'arrival_status', r.arrival_status)
  from public.rdv r
  where r.notes like '__AGENDA_META__%'
    and (substring(r.notes from 16))::jsonb ->> 'type' = 'Urgence';

grant select on public.patient_dossier_events to authenticated;
