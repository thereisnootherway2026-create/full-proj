import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { RDV_STATUSES } from '../lib/workflow'
import { normalizeRole, toLegacyRole } from '../lib/rbac'
import { getDoctors, getTodayVisits, subscribeClinicPayments, subscribeClinicVisits } from '../lib/visitService'

const AppContext = createContext(null)
const PREFS_KEY = 'macromedica-notification-prefs'

const buildId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

// Role mapping logic moved directly to App.jsx RootRedirect

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  // Server-authoritative permission set (role default + per-user overrides,
  // resolved by mm_get_my_permissions()). This is a UX cache only — every
  // sensitive RPC re-checks mm_has_permission()/mm_assert_permission()
  // server-side regardless of what this set says, so a stale/tampered
  // client value can only ever hide or show a button, never grant real
  // access. Doctors/admins get every key back from the RPC itself, so
  // `can()` works uniformly for all roles without special-casing here.
  const [permissions, setPermissions] = useState(() => new Set())
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

  const [patients, setPatients] = useState([])
  const [rdvList, setRdvList] = useState([])
  const [visits, setVisits] = useState([])
  const [doctors, setDoctors] = useState([])
  const [consultations, setConsultations] = useState([])
  const [dataErrors, setDataErrors] = useState({})
  // Canonical tenant identity is clinic_id. cabinet_id is retained only as a
  // backwards-compatible alias for profiles awaiting the Phase 4 backfill.
  const clinicId = profile?.clinic_id || profile?.cabinet_id || null
  const cabinetId = clinicId

  useEffect(() => {
    if (import.meta.env.DEV && profile) {
      console.debug('[tenant]', {
        userId: user?.id,
        profileId: profile.id,
        clinicId: profile.clinic_id || null,
        legacyCabinetId: profile.cabinet_id || null,
        canonicalClinicId: clinicId,
      })
    }
  }, [user?.id, profile, clinicId])

  // Derived operational waiting list from visits
  const waitingList = useMemo(() => {
    return visits
      .filter((visit) => ['waiting', 'called', 'consultation'].includes(visit.status))
      .sort((a, b) => (a.queue_number || 9999) - (b.queue_number || 9999))
  }, [visits])

  const [toasts, setToasts] = useState([])
  const [globalModal, setGlobalModal] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || '{"email":true,"browser":true,"reminders":true}')
    } catch {
      return { email: true, browser: true, reminders: true }
    }
  })
  
  // DEV SWITCHER — role override for development only
  const [devRoleOverride, setDevRoleOverride] = useState(() => {
    try {
      return localStorage.getItem('macromedica-dev-role-override') || null
    } catch {
      return null
    }
  })

  const currentUserIdRef = useRef(null)
  const initDoneRef = useRef(false)

  // Fetch profile by user ID
  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, cabinets(*)')
        .eq('id', userId)
        .single()
      if (error) throw error
      return data
    } catch (err) {
      console.error('Profile fetch error:', err)
      return null
    }
  }, [])

  const loadPatients = useCallback(async (cId) => {
    try {
      setDataErrors((current) => ({ ...current, patients: null }))
      // antecedents/allergies/groupe_sanguin are revoked at the column-
      // privilege level for the shared authenticated role (see migration
      // 20260912070000) — a bare select('*') would error for everyone here,
      // not just secretaries. Doctor/admin get them via mm_get_patient_clinical.
      const { data, error } = await supabase.from('patients').select('id, cabinet_id, nom, prenom, telephone, date_naissance, cin, adresse, mutuelle, numero_cnss, email, ville, sexe, created_at').eq('cabinet_id', cId).order('created_at', { ascending: false })
      if (error) {
        console.error('Patients load error:', error)
        setDataErrors((current) => ({ ...current, patients: error }))
        return
      }
      if (data) setPatients(data)
    } catch (err) {
      console.error('Patients load error:', err)
      setDataErrors((current) => ({ ...current, patients: err }))
    }
  }, [])

  const loadRdv = useCallback(async (cId) => {
    try {
      setDataErrors((current) => ({ ...current, appointments: null }))
      const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
      const { data, error } = await supabase
        .from('rdv')
        .select(`*, patients(id, nom, prenom, telephone)`)
        .eq('cabinet_id', cId)
        .gte('date_rdv', `${today}T00:00:00`)
        .lte('date_rdv', `${today}T23:59:59`)
        .order('start_time', { ascending: true, nullsFirst: false })
        .order('date_rdv', { ascending: true })
      if (error) {
        console.error('Rdv load error:', error)
        setDataErrors((current) => ({ ...current, appointments: error }))
        return
      }
      if (data) setRdvList(data)
    } catch (err) {
      console.error('Rdv load error:', err)
      setDataErrors((current) => ({ ...current, appointments: err }))
    }
  }, [])

  const loadConsultations = useCallback(async (cId) => {
    try {
      setDataErrors((current) => ({ ...current, consultations: null }))
      const { data, error } = await supabase.from('consultations').select(`*, patients(nom, prenom)`).eq('cabinet_id', cId).order('date_consult', { ascending: false })
      if (error) {
        console.error('Consultations load error:', error)
        setDataErrors((current) => ({ ...current, consultations: error }))
        return
      }
      if (data) setConsultations(data)
    } catch (err) {
      console.error('Consultations load error:', err)
      setDataErrors((current) => ({ ...current, consultations: err }))
    }
  }, [])

  const loadVisits = useCallback(async (cId) => {
    try {
      setDataErrors((current) => ({ ...current, visits: null }))
      const data = await getTodayVisits(cId)
      if (data) setVisits(data)
    } catch (err) {
      console.error('Visits load error:', err?.message || err?.code || err)
      setDataErrors((current) => ({ ...current, visits: err }))
    }
  }, [])

  const loadDoctors = useCallback(async (cId) => {
    try {
      const data = await getDoctors(cId)
      if (data) setDoctors(data)
    } catch (err) {
      console.error('Doctors load error:', err)
    }
  }, [])

  // Fetches the effective permission set for the current session
  // (mm_get_my_permissions(): role default + any per-user override,
  // resolved entirely server-side). Safe to call unconditionally — it
  // returns an empty set for an unauthenticated caller.
  const fetchPermissions = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('mm_get_my_permissions')
      if (error) throw error
      setPermissions(new Set((data || []).map((row) => row.permission_key)))
    } catch (err) {
      console.error('Permissions fetch error:', err)
      // Fail closed: on any error, the permission set stays whatever it
      // was (empty on first load) — an unrecognized/undefined permission
      // is always treated as denied by can(), never as allowed.
    } finally {
      setPermissionsLoaded(true)
    }
  }, [])

  // Handle a valid session — set user + profile + authenticated
  const handleSession = useCallback(async (session) => {
    if (!session?.user) {
      // No session — clear all business data
      currentUserIdRef.current = null
      setUser(null)
      setProfile(null)
      setIsAuthenticated(false)
      setPermissions(new Set())
      setPermissionsLoaded(false)
      setPatients([])
      setRdvList([])
      setVisits([])
      setDoctors([])
      setConsultations([])
      return
    }

    // Skip if we already loaded this user
    if (currentUserIdRef.current === session.user.id) return

    const prof = await fetchProfile(session.user.id)

    // Always authenticate if we have a valid session
    currentUserIdRef.current = session.user.id
    setUser(session.user)
    setIsAuthenticated(true)
    fetchPermissions()

    if (prof) {
      setProfile(prof)
      if (prof.clinic_id || prof.cabinet_id) {
        const tenantId = prof.clinic_id || prof.cabinet_id
         Promise.all([
           loadPatients(tenantId),
           loadRdv(tenantId),
           loadConsultations(tenantId),
           loadVisits(tenantId),
           loadDoctors(tenantId)
         ]).catch(console.error)
      }
    } else {
      // Profile not found yet (new signup / invite) — build from user metadata
      const meta = session.user.user_metadata || {}
      setProfile({
        id: session.user.id,
        nom_complet: meta.nom_complet || 'Utilisateur',
        role: meta.role || 'docteur',
        cabinet_id: meta.cabinet_id || null,
        clinic_id: meta.clinic_id || null,
      })
    }
  }, [fetchProfile, fetchPermissions, loadPatients, loadRdv, loadConsultations, loadVisits, loadDoctors])

  useEffect(() => {
    // SINGLE source of truth: getSession() on mount, then listen for changes.
    // We do NOT set isAuthenticated until the profile is successfully fetched.
    // This prevents the "stale session → redirect to dashboard → fail → back to login" loop.

    // Purge any stale visits cache from previous sessions — Supabase is the source of truth
    localStorage.removeItem('macromedica_visits_cache')

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await handleSession(session)
    }).catch(err => {
      console.error('Session error:', err)
    }).finally(() => {
      initDoneRef.current = true
      setIsInitializing(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Ignore events that fire before getSession has completed
        // This prevents the race condition
        if (!initDoneRef.current) return

        if (event === 'SIGNED_IN') {
          await handleSession(session)
        } else if (event === 'USER_UPDATED' && session?.user) {
          await handleSession(session)
        } else if (event === 'SIGNED_OUT') {
          currentUserIdRef.current = null
          setUser(null)
          setProfile(null)
          setIsAuthenticated(false)
          setPatients([])
          setRdvList([])
          setVisits([])
          setDoctors([])
          setConsultations([])
          localStorage.removeItem('macromedica_visits_cache')
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Only update user object, don't re-fetch profile
          setUser(session.user)
        } else if (event === 'USER_UPDATED' && !session) {
          // Handle invalid refresh token by signing out
          await supabase.auth.signOut()
        }
        // Ignore INITIAL_SESSION — already handled by getSession
      }
    )

    return () => subscription.unsubscribe()
  }, [handleSession])

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(notificationPrefs))
  }, [notificationPrefs])

  // DEV SWITCHER — persist role override
  useEffect(() => {
    if (devRoleOverride) {
      localStorage.setItem('macromedica-dev-role-override', devRoleOverride)
    } else {
      localStorage.removeItem('macromedica-dev-role-override')
    }
  }, [devRoleOverride])

  const rdvRealtimeTimeoutRef = useRef(null)

  useEffect(() => {
    if (!cabinetId) return

    // Centralized realtime sync for the dashboard / waiting room.
    //
    // Debounced: an action like "Ajouter à la salle" already applies its own
    // optimistic local update (DashboardPage's localRdvList) AND updates the
    // database, which in turn fires THIS SAME realtime event almost
    // immediately. Calling loadRdv() synchronously on every event replaces
    // the entire rdvList array (a fresh SELECT, all-new object references)
    // while the card's exit animation is still mid-flight — that full-list
    // swap fights with AnimatePresence's own reconciliation and was making
    // unrelated cards flicker/disappear instead of just the one being
    // removed. Debouncing coalesces bursts of events (including the one the
    // user's own click just caused) into a single refetch after the UI has
    // had a moment to settle, without weakening the resync itself — it
    // still remains the source of truth for other tabs/users' changes.
    const scheduleRdvReload = () => {
      if (rdvRealtimeTimeoutRef.current) clearTimeout(rdvRealtimeTimeoutRef.current)
      rdvRealtimeTimeoutRef.current = setTimeout(() => {
        rdvRealtimeTimeoutRef.current = null
        loadRdv(cabinetId)
      }, 600)
    }

    const rdvChannel = supabase
      .channel('app-global-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rdv', filter: `cabinet_id=eq.${cabinetId}` },
        scheduleRdvReload
      )
      .subscribe()

    const visitChannel = subscribeClinicVisits(cabinetId, () => loadVisits(cabinetId))
    const paymentChannel = subscribeClinicPayments(cabinetId, () => {
      loadVisits(cabinetId)
      loadConsultations(cabinetId)
      window.dispatchEvent(new CustomEvent('mm:payments-changed'))
    })

    return () => {
      if (rdvRealtimeTimeoutRef.current) clearTimeout(rdvRealtimeTimeoutRef.current)
      supabase.removeChannel(rdvChannel)
      supabase.removeChannel(visitChannel)
      supabase.removeChannel(paymentChannel)
    }
  }, [cabinetId, loadRdv, loadVisits, loadConsultations])

  const pushToast = (toast) => {
    const id = buildId('toast')
    setToasts((current) => [...current, { id, tone: toast.tone || 'success', ...toast }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 3200)
  }

  // Login: sign in, then immediately fetch profile so navigation can happen
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) {
      if (error.message.includes('Invalid')) {
        throw new Error('Email ou mot de passe incorrect')
      }
      if (error.message.includes('network')) {
        throw new Error('Problème de connexion réseau')
      }
      throw new Error(error.message)
    }
    // Set state immediately so the caller can navigate
    if (data.user) {
      const prof = await fetchProfile(data.user.id)
      currentUserIdRef.current = data.user.id
      setUser(data.user)
      setIsAuthenticated(true)

      if (prof) {
        setProfile(prof)
        if (prof.clinic_id || prof.cabinet_id) {
          const tenantId = prof.clinic_id || prof.cabinet_id
           Promise.all([
             loadPatients(tenantId),
             loadRdv(tenantId),
             loadConsultations(tenantId),
             loadVisits(tenantId),
             loadDoctors(tenantId)
           ]).catch(console.error)
        }
      } else {
        // Profile not found — build minimal profile from user metadata
        const meta = data.user.user_metadata || {}
        setProfile({
          id: data.user.id,
          nom_complet: meta.nom_complet || 'Utilisateur',
          role: 'docteur',
          cabinet_id: null,
          clinics: null
        })
      }
    }
    pushToast({ title: 'Connexion réussie', description: `Bienvenue ${email}.` })
    return data
  }

  // Logout: clear everything and hard redirect
  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Logout error:', err)
    }
    currentUserIdRef.current = null
    setUser(null)
    setProfile(null)
    setIsAuthenticated(false)
    setPatients([])
    setRdvList([])
    setVisits([])
    setDoctors([])
    setConsultations([])
    localStorage.removeItem(PREFS_KEY)
    localStorage.removeItem('macromedica_visits_cache')
    window.location.href = '/'
  }

  // DEV SWITCHER — use dev override first, then real profile role. Never active outside dev builds,
  // so a stale localStorage override can't silently grant a fake role in production.
  const baseRole = (import.meta.env.DEV && devRoleOverride) || profile?.role || 'doctor'
  const canonicalRole = normalizeRole(baseRole)
  const role = toLegacyRole(canonicalRole)

  // Optimistically update a single visit's status
  const updateVisitStatus = useCallback((visitId, newStatus, extra = {}) => {
    const rawId = String(visitId || '').replace(/^pay_/, '').replace(/^consult_/, '')
    setVisits(current => {
      let found = false
      const updated = current.map(visit => {
        const vId = String(visit.id || '')
        const isMatch = vId === visitId || vId === rawId || `pay_${vId}` === visitId || visit.visit_id === rawId || (visit.rdv && (visit.rdv.id === visitId || visit.rdv.id === rawId))
        if (isMatch) {
          found = true
          return {
            ...visit,
            status: newStatus,
            billing_type: extra.method || visit.billing_type || 'cash',
            billing_amount: extra.amount !== undefined ? Number(extra.amount) : (visit.billing_amount || 300),
            updated_at: new Date().toISOString(),
            ...extra
          }
        }
        return visit
      })

      /*
        const newEntry = {
          id: visitId,
          patient_id: extra.patient_id || 'pat_01',
          status: newStatus,
          billing_amount: extra.amount !== undefined ? Number(extra.amount) : 300,
          billing_type: extra.method || 'cash',
          motif: extra.motif || 'Consultation médicale',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          patients: extra.patient_name ? { prenom: extra.patient_name.split(' ')[0], nom: extra.patient_name.split(' ').slice(1).join(' ') } : { prenom: 'Patient', nom: 'Inconnu' },
          ...extra
        }
        return [newEntry, ...updated]
      */

      return updated
    })
  }, [])

  // Remove a visit from AppContext visits array (used by undo of ADD_TO_QUEUE)
  const removeVisit = useCallback((visitId) => {
    const rawId = String(visitId || '').replace(/^pay_/, '').replace(/^consult_/, '')
    setVisits(current => current.filter(visit => {
      const vId = String(visit.id || '')
      return vId !== visitId && vId !== rawId
    }))
  }, [])

  // Update patient debt (solde_impaye)
  const updatePatientDebt = useCallback((patientId, debtAmount) => {
    if (!patientId) return
    setPatients(current => current.map(p => {
      if (p.id === patientId || p.id === String(patientId)) {
        return { ...p, solde_impaye: Math.max(0, Number(debtAmount || 0)) }
      }
      return p
    }))
  }, [])

  // Fail-closed permission check: an unrecognized/undefined permission key,
  // or a permission set that hasn't loaded yet, is always denied — never
  // implicitly allowed. This is a UX convenience only; see fetchPermissions.
  const can = useCallback((permissionKey) => permissions.has(permissionKey), [permissions])

  const value = useMemo(() => ({
    user,
    profile,
    role,
    canonicalRole,
    devRoleOverride,
    setDevRoleOverride,
    permissions,
    permissionsLoaded,
    can,
    refreshPermissions: fetchPermissions,
    cabinet: profile?.clinics,
    clinicId,
    cabinetId: clinicId,
    currentUser: profile
      ? { name: profile.nom_complet, role: profile.role }
      : { name: 'Utilisateur', role: 'Staff' },
    isAuthenticated,
    isInitializing,
    toasts,
    globalModal,
    confirmDialog,
    notificationPrefs,
    dataErrors,

    login,
    logout,

    setNotificationPrefs,
    openGlobalModal(type, payload = {}) { setGlobalModal({ type, payload }) },
    closeGlobalModal() { setGlobalModal(null) },
    requestConfirmation(config) { setConfirmDialog(config) },
    closeConfirmation() { setConfirmDialog(null) },
    dismissToast(id) { setToasts((c) => c.filter((t) => t.id !== id)) },
    notify(toast) { pushToast(toast) },

    // Fallbacks for un-migrated components
    patients,
    rdvList,
    appointments: rdvList,
    consultations,
    visits,
    doctors,
    waitingList,
    invoices: [],
    staff: [],
    getPatientName: () => 'Patient...',

    updateVisitStatus,
    removeVisit,
    updatePatientDebt,

    refreshPatients: () => clinicId && loadPatients(clinicId),
    refreshRdv: () => clinicId && loadRdv(clinicId),
    refreshConsultations: () => clinicId && loadConsultations(clinicId),
    refreshVisits: () => clinicId && loadVisits(clinicId),
    refreshDoctors: () => clinicId && loadDoctors(clinicId),
    refreshAll: () => {
      if (clinicId) {
        loadPatients(clinicId)
        loadRdv(clinicId)
        loadConsultations(clinicId)
        loadVisits(clinicId)
        loadDoctors(clinicId)
      }
    },
  }), [user, profile, role, canonicalRole, permissions, permissionsLoaded, can, fetchPermissions, clinicId, isAuthenticated, isInitializing, toasts, globalModal, confirmDialog, notificationPrefs, dataErrors, patients, rdvList, consultations, visits, doctors, waitingList, updateVisitStatus, removeVisit, updatePatientDebt])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppContext must be used within AppProvider')
  return context
}

export const useApp = useAppContext
