import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { RDV_STATUSES } from '../lib/workflow'
import { normalizeRole, toLegacyRole } from '../lib/rbac'
import { getDoctors, getTodayVisits, subscribeClinicPayments, subscribeClinicVisits } from '../lib/visitService'
import {
  MOCK_PATIENTS,
  MOCK_RDV,
  MOCK_VISITS,
  MOCK_DOCTORS,
  MOCK_CONSULTATIONS,
} from '../lib/mockData'

const AppContext = createContext(null)
const PREFS_KEY = 'macromedica-notification-prefs'

const buildId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

// Role mapping logic moved directly to App.jsx RootRedirect

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)

  const [patients, setPatients] = useState(MOCK_PATIENTS)
  const [rdvList, setRdvList] = useState(MOCK_RDV)
  const [visits, setVisits] = useState(() => {
    try {
      const cached = localStorage.getItem('macromedica_visits_cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch (e) {
      console.warn('Visits cache load error:', e)
    }
    return MOCK_VISITS
  })
  const [doctors, setDoctors] = useState(MOCK_DOCTORS)
  const [consultations, setConsultations] = useState(MOCK_CONSULTATIONS)
  const cabinetId = profile?.cabinet_id ?? profile?.clinic_id

  useEffect(() => {
    try {
      localStorage.setItem('macromedica_visits_cache', JSON.stringify(visits))
    } catch (e) {
      console.warn('Visits cache save error:', e)
    }
  }, [visits])

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
      const { data, error } = await supabase.from('patients').select('*').eq('cabinet_id', cId).order('created_at', { ascending: false })
      if (error) {
        console.error('Patients load error:', error)
        return
      }
      if (data && data.length > 0) setPatients(data)
    } catch (err) {
      console.error('Patients load error:', err)
    }
  }, [])

  const loadRdv = useCallback(async (cId) => {
    try {
      const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
      const { data, error } = await supabase
        .from('rdv')
        .select(`*, patients(id, nom, prenom, telephone)`)
        .eq('cabinet_id', cId)
        .gte('date_rdv', `${today}T00:00:00`)
        .lte('date_rdv', `${today}T23:59:59`)
        .order('date_rdv', { ascending: true })
      if (error) {
        console.error('Rdv load error:', error)
        return
      }
      if (data && data.length > 0) setRdvList(data)
    } catch (err) {
      console.error('Rdv load error:', err)
    }
  }, [])

  const loadConsultations = useCallback(async (cId) => {
    try {
      const { data, error } = await supabase.from('consultations').select(`*, patients(nom, prenom)`).eq('cabinet_id', cId).order('date_consult', { ascending: false })
      if (error) {
        console.error('Consultations load error:', error)
        return
      }
      if (data && data.length > 0) setConsultations(data)
    } catch (err) {
      console.error('Consultations load error:', err)
    }
  }, [])

  const loadVisits = useCallback(async (cId) => {
    try {
      const data = await getTodayVisits(cId)
      if (data && data.length > 0) setVisits(data)
    } catch (err) {
      console.error('Visits load error:', err?.message || err?.code || err)
    }
  }, [])

  const loadDoctors = useCallback(async (cId) => {
    try {
      const data = await getDoctors(cId)
      setDoctors(data && data.length > 0 ? data : MOCK_DOCTORS)
    } catch (err) {
      console.error('Doctors load error:', err)
      setDoctors(MOCK_DOCTORS)
    }
  }, [])

  // Handle a valid session — set user + profile + authenticated
  const handleSession = useCallback(async (session) => {
    if (!session?.user) {
      // No session — keep mock data visible so the UI looks full
      currentUserIdRef.current = null
      setUser(null)
      setProfile(null)
      setIsAuthenticated(false)
      // Keep mock data visible (already set as initial state)
      return
    }

    // Skip if we already loaded this user
    if (currentUserIdRef.current === session.user.id) return

    const prof = await fetchProfile(session.user.id)
    
    // Always authenticate if we have a valid session
    currentUserIdRef.current = session.user.id
    setUser(session.user)
    setIsAuthenticated(true)

    if (prof) {
      setProfile(prof)
      if (prof.cabinet_id) {
         Promise.all([
           loadPatients(prof.cabinet_id),
           loadRdv(prof.cabinet_id),
           loadConsultations(prof.cabinet_id),
           loadVisits(prof.cabinet_id),
           loadDoctors(prof.cabinet_id)
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
  }, [fetchProfile, loadPatients, loadRdv, loadConsultations, loadVisits, loadDoctors])

  useEffect(() => {
    // SINGLE source of truth: getSession() on mount, then listen for changes.
    // We do NOT set isAuthenticated until the profile is successfully fetched.
    // This prevents the "stale session → redirect to dashboard → fail → back to login" loop.
    
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

  useEffect(() => {
    if (!cabinetId) return

    // Centralized realtime sync for the dashboard / waiting room
    const rdvChannel = supabase
      .channel('app-global-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rdv', filter: `cabinet_id=eq.${cabinetId}` },
        () => loadRdv(cabinetId)
      )
      .subscribe()

    const visitChannel = subscribeClinicVisits(cabinetId, () => loadVisits(cabinetId))
    const paymentChannel = subscribeClinicPayments(cabinetId, () => {
      loadVisits(cabinetId)
      loadConsultations(cabinetId)
      window.dispatchEvent(new CustomEvent('mm:payments-changed'))
    })

    return () => {
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
        if (prof.cabinet_id) {
           Promise.all([
             loadPatients(prof.cabinet_id),
             loadRdv(prof.cabinet_id),
             loadConsultations(prof.cabinet_id),
             loadVisits(prof.cabinet_id),
             loadDoctors(prof.cabinet_id)
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
    localStorage.removeItem(PREFS_KEY)
    window.location.href = '/'
  }

  // DEV SWITCHER — use dev override first, then real profile role
  const baseRole = devRoleOverride || profile?.role || 'doctor'
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

      if (!found && visitId) {
        const newEntry = {
          id: visitId,
          patient_id: extra.patient_id || 'pat_01',
          status: newStatus,
          billing_amount: extra.amount !== undefined ? Number(extra.amount) : 300,
          billing_type: extra.method || 'cash',
          motif: extra.motif || 'Consultation médicale',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          patients: extra.patient_name ? { prenom: extra.patient_name.split(' ')[0], nom: extra.patient_name.split(' ').slice(1).join(' ') } : { prenom: 'Karima', nom: 'Benali' },
          ...extra
        }
        return [newEntry, ...updated]
      }

      return updated
    })
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

  const value = useMemo(() => ({
    user,
    profile,
    role,
    canonicalRole,
    devRoleOverride,
    setDevRoleOverride,
    cabinet: profile?.clinics,
    cabinetId: profile?.cabinet_id,
    currentUser: profile
      ? { name: profile.nom_complet, role: profile.role }
      : { name: 'Utilisateur', role: 'Staff' },
    isAuthenticated,
    isInitializing,
    toasts,
    globalModal,
    confirmDialog,
    notificationPrefs,

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
    updatePatientDebt,

    refreshPatients: () => profile?.cabinet_id && loadPatients(profile.cabinet_id),
    refreshRdv: () => profile?.cabinet_id && loadRdv(profile.cabinet_id),
    refreshConsultations: () => profile?.cabinet_id && loadConsultations(profile.cabinet_id),
    refreshVisits: () => profile?.cabinet_id && loadVisits(profile.cabinet_id),
    refreshDoctors: () => profile?.cabinet_id && loadDoctors(profile.cabinet_id),
    refreshAll: () => {
      if (profile?.cabinet_id) {
        loadPatients(profile.cabinet_id)
        loadRdv(profile.cabinet_id)
        loadConsultations(profile.cabinet_id)
        loadVisits(profile.cabinet_id)
        loadDoctors(profile.cabinet_id)
      }
    },
  }), [user, profile, role, canonicalRole, isAuthenticated, isInitializing, toasts, globalModal, confirmDialog, notificationPrefs, patients, rdvList, consultations, visits, doctors, waitingList, updateVisitStatus, updatePatientDebt])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppContext must be used within AppProvider')
  return context
}

export const useApp = useAppContext
