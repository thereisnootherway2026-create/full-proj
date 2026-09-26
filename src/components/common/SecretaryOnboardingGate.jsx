import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import { needsSecretaryOnboarding } from '../../lib/onboarding'

export default function SecretaryOnboardingGate() {
  const { user, profile, isInitializing } = useAppContext()

  // Wait for both the session and the profile to be fully loaded before
  // deciding anything. The old code only checked isInitializing, which
  // could resolve while profile was still null (e.g. slow network) —
  // causing needsSecretaryOnboarding to evaluate against stale
  // user_metadata and redirect prematurely.
  if (isInitializing || (user && !profile)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (needsSecretaryOnboarding(user, profile)) {
    return <Navigate to="/bienvenue-secretaire" replace />
  }

  return <Outlet />
}
