-- Agenda: real appointment durations, consultation types, per-cabinet agenda
-- settings, and database-enforced overlap protection.
--
-- Decisions (audit of 2026-09-23, live data checked read-only before writing):
--
-- * Overlap scope is PER CABINET. rdv has no doctor column, and the product has
--   no path that creates a second doctor in a cabinet (mm_create_invitation only
--   accepts 'secretary'; every doctor signup creates its own cabinet). Live check:
--   23 cabinets have a doctor profile; 3 show two "doctor" profiles, but none of
--   those second profiles is the clinic owner or has ever been a visit's doctor —
--   two are the clinic's own secretary (clinics.secretary_id, accepted secretary
--   invitation) whose role now reads 'docteur', the third has no invitation and a
--   cabinet with no appointments. Not real second practitioners, so per-cabinet
--   checking is correct; those role values are a separate data issue, not fixed
--   here. When multi-doctor cabinets become a product feature, add
--   rdv.doctor_id NOT NULL and widen the constraint to (cabinet_id, doctor_id, range).
--
-- * Duration lives in rdv.duree_minutes (NOT NULL, default 30 — the same 30 min
--   the 20260827030000 back-fill used for end_time). start_time / end_time are
--   derived from date_rdv + duree_minutes by trigger on EVERY insert/update, so a
--   writer only ever sets date_rdv and duree_minutes and cannot desync the range
--   by writing end_time directly. reschedule_appointment (which only sets
--   date_rdv) therefore moves the whole range with no change to it.
--
-- * Which rows the overlap check covers: status in ('scheduled', 'confirme').
--   'cancelled' and 'no_show' never occupy the agenda. 'completed' is excluded
--   too, deliberately: end_time is the booked estimate, never the actual end, so
--   a consultation finished early (booked 10:00–10:30, done at 09:55) would
--   otherwise keep 10:00–10:30 blocked for the rest of the day — a phantom block
--   against a legitimate new booking. A completed consultation no longer needs
--   the slot. If such a row is ever reopened to 'confirme', it re-enters the
--   check and is validated like any other change.
--
-- * Cutover by APPOINTMENT TIME, not created_at. Live data has 22 overlapping
--   active pairs under 30-min durations, all in the past (and 4 even at 15 min).
--   A created_at cutover (as in rdv_one_active_per_patient_per_day) would leave
--   every already-booked future appointment outside the constraint, so a new
--   booking could overlap it unchecked. Scoping to start_time >= <apply time>
--   covers every appointment from now on, old or new, and leaves only history
--   out. Live check: 0 overlapping active pairs from now on, at 15 or 30 min.
--   The cutover literal is captured at apply time (dynamic DDL below) because a
--   constraint predicate must be immutable.
--
-- * Consultation types move out of the JSON in rdv.notes (__AGENDA_META__) into
--   public.types_consultation, seeded from the durations the booking form
--   already defined but never used (AppointmentFormModal.jsx APPOINTMENT_TYPES).
--   The notes JSON is left untouched so the current frontend keeps working
--   until it reads the new column.
--
-- * New tables follow the actes_catalogue convention (20260922000200): clinic
--   members read through RLS; no direct writes; changes only through
--   SECURITY DEFINER RPCs gated by mm_assert_role(admin, doctor) and audited.
--
-- Safe to re-run: every statement is idempotent (if not exists / on conflict
-- do nothing / drop-if-exists before create).

create extension if not exists btree_gist with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Consultation types (per cabinet)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.types_consultation (
  id uuid primary key default gen_random_uuid(),
  cabinet_id uuid not null references public.cabinets(id) on delete cascade,
  libelle text not null,
  description text,
  duree_minutes integer not null default 30,
  couleur text,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint types_consultation_duree_check check (duree_minutes between 5 and 480),
  constraint types_consultation_libelle_check check (length(btrim(libelle)) between 1 and 80),
  constraint types_consultation_couleur_check check (couleur is null or couleur ~ '^#[0-9a-fA-F]{6}$'),
  -- target of the composite FK from rdv: a type can only be used by its own cabinet
  constraint types_consultation_cabinet_id_id_key unique (cabinet_id, id)
);

-- One name per cabinet (case/space-insensitive), archived ones included — a
-- re-run seed or a duplicate create hits this instead of creating a twin.
create unique index if not exists types_consultation_cabinet_libelle_uniq
  on public.types_consultation (cabinet_id, lower(btrim(libelle)));

alter table public.types_consultation enable row level security;

drop policy if exists types_consultation_select on public.types_consultation;
create policy types_consultation_select on public.types_consultation
  for select to authenticated using (cabinet_id = public.current_clinic_id());

drop policy if exists types_consultation_no_direct_write on public.types_consultation;
create policy types_consultation_no_direct_write on public.types_consultation
  for all to authenticated using (false) with check (false);
revoke insert, update, delete on public.types_consultation from authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Agenda settings (per cabinet)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cabinet_agenda_settings (
  cabinet_id uuid primary key references public.cabinets(id) on delete cascade,
  heure_debut time not null default '08:00',
  heure_fin time not null default '18:00',
  pas_minutes integer not null default 15,           -- agenda grid interval
  duree_defaut_minutes integer not null default 30,  -- when no type is chosen
  pause_debut time,
  pause_fin time,
  jours_ouvres smallint[] not null default '{1,2,3,4,5,6}', -- ISO: 1 = lundi … 7 = dimanche
  updated_at timestamptz not null default now(),
  constraint cabinet_agenda_settings_heures_check check (heure_fin > heure_debut),
  constraint cabinet_agenda_settings_pas_check check (pas_minutes in (5, 10, 15, 20, 30, 60)),
  constraint cabinet_agenda_settings_duree_check check (duree_defaut_minutes between 5 and 480),
  constraint cabinet_agenda_settings_pause_check check (
    (pause_debut is null and pause_fin is null)
    or (pause_debut is not null and pause_fin is not null
        and pause_fin > pause_debut and pause_debut >= heure_debut and pause_fin <= heure_fin)
  ),
  constraint cabinet_agenda_settings_jours_check check (
    cardinality(jours_ouvres) between 1 and 7 and jours_ouvres <@ array[1,2,3,4,5,6,7]::smallint[]
  )
);

alter table public.cabinet_agenda_settings enable row level security;

drop policy if exists cabinet_agenda_settings_select on public.cabinet_agenda_settings;
create policy cabinet_agenda_settings_select on public.cabinet_agenda_settings
  for select to authenticated using (cabinet_id = public.current_clinic_id());

drop policy if exists cabinet_agenda_settings_no_direct_write on public.cabinet_agenda_settings;
create policy cabinet_agenda_settings_no_direct_write on public.cabinet_agenda_settings
  for all to authenticated using (false) with check (false);
revoke insert, update, delete on public.cabinet_agenda_settings from authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Defaults for every cabinet (existing now, and new ones via trigger)
-- ─────────────────────────────────────────────────────────────────────────

-- Idempotent: on conflict do nothing against the name / primary-key uniques,
-- so running it twice (or on a cabinet that already customised its types)
-- never duplicates or overwrites anything.
create or replace function public.mm_seed_cabinet_agenda_defaults(p_cabinet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.types_consultation (cabinet_id, libelle, description, duree_minutes, couleur, ordre)
  values
    (p_cabinet_id, 'Consultation',             'Consultation générale ou examen clinique',     30, '#3b82f6', 1),
    (p_cabinet_id, 'Suivi',                    'Contrôle d’évolution & renouvellement',        20, '#8b5cf6', 2),
    (p_cabinet_id, 'Première consultation',    'Nouveau patient, anamnèse & dossier initial', 45, '#10b981', 3),
    (p_cabinet_id, 'Urgence',                  'Symptômes aigus, prise en charge immédiate',  15, '#ef4444', 4),
    (p_cabinet_id, 'Contrôle post-opératoire', 'Suivi post-opératoire & pansements',          30, '#f59e0b', 5),
    (p_cabinet_id, 'Bilan annuel',             'Check-up préventif complet',                  45, '#0ea5e9', 6)
  on conflict do nothing;

  insert into public.cabinet_agenda_settings (cabinet_id)
  values (p_cabinet_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.mm_seed_cabinet_agenda_defaults(uuid) from public, anon, authenticated;

create or replace function public.trg_cabinet_seed_agenda_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mm_seed_cabinet_agenda_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists trg_cabinet_seed_agenda_defaults on public.cabinets;
create trigger trg_cabinet_seed_agenda_defaults
  after insert on public.cabinets
  for each row execute function public.trg_cabinet_seed_agenda_defaults();

do $$
declare
  v_cab uuid;
begin
  for v_cab in select id from public.cabinets loop
    perform public.mm_seed_cabinet_agenda_defaults(v_cab);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. rdv: duration, type, and a range that can't drift
-- ─────────────────────────────────────────────────────────────────────────

alter table public.rdv add column if not exists duree_minutes integer not null default 30;
alter table public.rdv drop constraint if exists rdv_duree_minutes_check;
alter table public.rdv add constraint rdv_duree_minutes_check check (duree_minutes between 5 and 480);

alter table public.rdv add column if not exists type_consultation_id uuid;
alter table public.rdv drop constraint if exists rdv_type_consultation_fk;
-- Composite FK: the type must belong to the appointment's own cabinet. NO ACTION on
-- delete — types are archived (actif = false), never deleted while referenced.
alter table public.rdv add constraint rdv_type_consultation_fk
  foreign key (cabinet_id, type_consultation_id)
  references public.types_consultation (cabinet_id, id);

create index if not exists rdv_type_consultation_id_idx on public.rdv (type_consultation_id);

create or replace function public.rdv_sync_time_range()
returns trigger
language plpgsql
as $$
begin
  new.start_time := new.date_rdv;
  new.end_time := new.date_rdv + make_interval(mins => new.duree_minutes);
  return new;
end;
$$;

-- No column list on purpose: recomputed on every write, so end_time can never be
-- set independently of date_rdv + duree_minutes.
drop trigger if exists rdv_sync_time_range on public.rdv;
create trigger rdv_sync_time_range
  before insert or update on public.rdv
  for each row execute function public.rdv_sync_time_range();

-- Back-fill: 51 rows have start_time/end_time NULL (everything created after the
-- 20260827 one-off back-fill); the rest get recomputed to the same values.
update public.rdv
set start_time = date_rdv,
    end_time = date_rdv + make_interval(mins => duree_minutes)
where start_time is distinct from date_rdv
   or end_time is distinct from date_rdv + make_interval(mins => duree_minutes);

alter table public.rdv alter column start_time set not null;
alter table public.rdv alter column end_time set not null;

-- Link existing appointments to their type, read from the __AGENDA_META__ JSON in
-- notes. Row by row so one malformed notes value is skipped, not fatal. Duration
-- is NOT changed from the type: these were booked without one, and changing it
-- now could create overlaps that never existed on the agenda.
do $$
declare
  r record;
  v_type text;
begin
  for r in
    select id, cabinet_id, notes from public.rdv
    where type_consultation_id is null and notes like '\_\_AGENDA\_META\_\_%'
  loop
    begin
      v_type := (substr(r.notes, length('__AGENDA_META__') + 1))::jsonb ->> 'type';
    exception when others then
      v_type := null;
    end;
    if v_type is not null then
      update public.rdv
      set type_consultation_id = (
        select t.id from public.types_consultation t
        where t.cabinet_id = r.cabinet_id and lower(btrim(t.libelle)) = lower(btrim(v_type))
      )
      where id = r.id;
    end if;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Overlap protection
-- ─────────────────────────────────────────────────────────────────────────

-- Half-open ranges ('[)'): 09:00–09:30 and 09:30–10:00 touch but don't overlap.
-- A conflicting insert/update fails with SQLSTATE 23P01 (exclusion_violation),
-- naming rdv_no_overlap_per_cabinet.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rdv'::regclass and conname = 'rdv_no_overlap_per_cabinet'
  ) then
    execute format(
      'alter table public.rdv add constraint rdv_no_overlap_per_cabinet
         exclude using gist (cabinet_id with =, tstzrange(start_time, end_time, %L) with &&)
         where (status in (%L, %L) and start_time >= %L::timestamptz)',
      '[)', 'scheduled', 'confirme', now()
    );
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Write RPCs (doctor / admin), same shape as upsert_acte / set_acte_active
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.upsert_type_consultation(
  p_id uuid,
  p_libelle text,
  p_duree_minutes integer,
  p_couleur text default null,
  p_description text default null
)
returns public.types_consultation
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_name text := btrim(coalesce(p_libelle, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_color text := nullif(btrim(coalesce(p_couleur, '')), '');
  v_before public.types_consultation;
  v_row public.types_consultation;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  if v_clinic is null then raise exception 'no clinic for current user'; end if;
  if length(v_name) = 0 or length(v_name) > 80 then raise exception 'invalid type name'; end if;
  if p_duree_minutes is null or p_duree_minutes < 5 or p_duree_minutes > 480 then raise exception 'invalid duration'; end if;
  if v_desc is not null and length(v_desc) > 200 then raise exception 'invalid description'; end if;

  if p_id is null then
    insert into public.types_consultation (cabinet_id, libelle, description, duree_minutes, couleur, ordre)
    values (
      v_clinic, v_name, v_desc, p_duree_minutes, v_color,
      coalesce((select max(ordre) + 1 from public.types_consultation where cabinet_id = v_clinic), 1)
    )
    returning * into v_row;
    perform public.write_audit_log('TYPE_CONSULTATION_CREATED', 'type_consultation', v_row.id, null, to_jsonb(v_row), null);
  else
    select * into v_before from public.types_consultation where id = p_id and cabinet_id = v_clinic for update;
    if not found then raise exception 'type not found'; end if;
    update public.types_consultation
    set libelle = v_name, description = v_desc, duree_minutes = p_duree_minutes, couleur = v_color, updated_at = now()
    where id = p_id
    returning * into v_row;
    perform public.write_audit_log('TYPE_CONSULTATION_UPDATED', 'type_consultation', v_row.id, to_jsonb(v_before), to_jsonb(v_row), null);
  end if;
  return v_row;
end;
$$;

create or replace function public.set_type_consultation_active(p_id uuid, p_actif boolean)
returns public.types_consultation
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_before public.types_consultation;
  v_row public.types_consultation;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  select * into v_before from public.types_consultation where id = p_id and cabinet_id = v_clinic for update;
  if not found then raise exception 'type not found'; end if;
  update public.types_consultation
  set actif = coalesce(p_actif, true), updated_at = now()
  where id = p_id
  returning * into v_row;
  perform public.write_audit_log(
    case when v_row.actif then 'TYPE_CONSULTATION_REACTIVATED' else 'TYPE_CONSULTATION_ARCHIVED' end,
    'type_consultation', v_row.id, to_jsonb(v_before), to_jsonb(v_row), null
  );
  return v_row;
end;
$$;

create or replace function public.upsert_cabinet_agenda_settings(
  p_heure_debut time,
  p_heure_fin time,
  p_pas_minutes integer,
  p_duree_defaut_minutes integer,
  p_pause_debut time default null,
  p_pause_fin time default null,
  p_jours_ouvres smallint[] default '{1,2,3,4,5,6}'
)
returns public.cabinet_agenda_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_before public.cabinet_agenda_settings;
  v_row public.cabinet_agenda_settings;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  if v_clinic is null then raise exception 'no clinic for current user'; end if;

  select * into v_before from public.cabinet_agenda_settings where cabinet_id = v_clinic for update;

  -- Value checks are the table constraints; a bad value raises check_violation.
  insert into public.cabinet_agenda_settings as s (
    cabinet_id, heure_debut, heure_fin, pas_minutes, duree_defaut_minutes, pause_debut, pause_fin, jours_ouvres, updated_at
  ) values (
    v_clinic, p_heure_debut, p_heure_fin, p_pas_minutes, p_duree_defaut_minutes, p_pause_debut, p_pause_fin, p_jours_ouvres, now()
  )
  on conflict (cabinet_id) do update set
    heure_debut = excluded.heure_debut,
    heure_fin = excluded.heure_fin,
    pas_minutes = excluded.pas_minutes,
    duree_defaut_minutes = excluded.duree_defaut_minutes,
    pause_debut = excluded.pause_debut,
    pause_fin = excluded.pause_fin,
    jours_ouvres = excluded.jours_ouvres,
    updated_at = now()
  returning * into v_row;

  perform public.write_audit_log('AGENDA_SETTINGS_UPDATED', 'cabinet_agenda_settings', v_clinic, to_jsonb(v_before), to_jsonb(v_row), null);
  return v_row;
end;
$$;

revoke all on function public.upsert_type_consultation(uuid, text, integer, text, text) from public, anon;
revoke all on function public.set_type_consultation_active(uuid, boolean) from public, anon;
revoke all on function public.upsert_cabinet_agenda_settings(time, time, integer, integer, time, time, smallint[]) from public, anon;
grant execute on function public.upsert_type_consultation(uuid, text, integer, text, text) to authenticated, service_role;
grant execute on function public.set_type_consultation_active(uuid, boolean) to authenticated, service_role;
grant execute on function public.upsert_cabinet_agenda_settings(time, time, integer, integer, time, time, smallint[]) to authenticated, service_role;

notify pgrst, 'reload schema';
