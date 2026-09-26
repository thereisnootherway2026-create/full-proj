-- Acte catalogue management (Paramètres > Actes).
--
-- public.actes_catalogue already exists (20260910120000) and was empty and unused by any writer.
-- This migration makes it manageable and safe:
--   * writes only through upsert_acte / set_acte_active (admin or doctor of the clinic), like the
--     payments / claims RPCs, instead of the broad direct-write RLS policy;
--   * no hard delete: an acte is archived (active = false). facture_lignes keeps its own
--     label/price snapshots, so past invoices never change when the catalogue does;
--   * one acte name per clinic (case/space-insensitive), archived ones included, so an archived acte
--     is reactivated instead of duplicated.
-- The table's tenant column is cabinet_id (= current_clinic_id()).

alter table public.actes_catalogue
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists actes_catalogue_cabinet_libelle_uniq
  on public.actes_catalogue (cabinet_id, lower(btrim(libelle)));

alter table public.actes_catalogue
  drop constraint if exists actes_catalogue_prix_check;
alter table public.actes_catalogue
  add constraint actes_catalogue_prix_check check (prix >= 0);

drop policy if exists actes_catalogue_write on public.actes_catalogue;
drop policy if exists actes_catalogue_no_direct_write on public.actes_catalogue;
create policy actes_catalogue_no_direct_write on public.actes_catalogue
  for all to authenticated using (false) with check (false);
revoke insert, update, delete on public.actes_catalogue from authenticated, anon;

create or replace function public.upsert_acte(
  p_id uuid, p_libelle text, p_prix numeric, p_categorie text default null
)
returns public.actes_catalogue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_name text := btrim(coalesce(p_libelle, ''));
  v_cat text := nullif(btrim(coalesce(p_categorie, '')), '');
  v_before public.actes_catalogue;
  v_row public.actes_catalogue;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  if v_clinic is null then raise exception 'no clinic for current user'; end if;
  if length(v_name) = 0 or length(v_name) > 120 then raise exception 'invalid acte name'; end if;
  if p_prix is null or p_prix < 0 or p_prix > 9999999 then raise exception 'invalid acte price'; end if;
  if v_cat is not null and length(v_cat) > 60 then raise exception 'invalid acte category'; end if;

  if p_id is null then
    insert into public.actes_catalogue (cabinet_id, code, libelle, categorie, prix)
    values (v_clinic, 'ACT-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)), v_name, v_cat, round(p_prix, 2))
    returning * into v_row;
    perform public.write_audit_log('ACTE_CREATED', 'acte', v_row.id, null, to_jsonb(v_row), null);
  else
    select * into v_before from public.actes_catalogue where id = p_id and cabinet_id = v_clinic for update;
    if not found then raise exception 'acte not found'; end if;
    update public.actes_catalogue
    set libelle = v_name, categorie = v_cat, prix = round(p_prix, 2), updated_at = now()
    where id = p_id
    returning * into v_row;
    perform public.write_audit_log('ACTE_UPDATED', 'acte', v_row.id, to_jsonb(v_before), to_jsonb(v_row), null);
  end if;
  return v_row;
end;
$$;

create or replace function public.set_acte_active(p_id uuid, p_active boolean)
returns public.actes_catalogue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_before public.actes_catalogue;
  v_row public.actes_catalogue;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  select * into v_before from public.actes_catalogue where id = p_id and cabinet_id = v_clinic for update;
  if not found then raise exception 'acte not found'; end if;
  update public.actes_catalogue set active = coalesce(p_active, true), updated_at = now()
  where id = p_id returning * into v_row;
  perform public.write_audit_log(case when v_row.active then 'ACTE_RESTORED' else 'ACTE_ARCHIVED' end,
    'acte', v_row.id, to_jsonb(v_before), to_jsonb(v_row), null);
  return v_row;
end;
$$;

revoke all on function public.upsert_acte(uuid, text, numeric, text) from public, anon;
revoke all on function public.set_acte_active(uuid, boolean) from public, anon;
grant execute on function public.upsert_acte(uuid, text, numeric, text) to authenticated, service_role;
grant execute on function public.set_acte_active(uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
