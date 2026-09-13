-- Secretary invitation system hardening.
--
-- Context: public.invitations already existed (20260616_patient_flow_rbac.sql)
-- but was never wired to any application code — zero reads/writes anywhere in
-- the codebase. The live "invite secretary" flow instead called
-- supabase.auth.admin.inviteUserByEmail() directly from an Edge Function and
-- upserted a 'secretaire' profile immediately on invite-send (before
-- acceptance), with no persisted invitation record, no resend/revoke, no
-- audit trail, and no protection against duplicate invites. A second,
-- completely separate and unauthenticated "add team member" implementation
-- also existed (StaffManagementPage.jsx, dead/unrouted, deleted alongside
-- this migration) that called supabase.auth.signUp() directly from the
-- browser with an admin-chosen password and no server-side role/tenant
-- check — a privilege-escalation hole, unreachable in production only
-- because nothing routed to it.
--
-- This migration turns the existing invitations table into the real,
-- RLS-protected, audited source of truth for the invite lifecycle, and adds
-- the RPCs the frontend/Edge Function need. It reuses the existing
-- clinic_id-canonical tenant model established in the Phase 4 migrations
-- (current_clinic_id(), mm_assert_same_clinic, mm_assert_role) rather than
-- introducing any new tenant concept. invitations.clinic_id keeps its
-- existing FK to public.cabinets(id) unchanged — cabinets.id and clinics.id
-- are kept in sync elsewhere in this schema, so current_clinic_id()'s return
-- value is valid against either table, matching the pattern already used by
-- create_walk_in_visit/mm_assert_same_clinic.

-- pgcrypto lives in the `extensions` schema on this project (confirmed live via
-- `select extnamespace::regnamespace from pg_extension where extname='pgcrypto'`
-- -> 'extensions'), not `public`. Every pgcrypto call below is schema-qualified
-- rather than relying on search_path ordering, so it works regardless of
-- session/role search_path config.
create extension if not exists pgcrypto with schema extensions;

-- ---------- Schema: bring invitations up to full lifecycle ----------

alter table public.invitations add column if not exists accepted_by uuid references public.profiles(id) on delete set null;
alter table public.invitations add column if not exists revoked_at timestamptz;
alter table public.invitations add column if not exists updated_at timestamptz not null default now();

create or replace function public.mm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists invitations_touch_updated_at on public.invitations;
create trigger invitations_touch_updated_at
before update on public.invitations
for each row execute function public.mm_touch_updated_at();

-- One active (pending, unexpired) invitation per clinic + email + role.
-- A resend reuses/updates the existing row rather than inserting a new one,
-- so this index also protects against double-submit races.
drop index if exists idx_invitations_one_active_per_target;
create unique index idx_invitations_one_active_per_target
  on public.invitations (clinic_id, lower(email), role)
  where status = 'pending';

create index if not exists idx_invitations_expires_at on public.invitations(expires_at);

-- ---------- RLS: doctors (clinic owners) and admins, scoped to their own clinic ----------

drop policy if exists invitations_admin_select on public.invitations;
drop policy if exists invitations_admin_insert on public.invitations;
drop policy if exists invitations_owner_select on public.invitations;
drop policy if exists invitations_owner_insert on public.invitations;
drop policy if exists invitations_owner_update on public.invitations;

create policy invitations_owner_select on public.invitations
for select to authenticated
using (clinic_id = public.current_clinic_id() and public.has_any_role(array['doctor']));

-- Inserts/updates always go through the SECURITY DEFINER RPCs below (which
-- re-validate role + tenant server-side regardless of RLS), but these
-- policies exist too so the table is never silently writable if something
-- ever calls .insert()/.update() on it directly.
create policy invitations_owner_insert on public.invitations
for insert to authenticated
with check (clinic_id = public.current_clinic_id() and public.has_any_role(array['doctor']));

create policy invitations_owner_update on public.invitations
for update to authenticated
using (clinic_id = public.current_clinic_id() and public.has_any_role(array['doctor']))
with check (clinic_id = public.current_clinic_id() and public.has_any_role(array['doctor']));

-- ---------- Token helpers ----------

create or replace function public.mm_hash_invitation_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

-- ---------- Create invitation ----------
-- Called from the invite-secretary Edge Function (service role), which then
-- uses the returned raw_token to build the acceptance URL and trigger the
-- real invite email via supabase.auth.admin.inviteUserByEmail(). The raw
-- token is returned exactly once here and never persisted anywhere.

create or replace function public.mm_create_invitation(
  p_email text,
  p_role text default 'secretaire'
)
returns table (id uuid, raw_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_email text;
  v_role text;
  v_raw_token text;
  v_existing_id uuid;
  v_row public.invitations%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'no clinic associated with this account';
  end if;

  v_email := lower(trim(p_email));
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid email';
  end if;

  -- Only 'secretaire' is allowed through this feature today. The caller
  -- (client/Edge Function) never gets to pick an arbitrary role — this is
  -- enforced here, not trusted from the request body.
  v_role := public.mm_role_key(p_role);
  if v_role is distinct from 'secretary' then
    raise exception 'role not allowed for invitation';
  end if;
  v_role := 'secretaire';

  if exists (
    select 1 from public.profiles pr
    where pr.clinic_id = v_clinic_id and lower(pr.email) = v_email
  ) then
    raise exception 'email already belongs to a member of this clinic';
  end if;

  -- Bare `id` here would be ambiguous against this function's own `returns
  -- table (id uuid, ...)` OUT parameter (caught live: SQLSTATE 42702) — the
  -- alias qualifies every column against the actual table, not the OUT param.
  select inv.id into v_existing_id
  from public.invitations inv
  where inv.clinic_id = v_clinic_id and lower(inv.email) = v_email and inv.role = v_role and inv.status = 'pending';

  if v_existing_id is not null then
    raise exception 'duplicate pending invitation';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations (
    clinic_id, invited_by, first_name, last_name, email, role, token_hash, status, expires_at
  )
  values (
    v_clinic_id, auth.uid(), '', '', v_email, v_role,
    public.mm_hash_invitation_token(v_raw_token), 'pending', now() + interval '7 days'
  )
  returning * into v_row;

  perform public.write_audit_log(
    'INVITATION_CREATED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_email, 'role', v_role),
    null
  );

  return query select v_row.id, v_raw_token, v_row.expires_at;
end;
$$;

-- ---------- Resend invitation ----------
-- Invalidates the old token by overwriting token_hash in place (the old raw
-- token can never be re-derived from the row, so it's already unusable the
-- instant this runs), issues a fresh token + expiry, and returns it for the
-- Edge Function to re-send. Rate-limited via updated_at.

create or replace function public.mm_resend_invitation(p_invitation_id uuid)
returns table (id uuid, raw_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
  v_raw_token text;
begin
  perform public.mm_assert_role(array['doctor']);

  -- Bare `id` would be ambiguous against this function's own
  -- `returns table (id uuid, ...)` OUT parameter (same class of bug caught
  -- live in mm_create_invitation, SQLSTATE 42702) — qualify explicitly.
  select inv.* into v_row from public.invitations inv where inv.id = p_invitation_id for update;
  if v_row is null then
    raise exception 'invitation not found';
  end if;

  perform public.mm_assert_same_clinic(v_row.clinic_id);

  if v_row.status is distinct from 'pending' then
    raise exception 'only a pending invitation can be resent';
  end if;

  if v_row.updated_at > now() - interval '60 seconds' then
    raise exception 'please wait before resending this invitation';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.invitations
  set token_hash = public.mm_hash_invitation_token(v_raw_token),
      expires_at = now() + interval '7 days'
  where public.invitations.id = v_row.id
  returning * into v_row;

  perform public.write_audit_log(
    'INVITATION_RESENT', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_row.email), null
  );

  return query select v_row.id, v_raw_token, v_row.expires_at;
end;
$$;

-- ---------- Revoke invitation ----------

create or replace function public.mm_revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  select * into v_row from public.invitations where id = p_invitation_id for update;
  if v_row is null then
    raise exception 'invitation not found';
  end if;

  perform public.mm_assert_same_clinic(v_row.clinic_id);

  if v_row.status is distinct from 'pending' then
    raise exception 'only a pending invitation can be revoked';
  end if;

  update public.invitations
  set status = 'revoked', revoked_at = now()
  where id = v_row.id;

  perform public.write_audit_log(
    'INVITATION_REVOKED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_row.email), null
  );
end;
$$;

-- ---------- Validate token (pre-auth, safe subset only) ----------
-- Callable by anon (the visitor isn't signed in yet when this page loads).
-- Deliberately returns no clinic_id/invited_by — only what the acceptance
-- screen needs to render safely.

create or replace function public.mm_validate_invitation_token(p_token text)
returns table (
  valid boolean,
  status text,
  email text,
  role text,
  clinic_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
  v_clinic_name text;
  v_effective_status text;
begin
  select * into v_row
  from public.invitations
  where token_hash = public.mm_hash_invitation_token(p_token);

  if v_row is null then
    return query select false, 'invalid'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_effective_status := v_row.status;
  if v_effective_status = 'pending' and v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    v_effective_status := 'expired';
  end if;

  -- cabinets is always written with `nom` (see ensureTenantForProfile in
  -- supabase/functions/_shared/tenant.ts) — unlike `clinics`, it doesn't
  -- also have a `name` column, so referencing one here would error at
  -- query time rather than just returning null.
  select c.nom into v_clinic_name
  from public.cabinets c where c.id = v_row.clinic_id;

  return query select
    (v_effective_status = 'pending'),
    v_effective_status,
    v_row.email,
    v_row.role,
    coalesce(v_clinic_name, 'votre cabinet'),
    v_row.expires_at;
end;
$$;

grant execute on function public.mm_validate_invitation_token(text) to anon, authenticated;

-- ---------- Atomic acceptance ----------
-- Requires an authenticated session (established client-side beforehand via
-- supabase.auth.verifyOtp(..., type: 'invite') using the OTP code from the
-- same email — see supabase/functions/invite-secretary and
-- src/pages/SecretaryWelcomePage.tsx). GoTrue itself guarantees the
-- authenticated session's email matches the address the OTP was issued to,
-- so the email-match check below is defense-in-depth, not the only guard.
--
-- Shared finalization step, used by both acceptance entry points below.
-- v_row must already be locked (select ... for update) by the caller.
--
-- One-secretary-per-clinic race: this schema keeps a single secretary slot
-- per tenant (cabinets.secretaire_id / clinics.secretary_id — no
-- clinic_members table, unchanged by design). Two invitation acceptances
-- for the same clinic can arrive concurrently (e.g. two invited addresses,
-- or a double-submit); without locking, both could read the slot as empty
-- and both write to it, silently replacing whichever committed first. Fixed
-- by taking SELECT ... FOR UPDATE row locks on the clinic's cabinets AND
-- clinics rows, in that fixed order, before ever checking or writing
-- secretaire_id/secretary_id. Postgres serializes any second concurrent
-- transaction on the same row behind the first transaction's commit; the
-- second transaction then re-reads the now-committed secretary_id and
-- aborts cleanly via the exception below, rolling back everything it did
-- (profile upsert, invitation status) in this same function.

create or replace function public.mm_finalize_invitation_acceptance(v_row public.invitations)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_email text;
  v_full_name text;
  v_clinic_secretary uuid;
begin
  if v_row.status is distinct from 'pending' then
    raise exception 'invitation is % and cannot be accepted', v_row.status;
  end if;

  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    raise exception 'invitation has expired';
  end if;

  select lower(trim(email)) into v_auth_email from auth.users where id = auth.uid();
  if v_auth_email is distinct from lower(trim(v_row.email)) then
    raise exception 'authenticated email does not match invitation';
  end if;

  -- Lock the tenant's secretary slot before checking it.
  --
  -- Caught live (SQLSTATE 42703): public.cabinets has no secretaire_id
  -- column at all — confirmed via information_schema.columns against the
  -- real database (cabinets: id, nom, adresse, telephone, tenant_id,
  -- created_at, ville, pin_hash). This is a pre-existing mismatch between
  -- supabase/functions/_shared/tenant.ts (which reads/writes
  -- cabinets.secretaire_id) and the actual schema — it doesn't currently
  -- break that JS code only because the Supabase JS client swallows the
  -- resulting query error and falls through to the clinics table, which
  -- does have the real column. Raw PL/pgSQL has no such fallback, so this
  -- function uses clinics.secretary_id only, which is the one place this
  -- data is actually stored live. Not fixing _shared/tenant.ts itself here
  -- (out of scope for this patch — it degrades correctly today) but this is
  -- worth cleaning up separately.
  select secretary_id into v_clinic_secretary
  from public.clinics where id = v_row.clinic_id for update;

  if v_clinic_secretary is not null then
    raise exception 'clinic already has an active secretary';
  end if;

  select nom_complet into v_full_name from public.profiles where id = auth.uid();

  insert into public.profiles (id, email, cabinet_id, clinic_id, role, nom_complet)
  values (auth.uid(), v_auth_email, v_row.clinic_id, v_row.clinic_id, 'secretaire', coalesce(v_full_name, split_part(v_auth_email, '@', 1)))
  on conflict (id) do update
    set cabinet_id = excluded.cabinet_id,
        clinic_id = excluded.clinic_id,
        role = 'secretaire',
        email = excluded.email;

  -- cabinets has no secretaire_id column (see note above) — clinics.secretary_id
  -- is the only real column for this, so it's the only one written here.
  update public.clinics set secretary_id = auth.uid() where id = v_row.clinic_id;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_row.id;

  perform public.write_audit_log(
    'INVITATION_ACCEPTED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_row.email, 'role', v_row.role), null
  );
end;
$$;

-- Preferred entry point: accept via the per-invitation token carried in the
-- acceptance link (?token=... in the email's CTA).
create or replace function public.mm_accept_invitation(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_row
  from public.invitations
  where token_hash = public.mm_hash_invitation_token(p_token)
  for update;

  if v_row is null then
    raise exception 'invitation not found';
  end if;

  perform public.mm_finalize_invitation_acceptance(v_row);
end;
$$;

-- Fallback entry point for when the acceptance link itself didn't reach the
-- user intact (e.g. an email client stripped the link/query string) but the
-- OTP code did — the same code the secretary used to authenticate via
-- verifyOtp is proof enough of email ownership, so once a session exists we
-- can look up her own most recent pending invitation directly by email
-- instead of requiring the token. Still fully server-side validated.
create or replace function public.mm_accept_invitation_by_email()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
  v_auth_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select lower(trim(email)) into v_auth_email from auth.users where id = auth.uid();

  select * into v_row
  from public.invitations
  where lower(email) = v_auth_email and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_row is null then
    raise exception 'invitation not found';
  end if;

  perform public.mm_finalize_invitation_acceptance(v_row);
end;
$$;

grant execute on function public.mm_create_invitation(text, text) to authenticated;
grant execute on function public.mm_resend_invitation(uuid) to authenticated;
grant execute on function public.mm_revoke_invitation(uuid) to authenticated;
grant execute on function public.mm_accept_invitation(text) to authenticated;
grant execute on function public.mm_accept_invitation_by_email() to authenticated;
