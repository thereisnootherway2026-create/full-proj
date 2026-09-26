-- Migration: 20260922000500_task_actions_server_enforcement.sql
-- Description: Server-side role enforcement for task actions and authentic persistence of clinical prescription renewals (Option A).

-- 1. Add document_id column to tasks table if not exists
alter table public.tasks
  add column if not exists document_id uuid references public.documents(id) on delete set null;

create index if not exists idx_tasks_document_id on public.tasks(document_id);

-- 2. Define the secure RPC mm_execute_task_action
create or replace function public.mm_execute_task_action(
  p_task_id uuid,
  p_action_key text,
  p_action_role text,
  p_note text default null,
  p_assign_to text default null,
  p_priority text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_before_task public.tasks%rowtype;
  v_patient public.patients%rowtype;
  v_patient_name text := '';
  v_doc_id uuid := null;
  v_new_doc_id uuid := null;
  v_new_assigned_to uuid := null;
  v_new_priority text;
  v_new_status text;
  v_actor_name text := '';
  v_actor_label text := '';
  v_timestamp_label text := '';
  v_log_line text := '';
  v_updated_description text := '';
begin
  -- 1. Must be authenticated
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- 2. Fetch the target task
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found';
  end if;
  v_before_task := v_task;

  -- 3. Assert clinic isolation boundary
  perform public.mm_assert_same_clinic(v_task.cabinet_id);

  -- 4. Server-side role assertions
  if p_action_role = 'doctor' then
    perform public.mm_assert_role(array['doctor', 'admin']);
  elsif p_action_role = 'secretary' then
    perform public.mm_assert_role(array['secretary', 'admin', 'doctor']);
    if public.current_role() = 'secretary' and not (
      public.mm_has_permission('tasks.update') or public.mm_has_permission('tasks.complete')
    ) then
      raise exception 'not authorized';
    end if;
  else
    raise exception 'invalid action role: %', p_action_role;
  end if;

  -- 5. Retrieve patient name if patient_id is present
  if v_task.patient_id is not null then
    select * into v_patient from public.patients where id = v_task.patient_id;
    v_patient_name := btrim(coalesce(v_patient.prenom, '') || ' ' || coalesce(v_patient.nom, ''));
  end if;

  -- 6. Option A: Clinical prescription renewal document creation
  if p_action_key = 'doctor_validate_prescription' then
    if v_task.patient_id is null then
      raise exception 'patient required for prescription renewal';
    end if;

    insert into public.documents (
      cabinet_id,
      patient_id,
      type_document,
      nom_fichier,
      storage_path,
      created_at
    ) values (
      v_task.cabinet_id,
      v_task.patient_id,
      'ordonnance',
      'Ordonnance_renouvellement_' || regexp_replace(coalesce(nullif(v_patient_name, ''), 'patient'), '\s+', '_', 'g') || '_' || to_char(now(), 'YYYYMMDD_HH24MI') || '.pdf',
      'renouvellements/' || v_task.id::text || '.pdf',
      now()
    ) returning id into v_doc_id;

    v_new_doc_id := v_doc_id;
  end if;

  -- 7. Build audit trail line
  select nom_complet into v_actor_name from public.profiles where id = auth.uid();
  if public.current_role() in ('doctor', 'admin') then
    v_actor_label := coalesce('Dr. ' || nullif(btrim(v_actor_name), ''), 'Médecin');
  else
    v_actor_label := 'Secrétariat';
  end if;

  v_timestamp_label := to_char(now() at time zone 'Africa/Casablanca', 'DD/MM à HH24:MI');
  v_log_line := '[' || v_actor_label || ' · ' || v_timestamp_label || '] ' || coalesce(p_note, 'Action validée');

  v_updated_description := case
    when v_task.description is null or length(btrim(v_task.description)) = 0 then v_log_line
    else v_task.description || E'\n' || v_log_line
  end;

  -- 8. Resolve assignee if supplied
  if p_assign_to is not null then
    if p_assign_to in ('secretary', 'secretaire') then
      v_new_assigned_to := null;
    elsif p_assign_to in ('me', 'currentUser') then
      v_new_assigned_to := auth.uid();
    else
      begin
        v_new_assigned_to := p_assign_to::uuid;
      exception when others then
        v_new_assigned_to := null;
      end;
    end if;
  else
    v_new_assigned_to := v_task.assigned_to;
  end if;

  -- 9. Resolve priority
  if p_priority is not null and p_priority in ('urgent', 'high', 'normal', 'low') then
    v_new_priority := p_priority;
  else
    v_new_priority := v_task.priority;
  end if;

  -- 10. Resolve status
  if p_status is not null and p_status in ('pending', 'completed', 'cancelled') then
    v_new_status := p_status;
  elsif p_action_key = 'doctor_validate_prescription' then
    v_new_status := 'completed';
  else
    v_new_status := v_task.status;
  end if;

  -- 11. Update tasks record
  update public.tasks
  set
    description = v_updated_description,
    status = v_new_status,
    priority = v_new_priority,
    assigned_to = v_new_assigned_to,
    document_id = coalesce(v_new_doc_id, document_id),
    completed_at = case
      when v_new_status = 'completed' then coalesce(completed_at, now())
      else null
    end,
    completed_by = case
      when v_new_status = 'completed' then coalesce(completed_by, auth.uid())
      else null
    end,
    updated_at = now()
  where id = v_task.id
  returning * into v_task;

  -- 12. Log audit event
  perform public.write_audit_log(
    'TASK_ACTION_EXECUTED',
    'task',
    v_task.id,
    to_jsonb(v_before_task),
    to_jsonb(v_task),
    jsonb_build_object(
      'action_key', p_action_key,
      'action_role', p_action_role,
      'document_id', v_new_doc_id
    )
  );

  -- 13. Return jsonb with task row + patientName
  return jsonb_build_object(
    'id', v_task.id,
    'cabinet_id', v_task.cabinet_id,
    'patient_id', v_task.patient_id,
    'title', v_task.title,
    'description', v_task.description,
    'type', v_task.type,
    'priority', v_task.priority,
    'status', v_task.status,
    'due_date', v_task.due_date,
    'due_time', v_task.due_time,
    'assigned_to', v_task.assigned_to,
    'document_id', v_task.document_id,
    'created_by', v_task.created_by,
    'completed_by', v_task.completed_by,
    'completed_at', v_task.completed_at,
    'created_at', v_task.created_at,
    'updated_at', v_task.updated_at,
    'patientName', case when length(v_patient_name) > 0 then v_patient_name else null end
  );
end;
$$;

-- 3. Grants & Revocations
revoke all on function public.mm_execute_task_action(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.mm_execute_task_action(uuid, text, text, text, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
