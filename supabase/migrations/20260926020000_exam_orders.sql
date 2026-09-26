-- Examens complémentaires as real, trackable records.
--
-- Until now an exam only existed as a string inside a consultation note: no state, no result,
-- nothing to tell the doctor a result is waiting. Each exam is now one row:
--   demande  -> prescribed, waiting for the patient to do it
--   resultat -> a result (file and/or comment) was attached — by the doctor or the secretary
--   revu     -> the doctor read the result (doctor/admin only)
--   annule   -> no longer needed (doctor/admin only)
-- Rows are created when a consultation is completed (trigger below), or added from the dossier.
-- All writes go through the mm_exam_* functions; the table itself is read-only to clients.

create table if not exists public.exam_orders (
  id uuid primary key default gen_random_uuid(),
  cabinet_id uuid not null references public.cabinets(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  ordered_by uuid references public.profiles(id),
  label text not null check (char_length(btrim(label)) between 1 and 300),
  category text not null default 'biologie' check (category in ('biologie', 'imagerie', 'autre')),
  status text not null default 'demande' check (status in ('demande', 'resultat', 'revu', 'annule')),
  requested_at timestamptz not null default now(),
  result_at timestamptz,
  result_by uuid references public.profiles(id),
  result_comment text check (result_comment is null or char_length(result_comment) <= 2000),
  result_file_path text,
  result_file_name text,
  result_file_mime text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exam_orders_patient_idx on public.exam_orders (patient_id, requested_at desc);
create index if not exists exam_orders_cabinet_status_idx on public.exam_orders (cabinet_id, status);
create index if not exists exam_orders_encounter_idx on public.exam_orders (encounter_id);

create or replace function public.exam_orders_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists exam_orders_touch_updated_at on public.exam_orders;
create trigger exam_orders_touch_updated_at
  before update on public.exam_orders
  for each row execute function public.exam_orders_touch_updated_at();

alter table public.exam_orders enable row level security;

drop policy if exists exam_orders_select on public.exam_orders;
create policy exam_orders_select on public.exam_orders
  for select to authenticated
  using (cabinet_id = public.get_user_cabinet_id());

revoke all on public.exam_orders from public, anon, authenticated;
grant select on public.exam_orders to authenticated;

-- ---- helpers ----

-- Imaging vs lab, from the label (the consultation picker stores free text).
create or replace function public.mm_exam_category(p_label text)
returns text language sql immutable as $$
  select case
    when p_label ~* '(radio|rx\M|[ée]cho|irm|scanner|tdm|mammo|doppler|imagerie|ost[ée]odensit|panoramique)' then 'imagerie'
    when p_label ~* '(ecg|[ée]lectrocardio|eeg|emg|holter|spirom|efr|fond d.?oeil|audiogram|endoscop|fibroscop|coloscop)' then 'autre'
    else 'biologie'
  end;
$$;

-- The row, locked, after checking it belongs to the caller's clinic.
create or replace function public.mm_exam_lock(p_id uuid)
returns public.exam_orders
language plpgsql security definer set search_path = public as $$
declare
  v_row public.exam_orders%rowtype;
begin
  select * into v_row from public.exam_orders where id = p_id for update;
  if not found or v_row.cabinet_id is distinct from public.get_user_cabinet_id() then
    raise exception 'exam not found';
  end if;
  return v_row;
end;
$$;
revoke all on function public.mm_exam_lock(uuid) from public, anon, authenticated;

-- ---- creation from a completed consultation ----

create or replace function public.mm_exams_from_encounter(p_encounter_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_enc public.clinical_encounters%rowtype;
  v_label text;
  v_count integer := 0;
begin
  select * into v_enc from public.clinical_encounters where id = p_encounter_id;
  if not found or v_enc.status is distinct from 'completed' then return 0; end if;
  if exists (select 1 from public.exam_orders where encounter_id = p_encounter_id) then return 0; end if;
  if jsonb_typeof(v_enc.note -> 'examens') is distinct from 'array' then return 0; end if;

  for v_label in
    select distinct on (lower(btrim(x))) btrim(x)
    from jsonb_array_elements_text(v_enc.note -> 'examens') as x
    where btrim(x) <> ''
    limit 30
  loop
    insert into public.exam_orders (cabinet_id, patient_id, encounter_id, ordered_by, label, category, requested_at)
    values (v_enc.clinic_id, v_enc.patient_id, v_enc.id, v_enc.doctor_id, left(v_label, 300),
            public.mm_exam_category(v_label), coalesce(v_enc.completed_at, now()));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.mm_exams_from_encounter(uuid) from public, anon, authenticated;

create or replace function public.trg_encounter_completed_creates_exams()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.mm_exams_from_encounter(new.id);
  return new;
end;
$$;

drop trigger if exists trg_encounter_completed_creates_exams on public.clinical_encounters;
create trigger trg_encounter_completed_creates_exams
  after update of status on public.clinical_encounters
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.trg_encounter_completed_creates_exams();

-- ---- client actions ----

-- Add exams outside a consultation (e.g. a phoned-in request). Doctor/admin.
create or replace function public.mm_exam_create(p_patient_id uuid, p_labels text[])
returns setof public.exam_orders
language plpgsql security definer set search_path = public as $$
declare
  v_cabinet uuid := public.get_user_cabinet_id();
  v_label text;
  v_row public.exam_orders%rowtype;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);
  if not exists (select 1 from public.patients where id = p_patient_id and cabinet_id = v_cabinet) then
    raise exception 'patient not found';
  end if;
  if p_labels is null or coalesce(array_length(p_labels, 1), 0) = 0 or array_length(p_labels, 1) > 30 then
    raise exception 'invalid labels';
  end if;
  foreach v_label in array p_labels loop
    if btrim(coalesce(v_label, '')) = '' then continue; end if;
    insert into public.exam_orders (cabinet_id, patient_id, ordered_by, label, category)
    values (v_cabinet, p_patient_id, auth.uid(), left(btrim(v_label), 300), public.mm_exam_category(v_label))
    returning * into v_row;
    perform public.write_audit_log('EXAM_REQUESTED', 'exam_order', v_row.id, null, to_jsonb(v_row), null);
    return next v_row;
  end loop;
end;
$$;

-- Attach (or replace) the result. Any clinic member: results often arrive at reception.
-- The file, when there is one, must already be uploaded under <cabinet>/<patient>/<exam>/.
create or replace function public.mm_exam_attach_result(
  p_id uuid, p_file_path text default null, p_file_name text default null,
  p_file_mime text default null, p_comment text default null
)
returns public.exam_orders
language plpgsql security definer set search_path = public as $$
declare
  v_row public.exam_orders%rowtype;
  v_before jsonb;
begin
  perform public.mm_assert_role(array['doctor', 'secretary', 'admin']);
  v_row := public.mm_exam_lock(p_id);
  if v_row.status = 'annule' then raise exception 'exam cancelled'; end if;
  if nullif(btrim(coalesce(p_file_path, '')), '') is null and nullif(btrim(coalesce(p_comment, '')), '') is null then
    raise exception 'empty result';
  end if;
  if p_file_path is not null
     and p_file_path not like (v_row.cabinet_id::text || '/' || v_row.patient_id::text || '/' || v_row.id::text || '/%') then
    raise exception 'invalid file path';
  end if;
  if p_file_mime is not null and p_file_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception 'invalid file type';
  end if;

  v_before := to_jsonb(v_row);
  update public.exam_orders
  set status = 'resultat',
      result_at = now(),
      result_by = auth.uid(),
      result_comment = nullif(btrim(coalesce(p_comment, '')), ''),
      result_file_path = coalesce(nullif(btrim(coalesce(p_file_path, '')), ''), result_file_path),
      result_file_name = case when nullif(btrim(coalesce(p_file_path, '')), '') is not null then left(p_file_name, 200) else result_file_name end,
      result_file_mime = case when nullif(btrim(coalesce(p_file_path, '')), '') is not null then p_file_mime else result_file_mime end,
      reviewed_at = null, reviewed_by = null, review_note = null
  where id = p_id
  returning * into v_row;
  perform public.write_audit_log('EXAM_RESULT_ATTACHED', 'exam_order', v_row.id, v_before, to_jsonb(v_row), null);
  return v_row;
end;
$$;

-- The doctor has read the result. Doctor/admin only.
create or replace function public.mm_exam_review(p_id uuid, p_note text default null)
returns public.exam_orders
language plpgsql security definer set search_path = public as $$
declare
  v_row public.exam_orders%rowtype;
  v_before jsonb;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);
  v_row := public.mm_exam_lock(p_id);
  if v_row.status <> 'resultat' then raise exception 'no result to review'; end if;
  v_before := to_jsonb(v_row);
  update public.exam_orders
  set status = 'revu', reviewed_at = now(), reviewed_by = auth.uid(),
      review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id
  returning * into v_row;
  perform public.write_audit_log('EXAM_RESULT_REVIEWED', 'exam_order', v_row.id, v_before, to_jsonb(v_row), null);
  return v_row;
end;
$$;

-- No longer needed. Doctor/admin only; a result already attached stays in the record.
create or replace function public.mm_exam_cancel(p_id uuid)
returns public.exam_orders
language plpgsql security definer set search_path = public as $$
declare
  v_row public.exam_orders%rowtype;
  v_before jsonb;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);
  v_row := public.mm_exam_lock(p_id);
  if v_row.status <> 'demande' then raise exception 'exam not pending'; end if;
  v_before := to_jsonb(v_row);
  update public.exam_orders
  set status = 'annule', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_id
  returning * into v_row;
  perform public.write_audit_log('EXAM_CANCELLED', 'exam_order', v_row.id, v_before, to_jsonb(v_row), null);
  return v_row;
end;
$$;

revoke all on function public.mm_exam_create(uuid, text[]) from public, anon;
revoke all on function public.mm_exam_attach_result(uuid, text, text, text, text) from public, anon;
revoke all on function public.mm_exam_review(uuid, text) from public, anon;
revoke all on function public.mm_exam_cancel(uuid) from public, anon;
grant execute on function public.mm_exam_create(uuid, text[]) to authenticated;
grant execute on function public.mm_exam_attach_result(uuid, text, text, text, text) to authenticated;
grant execute on function public.mm_exam_review(uuid, text) to authenticated;
grant execute on function public.mm_exam_cancel(uuid) to authenticated;

-- ---- result files: private bucket, one folder per clinic ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-results', 'exam-results', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exam_results_read on storage.objects;
create policy exam_results_read on storage.objects
  for select to authenticated
  using (bucket_id = 'exam-results' and (storage.foldername(name))[1] = public.get_user_cabinet_id()::text);

drop policy if exists exam_results_upload on storage.objects;
create policy exam_results_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'exam-results'
    and (storage.foldername(name))[1] = public.get_user_cabinet_id()::text
    and exists (
      select 1 from public.exam_orders e
      where e.id::text = (storage.foldername(name))[3]
        and e.patient_id::text = (storage.foldername(name))[2]
        and e.cabinet_id = public.get_user_cabinet_id()
    )
  );

-- Only the uploader can remove a file (cleanup when attaching the result failed).
drop policy if exists exam_results_delete_own on storage.objects;
create policy exam_results_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'exam-results' and owner = auth.uid());

-- ---- back-fill: exams already prescribed in completed consultations ----
do $$
declare
  v_id uuid;
  v_total integer := 0;
begin
  for v_id in
    select e.id from public.clinical_encounters e
    where e.status = 'completed'
      and jsonb_typeof(e.note -> 'examens') = 'array'
      and jsonb_array_length(e.note -> 'examens') > 0
      and not exists (select 1 from public.exam_orders o where o.encounter_id = e.id)
    order by e.completed_at
  loop
    v_total := v_total + public.mm_exams_from_encounter(v_id);
  end loop;
  raise notice 'created % exam(s) from completed consultations', v_total;
end;
$$;

notify pgrst, 'reload schema';
