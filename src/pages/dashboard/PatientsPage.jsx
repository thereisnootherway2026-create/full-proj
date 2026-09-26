import { useQuery } from '@tanstack/react-query'
import { Search, Loader2, Users, FileCheck, Calendar, ChevronLeft, ChevronRight, Plus, AlertCircle, Eye, X, Phone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'
import Button from '../../components/common/Button'
import PatientFormModal from '../../components/forms/PatientFormModal'
import AppointmentFormModal from '../../components/forms/AppointmentFormModal'
import { getPatients, getConsultations, getRdv } from '../../lib/api'
import { useAppContext } from '../../context/AppContext'
import PatientProfileView from './PatientProfileView'


const formatDateShort = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Casablanca'
  })
}

function formatFullName(nom, prenom) {
  const cleanNom = (nom || '').trim()
  const cleanPrenom = (prenom || '').trim()
  if (!cleanNom && !cleanPrenom) return 'Patient sans nom'
  
  const cap = (s) => s.toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return `${cap(cleanNom)} ${cap(cleanPrenom)}`.trim()
}

function formatPhone(phone) {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) {
    return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5')
  }
  return phone
}

function calcAge(dateStr) {
  if (!dateStr) return null
  const birth = new Date(dateStr)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

const PAGE_SIZE = 10

function StatCard({ icon: Icon, iconWrap, iconColor, label, value, suffix = '' }) {
  return (
    <div className="flex items-center justify-between rounded-[21px] border border-[#e2e8f0] bg-white px-5 py-5 shadow-[0_5px_16px_rgba(15,23,42,0.045)] transition hover:-translate-y-[1px]">
      <div className="flex items-center gap-3.5">
        <div className={`flex h-[52px] w-[52px] items-center justify-center rounded-full ${iconWrap}`}>
          <Icon className={iconColor} size={25} strokeWidth={2.1} />
        </div>
        <p className="text-sm font-medium text-slate-600">
          {label}
        </p>
      </div>

      <div className="flex items-end gap-1.5">
        <p className="text-4xl font-bold text-slate-900 leading-none">
          {value}
        </p>
        {suffix && (
          <p className="pb-1 text-base font-semibold text-slate-600">
            {suffix}
          </p>
        )}
      </div>
    </div>
  )
}

function PatientsPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { profile, canonicalRole } = useAppContext()
  const reduceMotion = useReducedMotion()
  // Matches the /patient-workspace/:id route guard (RoleGuard role="docteur")
  // exactly, so this link is never shown to a role that can't open it.
  const canOpenWorkspace = canonicalRole === 'doctor'
  
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingPatient, setEditingPatient] = useState(null)
  const [bookingPatient, setBookingPatient] = useState(null)
  const [activeTab, setActiveTab] = useState('Tous')
  const [currentPage, setCurrentPage] = useState(1)

  // ── Data Queries ──
  const { data: patientsRaw, isLoading: isLoadingPatients, refetch } = useQuery({
    queryKey: ['patients', profile?.cabinet_id],
    queryFn: getPatients,
    enabled: !!profile?.cabinet_id && !id // Don't fetch the list if we're in profile view
  })

  const { data: consultationsRaw, isLoading: isLoadingConsultations } = useQuery({
    queryKey: ['consultations', profile?.cabinet_id],
    queryFn: getConsultations,
    enabled: !!profile?.cabinet_id && !id
  })

  const { data: rdvsRaw, isLoading: isLoadingRdvs } = useQuery({
    queryKey: ['rdv', profile?.cabinet_id],
    queryFn: getRdv,
    enabled: !!profile?.cabinet_id && !id
  })

  // We simply use the data provided by context; if it's empty, it's a real empty state
  const patients = patientsRaw || []
  const consultations = consultationsRaw || []
  const rdvs = rdvsRaw || []


  // ── Build lookup maps for real data ──
  const patientDataMap = useMemo(() => {
    const map = {}
    if (!patients) return map

    // Initialize all patients
    patients.forEach(p => {
      map[p.id] = {
        hasUnpaidCredit: false,
        lastVisitDate: null,
        nextRdvDate: null,
        nextRdvTime: null,
        isArchived: p.statut === 'archive' || p.statut === 'archived' || p.archive === true,
      }
    })

    // Process consultations: find last visit + unpaid credits
    if (consultations) {
      consultations.forEach(c => {
        if (!c.patient_id || !map[c.patient_id]) return
        const entry = map[c.patient_id]
        // Check for unpaid credit
        if (c.statut === 'credit') {
          entry.hasUnpaidCredit = true
        }
        // Track last visit date
        if (c.date_consult) {
          if (!entry.lastVisitDate || c.date_consult > entry.lastVisitDate) {
            entry.lastVisitDate = c.date_consult
          }
        }
      })
    }

    // Process RDVs: find next upcoming appointment
    if (rdvs) {
      const now = new Date()
      rdvs.forEach(r => {
        if (!r.patient_id || !map[r.patient_id]) return
        const rdvDate = new Date(r.date_rdv)
        const currentStatus = r.status || r.statut
        if (rdvDate > now && currentStatus !== 'annule') {
          const entry = map[r.patient_id]
          if (!entry.nextRdvDate || r.date_rdv < entry.nextRdvDate) {
            entry.nextRdvDate = r.date_rdv
            entry.nextRdvTime = rdvDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' })
          }
        }
      })
    }

    return map
  }, [patients, consultations, rdvs])

  // ── Compute tab counts ──
  const tabCounts = useMemo(() => {
    if (!patients) return { Tous: 0, Actifs: 0, 'Bilan impayé': 0, Archivés: 0 }
    let actifs = 0, unpaid = 0, archived = 0
    patients.forEach(p => {
      const info = patientDataMap[p.id]
      if (!info) return
      if (info.isArchived) { archived++; return }
      actifs++
      if (info.hasUnpaidCredit) unpaid++
    })
    return {
      Tous: patients.length,
      Actifs: actifs,
      'Bilan impayé': unpaid,
      Archivés: archived,
    }
  }, [patients, patientDataMap])

  const TABS = [
    { key: 'Tous', label: 'Tous' },
    { key: 'Actifs', label: 'Actifs' },
    { key: 'Bilan impayé', label: 'Bilan impayé', count: tabCounts['Bilan impayé'], highlight: true },
    { key: 'Archivés', label: 'Archivés' },
  ]

  // ── Filter: search + tab ──
  const filteredPatients = useMemo(() => {
    if (!patients) return []

    // Step 1: Tab filter
    let list = patients
    if (activeTab === 'Actifs') {
      list = list.filter(p => !patientDataMap[p.id]?.isArchived)
    } else if (activeTab === 'Archivés') {
      list = list.filter(p => patientDataMap[p.id]?.isArchived)
    } else if (activeTab === 'Bilan impayé') {
      list = list.filter(p => patientDataMap[p.id]?.hasUnpaidCredit)
    }

    // Step 2: Search filter
    const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    if (q) {
      const qPhone = (search || '').replace(/[\s.\-()]/g, '').replace(/^\+212/, '0').replace(/^212/, '0').trim()
      list = list.filter((p) => {
        const prenom = (p.prenom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const nom = (p.nom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const cin = (p.cin || '').toLowerCase().trim()
        const full = `${prenom} ${nom}`
        const telNorm = (p.telephone || '').replace(/[\s.\-()]/g, '').replace(/^\+212/, '0').replace(/^212/, '0')
        const initials = `${prenom[0] || ''}${nom[0] || ''}`
        const phoneMatch = qPhone.length >= 4 && (telNorm.includes(qPhone) || telNorm.startsWith(qPhone))
        return full.includes(q) || `${nom} ${prenom}`.includes(q) || cin.includes(q) || phoneMatch || initials.startsWith(q)
      })
    }

    return list
  }, [patients, search, activeTab, patientDataMap])

  const totalPatients = patients?.length || 0
  const totalPages = Math.ceil(filteredPatients.length / PAGE_SIZE) || 1
  const safePage = Math.min(currentPage, totalPages)
  const paginatedPatients = filteredPatients.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // ── Stat: "Dossiers complétés" = patients with at least name + phone + CIN filled ──
  const completionPct = useMemo(() => {
    if (!patients || patients.length === 0) return 0
    const complete = patients.filter(p => p.nom && p.prenom && p.telephone).length
    return Math.round((complete / patients.length) * 100)
  }, [patients])

  // ── New patients this month ──
  const newThisMonth = useMemo(() => {
    if (!patients) return 0
    const now = new Date()
    return patients.filter(p => {
      if (!p.created_at) return false
      const created = new Date(p.created_at)
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
    }).length
  }, [patients])

  const handleFormSuccess = () => refetch()

  // ── Profile View Routing ──
  if (id) {
    return <PatientProfileView patientId={id} onBack={() => navigate('/patients')} />
  }



  return (
    <div className="pt-6 space-y-6 max-w-[1600px] mx-auto pb-16">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Patients</h1>
          <p className="mt-1 text-sm text-slate-500 font-normal">
            Gestion du registre de la clinique · <span className="font-semibold text-blue-600">{totalPatients.toLocaleString('fr-FR')} dossiers</span>
          </p>
        </div>
        <Button 
          variant="primary"
          onClick={() => setShowCreate(true)}
          className="shadow-xs hover:shadow-sm"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          <span>Nouveau patient</span>
        </Button>
      </div>

      {/* ── 3 Stat Cards (exact Tableau de bord design) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Users}
          iconWrap="bg-[#dbeafe]"
          iconColor="text-[#3b82f6]"
          label="Total Patients"
          value={totalPatients.toLocaleString('fr-FR')}
        />
        <StatCard
          icon={Calendar}
          iconWrap="bg-[#fff2e3]"
          iconColor="text-[#ff851f]"
          label="Nouveaux ce mois"
          value={newThisMonth}
        />
        <StatCard
          icon={FileCheck}
          iconWrap="bg-[#ecfdf3]"
          iconColor="text-[#22c55e]"
          label="Dossiers complétés"
          value={completionPct}
          suffix="%"
        />
      </div>

      {/* ── Horizontal Navigation Tabs (matching Facturation & Paramètres) ── */}
      <div className="flex items-center gap-6 border-b border-slate-200 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveTab(tab.key); setCurrentPage(1) }}
              className={cn(
                "pb-3 text-xs sm:text-sm font-medium transition-colors relative flex items-center gap-2 whitespace-nowrap cursor-pointer group",
                isActive ? "text-blue-600 font-semibold" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <span>{tab.label}</span>
              {tab.count != null && tab.count > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold transition-colors",
                    isActive
                      ? "bg-blue-100/80 text-blue-700 font-bold"
                      : tab.highlight
                      ? "bg-amber-100 text-amber-700 font-bold"
                      : "bg-slate-100 text-slate-600 font-medium"
                  )}
                >
                  {tab.count}
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId="patients-tab-underline"
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Search Bar ── */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
          type="text"
          placeholder="Rechercher par nom, prénom, CIN ou téléphone..."
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs sm:text-sm font-normal text-slate-800 h-10 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all placeholder:text-slate-400 shadow-2xs"
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(''); setCurrentPage(1) }}
            className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
            title="Effacer la recherche"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Animated Tab Content & Patient Table ── */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
        >
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-none">
              <div className="min-w-[1020px]">
                {/* Table Header */}
                <div className="grid grid-cols-[auto_minmax(180px,1.2fr)_140px_140px_100px_120px_135px_95px_75px] gap-4 px-5 sm:px-6 py-2.5 bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider items-center select-none">
                  <div className="w-10" />
                  <span>Patient</span>
                  <span>CIN / ID</span>
                  <span>Téléphone</span>
                  <span>Âge / Sexe</span>
                  <span>Dernière visite</span>
                  <span>Prochain RDV</span>
                  <span>Statut</span>
                  <span className="text-right">Actions</span>
                </div>

                {/* Rows */}
                {(isLoadingPatients || isLoadingConsultations || isLoadingRdvs) ? (
                  <div className="px-6 py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    <span className="text-xs font-semibold text-slate-500">Chargement des patients...</span>
                  </div>
                ) : paginatedPatients.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" strokeWidth={1.5} />
                    <p className="text-sm font-semibold text-slate-700">Aucun patient trouvé</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {search ? 'Aucun résultat ne correspond à votre recherche.' : 'Aucun dossier dans cette catégorie.'}
                    </p>
                  </div>
                ) : (
                  paginatedPatients.map((p) => {
                    const age = calcAge(p.date_naissance)
                    const sex = p.sexe === 'homme' ? 'H' : p.sexe === 'femme' ? 'F' : '-'
                    const initials = ((p.nom?.[0] || '') + (p.prenom?.[0] || '')).toUpperCase()
                    const info = patientDataMap[p.id] || {}

                    // Determine status
                    let statusLabel = 'Actif'
                    let statusClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                    if (info.isArchived) {
                      statusLabel = 'Archivé'
                      statusClasses = 'bg-slate-100 text-slate-600 border-slate-200/80'
                    } else if (info.hasUnpaidCredit) {
                      statusLabel = 'Impayé'
                      statusClasses = 'bg-amber-50 text-amber-700 border-amber-200/80'
                    }

                    // Next RDV display
                    const nextRdvDisplay = info.nextRdvDate
                      ? formatDateShort(info.nextRdvDate)
                      : 'Non planifié'
                    const nextRdvSub = info.nextRdvTime || ''

                    return (
                      <div
                        key={p.id}
                        role="row"
                        onClick={() => navigate(`/patients/${p.id}`)}
                        className="w-full grid grid-cols-[auto_minmax(180px,1.2fr)_140px_140px_100px_120px_135px_95px_75px] gap-4 px-5 sm:px-6 py-3 border-b border-slate-100 last:border-b-0 items-center text-left hover:bg-blue-50/20 transition-colors group cursor-pointer"
                      >
                        {/* Avatar */}
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-bold text-blue-700 border border-blue-100/80 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all shadow-2xs">
                          {initials || 'P'}
                        </div>

                        {/* Patient Name */}
                        <div className="min-w-0 pr-2">
                          <p className="text-[14px] sm:text-[15px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate tracking-tight leading-snug">
                            {formatFullName(p.nom, p.prenom)}
                          </p>
                        </div>

                        {/* CIN / ID (in front of the name) */}
                        <div className="min-w-0">
                          {p.cin ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200/70 font-mono text-[11px] font-bold text-slate-700 shadow-2xs">
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">CIN</span>
                              <span className="truncate">{p.cin.toUpperCase()}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200/50 font-mono text-[11px] font-medium text-slate-500">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">ID</span>
                              <span className="truncate">{p.id?.split('-')[0] || '-'}</span>
                            </span>
                          )}
                        </div>

                        {/* Téléphone (in front of the name) */}
                        <div className="min-w-0">
                          {p.telephone ? (
                            <span className="text-xs sm:text-[13px] font-medium text-slate-600 font-mono flex items-center gap-1.5 truncate">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{formatPhone(p.telephone)}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-normal">-</span>
                          )}
                        </div>

                        {/* Age / Sex */}
                        <span className="text-xs sm:text-[13px] text-slate-600 font-medium truncate">
                          {age ? `${age} ans` : '-'} · <span className="text-slate-500">{sex}</span>
                        </span>

                        {/* Last Visit */}
                        <span className="text-xs sm:text-[13px] text-slate-600 font-normal truncate">
                          {formatDateShort(info.lastVisitDate || p.updated_at)}
                        </span>

                        {/* Next Appointment */}
                        <div className="min-w-0">
                          {info.nextRdvDate ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs sm:text-[13px] text-slate-800 font-medium">
                                {formatDateShort(info.nextRdvDate)}
                              </span>
                              {nextRdvSub && (
                                <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100/60 leading-none">
                                  {nextRdvSub}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-normal">Non planifié</span>
                          )}
                        </div>

                        {/* Status */}
                        <div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusClasses}`}>
                            {info.hasUnpaidCredit && !info.isArchived && <AlertCircle className="w-3 h-3 mr-1 shrink-0" />}
                            {statusLabel}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title={`Prendre RDV pour ${formatFullName(p.nom, p.prenom)}`}
                            onClick={() => setBookingPatient(p)}
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                          {canOpenWorkspace && (
                            <button
                              type="button"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              title="Voir dossier médical"
                              onClick={() => navigate(`/patient-workspace/${p.id}`)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-2.5 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500 font-normal">
                Affichage de <span className="font-semibold text-slate-700">{filteredPatients.length > 0 ? ((safePage - 1) * PAGE_SIZE) + 1 : 0}</span> à <span className="font-semibold text-slate-700">{Math.min(safePage * PAGE_SIZE, filteredPatients.length)}</span> sur <span className="font-semibold text-slate-700">{filteredPatients.length}</span> patients
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/70 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page
                  if (totalPages <= 5) {
                    page = i + 1
                  } else if (safePage <= 3) {
                    page = i + 1
                  } else if (safePage >= totalPages - 2) {
                    page = totalPages - 4 + i
                  } else {
                    page = safePage - 2 + i
                  }
                  return (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={cn(
                        "w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                        safePage === page
                          ? "bg-blue-600 text-white shadow-xs font-bold"
                          : "text-slate-600 hover:bg-slate-200/60"
                      )}
                    >
                      {page}
                    </button>
                  )
                })}
                {totalPages > 5 && safePage < totalPages - 2 && (
                  <>
                    <span className="text-slate-400 px-1 text-xs">...</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      className={cn(
                        "w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                        safePage === totalPages
                          ? "bg-blue-600 text-white shadow-xs font-bold"
                          : "text-slate-600 hover:bg-slate-200/60"
                      )}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/70 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  aria-label="Page suivante"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <PatientFormModal open={showCreate} onClose={() => setShowCreate(false)} onSuccess={handleFormSuccess} />
      <PatientFormModal open={Boolean(editingPatient)} onClose={() => setEditingPatient(null)} patient={editingPatient} onSuccess={handleFormSuccess} />
      <AppointmentFormModal
        open={Boolean(bookingPatient)}
        onClose={() => setBookingPatient(null)}
        initialPatient={bookingPatient}
        onSuccess={() => {
          setBookingPatient(null)
          refetch()
        }}
      />
    </div>
  )
}

export default PatientsPage