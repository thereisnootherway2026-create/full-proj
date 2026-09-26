-- Vitals: impossible values, new measures.
--
-- 1. patient_vitals gets two new measures:
--      fr          smallint  respiratory rate (/min)
--      douleur_eva smallint  pain score, 0-10
--    Capillary glycaemia already exists as patient_vitals.blood_sugar
--    (numeric(5,2), g/L, 20260827040000), so no glycemie_gl column is added;
--    blood_sugar is reused.
--
-- 2. CHECK constraints with the ABSOLUTE bounds (physically impossible values),
--    identical to src/lib/vitals/validateVital.ts `ABSOLUTE`:
--      SpO2 50-100 % | poids 0.3-350 kg | taille 30-250 cm | T 25-45 °C
--      FC 20-300 | TA sys 50-300, dia 20-200, sys > dia | glycémie 0.1-8 g/L
--      FR 4-80 | EVA 0-10
--    All are added NOT VALID: existing rows (including test data such as SpO2 9,
--    poids 7, taille 20) are NOT checked and NOT modified; only new writes are.
--    TO VALIDATE WITH A PHYSICIAN.
--
-- 3. mm_complete_encounter (latest body: 20260919030000) is re-created with the
--    same signature and behaviour, except the vitals block:
--      * the new absolute bounds (stricter than before: SpO2 >= 50, poids <= 350,
--        taille 30-250, systolique >= 50) and systolique > diastolique;
--      * respiratoryRate / bloodSugar / painScore are parsed, bounded and stored;
--      * note.pregnancyStatus, when present, must be a known value.
--    Everything after the vitals insert (workflow hand-off, audit) is unchanged.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, constraints guarded by pg_constraint,
-- CREATE OR REPLACE with an unchanged signature.

alter table public.patient_vitals
  add column if not exists fr smallint,
  add column if not exists douleur_eva smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_spo2_abs') then
    alter table public.patient_vitals add constraint patient_vitals_spo2_abs
      check (spo2 is null or spo2 between 50 and 100) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_weight_abs') then
    alter table public.patient_vitals add constraint patient_vitals_weight_abs
      check (weight is null or weight between 0.3 and 350) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_height_abs') then
    alter table public.patient_vitals add constraint patient_vitals_height_abs
      check (height is null or height between 30 and 250) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_temperature_abs') then
    alter table public.patient_vitals add constraint patient_vitals_temperature_abs
      check (temperature is null or temperature between 25 and 45) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_heart_rate_abs') then
    alter table public.patient_vitals add constraint patient_vitals_heart_rate_abs
      check (heart_rate is null or heart_rate between 20 and 300) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_blood_sugar_abs') then
    alter table public.patient_vitals add constraint patient_vitals_blood_sugar_abs
      check (blood_sugar is null or blood_sugar between 0.1 and 8) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_fr_abs') then
    alter table public.patient_vitals add constraint patient_vitals_fr_abs
      check (fr is null or fr between 4 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_douleur_eva_abs') then
    alter table public.patient_vitals add constraint patient_vitals_douleur_eva_abs
      check (douleur_eva is null or douleur_eva between 0 and 10) not valid;
  end if;
  -- blood_pressure is stored as text "sys/dia" (mm_complete_encounter writes int/int).
  -- The CASE guards the casts: anything not shaped like "120/80" fails the check.
  if not exists (select 1 from pg_constraint where conname = 'patient_vitals_blood_pressure_abs') then
    alter table public.patient_vitals add constraint patient_vitals_blood_pressure_abs
      check (
        blood_pressure is null
        or case
             when blood_pressure ~ '^\d{2,3}/\d{2,3}$' then
               split_part(blood_pressure, '/', 1)::int between 50 and 300
               and split_part(blood_pressure, '/', 2)::int between 20 and 200
               and split_part(blood_pressure, '/', 1)::int > split_part(blood_pressure, '/', 2)::int
             else false
           end
      ) not valid;
  end if;
end $$;

create or replace function public.mm_complete_encounter(
  p_id uuid,
  p_note jsonb,
  p_expected_version integer,
  p_billing_amount numeric default null,
  p_billing_type text default 'cash'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_encounters%rowtype;
  v_vit jsonb;
  v_sys numeric; v_dia numeric; v_hr numeric; v_temp numeric; v_spo2 numeric; v_w numeric; v_h numeric;
  v_fr numeric; v_gly numeric; v_eva numeric;
  v_any boolean;
  v_raw text;
  v_amount numeric := coalesce(p_billing_amount, 0);
  v_visit public.visits%rowtype;
  v_have_visit boolean := false;
  v_next text;
  v_pay_status text;
  v_pay_method text;
  v_handoff text := 'none';
  v_visit_before jsonb;
  v_qn integer;
  v_rdv uuid;
begin
  perform public.mm_assert_role(array['doctor']);

  if p_note is null or jsonb_typeof(p_note) is distinct from 'object' then
    raise exception 'invalid note';
  end if;
  if pg_column_size(p_note) > 200000 then raise exception 'note too large'; end if;
  if p_billing_type is null or p_billing_type not in ('cash', 'insurance', 'package', 'free') then
    raise exception 'invalid billing type';
  end if;
  if v_amount < 0 or v_amount > 1000000 then raise exception 'invalid billing amount'; end if;

  select * into v_row from public.clinical_encounters where id = p_id for update;
  if not found then raise exception 'encounter not found'; end if;
  perform public.mm_assert_same_clinic(v_row.clinic_id);
  if v_row.doctor_id is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if v_row.status is distinct from 'draft' then raise exception 'encounter is not editable'; end if;
  if v_row.version is distinct from p_expected_version then raise exception 'version conflict'; end if;

  if btrim(coalesce(p_note->>'motif', '')) = '' then raise exception 'motif required'; end if;

  if btrim(coalesce(p_note->>'pregnancyStatus', '')) <> ''
     and p_note->>'pregnancyStatus' not in ('non', 'oui', 'allaitement', 'inconnu') then
    raise exception 'invalid note';
  end if;

  v_vit := case when jsonb_typeof(p_note->'vitals') = 'object' then p_note->'vitals' else '{}'::jsonb end;

  v_sys  := public.mm__parse_num(v_vit->>'bloodPressureSystolic');
  v_dia  := public.mm__parse_num(v_vit->>'bloodPressureDiastolic');
  v_hr   := public.mm__parse_num(v_vit->>'heartRate');
  v_temp := public.mm__parse_num(v_vit->>'temperature');
  v_spo2 := public.mm__parse_num(v_vit->>'oxygenSaturation');
  v_w    := public.mm__parse_num(v_vit->>'weight');
  v_h    := public.mm__parse_num(v_vit->>'height');
  v_fr   := public.mm__parse_num(v_vit->>'respiratoryRate');
  v_gly  := public.mm__parse_num(v_vit->>'bloodSugar');
  v_eva  := public.mm__parse_num(v_vit->>'painScore');

  -- A vital that was typed but is malformed or impossible is rejected rather
  -- than silently dropped from the medical record. Bounds = ABSOLUTE bounds of
  -- src/lib/vitals/validateVital.ts (TO VALIDATE WITH A PHYSICIAN).
  foreach v_raw in array array['bloodPressureSystolic','bloodPressureDiastolic','heartRate','temperature','oxygenSaturation','weight','height','respiratoryRate','bloodSugar','painScore'] loop
    if btrim(coalesce(v_vit->>v_raw, '')) <> ''
       and public.mm__parse_num(v_vit->>v_raw) is null then
      raise exception 'invalid vitals';
    end if;
  end loop;
  if (v_sys is not null and (v_sys < 50 or v_sys > 300))
     or (v_dia is not null and (v_dia < 20 or v_dia > 200))
     or (v_hr is not null and (v_hr < 20 or v_hr > 300))
     or (v_temp is not null and (v_temp < 25 or v_temp > 45))
     or (v_spo2 is not null and (v_spo2 < 50 or v_spo2 > 100))
     or (v_w is not null and (v_w < 0.3 or v_w > 350))
     or (v_h is not null and (v_h < 30 or v_h > 250))
     or (v_fr is not null and (v_fr < 4 or v_fr > 80))
     or (v_gly is not null and (v_gly < 0.1 or v_gly > 8))
     or (v_eva is not null and (v_eva < 0 or v_eva > 10 or v_eva <> trunc(v_eva))) then
    raise exception 'invalid vitals';
  end if;
  if (v_sys is null) is distinct from (v_dia is null) then
    raise exception 'invalid vitals';
  end if;
  if v_sys is not null and round(v_sys) <= round(v_dia) then
    raise exception 'invalid vitals';
  end if;

  update public.clinical_encounters
  set note = p_note, status = 'completed', completed_at = now(),
      version = version + 1, updated_at = now()
  where id = p_id
  returning * into v_row;

  v_any := v_sys is not null or v_hr is not null or v_temp is not null
           or v_spo2 is not null or v_w is not null or v_h is not null
           or v_fr is not null or v_gly is not null or v_eva is not null;
  if v_any then
    insert into public.patient_vitals (
      patient_id, cabinet_id, date_mesure, blood_pressure, heart_rate,
      temperature, spo2, weight, height, fr, blood_sugar, douleur_eva, created_by
    ) values (
      v_row.patient_id, v_row.clinic_id, now(),
      case when v_sys is not null then round(v_sys)::int || '/' || round(v_dia)::int end,
      round(v_hr)::int, round(v_temp, 1), round(v_spo2)::int, round(v_w, 1), round(v_h, 1),
      round(v_fr)::smallint, round(v_gly, 2), round(v_eva)::smallint,
      auth.uid()
    );
  end if;

  -- ---- workflow hand-off (IN_CONSULTATION -> TO_BE_PAID) — unchanged ----
  if v_row.visit_id is not null then
    select * into v_visit from public.visits where id = v_row.visit_id for update;
    v_have_visit := found;
  elsif v_row.rdv_id is not null then
    select * into v_visit from public.visits
     where rdv_id = v_row.rdv_id and status <> 'cancelled'
     order by created_at desc limit 1 for update;
    v_have_visit := found;
  end if;

  if not v_have_visit and v_row.rdv_id is not null then
    v_qn := public.mm_next_queue_number(v_row.clinic_id, auth.uid(), current_date);
    insert into public.visits (
      clinic_id, patient_id, rdv_id, source, doctor_id, status,
      queue_date, queue_number, queue_sort_at, queued_at, waiting_at,
      consultation_start_at, created_by, updated_by
    ) values (
      v_row.clinic_id, v_row.patient_id, v_row.rdv_id, 'appointment', auth.uid(), 'consultation',
      current_date, v_qn, v_row.started_at, v_row.started_at, v_row.started_at,
      v_row.started_at, auth.uid(), auth.uid()
    )
    returning * into v_visit;
    v_have_visit := true;
  end if;

  if v_have_visit
     and v_visit.status in ('waiting', 'called', 'consultation')
     and (v_visit.doctor_id is not distinct from auth.uid() or public.is_admin()) then

    v_visit_before := to_jsonb(v_visit);

    if p_billing_type in ('cash', 'insurance') and v_amount > 0 then
      v_next := 'billing';
      v_pay_status := 'pending';
      v_pay_method := case when p_billing_type = 'insurance' then 'insurance' else null end;
    else
      v_next := 'completed';
      v_pay_status := 'waived';
      v_pay_method := p_billing_type;
    end if;

    update public.visits
    set status = v_next,
        consultation_start_at = coalesce(consultation_start_at, v_row.started_at),
        consultation_end_at = now(),
        billing_at = case when v_next = 'billing' then now() else billing_at end,
        completed_at = case when v_next = 'completed' then now() else completed_at end,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_visit.id
    returning * into v_visit;

    insert into public.payments (
      clinic_id, visit_id, patient_id, amount, method, status, received_by, paid_at
    ) values (
      v_visit.clinic_id, v_visit.id, v_visit.patient_id, v_amount, v_pay_method, v_pay_status,
      case when v_pay_status = 'waived' then auth.uid() end,
      case when v_pay_status = 'waived' then now() end
    )
    on conflict (visit_id) where status in ('pending', 'paid', 'waived')
    do update set amount = excluded.amount, method = excluded.method,
                  status = excluded.status, updated_at = now()
    where public.payments.status = 'pending';

    v_rdv := coalesce(v_visit.rdv_id, v_row.rdv_id);
    if v_rdv is not null then
      update public.rdv
      set arrival_status = 'LEFT',
          status = 'completed',
          consultation_completed_at = now(),
          payment_status = case when v_next = 'billing' then 'UNPAID' else 'NOT_REQUIRED' end
      where id = v_rdv and cabinet_id = v_visit.clinic_id;
    end if;

    perform public.write_audit_log(
      case when v_next = 'billing' then 'PATIENT_READY_FOR_PAYMENT' else 'VISIT_COMPLETED_NO_PAYMENT_REQUIRED' end,
      'visit', v_visit.id, v_visit_before, to_jsonb(v_visit),
      jsonb_build_object('billing_type', p_billing_type, 'amount', v_amount, 'encounter_id', v_row.id)
    );
    v_handoff := v_next;
  end if;

  perform public.write_audit_log(
    'ENCOUNTER_COMPLETED', 'clinical_encounter', v_row.id, null,
    jsonb_build_object('status', v_row.status, 'version', v_row.version, 'patient_id', v_row.patient_id, 'handoff', v_handoff),
    null
  );

  return jsonb_build_object('encounter', to_jsonb(v_row), 'handoff', v_handoff, 'visit_id', case when v_have_visit then v_visit.id end);
end;
$$;

revoke all on function public.mm_complete_encounter(uuid, jsonb, integer, numeric, text) from public, anon;
grant execute on function public.mm_complete_encounter(uuid, jsonb, integer, numeric, text) to authenticated;
