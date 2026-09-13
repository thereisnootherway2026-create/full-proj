import { useAppContext } from '../../context/AppContext'

/**
 * UX-layer gate only — hides/disables UI for an action the current user
 * doesn't have. This is never the real authorization boundary: every
 * sensitive RPC re-checks mm_has_permission()/mm_assert_permission()
 * server-side regardless of what renders here, so removing or bypassing
 * this component cannot grant real access, only change what's shown.
 *
 * <Can permission="billing.collect">
 *   <button onClick={...}>Encaisser</button>
 * </Can>
 *
 * Pass `fallback` to render something else instead of nothing (e.g. a
 * disabled button) when the permission is missing.
 */
export default function Can({ permission, fallback = null, children }) {
  const { can } = useAppContext()
  return can(permission) ? children : fallback
}
