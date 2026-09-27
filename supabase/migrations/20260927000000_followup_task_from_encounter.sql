-- Follow-up reminder: a completed consultation with a "Prochain contrôle" date (and the
-- reminder box left checked) creates a task for the secretariat, in the same transaction as
-- the completion — same principle as the ordonnance (20260923050000) and the exams
-- (20260926020000). The secretary calls the patient and books with the normal RDV form;
-- no appointment is ever created blindly (no "provisional" rdv status exists, and a booked
-- slot would block the agenda for a time nobody chose).
--
-- Note keys read (set by the consultation sheet):
--   followUpDate      'YYYY-MM-DD'   required
--   followUpReminder  boolean        absent = true (the box is checked by default)
--   followUpKind      'renouvellement' | 'controle'   -> task title
--   followUpNotes, motif              -> task description
--
-- tasks.encounter_id links the task to its consultation: traceability, one follow-up task per
-- consultation (unique index), and the future "Planifier" action (open the RDV form prefilled).

alter table public.tasks
  add column if not exists encounter_id uuid references public.clinical_encounters(id) on delete set null;

create unique index if not exists tasks_one_followup_per_encounter
  on public.tasks (encounter_id)
  where encounter_id is not null and type = 'patient_followup';

create or replace function public.mm_followup_task_from_encounter(p_encounter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.clinical_encounters%rowtype;
  v_patient public.patients%rowtype;
  v_due date;
  v_name text;
  v_title text;
  v_desc text;
  v_id uuid;
begin
  select * into v_enc from public.clinical_encounters where id = p_encounter_id;
  if not found or v_enc.status <> 'completed' then return null; end if;
  if coalesce(v_enc.note ->> 'followUpReminder', 'true') = 'false' then return null; end if;
  if coalesce(v_enc.note ->> 'followUpDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin
    v_due := (v_enc.note ->> 'followUpDate')::date;
  exception when others then
    return null;
  end;
  if exists (select 1 from public.tasks where encounter_id = v_enc.id and type = 'patient_followup') then return null; end if;

  select * into v_patient from public.patients where id = v_enc.patient_id;
  v_name := nullif(btrim(coalesce(v_patient.prenom, '') || ' ' || coalesce(v_patient.nom, '')), '');
  v_title := case when v_enc.note ->> 'followUpKind' = 'renouvellement'
                  then 'Renouveler l''ordonnance — '
                  else 'Planifier le contrôle — ' end
             || coalesce(v_name, 'patient');
  v_desc := concat_ws(E'\n',
    'Consultation du ' || to_char((coalesce(v_enc.completed_at, now()) at time zone 'Africa/Casablanca')::date, 'DD/MM/YYYY')
      || nullif(' — ' || btrim(split_part(coalesce(v_enc.note ->> 'motif', ''), E'\n', 1)), ' — '),
    nullif(btrim(coalesce(v_enc.note ->> 'followUpNotes', '')), ''),
    'Prévu le ' || to_char(v_due, 'DD/MM/YYYY') || ' : contacter le patient pour fixer le rendez-vous.'
  );

  insert into public.tasks (
    cabinet_id, patient_id, encounter_id, title, description, type, priority, status,
    due_date, assigned_to, created_by
  ) values (
    v_enc.clinic_id, v_enc.patient_id, v_enc.id, left(v_title, 200), v_desc, 'patient_followup', 'normal', 'pending',
    -- 09:00 Morocco time on the planned day
    (v_due + time '09:00') at time zone 'Africa/Casablanca',
    null,            -- secretariat queue
    v_enc.doctor_id
  )
  returning id into v_id;

  perform public.write_audit_log(
    'FOLLOWUP_TASK_CREATED', 'task', v_id, null,
    jsonb_build_object('encounter_id', v_enc.id, 'due', v_due, 'kind', coalesce(v_enc.note ->> 'followUpKind', 'controle')),
    null
  );
  return v_id;
end;
$$;

-- Internal only: called by the trigger below.
revoke all on function public.mm_followup_task_from_encounter(uuid) from public, anon, authenticated;

create or replace function public.trg_encounter_completed_creates_followup_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mm_followup_task_from_encounter(new.id);
  return new;
end;
$$;

drop trigger if exists trg_encounter_completed_creates_followup_task on public.clinical_encounters;
create trigger trg_encounter_completed_creates_followup_task
  after update of status on public.clinical_encounters
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.trg_encounter_completed_creates_followup_task();

-- No back-fill: only consultations completed from now on create a reminder (older ones never
-- asked the doctor whether they wanted one).

notify pgrst, 'reload schema';
