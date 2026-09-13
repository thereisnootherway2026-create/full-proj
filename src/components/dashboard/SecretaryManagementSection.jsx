import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Lock,
  Mail,
  RotateCw,
  Send,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getTenantSecretaryId } from '../../lib/tenantService'
import { normalizeRole } from '../../lib/rbac'

const INVITE_STEPS = [
  'Saisissez l\'email professionnel de votre secrétaire',
  'Elle reçoit un code par email',
  'Accès au tableau de bord, agenda et facturation',
]

// Only these domains are exposed to per-secretary configuration — matches
// the product's explicit list. Clinical data (dossiers.update, staff.*,
// settings.*) is intentionally never shown here: it's enforced server-side
// as doctor/admin-only regardless of what this UI would let anyone toggle.
const PERMISSION_GROUP_LABELS = {
  appointments: 'Rendez-vous',
  waiting_room: "Salle d'attente",
  patients: 'Patients',
  dossiers: 'Dossiers',
  billing: 'Facturation',
  tasks: 'Tâches',
}
const PERMISSION_GROUP_ORDER = ['appointments', 'waiting_room', 'patients', 'dossiers', 'billing', 'tasks']

// Seeded in the permission catalogue for future use but not backed by any
// live RPC/RLS check today (confirmed by full-repo audit) — showing a
// toggle for these would present a permission as functional when nothing
// actually depends on it. Hide until a real capability exists behind them.
const NOT_YET_IMPLEMENTED_PERMISSIONS = new Set([
  'billing.mark_paid',
  'billing.refund',
  'waiting_room.change_status',
])

function emailLooksValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

async function callInviteFunction(method, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expirée — reconnectez-vous.')

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-secretary`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Une erreur est survenue.')
  return result
}

export default function SecretaryManagementSection({ cabinetId, notify, userRole }) {
  const isDoctor = normalizeRole(userRole) === 'doctor' || userRole === 'docteur'
  const queryClient = useQueryClient()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [resendingId, setResendingId] = useState(null)
  const [revokingInviteId, setRevokingInviteId] = useState(null)
  const [secretary, setSecretary] = useState(null)
  const [secLoading, setSecLoading] = useState(true)
  const sessionRef = useRef(null)

  const loadSecretary = useCallback(async () => {
    if (!cabinetId) {
      setSecretary(null)
      setSecLoading(false)
      return
    }
    setSecLoading(true)
    try {
      const secretaryId = await getTenantSecretaryId(cabinetId)
      if (!secretaryId) {
        setSecretary(null)
        return
      }
      const { data: secProfile } = await supabase
        .from('profiles')
        .select('id, nom_complet, role')
        .eq('id', secretaryId)
        .maybeSingle()
      setSecretary(secProfile || null)
    } catch {
      setSecretary(null)
    } finally {
      setSecLoading(false)
    }
  }, [cabinetId])

  useEffect(() => {
    loadSecretary()
  }, [loadSecretary])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      sessionRef.current = data.session
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionRef.current = session
    })
    return () => subscription.unsubscribe()
  }, [])

  // Pending invitations for this clinic — RLS already scopes this to the
  // caller's own clinic_id, so no client-side filtering is needed/trusted.
  const { data: pendingInvitations = [], isLoading: invitationsLoading } = useQuery({
    queryKey: ['secretary-invitations', cabinetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, status, created_at, expires_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: Boolean(cabinetId) && isDoctor,
  })

  const invalidateInvitations = () => queryClient.invalidateQueries({ queryKey: ['secretary-invitations', cabinetId] })

  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const [togglingKey, setTogglingKey] = useState(null)

  // Effective permissions for the current secretary — always re-fetched from
  // the server (mm_get_user_permissions), never assumed from role. Doctor/
  // admin only; the RPC itself re-checks that server-side regardless of
  // what this UI does.
  const {
    data: secretaryPermissions = [],
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useQuery({
    queryKey: ['secretary-permissions', secretary?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mm_get_user_permissions', {
        p_user_id: secretary.id,
      })
      if (error) throw error
      return data || []
    },
    enabled: Boolean(secretary?.id) && isDoctor && permissionsOpen,
  })

  const invalidatePermissions = () =>
    queryClient.invalidateQueries({ queryKey: ['secretary-permissions', secretary?.id] })

  const handleTogglePermission = async (permissionKey, nextGranted) => {
    if (!secretary?.id) return
    setTogglingKey(permissionKey)
    try {
      const { error } = await supabase.rpc('mm_set_user_permission', {
        p_user_id: secretary.id,
        p_permission_key: permissionKey,
        p_granted: nextGranted,
      })
      if (error) throw error
      invalidatePermissions()
    } catch (err) {
      notify({ title: 'Erreur', description: err.message, tone: 'error' })
    } finally {
      setTogglingKey(null)
    }
  }

  const groupedPermissions = PERMISSION_GROUP_ORDER
    .map((group) => ({
      group,
      label: PERMISSION_GROUP_LABELS[group],
      items: secretaryPermissions.filter((p) => p.group === group && !NOT_YET_IMPLEMENTED_PERMISSIONS.has(p.permission_key)),
    }))
    .filter((g) => g.items.length > 0)

  const handleInvite = async (event) => {
    event?.preventDefault()

    if (!isDoctor) return

    if (!cabinetId) {
      notify({
        title: 'Cabinet manquant',
        description: 'Reconnectez-vous ou exécutez fix_cabinet_owner.sql dans Supabase.',
        tone: 'error',
      })
      return
    }

    const email = inviteEmail.trim().toLowerCase()
    if (!emailLooksValid(email)) {
      notify({ title: 'Email invalide', description: 'Saisissez une adresse email valide.', tone: 'error' })
      return
    }

    setInviteLoading(true)
    setInviteSuccess(false)

    try {
      await callInviteFunction('POST', { email })

      setInviteSuccess(true)
      setInviteEmail('')
      notify({
        title: 'Invitation envoyée',
        description: `Un email avec un code d'activation a été envoyé à ${email}.`,
        variant: 'success',
      })
      invalidateInvitations()
      window.setTimeout(() => setInviteSuccess(false), 4000)
    } catch (err) {
      notify({ title: 'Erreur', description: err.message, tone: 'error' })
    } finally {
      setInviteLoading(false)
    }
  }

  const handleResend = async (invitationId) => {
    setResendingId(invitationId)
    try {
      await callInviteFunction('PATCH', { invitation_id: invitationId })
      notify({ title: 'Invitation renvoyée', description: 'Un nouveau code a été envoyé.', variant: 'success' })
      invalidateInvitations()
    } catch (err) {
      notify({ title: 'Erreur', description: err.message, tone: 'error' })
    } finally {
      setResendingId(null)
    }
  }

  const handleRevokeInvitation = async (invitationId) => {
    if (!window.confirm('Révoquer cette invitation ? Elle ne pourra plus être utilisée.')) return
    setRevokingInviteId(invitationId)
    try {
      await callInviteFunction('DELETE', { invitation_id: invitationId })
      notify({ title: 'Invitation révoquée', variant: 'success' })
      invalidateInvitations()
    } catch (err) {
      notify({ title: 'Erreur', description: err.message, tone: 'error' })
    } finally {
      setRevokingInviteId(null)
    }
  }

  const handleRevoke = async () => {
    if (!secretary) return
    if (!window.confirm(`Révoquer l'accès de ${secretary.nom_complet || 'cette secrétaire'} ?`)) return

    setRevokeLoading(true)
    try {
      await callInviteFunction('DELETE', { secretary_id: secretary.id })
      setSecretary(null)
      notify({ title: 'Accès révoqué', description: 'La secrétaire a été retirée.', variant: 'success' })
    } catch (err) {
      notify({ title: 'Erreur', description: err.message, tone: 'error' })
    } finally {
      setRevokeLoading(false)
    }
  }

  if (!isDoctor) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Équipe d&apos;accueil</h3>
              <p className="text-sm text-slate-500">Géré par le praticien titulaire</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-8 text-center text-sm text-slate-500">
          Seul le médecin peut inviter ou révoquer une secrétaire.
        </div>
      </section>
    )
  }

  const emailValid = emailLooksValid(inviteEmail)
  const hasPendingInvitation = pendingInvitations.length > 0
  const canSubmit = emailValid && !inviteLoading && !secretary && !hasPendingInvitation

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50/90 via-white to-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/25">
              <Users size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-slate-900">Gestion secrétaire</h3>
              <p className="mt-0.5 text-sm text-slate-500">
                Accueil, file d&apos;attente et facturation
              </p>
            </div>
          </div>
          {!secLoading && (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                secretary
                  ? 'bg-emerald-100 text-emerald-800'
                  : hasPendingInvitation
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {secretary ? 'Poste occupé' : hasPendingInvitation ? 'Invitation envoyée' : 'Poste vacant'}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {secLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-20 rounded-2xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
          </div>
        ) : secretary ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-blue-50/50 p-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-600/20">
                {(secretary.nom_complet || 'S')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-slate-900">
                  {secretary.nom_complet || 'Secrétaire'}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <ShieldCheck size={14} />
                  Accès actif — 1 secrétaire max
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setPermissionsOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  Permissions et accès
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${permissionsOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {permissionsOpen && (
                <div className="border-t border-slate-100 px-4 py-4">
                  <p className="mb-4 text-xs leading-snug text-slate-500">
                    Contrôlez précisément ce que cette secrétaire peut faire. Ces réglages sont
                    appliqués et vérifiés côté serveur — désactiver une action ici la bloque
                    réellement, pas seulement dans l&apos;affichage.
                  </p>

                  {permissionsLoading ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
                      ))}
                    </div>
                  ) : permissionsError ? (
                    <p className="text-xs font-medium text-rose-600">
                      Impossible de charger les permissions : {permissionsError.message}
                    </p>
                  ) : (
                    <div className="space-y-5">
                      {groupedPermissions.map(({ group, label, items }) => (
                        <div key={group}>
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                            {label}
                          </p>
                          <div className="space-y-1.5">
                            {items.map((item) => (
                              <div
                                key={item.permission_key}
                                className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 hover:bg-slate-50"
                              >
                                <span className="text-sm font-medium text-slate-700">
                                  {item.description || item.permission_key}
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={item.granted}
                                  disabled={togglingKey === item.permission_key}
                                  onClick={() => handleTogglePermission(item.permission_key, !item.granted)}
                                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                                    item.granted ? 'bg-blue-600' : 'bg-slate-200'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition ${
                                      item.granted ? 'translate-x-5' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>
                          Les données cliniques (diagnostics, prescriptions, notes de
                          consultation) restent toujours réservées au médecin, quels que soient
                          ces réglages.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleRevoke}
              disabled={revokeLoading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 active:scale-[0.99] disabled:opacity-60"
            >
              {revokeLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldX className="h-4 w-4" />
              )}
              {revokeLoading ? 'Révocation...' : "Révoquer l'accès"}
            </button>
          </div>
        ) : (
          <>
            {!hasPendingInvitation && (
              <div className="space-y-5">
                {/* How it works */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <Sparkles size={14} className="text-blue-600" />
                    Comment ça marche
                  </div>
                  <ol className="space-y-2.5">
                    {INVITE_STEPS.map((step, index) => (
                      <li key={step} className="flex gap-3 text-sm text-slate-600">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                          {index + 1}
                        </span>
                        <span className="pt-0.5 leading-snug">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Invite form */}
                <form onSubmit={handleInvite} className="space-y-3">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      Email professionnel
                    </span>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        strokeWidth={2}
                      />
                      <input
                        type="email"
                        autoComplete="email"
                        value={inviteEmail}
                        onChange={(e) => {
                          setInviteEmail(e.target.value)
                          setInviteSuccess(false)
                        }}
                        placeholder="marie.dupont@votrecabinet.ma"
                        disabled={inviteLoading}
                        className={`w-full rounded-2xl border bg-white py-3.5 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 disabled:opacity-60 ${
                          emailValid
                            ? 'border-blue-300 ring-2 ring-blue-500/10'
                            : 'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15'
                        }`}
                      />
                      {emailValid && !inviteLoading && (
                        <CheckCircle2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" />
                      )}
                    </div>
                  </label>

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${
                      inviteSuccess
                        ? 'bg-emerald-600 shadow-emerald-600/25'
                        : 'bg-blue-600 shadow-blue-600/25 hover:bg-blue-700'
                    }`}
                  >
                    {inviteLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : inviteSuccess ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Invitation envoyée
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Inviter la secrétaire
                      </>
                    )}
                  </button>
                </form>

                {!cabinetId && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    Votre profil n&apos;est pas lié à un cabinet — l&apos;invitation ne pourra pas aboutir.
                  </p>
                )}
              </div>
            )}

            {/* Pending invitations */}
            {!invitationsLoading && pendingInvitations.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Invitations en attente
                </p>
                {pendingInvitations.map((inv) => (
                  <div key={inv.id} className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{inv.email}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <Clock size={12} />
                          Invitée le {formatDate(inv.created_at)} · Expire le {formatDate(inv.expires_at)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleResend(inv.id)}
                          disabled={resendingId === inv.id}
                          title="Renvoyer l'invitation"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                        >
                          {resendingId === inv.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCw className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeInvitation(inv.id)}
                          disabled={revokingInviteId === inv.id}
                          title="Révoquer l'invitation"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                        >
                          {revokingInviteId === inv.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
