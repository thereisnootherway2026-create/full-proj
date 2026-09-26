-- Ordonnances (prescriptions): dedicated tables, RPCs, and RLS.
-- documents stays artifact-only (ordonnances.document_id links to it when a file is ever produced).
-- Legacy `consultations` table and `documents.consultation_id` are untouched.

create table if not exists public.ordonnances (
  id uuid primary key default gen_random_uuid(),
  cabinet_id uuid not null references public.cabinets(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  doctor_id uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id) default auth.uid(),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'emise', 'annulee')),
  date_prescription date not null default current_date,
  entete jsonb not null default '{}'::jsonb,
  instructions text,
  document_id uuid references public.documents(id) on delete set null,
  emitted_at timestamptz,
  emitted_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ordonnances_cabinet_id_idx on public.ordonnances(cabinet_id);
create index if not exists ordonnances_patient_id_idx on public.ordonnances(patient_id);
create index if not exists ordonnances_encounter_id_idx on public.ordonnances(encounter_id);
create index if not exists ordonnances_statut_idx on public.ordonnances(statut);

create table if not exists public.ordonnance_lignes (
  id uuid primary key default gen_random_uuid(),
  ordonnance_id uuid not null references public.ordonnances(id) on delete cascade,
  ordre int not null default 0,
  medicament text not null,
  posologie text,
  duree text,
  created_at timestamptz not null default now()
);

create index if not exists ordonnance_lignes_ordonnance_id_idx on public.ordonnance_lignes(ordonnance_id);

create or replace function public.ordonnances_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ordonnances_touch_updated_at on public.ordonnances;
create trigger ordonnances_touch_updated_at
  before update on public.ordonnances
  for each row execute function public.ordonnances_set_updated_at();

alter table public.ordonnances enable row level security;
alter table public.ordonnance_lignes enable row level security;

-- Tenant isolation (same convention as documents_tenant_isolation).
drop policy if exists ordonnances_tenant_isolation on public.ordonnances;
create policy ordonnances_tenant_isolation on public.ordonnances
  for all to authenticated
  using (cabinet_id = public.get_user_cabinet_id())
  with check (cabinet_id = public.get_user_cabinet_id());

-- Doctor-only emission boundary (same shape as documents_clinical_boundary, scoped to emitted rows
-- instead of the whole type so secretaries can still create/edit drafts).
drop policy if exists ordonnances_emission_boundary on public.ordonnances;
create policy ordonnances_emission_boundary on public.ordonnances as restrictive
  for all to authenticated
  using (
    public.is_admin() or public.current_role() = 'doctor' or statut is distinct from 'emise'
  )
  with check (
    public.is_admin() or public.current_role() = 'doctor' or statut is distinct from 'emise'
  );

drop policy if exists ordonnance_lignes_tenant_isolation on public.ordonnance_lignes;
create policy ordonnance_lignes_tenant_isolation on public.ordonnance_lignes
  for all to authenticated
  using (
    exists (
      select 1 from public.ordonnances o
      where o.id = ordonnance_lignes.ordonnance_id
        and o.cabinet_id = public.get_user_cabinet_id()
    )
  )
  with check (
    exists (
      select 1 from public.ordonnances o
      where o.id = ordonnance_lignes.ordonnance_id
        and o.cabinet_id = public.get_user_cabinet_id()
    )
  );

drop policy if exists ordonnance_lignes_emission_boundary on public.ordonnance_lignes;
create policy ordonnance_lignes_emission_boundary on public.ordonnance_lignes as restrictive
  for all to authenticated
  using (
    public.is_admin() or public.current_role() = 'doctor'
    or exists (
      select 1 from public.ordonnances o
      where o.id = ordonnance_lignes.ordonnance_id and o.statut is distinct from 'emise'
    )
  )
  with check (
    public.is_admin() or public.current_role() = 'doctor'
    or exists (
      select 1 from public.ordonnances o
      where o.id = ordonnance_lignes.ordonnance_id and o.statut is distinct from 'emise'
    )
  );

-- mm_create_ordonnance: any clinic member (doctor/secretary/admin) can create a draft.
create or replace function public.mm_create_ordonnance(
  p_patient_id uuid,
  p_doctor_id uuid,
  p_encounter_id uuid default null,
  p_date_prescription date default current_date,
  p_entete jsonb default '{}'::jsonb,
  p_instructions text default null,
  p_lignes jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_ordonnance_id uuid;
  v_ligne jsonb;
  v_ordre int := 0;
begin
  perform public.mm_assert_role(array['doctor', 'secretary', 'admin']);

  if not exists (
    select 1 from public.patients where id = p_patient_id and cabinet_id = v_cabinet_id
  ) then
    raise exception 'patient not found in current clinic';
  end if;

  if p_encounter_id is not null and not exists (
    select 1 from public.clinical_encounters where id = p_encounter_id and patient_id = p_patient_id
  ) then
    raise exception 'encounter does not match patient';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_doctor_id and cabinet_id = v_cabinet_id and public.mm_role_key(role) = 'doctor'
  ) then
    raise exception 'doctor not found in current clinic';
  end if;

  insert into public.ordonnances (
    cabinet_id, patient_id, encounter_id, doctor_id, created_by,
    date_prescription, entete, instructions
  ) values (
    v_cabinet_id, p_patient_id, p_encounter_id, p_doctor_id, auth.uid(),
    coalesce(p_date_prescription, current_date), coalesce(p_entete, '{}'::jsonb), p_instructions
  )
  returning id into v_ordonnance_id;

  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb))
  loop
    insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree)
    values (
      v_ordonnance_id, v_ordre,
      v_ligne->>'medicament', v_ligne->>'posologie', v_ligne->>'duree'
    );
    v_ordre := v_ordre + 1;
  end loop;

  perform public.write_audit_log(
    'ORDONNANCE_CREATED', 'ordonnance', v_ordonnance_id, null,
    jsonb_build_object('patient_id', p_patient_id, 'statut', 'brouillon'), null
  );

  return v_ordonnance_id;
end;
$$;

-- mm_update_ordonnance: editable only while still a draft.
create or replace function public.mm_update_ordonnance(
  p_id uuid,
  p_doctor_id uuid default null,
  p_encounter_id uuid default null,
  p_date_prescription date default null,
  p_entete jsonb default null,
  p_instructions text default null,
  p_lignes jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_ordonnance public.ordonnances%rowtype;
  v_ligne jsonb;
  v_ordre int := 0;
begin
  perform public.mm_assert_role(array['doctor', 'secretary', 'admin']);

  select * into v_ordonnance from public.ordonnances where id = p_id;
  if not found or v_ordonnance.cabinet_id <> v_cabinet_id then
    raise exception 'ordonnance not found';
  end if;
  if v_ordonnance.statut <> 'brouillon' then
    raise exception 'only draft ordonnances can be edited';
  end if;

  if p_doctor_id is not null and not exists (
    select 1 from public.profiles
    where id = p_doctor_id and cabinet_id = v_cabinet_id and public.mm_role_key(role) = 'doctor'
  ) then
    raise exception 'doctor not found in current clinic';
  end if;

  if p_encounter_id is not null and not exists (
    select 1 from public.clinical_encounters where id = p_encounter_id and patient_id = v_ordonnance.patient_id
  ) then
    raise exception 'encounter does not match patient';
  end if;

  update public.ordonnances set
    doctor_id = coalesce(p_doctor_id, doctor_id),
    encounter_id = coalesce(p_encounter_id, encounter_id),
    date_prescription = coalesce(p_date_prescription, date_prescription),
    entete = coalesce(p_entete, entete),
    instructions = coalesce(p_instructions, instructions)
  where id = p_id;

  if p_lignes is not null then
    delete from public.ordonnance_lignes where ordonnance_id = p_id;
    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
      insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree)
      values (
        p_id, v_ordre,
        v_ligne->>'medicament', v_ligne->>'posologie', v_ligne->>'duree'
      );
      v_ordre := v_ordre + 1;
    end loop;
  end if;
end;
$$;

-- mm_emit_ordonnance: doctor/admin only, one-way brouillon -> emise.
create or replace function public.mm_emit_ordonnance(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_ordonnance public.ordonnances%rowtype;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'security', p_id, null, null,
      jsonb_build_object('action', 'mm_emit_ordonnance', 'actual_role', public.current_role())
    );
    raise exception 'not authorized';
  end if;

  select * into v_ordonnance from public.ordonnances where id = p_id;
  if not found or v_ordonnance.cabinet_id <> v_cabinet_id then
    raise exception 'ordonnance not found';
  end if;
  if v_ordonnance.statut <> 'brouillon' then
    raise exception 'only draft ordonnances can be emitted';
  end if;

  update public.ordonnances
  set statut = 'emise', emitted_at = now(), emitted_by = auth.uid()
  where id = p_id;

  perform public.write_audit_log(
    'ORDONNANCE_EMITTED', 'ordonnance', p_id,
    jsonb_build_object('statut', 'brouillon'), jsonb_build_object('statut', 'emise'), null
  );
end;
$$;

-- mm_cancel_ordonnance: doctor/admin only, from any non-cancelled state.
create or replace function public.mm_cancel_ordonnance(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_ordonnance public.ordonnances%rowtype;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'security', p_id, null, null,
      jsonb_build_object('action', 'mm_cancel_ordonnance', 'actual_role', public.current_role())
    );
    raise exception 'not authorized';
  end if;

  select * into v_ordonnance from public.ordonnances where id = p_id;
  if not found or v_ordonnance.cabinet_id <> v_cabinet_id then
    raise exception 'ordonnance not found';
  end if;
  if v_ordonnance.statut = 'annulee' then
    raise exception 'ordonnance already cancelled';
  end if;

  update public.ordonnances
  set statut = 'annulee', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_id;

  perform public.write_audit_log(
    'ORDONNANCE_CANCELLED', 'ordonnance', p_id,
    jsonb_build_object('statut', v_ordonnance.statut), jsonb_build_object('statut', 'annulee'), null
  );
end;
$$;

-- mm_duplicate_ordonnance: any clinic member, always produces a fresh draft.
create or replace function public.mm_duplicate_ordonnance(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_source public.ordonnances%rowtype;
  v_new_id uuid;
begin
  perform public.mm_assert_role(array['doctor', 'secretary', 'admin']);

  select * into v_source from public.ordonnances where id = p_id;
  if not found or v_source.cabinet_id <> v_cabinet_id then
    raise exception 'ordonnance not found';
  end if;

  insert into public.ordonnances (
    cabinet_id, patient_id, encounter_id, doctor_id, created_by,
    date_prescription, entete, instructions
  ) values (
    v_source.cabinet_id, v_source.patient_id, v_source.encounter_id, v_source.doctor_id, auth.uid(),
    current_date, v_source.entete, v_source.instructions
  )
  returning id into v_new_id;

  insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree)
  select v_new_id, ordre, medicament, posologie, duree
  from public.ordonnance_lignes
  where ordonnance_id = p_id
  order by ordre;

  perform public.write_audit_log(
    'ORDONNANCE_DUPLICATED', 'ordonnance', v_new_id, null,
    jsonb_build_object('source_id', p_id), null
  );

  return v_new_id;
end;
$$;

grant execute on function public.mm_create_ordonnance(uuid, uuid, uuid, date, jsonb, text, jsonb) to authenticated;
grant execute on function public.mm_update_ordonnance(uuid, uuid, uuid, date, jsonb, text, jsonb) to authenticated;
grant execute on function public.mm_emit_ordonnance(uuid) to authenticated;
grant execute on function public.mm_cancel_ordonnance(uuid) to authenticated;
grant execute on function public.mm_duplicate_ordonnance(uuid) to authenticated;
