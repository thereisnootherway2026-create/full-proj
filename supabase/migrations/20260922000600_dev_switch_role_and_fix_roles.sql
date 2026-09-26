-- 1. Create RPC mm_dev_switch_role so local testing / dev switcher stays in 100% sync between frontend and PostgreSQL
create or replace function public.mm_dev_switch_role(p_new_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text;
  v_db_role text;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_normalized := public.mm_role_key(p_new_role);
  if v_normalized not in ('doctor', 'secretary', 'admin') then
    raise exception 'invalid role: %', p_new_role;
  end if;

  v_db_role := case 
    when v_normalized = 'doctor' then 'docteur'
    when v_normalized = 'secretary' then 'secretaire'
    else v_normalized 
  end;

  update public.profiles
     set role = v_db_role,
         updated_at = now()
   where id = auth.uid()
  returning * into v_profile;

  perform public.write_audit_log(
    'ROLE_SWITCHED_DEV',
    'profile',
    auth.uid(),
    null,
    jsonb_build_object('new_role', v_db_role),
    jsonb_build_object('switched_by', auth.uid(), 'canonical', v_normalized)
  );

  return jsonb_build_object('success', true, 'role', v_db_role, 'canonical', v_normalized);
end;
$$;

revoke all on function public.mm_dev_switch_role(text) from public, anon;
grant execute on function public.mm_dev_switch_role(text) to authenticated;

-- 2. Upgrade test user accounts to docteur so consultation testing succeeds immediately
update public.profiles
   set role = 'docteur', updated_at = now()
 where email in ('hhy716259@gmail.com', 'hatimscotflexx@gmail.com')
    or id in ('432ee79a-1245-4470-be20-e6c3fe8f9f3e', '95519749-fc09-463c-a79a-77a1cdd1dc89');
