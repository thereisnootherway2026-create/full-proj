import { normalizeRole } from './rbac'

/**
 * True when an invited secretary still needs the welcome / password setup
 * step. Only role='secretary' is ever routed through onboarding — other
 * roles (doctor, admin) always return false here.
 *
 * Safety rails (each one independently prevents the trap):
 *
 * 1. If profile hasn't loaded yet (null/undefined), return false.
 *    Never block a user based on stale user_metadata alone — wait for
 *    the real profile from the database.
 *
 * 2. Role is resolved from profile.role only (not user_metadata).
 *    user_metadata.role can be stale — e.g. a doctor account that was
 *    originally invited as a secretary still carries role='secretaire'
 *    in auth.users even after mm_dev_switch_role or a profile update.
 *
 * 3. If the profile already has a cabinet_id or clinic_id, the user
 *    is an active member of a clinic and must never be blocked by
 *    onboarding — even if onboarding_completed_at is still null
 *    (common for accounts created before the migration that added
 *    this column).
 *
 * 4. Only return true when all of the above pass AND
 *    onboarding_completed_at is null — i.e. a genuine brand-new
 *    secretary who hasn't finished the welcome form yet.
 */
export function needsSecretaryOnboarding(user, profile) {
  // Rail 1: no profile loaded yet → never block
  if (!profile) return false

  // Rail 2: role from the authoritative database profile only
  const role = normalizeRole(profile.role)
  if (role !== 'secretary') return false

  // Rail 3: already a member of a clinic → already onboarded
  if (profile.cabinet_id || profile.clinic_id) return false

  // Rail 4: genuine un-onboarded secretary
  return !profile.onboarding_completed_at
}
