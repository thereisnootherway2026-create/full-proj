import { useQuery } from '@tanstack/react-query'
import { Search, Loader2, Users, FileCheck, Calendar, ChevronLeft, ChevronRight, SlidersHorizontal, Plus, AlertCircle, MoreVertical, Eye } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppButton } from '../../components/dashboard/DashboardPrimitives'
import PatientFormModal from '../../components/forms/PatientFormModal'
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

function PatientsPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { profile, canonicalRole } = useAppContext()
  // Matches the /patient-workspace/:id route guard (RoleGuard role="docteur")
  // exactly, so this link is never shown to a role that can't open it.
  const canOpenWorkspace = canonicalRole === 'doctor'
  
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingPatient, setEditingPatient] = useState(null)
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
        const full = `${prenom} ${nom}`
        const telNorm = (p.telephone || '').replace(/[\s.\-()]/g, '').replace(/^\+212/, '0').replace(/^212/, '0')
        const initials = `${prenom[0] || ''}${nom[0] || ''}`
        const phoneMatch = qPhone.length >= 4 && (telNorm.includes(qPhone) || telNorm.startsWith(qPhone))
        return full.includes(q) || `${nom} ${prenom}`.includes(q) || phoneMatch || initials.startsWith(q)
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
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight">Patients</h1>
          <p className="text-[14px] text-slate-500 mt-1">
            Gestion du registre de la clinique · <span className="font-semibold text-blue-600">{totalPatients.toLocaleString('fr-FR')} dossiers</span>
          </p>
        </div>
        <AppButton onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouveau Patient
        </AppButton>
      </div>

      {/* ── 3 Stat Cards ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)]">
          <div className="p-3 rounded-2xl bg-blue-50">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total Patients</p>
            <p className="text-[28px] font-bold text-slate-800 leading-tight">{totalPatients.toLocaleString('fr-FR')}</p>
          </div>
        </div>

        <div className="rounded-[24px] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)]">
          <div className="p-3 rounded-2xl bg-amber-50">
            <Calendar className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nouveaux ce mois</p>
            <p className="text-[28px] font-bold text-slate-800 leading-tight">{newThisMonth}</p>
          </div>
        </div>

        <div className="rounded-[24px] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)]">
          <div className="p-3 rounded-2xl bg-emerald-50">
            <FileCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Dossiers complétés</p>
            <p className="text-[28px] font-bold text-slate-800 leading-tight">{completionPct}%</p>
          </div>
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div className="rounded-[20px] bg-white p-2 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex items-center gap-2">
        <label className="flex-1 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
            type="text"
            placeholder="Rechercher par nom, CIN ou téléphone..."
            className="w-full border-0 bg-transparent text-[15px] text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <button className="p-3 rounded-2xl bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors">
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setCurrentPage(1) }}
            className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-500 hover:bg-slate-50 ring-1 ring-slate-100'
            }`}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
                activeTab === tab.key
                  ? 'bg-white/20 text-white'
                  : 'bg-rose-100 text-rose-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Patient Table ── */}
      <div className="rounded-[24px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[auto_1fr_110px_140px_140px_100px_80px] gap-4 px-6 py-4 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-widest items-center">
          <div className="w-10" />
          <span>Patient</span>
          <span>Âge / Sexe</span>
          <span>Dernière visite</span>
          <span>Prochain RDV</span>
          <span>Statut</span>
          <span>Actions</span>
        </div>

        {/* Rows */}
        {(isLoadingPatients || isLoadingConsultations || isLoadingRdvs) ? (
          <div className="px-6 py-12 flex justify-center text-slate-400">
             <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : paginatedPatients.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400 text-[15px]">Aucun patient trouvé.</div>
        ) : paginatedPatients.map((p) => {
          const age = calcAge(p.date_naissance)
          const sex = p.sexe === 'homme' ? 'H' : p.sexe === 'femme' ? 'F' : '-'
          const initials = ((p.prenom?.[0] || '') + (p.nom?.[0] || '')).toUpperCase()
          const info = patientDataMap[p.id] || {}

          // Determine status
          let statusLabel = 'Actif'
          let statusClasses = 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100/50'
          if (info.isArchived) {
            statusLabel = 'Archivé'
            statusClasses = 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/50'
          } else if (info.hasUnpaidCredit) {
            statusLabel = 'Impayé'
            statusClasses = 'bg-rose-50 text-rose-700 ring-1 ring-rose-100/50'
          }

          // Next RDV display
          const nextRdvDisplay = info.nextRdvDate
            ? formatDateShort(info.nextRdvDate)
            : 'Non planifié'
          const nextRdvSub = info.nextRdvTime || ''

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/patients/${p.id}`)}
              className="w-full grid grid-cols-[auto_1fr_110px_140px_140px_100px_80px] gap-4 px-6 py-4 border-b border-slate-50 items-center text-left hover:bg-slate-50/50 transition-colors group"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-bold text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
                {initials || 'P'}
              </div>

              {/* Name + ID */}
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-slate-900 truncate">{p.nom} {p.prenom}</p>
                <p className="text-[12px] text-slate-400 mt-0.5 truncate">
                  ID: {p.id?.split('-')[0] || '-'}
                </p>
              </div>

              {/* Age / Sex */}
              <span className="text-[14px] text-slate-600">{age ? `${age} ans` : '-'} / {sex}</span>

              {/* Last Visit */}
              <div>
                <span className="text-[14px] text-slate-600">{formatDateShort(info.lastVisitDate || p.updated_at)}</span>
              </div>

              {/* Next Appointment */}
              <div className="min-w-0">
                <span className={`text-[14px] ${info.nextRdvDate ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                  {nextRdvDisplay}
                </span>
                {nextRdvSub && (
                  <span className="text-[12px] text-blue-600 ml-1">{nextRdvSub}</span>
                )}
              </div>

              {/* Status */}
              <div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${statusClasses}`}>
                  {info.hasUnpaidCredit && !info.isArchived && <AlertCircle className="w-3 h-3 mr-1" />}
                  {statusLabel}
                </span>
              </div>

              {/* Actions */}
      <div className="flex items-center gap-1.5">
                <div
                  className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  title="Prendre RDV"
                  onClick={(e) => { e.stopPropagation(); navigate('/agenda') }}
                >
                  <Calendar className="w-4 h-4" />
                </div>
                {canOpenWorkspace && (
                  <div
                    className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    title="Voir dossier"
                    onClick={(e) => { e.stopPropagation(); navigate(`/patient-workspace/${p.id}`) }}
                  >
                    <Eye className="w-4 h-4" />
                  </div>
                )}
              </div>
            </button>
          )
        })}

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <p className="text-[13px] text-slate-400">
            Affichage de {filteredPatients.length > 0 ? ((safePage - 1) * PAGE_SIZE) + 1 : 0} - {Math.min(safePage * PAGE_SIZE, filteredPatients.length)} sur {filteredPatients.length} patients
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              // Show pages around current page
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
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-xl text-[13px] font-semibold transition-all ${
                    safePage === page
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              )
            })}
            {totalPages > 5 && safePage < totalPages - 2 && (
              <>
                <span className="text-slate-400 px-1">...</span>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  className={`w-8 h-8 rounded-xl text-[13px] font-semibold transition-all ${
                    safePage === totalPages ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <PatientFormModal open={showCreate} onClose={() => setShowCreate(false)} onSuccess={handleFormSuccess} />
      <PatientFormModal open={Boolean(editingPatient)} onClose={() => setEditingPatient(null)} patient={editingPatient} onSuccess={handleFormSuccess} />
    </div>
  )
}

export default PatientsPage