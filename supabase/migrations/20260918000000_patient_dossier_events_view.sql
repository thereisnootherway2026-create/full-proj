-- Dossier Patient rebuild (feat/dossier-patient): ONE cross-table events view
-- feeding the "Parcours de soins" timeline, its live count, and the "dernière
-- conclusion" strip from a single query — eliminates the split between the
-- old "Historique Médical"-style duplication and the timeline that this
-- rebuild's Phase 0 recon was asked to investigate (see PR notes: that split
-- did not actually exist in this codebase, but the single-source-of-truth
-- requirement still applies going forward).
--
-- security_invoker = true: this view runs with the CALLING role's own RLS
-- policies applied to every underlying table, not the view owner's
-- privileges — required so it can't leak across clinics/roles (checked
-- live against pg_policies before writing this; see below).
--
-- RLS reality checked live for each unioned table:
--   - consultations: consultations_doctor_select restricts a doctor to rows
--     where doctor_id = auth.uid(); admin sees all via consultations_admin_select.
--     This view relies on that — it is the intended ownership boundary, not a
--     gap to work around.
--   - patient_lab_results, documents, rdv: scoped by cabinet_id via existing
--     policies from earlier hardening migrations.
--   - profiles has NO general "same clinic" read policy (only auth.uid() = id,
--     plus one doctor-can-read-secretary policy) — so a LEFT JOIN profiles
--     here for a practitioner display name would silently return NULL for
--     every doctor except the viewer. Since /patients/:id/dossier is
--     doctor-only and consultations RLS already restricts every visible
--     consultation to the viewing doctor, "acteur" is always the current
--     user in practice — resolved client-side from the logged-in profile
--     (already available via useAppContext), not via a SQL join. doctor_id
--     is still exposed in the payload for any future cross-doctor admin view.
--
-- "Urgence" is a real, user-selectable rdv type stored inside the
-- __AGENDA_META__ JSON blob in rdv.notes (see
-- src/components/forms/AppointmentFormModal.jsx buildAppointmentMeta /
-- parseAppointmentMeta) — not a separate table. Confirmed live grep before
-- writing this; there is no dedicated "urgence" column anywhere.
create or replace view public.patient_dossier_events
with (security_invoker = true) as
  -- Consultations
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
      'total_fee', c.total_fee
    ) as payload
  from public.consultations c

  union all

  -- Analyses (lab results) — no doctor/actor column on this table
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

  -- Ordonnances: documents of type 'ordonnance', enriched with the linked
  -- consultation's facturation status when there is one
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
    jsonb_build_object('storage_path', doc.storage_path, 'consultation_id', doc.consultation_id)
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
