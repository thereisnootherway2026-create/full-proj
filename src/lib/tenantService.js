import { supabase } from './supabase'

// public.cabinets has no secretaire_id column — clinics.secretary_id is the
// only real column for the active-secretary relationship (confirmed live
// against the actual schema). The old cabinets lookup here always failed
// silently (Supabase JS swallows the query error) and fell through to this
// same clinics query, so behavior is unchanged — this just stops making a
// doomed request first.
export async function getTenantSecretaryId(tenantId) {
  if (!tenantId) return null

  const { data: clinic } = await supabase
    .from('clinics')
    .select('secretary_id')
    .eq('id', tenantId)
    .maybeSingle()

  return clinic?.secretary_id ?? null
}
