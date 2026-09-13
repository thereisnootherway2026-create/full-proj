import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

export type TenantRecord = {
  id: string
  ownerId: string | null
  secretaryId: string | null
  pinHash: string | null
  source: 'cabinets' | 'clinics'
}

const DOCTOR_ROLES = ['docteur', 'doctor', 'medecin', 'médecin', 'admin']

export function isDoctorRole(role: string | null | undefined) {
  const value = String(role || '').toLowerCase()
  return DOCTOR_ROLES.includes(value)
}

export function resolveProfileTenantId(
  profile: { cabinet_id?: string | null; clinic_id?: string | null }
): string | null {
  return profile.cabinet_id || profile.clinic_id || null
}

/** Resolve the real clinic owner (doctor auth user id) for a tenant/cabinet id. */
export async function resolveTenantOwnerId(
  supabaseAdmin: SupabaseClient,
  tenantId: string
): Promise<string | null> {
  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('owner_id')
    .eq('id', tenantId)
    .maybeSingle()

  if (clinic?.owner_id) {
    return clinic.owner_id
  }

  const { data: cabinet } = await supabaseAdmin
    .from('cabinets')
    .select('tenant_id')
    .eq('id', tenantId)
    .maybeSingle()

  if (cabinet?.tenant_id) {
    const { data: tenantProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, cabinet_id')
      .eq('id', cabinet.tenant_id)
      .maybeSingle()

    if (tenantProfile && isDoctorRole(tenantProfile.role)) {
      return tenantProfile.id
    }
  }

  const { data: doctorProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('cabinet_id', tenantId)
    .in('role', DOCTOR_ROLES)
    .limit(1)
    .maybeSingle()

  return doctorProfile?.id ?? null
}

/** Authoritative check: can this user manage the tenant (invite secretary, set PIN, etc.) */
export async function userManagesTenant(
  supabaseAdmin: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, cabinet_id, clinic_id')
    .eq('id', userId)
    .maybeSingle()

  if (!profile || !isDoctorRole(profile.role)) {
    return false
  }

  const linkedIds = [profile.cabinet_id, profile.clinic_id].filter(Boolean)
  if (linkedIds.includes(tenantId)) {
    return true
  }

  const resolvedOwner = await resolveTenantOwnerId(supabaseAdmin, tenantId)
  if (resolvedOwner === userId) {
    return true
  }

  const { data: cabinet } = await supabaseAdmin
    .from('cabinets')
    .select('tenant_id')
    .eq('id', tenantId)
    .maybeSingle()

  if (cabinet?.tenant_id === userId) {
    return true
  }

  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('owner_id')
    .eq('id', tenantId)
    .maybeSingle()

  return clinic?.owner_id === userId
}

export async function loadTenant(
  supabaseAdmin: SupabaseClient,
  tenantId: string
): Promise<TenantRecord | null> {
  if (!tenantId) return null

  // public.cabinets has no secretaire_id column (confirmed live against the
  // real schema: id, nom, adresse, telephone, tenant_id, created_at, ville,
  // pin_hash) — clinics.secretary_id is the only real column for this.
  // Selecting a nonexistent column used to make this query fail silently
  // (the JS client swallows the error, `cabinet` came back null, and this
  // whole branch was effectively dead — every tenant fell through to the
  // clinics-only branch below). Fixed to select real columns only, so this
  // branch is reachable again; secretaryId is still sourced from clinics
  // exclusively, matching setTenantSecretary below.
  const { data: cabinet } = await supabaseAdmin
    .from('cabinets')
    .select('id, tenant_id, pin_hash')
    .eq('id', tenantId)
    .maybeSingle()

  if (cabinet) {
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('owner_id, secretary_id, pin_hash')
      .eq('id', cabinet.id)
      .maybeSingle()

    const ownerId = (await resolveTenantOwnerId(supabaseAdmin, cabinet.id))
      ?? cabinet.tenant_id
      ?? clinic?.owner_id
      ?? null

    return {
      id: cabinet.id,
      ownerId,
      secretaryId: clinic?.secretary_id ?? null,
      pinHash: cabinet.pin_hash ?? clinic?.pin_hash ?? null,
      source: 'cabinets',
    }
  }

  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('id, owner_id, secretary_id, pin_hash')
    .eq('id', tenantId)
    .maybeSingle()

  if (clinic) {
    const ownerId = clinic.owner_id ?? (await resolveTenantOwnerId(supabaseAdmin, clinic.id))

    return {
      id: clinic.id,
      ownerId: ownerId ?? null,
      secretaryId: clinic.secretary_id ?? null,
      pinHash: clinic.pin_hash ?? null,
      source: 'clinics',
    }
  }

  return null
}

/** Create missing cabinets/clinics rows for a doctor profile (self-heal orphan cabinet_id). */
async function upsertClinicRow(
  supabaseAdmin: SupabaseClient,
  id: string,
  ownerId: string,
  label: string
) {
  const attempts: Record<string, unknown>[] = [
    { id, owner_id: ownerId, name: label },
    { id, owner_id: ownerId, nom: label },
    { id, owner_id: ownerId },
  ]

  for (const row of attempts) {
    const { error } = await supabaseAdmin
      .from('clinics')
      .upsert(row, { onConflict: 'id' })

    if (!error) return
    const msg = String(error.message || '')
    if (!msg.includes('column') && error.code !== '42703') {
      throw error
    }
  }
}

/**
 * Load tenant or auto-create cabinets/clinics rows when profile references a missing id.
 * Fixes "Cabinet introuvable" without requiring manual SQL.
 */
export async function ensureTenantForProfile(
  supabaseAdmin: SupabaseClient,
  profile: {
    id: string
    role?: string | null
    cabinet_id?: string | null
    clinic_id?: string | null
    nom_complet?: string | null
  }
): Promise<TenantRecord | null> {
  if (!profile?.id || !isDoctorRole(profile.role)) {
    return null
  }

  let tenantId = resolveProfileTenantId(profile)
  const label = profile.nom_complet || 'MacroMedica'

  if (tenantId) {
    const existing = await loadTenant(supabaseAdmin, tenantId)
    if (existing) {
      // Caught live, two compounding bugs:
      //
      // 1. A freshly-signed-up doctor can have cabinet_id set but clinic_id
      //    still null (the ensure_profile_clinic_id DB trigger only
      //    backfills clinic_id when a matching clinics row already exists at
      //    INSERT time — if cabinets/clinics rows are created in a separate
      //    step slightly after the profile row, the trigger's EXISTS check
      //    misses the window and clinic_id is left null permanently). This
      //    function is exactly where that should self-heal, but this early
      //    return used to skip it whenever a tenant record already existed.
      //    current_clinic_id() (used by every mm_* invitation RPC) reads
      //    profiles.clinic_id only, so a stuck null here made every RPC call
      //    fail with "no clinic associated with this account".
      //
      // 2. loadTenant() only requires a cabinets row to consider a tenant
      //    "found" (clinics is read with optional chaining) — a real
      //    account was observed live with a cabinets row but NO matching
      //    clinics row at all. profiles.clinic_id has a foreign key to
      //    clinics(id), so attempting the backfill above without first
      //    guaranteeing the clinics row exists fails the FK constraint
      //    silently (the update's error was never checked) and clinic_id
      //    stays null forever. upsertClinicRow() is idempotent, so it's
      //    safe to call defensively here even when a clinics row already
      //    exists.
      await upsertClinicRow(supabaseAdmin, tenantId, existing.ownerId || profile.id, label)

      if (profile.clinic_id !== tenantId) {
        const { error: backfillError } = await supabaseAdmin
          .from('profiles')
          .update({ clinic_id: tenantId })
          .eq('id', profile.id)
        if (backfillError) {
          console.error('ensureTenantForProfile clinic_id backfill failed:', backfillError)
        }
      }
      return existing
    }

    const { error: cabinetError } = await supabaseAdmin
      .from('cabinets')
      .upsert({
        id: tenantId,
        tenant_id: profile.id,
        nom: label,
      }, { onConflict: 'id' })

    if (cabinetError) {
      console.error('ensureTenantForProfile cabinet upsert:', cabinetError)
      throw cabinetError
    }

    await upsertClinicRow(supabaseAdmin, tenantId, profile.id, label)

    await supabaseAdmin
      .from('profiles')
      .update({ cabinet_id: tenantId, clinic_id: tenantId })
      .eq('id', profile.id)

    return loadTenant(supabaseAdmin, tenantId)
  }

  const { data: newCabinet, error: createError } = await supabaseAdmin
    .from('cabinets')
    .insert({
      tenant_id: profile.id,
      nom: label,
    })
    .select('id')
    .single()

  if (createError || !newCabinet?.id) {
    console.error('ensureTenantForProfile cabinet create:', createError)
    throw createError || new Error('Impossible de créer le cabinet')
  }

  tenantId = newCabinet.id

  await upsertClinicRow(supabaseAdmin, tenantId, profile.id, label)

  await supabaseAdmin
    .from('profiles')
    .update({ cabinet_id: tenantId, clinic_id: tenantId })
    .eq('id', profile.id)

  return loadTenant(supabaseAdmin, tenantId)
}

export async function setTenantSecretary(
  supabaseAdmin: SupabaseClient,
  tenant: TenantRecord,
  secretaryId: string | null
) {
  // cabinets has no secretaire_id column (see loadTenant above) — the
  // secretary relationship lives exclusively on clinics.secretary_id
  // regardless of tenant.source.
  const { error: clinicError } = await supabaseAdmin
    .from('clinics')
    .update({ secretary_id: secretaryId })
    .eq('id', tenant.id)

  if (clinicError) {
    throw clinicError
  }
}

export async function setTenantPinHash(
  supabaseAdmin: SupabaseClient,
  tenant: TenantRecord,
  pinHash: string
) {
  if (tenant.source === 'cabinets') {
    const { error } = await supabaseAdmin
      .from('cabinets')
      .update({ pin_hash: pinHash })
      .eq('id', tenant.id)
    if (error) throw error
  }

  const { error: clinicError } = await supabaseAdmin
    .from('clinics')
    .update({ pin_hash: pinHash })
    .eq('id', tenant.id)

  if (clinicError && tenant.source === 'clinics') {
    throw clinicError
  }
}
