-- PRODUCTION HARDENING AUDIT — read side of the patient clinical boundary.
-- The write side (previous migration) stops anyone but doctor/admin from
-- setting antecedents/allergies/groupe_sanguin. This migration closes the
-- read side, which RLS structurally cannot do (row-level security can't
-- mask individual columns) — the standard, minimal-blast-radius Postgres
-- mechanism for that is a column-level privilege revoke, paired with a
-- SECURITY DEFINER RPC for the one legitimate reader (doctor/admin) to get
-- these fields back, since SECURITY DEFINER functions execute as their
-- owner and are unaffected by a revoke against `authenticated`.
--
-- Supabase collapses every signed-in app role (doctor, secretary, admin)
-- onto the single Postgres role `authenticated` — there is no SQL-level way
-- to revoke a column from "secretary" specifically without also revoking it
-- from doctor/admin. So this revoke is global, and doctor/admin regain the
-- 3 fields exclusively through mm_get_patient_clinical() below. Every other
-- patients column (name, phone, dob, CIN, address, mutuelle, CNSS, email,
-- city, sex) is untouched and stays readable exactly as before for anyone
-- whose row-level access already permits it.
--
-- IMPORTANT: Supabase's default `GRANT ALL ON ALL TABLES IN SCHEMA public TO
-- authenticated` means `authenticated` already holds table-wide SELECT —
-- confirmed live via information_schema.role_table_grants. A plain
-- `REVOKE SELECT (col) ... FROM authenticated` does NOT override that
-- broader table-wide grant (Postgres column and table privileges are
-- additive, not layered) — verified live: it was a silent no-op. The only
-- way to actually enforce this is to revoke table-wide SELECT and re-grant
-- it for exactly the administrative column list every current read site
-- uses (checked against every `.from('patients')` and every embedded
-- `patients(...)` select in the frontend before doing this).

revoke select on public.patients from authenticated;
grant select (id, cabinet_id, nom, prenom, telephone, date_naissance, cin, adresse, mutuelle, numero_cnss, email, ville, sexe, created_at) on public.patients to authenticated;

create or replace function public.mm_get_patient_clinical(p_patient_id uuid)
returns table (antecedents text, allergies text, groupe_sanguin text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    raise exception 'not authorized';
  end if;

  select cabinet_id into v_clinic from public.patients where id = p_patient_id;
  if v_clinic is null then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_clinic);

  return query
  select p.antecedents, p.allergies, p.groupe_sanguin
  from public.patients p
  where p.id = p_patient_id;
end;
$$;

grant execute on function public.mm_get_patient_clinical(uuid) to authenticated;
