-- A completed consultation's prescription becomes a real ordonnance.
--
-- Until now the medications written in a consultation (clinical_encounters.note ->
-- 'traitements') never reached public.ordonnances: the dossier rebuilt a read-only list
-- from the encounter JSON and showed it under "Historique antérieur à ce module", next to
-- the real ordonnances — so a prescription written today in consultation could not be
-- printed, cancelled or duplicated, and the patient's prescriptions were split in two
-- lists.
--
-- Now: when an encounter moves to 'completed', one ordonnance is created from its
-- treatment lines, linked by encounter_id, issued ('emise') by the encounter's doctor at
-- completion time — completing the consultation is the doctor signing it. Same rule as
-- the dossier's old derived list (lib/patientRecords.js): any completed encounter with at
-- least one non-blank medicament, whether or not the "ordonnance" box was ticked, so
-- nothing that was visible disappears.
--
-- Letterhead (entete) is snapshotted at creation from the doctor's profile and the
-- cabinet, the same fields OrdonnanceFormModal stores, so the print works identically.
--
-- Idempotent: the trigger and the back-fill both skip an encounter that already has an
-- ordonnance. (Not a unique index on encounter_id: mm_duplicate_ordonnance deliberately
-- copies encounter_id onto the copy, so several ordonnances can share one encounter.)
-- No change to the ordonnances / ordonnance_lignes columns, RLS policies or any RPC
-- signature. Both tables are written as the function owner, so the "emise" write
-- boundary policies (meant for client writes) don't apply here.

create or replace function public.mm_ordonnance_from_encounter(p_encounter_id uuid, p_audit boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.clinical_encounters%rowtype;
  v_doctor public.profiles%rowtype;
  v_cabinet public.cabinets%rowtype;
  v_lines jsonb;
  v_id uuid;
  v_at timestamptz;
begin
  select * into v_enc from public.clinical_encounters where id = p_encounter_id;
  if not found or v_enc.status <> 'completed' then return null; end if;
  if exists (select 1 from public.ordonnances where encounter_id = v_enc.id) then return null; end if;

  -- Non-blank medicament rows, in their written order.
  select coalesce(jsonb_agg(r order by ord), '[]'::jsonb) into v_lines
  from jsonb_array_elements(
         case when jsonb_typeof(v_enc.note -> 'traitements') = 'array' then v_enc.note -> 'traitements' else '[]'::jsonb end
       ) with ordinality as t(r, ord)
  where jsonb_typeof(r) = 'object' and length(btrim(coalesce(r ->> 'medicament', ''))) > 0;

  if jsonb_array_length(v_lines) = 0 then return null; end if;

  select * into v_doctor from public.profiles where id = v_enc.doctor_id;
  select * into v_cabinet from public.cabinets where id = v_enc.clinic_id;
  v_at := coalesce(v_enc.completed_at, now());

  insert into public.ordonnances (
    cabinet_id, patient_id, encounter_id, doctor_id, created_by,
    statut, date_prescription, entete, instructions, emitted_at, emitted_by
  ) values (
    v_enc.clinic_id, v_enc.patient_id, v_enc.id, v_enc.doctor_id, v_enc.doctor_id,
    'emise', (v_at at time zone 'Africa/Casablanca')::date,
    jsonb_build_object(
      'nomMedecin', coalesce(v_doctor.nom_complet, ''),
      'specialite', coalesce(to_jsonb(v_doctor) ->> 'specialite', 'Médecin généraliste'),
      'adresse', coalesce(v_cabinet.adresse, ''),
      'telephone', coalesce(v_cabinet.telephone, ''),
      'ville', coalesce(v_cabinet.ville, split_part(coalesce(v_cabinet.adresse, ''), ',', 1), ''),
      'signe', true,
      'source', 'consultation'
    ),
    null, v_at, v_enc.doctor_id
  )
  returning id into v_id;

  insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree)
  select v_id, (ord - 1)::int,
         left(btrim(r ->> 'medicament'), 500),
         nullif(left(btrim(coalesce(r ->> 'posologie', '')), 500), ''),
         nullif(left(btrim(coalesce(r ->> 'duree', '')), 500), '')
  from jsonb_array_elements(v_lines) with ordinality as t(r, ord);

  if p_audit then
    perform public.write_audit_log(
      'ORDONNANCE_FROM_ENCOUNTER', 'ordonnance', v_id, null,
      jsonb_build_object('encounter_id', v_enc.id, 'lignes', jsonb_array_length(v_lines)), null
    );
  end if;

  return v_id;
end;
$$;

-- Internal only: called by the trigger below and the one-off back-fill.
revoke all on function public.mm_ordonnance_from_encounter(uuid, boolean) from public, anon, authenticated;

create or replace function public.trg_encounter_completed_creates_ordonnance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mm_ordonnance_from_encounter(new.id, true);
  return new;
end;
$$;

drop trigger if exists trg_encounter_completed_creates_ordonnance on public.clinical_encounters;
create trigger trg_encounter_completed_creates_ordonnance
  after update of status on public.clinical_encounters
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.trg_encounter_completed_creates_ordonnance();

-- Back-fill: every consultation already completed with a prescription gets its ordonnance,
-- so the dossier shows one list. No audit rows here (no acting user in a migration).
do $$
declare
  v_id uuid;
  v_created int := 0;
begin
  for v_id in
    select e.id from public.clinical_encounters e
    where e.status = 'completed'
      and not exists (select 1 from public.ordonnances o where o.encounter_id = e.id)
    order by e.completed_at
  loop
    if public.mm_ordonnance_from_encounter(v_id, false) is not null then
      v_created := v_created + 1;
    end if;
  end loop;
  raise notice 'created % ordonnance(s) from completed consultations', v_created;
end;
$$;

notify pgrst, 'reload schema';
