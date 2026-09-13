import { normalizeRole } from './rbac'

/**
 * True when an invited secretary still needs the welcome / password setup
 * step. Only role='secretary' is ever routed through onboarding — other
 * roles (doctor, admin) always return false here.
 *
 * The completion signal is profiles.onboarding_completed_at, set only by
 * mm_finalize_invitation_acceptance (a SECURITY DEFINER function) at the
 * exact moment acceptance finalizes, and protected from direct client
 * writes by a database trigger — so this is a trustworthy, server-verified
 * fact, not a heuristic. Previously this checked a client-writable
 * user_metadata.onboarding_complete flag and a "does nom_complet look like
 * a real two-word name" heuristic — both were unreliable: the metadata
 * flag was never actually set server-side, and the name heuristic broke
 * for every secretary because of a since-fixed bug where the accepted
 * profile's nom_complet was left equal to the invited email address.
 */
export function needsSecretaryOnboarding(user, profile) {
  const role = normalizeRole(profile?.role || user?.user_metadata?.role)
  if (role !== 'secretary') return false

  return !profile?.onboarding_completed_at
}
