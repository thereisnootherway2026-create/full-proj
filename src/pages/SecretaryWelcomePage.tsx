import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Ban,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Phone,
  ShieldAlert,
  User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAppContext } from '../context/AppContext'
import { needsSecretaryOnboarding } from '../lib/onboarding'

// Module-level singleton promise for the one-time "read the auth fragment,
// call setSession, scrub the URL" side effect. Confirmed live: React
// StrictMode's dev-only double-mount doesn't just re-invoke the effect, it
// fully unmounts and remounts the component instance in development,
// resetting useRef/useState too — so a per-instance guard isn't enough to
// prevent two concurrent setSession() calls (observed live as a "Lock ...
// was not released within 5000ms" warning). A module-scoped promise survives
// remounts (the module only evaluates once per page load) while still
// letting *every* mounted generation correctly await the same shared work
// and update its own local state once — see the effect below. StrictMode's
// double-mount never happens in the production build, so this only matters
// in development, but the pattern is correct and harmless either way.
let authFragmentPromise: Promise<void> | null = null

function consumeAuthFragment(): Promise<void> {
  if (authFragmentPromise) return authFragmentPromise
  authFragmentPromise = (async () => {
    try {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (access_token && refresh_token) {
        // Tokens live only in these two locals and go straight into
        // setSession() — never logged, never rendered, never stored by
        // this page (Supabase's own client persists the resulting session
        // the normal way; no second storage mechanism here).
        await supabase.auth.setSession({ access_token, refresh_token })
      }
    } catch {
      // Left unauthenticated on failure — the lookup effect lands on the
      // correct terminal state once isAuthenticated resolves.
    } finally {
      // Scrub the fragment unconditionally, success or failure: raw auth
      // tokens must never linger in the visible URL or browser history.
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
    }
  })()
  return authFragmentPromise
}

// ---------------------------------------------------------------------------
// Design tokens (scoped to this page only — see the <style> block below).
// ---------------------------------------------------------------------------
const COLORS = {
  navy: '#0B1628',
  blue: '#1A56DB',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  bg: '#F8FAFC',
}

// Click-to-activate flow: the invitation email's CTA is Supabase's own
// {{ .ConfirmationURL }}, which authenticates the invited user via GoTrue's
// own verify endpoint *before* redirecting here — so by the time this page
// can do anything, there is either a session or there isn't. There is no
// more custom ?token= in the URL and no OTP step; the only way to know
// "what invitation does this authenticated person have" is the read-only
// mm_get_my_pending_invitation() RPC (see the migration — public.invitations
// has no RLS policy letting a non-doctor read it directly).
type LookupState =
  | 'loading'
  | 'no_session'
  | 'wrong_account'
  | 'expired'
  | 'revoked'
  | 'already_accepted'
  | 'invalid'
  | 'ready'

const STATE_COPY: Record<
  Exclude<LookupState, 'loading' | 'ready' | 'wrong_account'>,
  { title: string; body: string; icon: typeof AlertTriangle; iconColor: string; iconBg: string; cta: string }
> = {
  no_session: {
    title: 'Invitation introuvable',
    body: "Merci de cliquer sur le bouton reçu dans l'email d'invitation. Si le problème persiste, demandez à votre médecin de vous envoyer une nouvelle invitation.",
    icon: ShieldAlert,
    iconColor: COLORS.red,
    iconBg: '#FEF2F2',
    cta: 'Aller à la connexion',
  },
  expired: {
    title: 'Invitation expirée',
    body: "Cette invitation n'est plus valide. Demandez à votre médecin de vous en envoyer une nouvelle.",
    icon: Clock,
    iconColor: COLORS.amber,
    iconBg: '#FFFBEB',
    cta: 'Aller à la connexion',
  },
  revoked: {
    title: 'Invitation révoquée',
    body: "Cette invitation a été annulée par votre médecin. Contactez-le si vous pensez qu'il s'agit d'une erreur.",
    icon: Ban,
    iconColor: COLORS.red,
    iconBg: '#FEF2F2',
    cta: 'Aller à la connexion',
  },
  already_accepted: {
    title: 'Invitation déjà utilisée',
    body: 'Cette invitation a déjà été acceptée. Connectez-vous avec votre compte.',
    icon: CheckCircle2,
    iconColor: COLORS.green,
    iconBg: '#ECFDF5',
    cta: 'Se connecter',
  },
  invalid: {
    title: 'Lien invalide',
    body: "Ce lien d'invitation n'est pas reconnu. Demandez à votre médecin de vous envoyer une nouvelle invitation.",
    icon: ShieldAlert,
    iconColor: COLORS.red,
    iconBg: '#FEF2F2',
    cta: 'Aller à la connexion',
  },
}

function roleLabel(role: string | null | undefined) {
  const key = String(role || '').toLowerCase()
  if (key === 'secretaire' || key === 'secretary') return 'Secrétaire'
  if (!key) return 'Secrétaire'
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function formatExpiry(iso: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Logo() {
  return (
    <div className="mb-5 flex items-center justify-center gap-2.5">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-extrabold text-white"
        style={{ backgroundColor: COLORS.blue }}
      >
        M
      </div>
      <span className="text-lg font-bold tracking-tight" style={{ color: COLORS.navy }}>
        MacroMedica
      </span>
    </div>
  )
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="break-words text-sm font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

function LabeledInput({
  label,
  icon: Icon,
  ...props
}: { label: string; icon: typeof User } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition focus-within:border-[#1A56DB] focus-within:ring-2 focus-within:ring-[#1A56DB]/10">
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        <input {...props} className="w-full border-0 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400" />
      </div>
    </label>
  )
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg px-3 py-2.5 text-sm font-medium"
      style={{ backgroundColor: '#FEF2F2', color: '#B91C1C', border: '1px solid #FEE2E2' }}
    >
      {message}
    </p>
  )
}

function PrimaryButton({
  loading,
  loadingLabel,
  children,
  ...props
}: {
  loading?: boolean
  loadingLabel?: string
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundColor: COLORS.blue }}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingLabel || 'Chargement…'}
        </>
      ) : (
        children
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SecretaryWelcomePage() {
  const { user, profile, isInitializing, isAuthenticated } = useAppContext()
  const navigate = useNavigate()

  // Scoped, page-local compatibility shim — see src/lib/supabase.ts, which
  // stays on flowType: 'pkce' for the whole app (login, password reset,
  // etc.) unchanged. Supabase's admin-generated invite ConfirmationURL
  // redirects here using the *implicit* flow's URL fragment format
  // (#access_token=...&refresh_token=...), confirmed live. The installed
  // @supabase/auth-js SDK's own _getSessionFromURL (GoTrueClient.js) refuses
  // to process an implicit-style URL when the client's flowType is 'pkce'
  // — it throws AuthPKCEGrantCodeExchangeError by design — so the session
  // never gets picked up automatically. This page reads the fragment itself
  // and hands the tokens directly to the public setSession() API, which
  // bypasses that internal flow-type check entirely and requires no global
  // config change.
  const [consumingFragment, setConsumingFragment] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.location.hash.includes('access_token')
  })

  const [showForm, setShowForm] = useState(false)

  const [lookupState, setLookupState] = useState<LookupState>('loading')
  const [invitationClinicName, setInvitationClinicName] = useState('')
  const [invitationRole, setInvitationRole] = useState('')
  const [invitationExpiresAt, setInvitationExpiresAt] = useState<string | null>(null)

  // Step: profile/password setup (new-account path).
  const [prenom, setPrenom] = useState(() => profile?.nom_complet?.trim().split(/\s+/)[0] || '')
  const [nom, setNom] = useState(() => profile?.nom_complet?.trim().split(/\s+/).slice(1).join(' ') || '')
  const [telephone, setTelephone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Step: already-signed-in user accepting directly (existing account path).
  const [acceptingExisting, setAcceptingExisting] = useState(false)
  const [existingError, setExistingError] = useState<string | null>(null)

  // Terminal blocked state: the invitation itself was valid, but the clinic
  // already has an active secretary (mm_finalize_invitation_acceptance's
  // locked check rejected the accept — no profile/role/tenant change was
  // made, the invitation stayed pending). Distinct from `done` — this is
  // never success and must never redirect to the dashboard.
  const [secretarySlotTaken, setSecretarySlotTaken] = useState(false)

  // "Existing account" detection, decided once. AppContext sets
  // isAuthenticated=true for ANY valid session, whether or not a profiles
  // row exists yet — so isAuthenticated alone can't distinguish a brand-new
  // invitee (no profiles row yet, needs the password-setup form) from
  // someone who already had a MacroMedica account before this invitation.
  // Re-deriving on every render is also unsafe: handleSubmit calls
  // supabase.auth.updateUser({ data: { nom_complet: fullName, ... } })
  // *before* calling mm_accept_invitation_by_email, which fires a
  // USER_UPDATED event and briefly makes needsSecretaryOnboarding() look
  // "complete" even though the profiles row doesn't exist yet — so this is
  // computed once, the first time a session is observed, and frozen after.
  const existingAccountRef = useRef<boolean | null>(null)
  if (existingAccountRef.current === null && isAuthenticated && user) {
    existingAccountRef.current = !needsSecretaryOnboarding(user, profile)
  }
  const isExistingAccount = existingAccountRef.current === true

  // Belt-and-suspenders guard against double submission (e.g. a fast double
  // click before the disabled state has painted). The disabled prop on each
  // submit button already covers the common case — this closes the gap where
  // a second click fires before React has committed that re-render. Real
  // authorization is still enforced server-side either way.
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!consumingFragment) return
    let cancelled = false
    consumeAuthFragment().finally(() => {
      if (!cancelled) setConsumingFragment(false)
    })
    return () => { cancelled = true }
  }, [consumingFragment])

  useEffect(() => {
    let cancelled = false
    const lookup = async () => {
      if (isInitializing || consumingFragment) return
      if (!isAuthenticated || !user) {
        if (!cancelled) setLookupState('no_session')
        return
      }
      const { data, error } = await supabase.rpc('mm_get_my_pending_invitation').maybeSingle()
      if (cancelled) return
      if (error) {
        setLookupState('invalid')
        return
      }
      if (!data) {
        // Authenticated, but no invitation exists for this exact email —
        // the most likely real-world cause is that this browser session
        // belongs to a different account than the one the invitation was
        // sent to (see the "wrong account" screen below).
        setLookupState('wrong_account')
        return
      }
      setInvitationClinicName(data.clinic_name || '')
      setInvitationRole(data.role || '')
      setInvitationExpiresAt(data.expires_at || null)
      const status = data.status as string
      if (status === 'pending') setLookupState('ready')
      else if (status === 'expired') setLookupState('expired')
      else if (status === 'revoked') setLookupState('revoked')
      else if (status === 'accepted') setLookupState('already_accepted')
      else setLookupState('invalid')
    }
    lookup()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitializing, consumingFragment, isAuthenticated, user?.id])

  const pageShell = (children: React.ReactNode) => (
    <div className="mm-secretary-onboarding flex min-h-screen items-center justify-center px-4 py-8" style={{ backgroundColor: COLORS.bg }}>
      <style>{`
        .mm-secretary-onboarding, .mm-secretary-onboarding * { font-family: 'DM Sans', 'Inter', sans-serif; }
      `}</style>
      <div className="w-full max-w-[560px]">{children}</div>
    </div>
  )

  if (isInitializing || consumingFragment || lookupState === 'loading') {
    return pageShell(
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Logo />
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: COLORS.blue }} />
        <p className="mt-4 text-sm font-medium text-slate-500">Vérification de votre invitation…</p>
      </div>
    )
  }

  if (isAuthenticated && user && profile && !needsSecretaryOnboarding(user, profile) && lookupState !== 'ready') {
    return <Navigate to="/dashboard" replace />
  }

  // Shared "Se connecter" / "Aller à la connexion" handler for every
  // terminal screen below. Plain <a href="/login"> used to be enough, but
  // LoginPage itself redirects an already-authenticated user based on
  // needsSecretaryOnboarding() — which used to keep returning true here
  // even for an *already accepted* invitation, because nothing server-side
  // ever recorded onboarding as complete. That's now fixed at the source:
  // mm_finalize_invitation_acceptance sets profiles.onboarding_completed_at
  // (server-controlled, not client-writable) at the moment acceptance
  // finalizes, so needsSecretaryOnboarding() correctly resolves to false by
  // the time she's authenticated here — no client-side state mutation is
  // needed, or appropriate, just to navigate.
  const handleAuthCta = () => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }

  if (lookupState === 'wrong_account') {
    return pageShell(
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Logo />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: '#FEF2F2' }}>
          <ShieldAlert className="h-7 w-7" style={{ color: COLORS.red }} />
        </div>
        <p className="text-lg font-bold" style={{ color: COLORS.navy }}>Ce compte ne correspond pas à l'invitation</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          Vous êtes connecté(e) en tant que <span className="font-semibold text-slate-700">{user?.email}</span>, et
          aucune invitation en attente n'est associée à ce compte.
        </p>
        <button
          type="button"
          onClick={async () => { await supabase.auth.signOut(); window.location.reload() }}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          Se déconnecter et réessayer
        </button>
      </div>
    )
  }

  if (lookupState !== 'ready') {
    const copy = STATE_COPY[lookupState]
    const Icon = copy.icon
    return pageShell(
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Logo />
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: copy.iconBg }}
        >
          <Icon className="h-7 w-7" style={{ color: copy.iconColor }} />
        </div>
        <p className="text-lg font-bold" style={{ color: COLORS.navy }}>{copy.title}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{copy.body}</p>
        <button
          type="button"
          onClick={handleAuthCta}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold text-white transition"
          style={{ backgroundColor: COLORS.blue }}
        >
          {copy.cta}
        </button>
      </div>
    )
  }

  const handleAcceptExisting = async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setExistingError(null)
    setAcceptingExisting(true)
    try {
      const { error } = await supabase.rpc('mm_accept_invitation_by_email')
      if (error) throw error
      setDone(true)
      window.setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1200)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('already has an active secretary')) {
        setSecretarySlotTaken(true)
      } else if (message.includes('already belongs to another clinic')) {
        // mm_finalize_invitation_acceptance's cross-clinic guard — this
        // account already belongs to a different clinic and must never be
        // silently reassigned.
        setExistingError('Cette adresse est déjà associée à un autre cabinet.')
      } else {
        setExistingError("Impossible d'accepter cette invitation pour le moment.")
      }
    } finally {
      setAcceptingExisting(false)
      inFlightRef.current = false
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (inFlightRef.current) return
    setFormError(null)

    const trimmedPrenom = prenom.trim()
    const trimmedNom = nom.trim()
    const trimmedPhone = telephone.trim()
    const fullName = [trimmedPrenom, trimmedNom].filter(Boolean).join(' ')

    if (!trimmedPrenom || !trimmedNom) {
      setFormError('Veuillez saisir votre prénom et votre nom.')
      return
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setFormError('Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Les mots de passe ne correspondent pas.')
      return
    }

    inFlightRef.current = true
    setSubmitting(true)
    try {
      const { error: authUpdateError } = await supabase.auth.updateUser({
        password,
        data: {
          nom_complet: fullName,
          first_name: trimmedPrenom,
          last_name: trimmedNom,
          ...(trimmedPhone ? { telephone: trimmedPhone } : {}),
        },
      })
      if (authUpdateError) throw authUpdateError

      // Atomic, server-side: re-validates the invitation, checks
      // status/expiry, confirms the authenticated email matches, links the
      // profile to the correct tenant, assigns the secrétaire role, and
      // marks the invitation accepted — all in one transaction. The
      // authenticated session (not the URL) is the only identity input.
      const { error: acceptError } = await supabase.rpc('mm_accept_invitation_by_email')
      if (acceptError) throw acceptError

      setDone(true)
      window.setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1400)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('already has an active secretary')) {
        setSecretarySlotTaken(true)
      } else if (message.includes('already belongs to another clinic')) {
        // mm_finalize_invitation_acceptance's cross-clinic guard — this
        // account already belongs to a different clinic and must never be
        // silently reassigned.
        setFormError('Cette adresse est déjà associée à un autre cabinet.')
      } else {
        setFormError('Impossible de finaliser votre inscription pour le moment. Réessayez dans un instant.')
      }
    } finally {
      setSubmitting(false)
      inFlightRef.current = false
    }
  }

  // ---- Terminal states reached only after an accept attempt -------------

  if (secretarySlotTaken) {
    return pageShell(
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Logo />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: '#FFFBEB' }}>
          <AlertTriangle className="h-7 w-7" style={{ color: COLORS.amber }} />
        </div>
        <p className="text-lg font-bold" style={{ color: COLORS.navy }}>Ce cabinet possède déjà une secrétaire</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          Cette invitation ne peut pas être acceptée car un poste de secrétaire est déjà occupé pour ce cabinet.
          Contactez votre médecin pour régulariser la situation.
        </p>
        <button
          type="button"
          onClick={handleAuthCta}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold text-white"
          style={{ backgroundColor: COLORS.blue }}
        >
          Aller à la connexion
        </button>
      </div>
    )
  }

  if (done) {
    return pageShell(
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Logo />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: '#ECFDF5' }}>
          <CheckCircle2 className="h-7 w-7" style={{ color: COLORS.green }} />
        </div>
        <p className="text-lg font-bold" style={{ color: COLORS.navy }}>Bienvenue dans MacroMedica 🎉</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">Votre compte Secrétaire est maintenant activé.</p>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Accès à votre espace…
        </div>
      </div>
    )
  }

  // ---- Ready: invitation confirmed, finalize account ---------------------

  return pageShell(
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-center">
        <Logo />
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: COLORS.navy }}>Bienvenue sur MacroMedica</h1>
        <p className="mt-2 text-sm text-slate-500">
          Votre invitation a été confirmée. {isExistingAccount ? 'Confirmez pour rejoindre le cabinet.' : 'Finalisez votre compte pour commencer.'}
        </p>
      </div>

      <div className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/50 px-4">
        {invitationClinicName && (
          <SummaryRow icon={Building2} label="Cabinet" value={invitationClinicName} />
        )}
        <SummaryRow icon={Briefcase} label="Poste" value={roleLabel(invitationRole)} />
        {user?.email && <SummaryRow icon={Mail} label="Email" value={user.email} />}
        {invitationExpiresAt && (
          <SummaryRow icon={CalendarClock} label="Invitation valable jusqu'au" value={formatExpiry(invitationExpiresAt)} />
        )}
      </div>

      {isExistingAccount ? (
        /* ── Existing MacroMedica account: acceptance is a separate, ────
           explicit step — never automatic from authentication alone ──── */
        <div className="mt-6 space-y-4 text-center">
          <p className="text-sm font-semibold" style={{ color: COLORS.navy }}>Votre compte existe déjà</p>
          <p className="text-sm text-slate-500">Cette invitation vous permet de rejoindre un nouveau cabinet.</p>
          {existingError && <ErrorNotice message={existingError} />}
          <PrimaryButton
            type="button"
            onClick={handleAcceptExisting}
            loading={acceptingExisting}
            loadingLabel="Acceptation…"
          >
            Accepter l'invitation
          </PrimaryButton>
        </div>
      ) : !showForm ? (
        /* ── New account: summary is shown first on its own — never a ───
           raw form immediately ─────────────────────────────────────── */
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white transition active:scale-[0.99]"
          style={{ backgroundColor: COLORS.blue }}
        >
          Continuer
        </button>
      ) : (
        /* ── New account: profile + password, single finalization step ── */
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <p className="mb-3 text-sm font-bold" style={{ color: COLORS.navy }}>Votre profil</p>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput
                label="Prénom"
                icon={User}
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                required
                autoFocus
                placeholder="Marie"
              />
              <LabeledInput
                label="Nom"
                icon={User}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                placeholder="Dupont"
              />
            </div>
            <div className="mt-3">
              <LabeledInput
                label="Téléphone (optionnel)"
                icon={Phone}
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-bold" style={{ color: COLORS.navy }}>Créer votre mot de passe</p>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Mot de passe</span>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition focus-within:border-[#1A56DB] focus-within:ring-2 focus-within:ring-[#1A56DB]/10">
                  <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Créez un mot de passe"
                    className="w-full border-0 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="shrink-0 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1">
                {[
                  { ok: password.length >= 8, label: '8 caractères min.' },
                  { ok: /[a-zA-Z]/.test(password), label: 'Une lettre' },
                  { ok: /[0-9]/.test(password), label: 'Un chiffre' },
                ].map(({ ok, label }) => (
                  <span key={label} className="flex items-center gap-1 text-[11px] font-medium" style={{ color: ok ? COLORS.green : '#94A3B8' }}>
                    <Check className="h-3 w-3" />
                    {label}
                  </span>
                ))}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Confirmer le mot de passe</span>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition focus-within:border-[#1A56DB] focus-within:ring-2 focus-within:ring-[#1A56DB]/10">
                  <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Répétez le mot de passe"
                    className="w-full border-0 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="shrink-0 text-slate-400 hover:text-slate-600">
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>
          </div>

          {formError && <ErrorNotice message={formError} />}

          <PrimaryButton type="submit" loading={submitting} loadingLabel="Activation en cours…">
            Activer mon compte
          </PrimaryButton>
        </form>
      )}
    </div>
  )
}
