-- mm_get_user_permissions previously returned only (permission_key, group,
-- granted, is_override) — no human-readable label, so the Permissions UI
-- in SecretaryManagementSection had nothing but raw keys like
-- "waiting_room.add_patient" to fall back to. permissions.description
-- already holds the French label; expose it here instead of duplicating
-- a key->label map on the frontend. Return type changes, so the function
-- must be dropped and recreated (create or replace can't change OUT columns).
drop function if exists public.mm_get_user_permissions(uuid);

create function public.mm_get_user_permissions(p_user_id uuid)
returns table (permission_key text, description text, "group" text, granted boolean, is_override boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_clinic uuid;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);

  select coalesce(pr.clinic_id, pr.cabinet_id) into v_target_clinic
  from public.profiles pr where pr.id = p_user_id;

  if v_target_clinic is distinct from public.current_clinic_id() then
    raise exception 'cross-clinic access denied';
  end if;

  return query
  select p.key,
         p.description,
         p."group",
         coalesce(up.granted, exists (
           select 1 from public.role_permissions rp where rp.role = 'secretary' and rp.permission_id = p.id
         )) as granted,
         (up.id is not null) as is_override
  from public.permissions p
  left join public.user_permissions up on up.permission_id = p.id and up.user_id = p_user_id
  order by p."group", p.key;
end;
$$;

grant execute on function public.mm_get_user_permissions(uuid) to authenticated;
