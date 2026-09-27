-- Isolated test fixtures (throwaway local database only): two clinics, each with a doctor and a secretary.
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'docA@test.local'), ('a0000000-0000-4000-8000-000000000002', 'secA@test.local'),
  ('b0000000-0000-4000-8000-000000000001', 'docB@test.local'), ('b0000000-0000-4000-8000-000000000002', 'secB@test.local');
insert into cabinets (id, nom, tenant_id) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'Cabinet A', 'aaaaaaaa-0000-4000-8000-000000000000'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'Cabinet B', 'bbbbbbbb-0000-4000-8000-000000000000');
insert into clinics (id, name, owner_id) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'Cabinet A', 'a0000000-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'Cabinet B', 'b0000000-0000-4000-8000-000000000001')
on conflict (id) do update set owner_id = excluded.owner_id;
insert into profiles (id, cabinet_id, clinic_id, role, nom_complet) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000000', 'docteur', 'Dr A'),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000000', 'secretaire', 'Sec A'),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000000', 'docteur', 'Dr B'),
  ('b0000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000000', 'secretaire', 'Sec B');
-- patients: A1 (AMO), A2 (AMO), B1
insert into patients (id, cabinet_id, nom, prenom, numero_cnss) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000000', 'Alaoui', 'Amine', '123456789'),
  ('a1000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000000', 'Bennani', 'Sara', null),
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000000', 'Chraibi', 'Omar', null);
-- helper: a visit at the cashier with its pending invoice
create or replace function pg_temp.billing_visit(p_visit uuid, p_pay uuid, p_clinic uuid, p_patient uuid, p_doctor uuid, p_amount numeric, p_qn int)
returns void language sql as $$
  insert into visits (id, clinic_id, patient_id, source, doctor_id, status, queue_number) values (p_visit, p_clinic, p_patient, 'walk_in', p_doctor, 'billing', p_qn);
  insert into payments (id, clinic_id, visit_id, patient_id, amount, status) values (p_pay, p_clinic, p_visit, p_patient, p_amount, 'pending');
$$;
