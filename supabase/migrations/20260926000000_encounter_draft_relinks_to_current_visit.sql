-- A consultation draft left open on an earlier visit kept that visit's link forever:
-- mm_open_encounter merged with coalesce(existing, new), so reopening the patient from
-- today's queue (p_visit_id = today's visit) was ignored. Finishing the consultation then
-- closed the OLD visit and today's visit stayed 'waiting' in the File d'attente.
--
-- Now the visit/rdv the doctor opens the draft from wins. Without one, a link to a visit
-- that is no longer active (completed/cancelled/billing) is dropped, so the draft can never
-- hand off a visit that was already closed.
create or replace function public.mm_open_encounter(p_patient_id uuid, p_visit_id uuid default null)
returns public.clinical_encounters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_clinic uuid;
  v_visit_id uuid;
  v_rdv_id uuid;
  v_row public.clinical_encounters%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  select cabinet_id into v_patient_clinic from public.patients where id = p_patient_id;
  if not found then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_patient_clinic);

  if p_visit_id is not null then
    select id into v_visit_id from public.visits
     where id = p_visit_id and clinic_id = v_patient_clinic and patient_id = p_patient_id;
    if v_visit_id is null then
      select id into v_rdv_id from public.rdv
       where id = p_visit_id and cabinet_id = v_patient_clinic and patient_id = p_patient_id;
    end if;
  end if;

  insert into public.clinical_encounters (clinic_id, patient_id, doctor_id, visit_id, rdv_id)
  values (v_patient_clinic, p_patient_id, auth.uid(), v_visit_id, v_rdv_id)
  on conflict (doctor_id, patient_id) where status = 'draft'
  do update set
    visit_id = case
      when excluded.visit_id is not null or excluded.rdv_id is not null then excluded.visit_id
      when exists (select 1 from public.visits v
                    where v.id = public.clinical_encounters.visit_id
                      and v.status in ('waiting', 'called', 'consultation'))
        then public.clinical_encounters.visit_id
      else null
    end,
    rdv_id = case
      when excluded.visit_id is not null or excluded.rdv_id is not null then excluded.rdv_id
      when exists (select 1 from public.rdv r
                    where r.id = public.clinical_encounters.rdv_id
                      and r.status not in ('completed', 'cancelled'))
        then public.clinical_encounters.rdv_id
      else null
    end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public.mm_open_encounter(uuid, uuid) from public, anon;
grant execute on function public.mm_open_encounter(uuid, uuid) to authenticated;
