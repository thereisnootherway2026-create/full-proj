import { Bell, Download, Plus, Menu } from 'lucide-react'
import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router-dom'
import ConfirmDialog from '../components/common/ConfirmDialog'
import FloatingActionButton from '../components/common/FloatingActionButton'
import AppointmentFormModal from '../components/forms/AppointmentFormModal'
import InvoiceFormModal from '../components/forms/InvoiceFormModal'
import PatientFormModal from '../components/forms/PatientFormModal'
import DashboardSidebar from '../components/dashboard/DashboardSidebar'
import DashboardHeader from './DashboardHeader'
import { useAppContext } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { SidebarProvider, SidebarInset } from '../ui/sidebar'
import { TooltipProvider } from '../ui/tooltip'
import { PinProvider } from '../context/PinContext'

// Map the last path segment to a title, works for any role prefix
const PAGE_TITLES = {
  dashboard: 'Tableau de bord',
  agenda: 'Agenda (RDV)',
  patients: 'Patients',
  consultation: 'Consultation',
  ordonnances: 'Ordonnances',
  facturation: 'Facturation',
  'ai-scribe': 'Assistant IA',
  taches: 'Tâches',
  parametres: 'Paramètres',
}

function getPageTitle(pathname) {
  // strip trailing ID segments like /patients/uuid
  const clean = pathname.replace(/\/[0-9a-f-]{36}$/i, '')
  const segments = clean.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1] || 'dashboard'
  return PAGE_TITLES[lastSegment] || 'Dashboard'
}

const TZ = 'Africa/Casablanca'

/** Normalize string for search: lowercase + strip accents */
function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/** Normalize phone: strip all formatting, convert +212/212 → 0 */
function normalizePhone(phone) {
  return (phone || '').replace(/[\s.\-()]/g, '').replace(/^\+212/, '0').replace(/^212/, '0').trim()
}

function DashboardLayout() {
  const location = useLocation()
  const {
    cabinetId,
    role,
    notify,
    globalModal,
    closeGlobalModal,
    openGlobalModal,
    confirmDialog,
    closeConfirmation,
  } = useAppContext()
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mainScrollRef = useRef(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState({ patients: [], rdv: [], consultations: [] })
  const [searchLoading, setSearchLoading] = useState(false)

  // Local cache refs
  const allPatientsRef = useRef([])
  const allRdvRef = useRef([])
  const allConsultRef = useRef([])
  const cacheLoadedRef = useRef(false)

  const title = useMemo(() => getPageTitle(location.pathname), [location.pathname])
  const isDashboardRoute = location.pathname === '/dashboard'

  // Routes that need full-bleed layout (no padding wrapper, no scroll — component owns its own height)
  const FULL_BLEED_ROUTES = ['/secretaire', '/dashboard', '/dossier-patient']
  const isFullBleed = FULL_BLEED_ROUTES.includes(location.pathname) || (location.pathname === '/dashboard' && role === 'medecin')
  const isDossierRoute = location.pathname === '/dossier-patient'

  const breadcrumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    // Skip the first segment (role prefix like 'doctor') and show the rest
    return [segments[0] || 'dashboard', ...segments.slice(1)]
  }, [location.pathname])

  // Load all data into cache on mount (and when cabinetId changes)
  useEffect(() => {
    if (!cabinetId) return
    const load = async () => {
      try {
        const [pRes, rRes, cRes] = await Promise.all([
          supabase.from('patients').select('id, prenom, nom, telephone').eq('cabinet_id', cabinetId).order('nom'),
          supabase.from('rdv').select('id, date_rdv, status, notes, patient_id, patients(prenom, nom)').eq('cabinet_id', cabinetId).order('date_rdv', { ascending: false }).limit(200),
          supabase.from('consultations').select('id, date_consult, statut, montant, notes, patient_id, patients(prenom, nom)').eq('cabinet_id', cabinetId).order('date_consult', { ascending: false }).limit(200),
        ])
        allPatientsRef.current = pRes.data || []
        allRdvRef.current = rRes.data || []
        allConsultRef.current = cRes.data || []
        cacheLoadedRef.current = true
      } catch (err) {
        console.error('Search cache load error:', err)
      }
    }
    load()
  }, [cabinetId])

  // Client-side search
  useEffect(() => {
    const q = search.trim()
    if (!q || q.length < 1) {
      setSearchResults({ patients: [], rdv: [], consultations: [] })
      setSearchLoading(false)
      return
    }

    if (!cacheLoadedRef.current) {
      setSearchLoading(true)
      return
    }

    setSearchLoading(true)

    const timer = setTimeout(() => {
      const query = norm(q)
      const queryNoSpaces = query.replace(/\s/g, '')

      // ── Search patients ──
      const patientMatches = allPatientsRef.current.filter(p => {
        const prenom = norm(p.prenom)
        const nomF = norm(p.nom)
        const full = `${prenom} ${nomF}`
        const fullRev = `${nomF} ${prenom}`
        const telNorm = normalizePhone(p.telephone)
        const initials = `${prenom[0] || ''}${nomF[0] || ''}`
        const queryPhoneNorm = normalizePhone(q)

        // Phone match: normalize both sides, require 4+ digits
        const phoneMatch = queryPhoneNorm.length >= 4 && (
          telNorm.includes(queryPhoneNorm) || telNorm.startsWith(queryPhoneNorm)
        )

        return (
          full.includes(query) ||
          fullRev.includes(query) ||
          prenom.startsWith(query) ||
          nomF.startsWith(query) ||
          phoneMatch ||
          initials === query ||
          initials.startsWith(query)
        )
      }).slice(0, 6)

      const matchedIds = new Set(patientMatches.map(p => p.id))

      // ── Search RDV ──
      const rdvMatches = allRdvRef.current.filter(r => {
        if (matchedIds.has(r.patient_id)) return true
        const pPrenom = norm(r.patients?.prenom)
        const pNom = norm(r.patients?.nom)
        const full = `${pPrenom} ${pNom}`
        const initials = `${pPrenom[0] || ''}${pNom[0] || ''}`
        const notes = norm(r.notes)
        return full.includes(query) || initials.startsWith(query) || notes.includes(query)
      }).slice(0, 5)

      // ── Search consultations ──
      const consultMatches = allConsultRef.current.filter(c => {
        if (matchedIds.has(c.patient_id)) return true
        const pPrenom = norm(c.patients?.prenom)
        const pNom = norm(c.patients?.nom)
        const full = `${pPrenom} ${pNom}`
        const initials = `${pPrenom[0] || ''}${pNom[0] || ''}`
        const notes = norm(c.notes)
        return full.includes(query) || initials.startsWith(query) || notes.includes(query)
      }).slice(0, 4)

      // ── Format results ──
      const patientFormatted = patientMatches.map(p => ({
        id: p.id,
        label: `${p.prenom} ${p.nom}`,
        initials: `${(p.prenom?.[0] || '').toUpperCase()}${(p.nom?.[0] || '').toUpperCase()}`,
        subtitle: p.telephone ? `Patient · ${p.telephone}` : 'Patient',
        path: `/patients/${p.id}`,
      }))

      const rdvFormatted = rdvMatches.map(r => {
        const d = new Date(r.date_rdv)
        const pName = r.patients ? `${r.patients.prenom} ${r.patients.nom}` : 'Patient'
        const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: TZ })
        const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
        const currentStatus = r.status || r.statut
        const STATUS_MAP = {
          'confirme': { label: 'Confirmé', class: 'bg-amber-50 text-amber-700' },
          'arrive': { label: 'Arrivé', class: 'bg-blue-50 text-blue-700' },
          'en_consultation': { label: 'En consultation', class: 'bg-blue-50 text-blue-700' },
          'termine': { label: 'Terminé', class: 'bg-emerald-50 text-emerald-700' },
          'absent': { label: 'Absent', class: 'bg-rose-50 text-rose-700' },
          'annule': { label: 'Annulé', class: 'bg-rose-50 text-rose-700' }
        }
        const sMatch = STATUS_MAP[currentStatus] || { label: currentStatus, class: 'bg-slate-50 text-slate-600' }
        return { 
          id: r.id, 
          label: pName, 
          subtitle: `RDV · ${dateStr} à ${timeStr}`, 
          path: '/agenda', 
          badge: sMatch.label, 
          badgeClass: sMatch.class 
        }
      })

      const consultFormatted = consultMatches.map(c => {
        const pName = c.patients ? `${c.patients.prenom} ${c.patients.nom}` : 'Patient'
        const statutLabel = c.statut === 'paye' ? 'Payé' : c.statut === 'credit' ? 'Crédit' : 'Annulé'
        const badgeClass = c.statut === 'paye' ? 'bg-emerald-50 text-emerald-700' : c.statut === 'credit' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
        return { id: c.id, label: `${pName} — ${c.montant} MAD`, subtitle: `Consultation · ${c.date_consult}${c.notes ? ' · ' + c.notes.slice(0, 40) : ''}`, path: '/salle-attente', badge: statutLabel, badgeClass }
      })

      setSearchResults({ patients: patientFormatted, rdv: rdvFormatted, consultations: consultFormatted })
      setSearchLoading(false)
    }, 50) // Almost instant since it's local

    return () => clearTimeout(timer)
  }, [search])

  return (
    <PinProvider>
    <SidebarProvider defaultOpen={localStorage.getItem('sidebar-collapsed') !== 'true'}>
      <TooltipProvider>
        <div className="flex h-screen w-full overflow-hidden bg-gray-50">
          <div className="hidden lg:block shrink-0">
            <DashboardSidebar />
          </div>

          {sidebarOpen ? (
            <div className="fixed inset-0 z-[100] bg-slate-950/50 lg:hidden">
              <div className="h-full w-[88%] max-w-sm">
                <DashboardSidebar mobile onClose={() => setSidebarOpen(false)} />
              </div>
            </div>
          ) : null}

          <SidebarInset className="flex-1 min-w-0 flex flex-col bg-transparent overflow-hidden">
            {isDashboardRoute ? (
              <DashboardHeader
                onMenuClick={() => setSidebarOpen(true)}
                search={search}
                setSearch={setSearch}
                searchResults={searchResults}
                searchLoading={searchLoading}
                scrollContainerRef={mainScrollRef}
              />
            ) : (
              <div className="flex shrink-0 items-center h-[56px] px-4 border-b border-gray-200 bg-white lg:hidden">
                <button type="button" onClick={() => setSidebarOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400">
                  <Menu className="h-5 w-5" />
                </button>
              </div>
            )}

            <main ref={mainScrollRef} className={`relative flex-1 overflow-x-hidden ${isFullBleed ? (isDashboardRoute || isDossierRoute ? 'overflow-y-auto' : 'overflow-hidden flex flex-col') : 'overflow-y-auto'}`}>
              {isFullBleed
                ? <Outlet />
                : <div className="w-full max-w-[1400px] mx-auto px-5 md:px-[32px] pt-[12px] pb-[24px]"><Outlet /></div>
              }
            </main>
          </SidebarInset>

          <PatientFormModal open={globalModal?.type === 'patient'} onClose={closeGlobalModal} />
          <AppointmentFormModal open={globalModal?.type === 'appointment'} onClose={closeGlobalModal} />
          <InvoiceFormModal open={globalModal?.type === 'invoice'} onClose={closeGlobalModal} />

          <ConfirmDialog
            open={Boolean(confirmDialog)}
            title={confirmDialog?.title}
            description={confirmDialog?.description}
            confirmLabel={confirmDialog?.confirmLabel}
            onCancel={closeConfirmation}
            onConfirm={() => {
              confirmDialog?.onConfirm?.()
              closeConfirmation()
            }}
          />
        </div>
      </TooltipProvider>
    </SidebarProvider>
    </PinProvider>
  )
}

export default DashboardLayout
