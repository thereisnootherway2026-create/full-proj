import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Calendar, AlertCircle, CheckCircle2, Clock,
  ChevronDown, ChevronRight, Loader2, X, User, Ban
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useAppContext } from '../../context/AppContext'
import AddTaskModal from '../../components/forms/AddTaskModal'
import AppointmentFormModal from '../../components/forms/AppointmentFormModal'
import TaskDetailModal from '../../components/taches/TaskDetailModal'
import { isToday, isTomorrow, isPast, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { fetchTasks, toggleTaskStatus, createTask, updateTask, executeTaskAction } from '../../lib/taskService'
import { cn } from '../../lib/utils'
import { getCategoryMeta } from '../../lib/taskCategories'

// ─── 3 StatCards — Signature MacroMedica Design (Identical to Dashboard & Patients) ───
function StatCard({ icon: Icon, iconWrap, iconColor, label, value, onClick, suffix = '' }) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-[21px] border border-[#e2e8f0] bg-white px-5 py-5 shadow-[0_5px_16px_rgba(15,23,42,0.045)] transition hover:-translate-y-[1px] hover:border-slate-300 select-none",
        onClick && "cursor-pointer"
      )}
    >
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

// ─── Tabs definition ──────────────────────────────────────────────────────────
const TABS = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'aujourdhui', label: "Aujourd'hui" },
  { key: 'en-retard', label: 'En retard' },
  { key: 'urgentes', label: 'Urgentes' },
  { key: 'terminees', label: 'Terminées' },
]

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile, notify, patients, user, canonicalRole } = useAppContext()
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()

  const categoryParam = searchParams.get('category')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]           = useState('toutes')
  const [searchQuery, setSearchQuery]       = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [showAddModal, setShowAddModal]     = useState(false)
  const [editingTask, setEditingTask]       = useState(null)
  const [selectedTask, setSelectedTask]     = useState(null)
  const [drawerOpen, setDrawerOpen]         = useState(false)
  const [appointmentModalOpen, setAppointmentModalOpen]         = useState(false)
  const [appointmentTargetPatient, setAppointmentTargetPatient] = useState(null)
  const [activeTaskForAppointment, setActiveTaskForAppointment] = useState(null)

  // ── Fetch tasks ───────────────────────────────────────────────────────────
  const { data: tasks = [], isLoading, isError } = useQuery({
    queryKey: ['tasks', profile?.cabinet_id],
    queryFn:  () => fetchTasks(profile?.cabinet_id),
    enabled:  Boolean(profile?.cabinet_id),
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (taskData) => createTask(profile?.cabinet_id, profile?.id, taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', profile?.cabinet_id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics', profile?.cabinet_id] })
      setShowAddModal(false)
      notify?.({ title: 'Tâche créée', description: 'La nouvelle tâche a été ajoutée avec succès.', variant: 'success' })
    },
    onError: () => {
      notify?.({ title: 'Erreur', description: 'Impossible de créer la tâche.', variant: 'destructive' })
    },
  })

  const editMutation = useMutation({
    mutationFn: (taskData) => updateTask(editingTask.id, taskData),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', profile?.cabinet_id] })
      setSelectedTask(updated)
      setEditingTask(null)
      notify?.({ title: 'Tâche modifiée', description: 'Les modifications ont été enregistrées.', variant: 'success' })
    },
    onError: () => {
      notify?.({ title: 'Erreur', description: 'Impossible de modifier la tâche.', variant: 'destructive' })
    },
  })

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, updates }) => updateTask(taskId, updates),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', profile?.cabinet_id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics', profile?.cabinet_id] })
      if (selectedTask?.id === updated.id) {
        setSelectedTask(updated)
      }
    },
    onError: () => {
      notify?.({ title: 'Erreur', description: 'Impossible de mettre à jour la tâche.', variant: 'destructive' })
    },
  })

  const executeActionMutation = useMutation({
    mutationFn: (actionPayload) => executeTaskAction(actionPayload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', profile?.cabinet_id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics', profile?.cabinet_id] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['ordonnances'] })
      if (selectedTask?.id === updated.id) {
        setSelectedTask(updated)
      }
    },
    onError: (err) => {
      notify?.({
        title: 'Action non autorisée',
        description: err.message || 'Impossible d\'exécuter cette action métier.',
        variant: 'destructive'
      })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, currentStatus }) => toggleTaskStatus(taskId, currentStatus, profile?.id),
    onMutate: async ({ taskId, currentStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', profile?.cabinet_id] })
      const previousTasks = queryClient.getQueryData(['tasks', profile?.cabinet_id])
      queryClient.setQueryData(['tasks', profile?.cabinet_id], (old) => {
        if (!old) return old
        return old.map((t) => {
          if (t.id !== taskId) return t
          return { ...t, status: currentStatus === 'completed' ? 'pending' : 'completed' }
        })
      })
      return { previousTasks }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['tasks', profile?.cabinet_id], context.previousTasks)
      notify?.({ title: 'Erreur', description: 'Impossible de modifier la tâche.', variant: 'destructive' })
    },
    onSuccess: (updatedTask, { currentStatus }) => {
      if (selectedTask?.id === updatedTask.id) {
        setSelectedTask(updatedTask)
      }
      if (currentStatus !== 'completed') {
        notify?.({ title: 'Tâche terminée', description: 'La tâche a été marquée comme terminée.', variant: 'success' })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', profile?.cabinet_id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics', profile?.cabinet_id] })
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggleStatus = (taskId, currentStatus) => {
    toggleMutation.mutate({ taskId, currentStatus })
  }

  const handleOpenDetail = (task) => {
    setSelectedTask(task)
    setDrawerOpen(true)
  }

  const handleCloseDetail = () => {
    setDrawerOpen(false)
    setTimeout(() => setSelectedTask(null), 350)
  }

  const handleScheduleAppointment = (task, patient) => {
    setActiveTaskForAppointment(task)
    setAppointmentTargetPatient(patient)
    setAppointmentModalOpen(true)
  }

  const handleAppointmentSuccess = async () => {
    if (activeTaskForAppointment) {
      try {
        await executeActionMutation.mutateAsync({
          taskId: activeTaskForAppointment.id,
          actionKey: 'secretary_appointment_agreed',
          actionRole: canonicalRole === 'doctor' ? 'doctor' : 'secretary',
          note: 'Rendez-vous planifié dans l\'agenda.',
          status: 'completed'
        })
        notify?.({
          title: 'Rendez-vous planifié',
          description: 'Le rendez-vous a été enregistré et la tâche associée a été clôturée.',
          variant: 'success'
        })
      } catch (err) {
        console.error('Error closing task after appointment:', err)
      }
    }
    setAppointmentModalOpen(false)
    setActiveTaskForAppointment(null)
    setAppointmentTargetPatient(null)
  }

  const clearCategoryFilter = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('category')
      return next
    })
  }

  // A task is "active" (in the queue, counted as pending) only when it's
  // pending or in_progress — completed AND cancelled are both done with, just
  // for different reasons, so neither belongs in "À faire" counts.
  const isActiveTask = (t) => t.status === 'pending' || t.status === 'in_progress'

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    pending:   tasks.filter(isActiveTask).length,
    today:     tasks.filter((t) => isActiveTask(t) && t.due_date && isToday(parseISO(t.due_date))).length,
    urgent:    tasks.filter((t) => isActiveTask(t) && (t.priority === 'high' || t.priority === 'urgent')).length,
    overdue:   tasks.filter((t) => isActiveTask(t) && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))).length,
    completed: tasks.filter((t) => t.status === 'completed' || t.status === 'cancelled').length,
  }), [tasks])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    // Dashboard category deep-link
    if (categoryParam) {
      if (categoryParam === 'urgences') {
        result = result.filter(t => t.priority === 'urgent' || t.priority === 'high')
      } else if (categoryParam === 'resultats') {
        result = result.filter(t => t.type === 'results')
      } else if (categoryParam === 'prescriptions') {
        result = result.filter(t => t.type === 'prescription')
      } else if (categoryParam === 'messages') {
        result = result.filter(t => t.type === 'patient_followup' || t.type === 'other')
      }
    }

    // Tab filter
    switch (activeTab) {
      case 'aujourdhui':
        result = result.filter((t) =>
          isActiveTask(t) &&
          t.due_date &&
          isToday(parseISO(t.due_date))
        )
        break
      case 'en-retard':
        result = result.filter((t) =>
          isActiveTask(t) &&
          t.due_date &&
          isPast(parseISO(t.due_date)) &&
          !isToday(parseISO(t.due_date))
        )
        break
      case 'urgentes':
        result = result.filter((t) =>
          isActiveTask(t) &&
          (t.priority === 'urgent' || t.priority === 'high')
        )
        break
      case 'terminees':
        result = result.filter((t) => t.status === 'completed' || t.status === 'cancelled')
        break
      default: // 'toutes'
        result = result.filter(isActiveTask)
        break
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((t) =>
        t.title?.toLowerCase().includes(q) ||
        t.patientName?.toLowerCase().includes(q) ||
        t.type?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      )
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      result = result.filter((t) => t.priority === priorityFilter)
    }

    // Sort by due date
    return result.sort((a, b) => {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
  }, [tasks, activeTab, categoryParam, searchQuery, priorityFilter])

  // ── Grouping ──────────────────────────────────────────────────────────────
  const groupedTasks = useMemo(() => {
    const groups = { 'En retard': [], "Aujourd'hui": [], 'Demain': [], 'Plus tard': [], 'Terminées': [] }
    filteredTasks.forEach((t) => {
      if (t.status === 'completed' || t.status === 'cancelled') { groups['Terminées'].push(t); return }
      if (!t.due_date) { groups['Plus tard'].push(t); return }
      const d = parseISO(t.due_date)
      if (isPast(d) && !isToday(d)) groups['En retard'].push(t)
      else if (isToday(d)) groups["Aujourd'hui"].push(t)
      else if (isTomorrow(d)) groups['Demain'].push(t)
      else groups['Plus tard'].push(t)
    })
    return groups
  }, [filteredTasks])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatPatientName = (name) => {
    if (!name) return ''
    return name.toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  // Category labels/icons come from src/lib/taskCategories.js — the single
  // table also used by task creation and the detail modal, so a category
  // means the same thing everywhere in the module.

  const getTypeLabel = (type) => ({
    patient_followup: 'Suivi patient',
    clinical:         'Clinique',
    clinic:           'Clinique',
    prescription:     'Ordonnance',
    results:          'Résultats',
    administrative:   'Administratif',
    appointment:      'Rendez-vous',
    other:            'Autre',
  }[type] || 'Général')

  // Priority is surfaced as a small dot + word, not a bordered box — it only
  // needs to draw the eye when it's urgent or high; "Normal" stays silent.
  const getPriorityDot = (priority) => {
    switch (priority) {
      case 'urgent':
      case 'critical': return 'bg-red-500'
      case 'high':     return 'bg-amber-500'
      default:         return ''
    }
  }
  const getPriorityText = (priority) => {
    switch (priority) {
      case 'urgent':
      case 'critical': return 'text-red-600'
      case 'high':     return 'text-amber-600'
      default:         return 'text-slate-400'
    }
  }
  // The left rail on a row: a thin colour strip for urgent/high, invisible otherwise.
  const getPriorityRail = (priority) => {
    switch (priority) {
      case 'urgent':
      case 'critical': return 'bg-red-500'
      case 'high':     return 'bg-amber-400'
      default:         return 'bg-transparent'
    }
  }

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'urgent':
      case 'critical': return 'Urgent'
      case 'high':     return 'Important'
      default:         return 'Normal'
    }
  }

  const formatDueDateShort = (dueDate, dueTime) => {
    if (!dueDate) return 'Aucune date'
    try {
      const d = parseISO(dueDate)
      let dateStr
      if (isToday(d)) dateStr = "Aujourd'hui"
      else if (isTomorrow(d)) dateStr = 'Demain'
      else dateStr = format(d, 'd MMM', { locale: fr })
      return dueTime ? `${dateStr} · ${dueTime}` : dateStr
    } catch { return dueDate }
  }

  if (isError) {
    return (
      <div className="w-full px-6 pb-10 pt-6 bg-slate-50 min-h-screen">
        <div className="w-full rounded-[21px] border border-rose-200 bg-white p-8 text-center shadow-sm mt-5">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900">Erreur de chargement</h2>
          <p className="mt-2 text-slate-500">Impossible de charger les tâches. Veuillez réessayer plus tard.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-6 pb-12 pt-6 bg-[#f8fafc] min-h-screen">
      <div className="w-full space-y-6">

        {/* ── Header (Identical pattern to PatientsPage & Facturation) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tâches</h1>
            <p className="mt-1 text-sm text-slate-500">Gérez vos tâches cliniques et priorités du cabinet</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_2px_10px_rgba(37,99,235,0.2)] transition-all hover:bg-blue-700 hover:shadow-[0_4px_14px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none cursor-pointer"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Nouvelle tâche</span>
          </button>
        </div>

        {/* ── 3 StatCards (Identical design to Tableau de bord & Patients) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatCard
            icon={CheckCircle2}
            iconWrap="bg-[#dbeafe]"
            iconColor="text-[#3b82f6]"
            label="À faire"
            value={isLoading ? '-' : kpis.pending}
            onClick={() => setActiveTab('toutes')}
          />
          <StatCard
            icon={AlertCircle}
            iconWrap="bg-[#fee2e2]"
            iconColor="text-[#ef4444]"
            label="Urgentes"
            value={isLoading ? '-' : kpis.urgent}
            onClick={() => setActiveTab('urgentes')}
          />
          <StatCard
            icon={Clock}
            iconWrap="bg-[#fff2e3]"
            iconColor="text-[#ff851f]"
            label="En retard"
            value={isLoading ? '-' : kpis.overdue}
            onClick={() => setActiveTab('en-retard')}
          />
        </div>

        {/* ── Active Category Indicator (If navigated from Dashboard) ── */}
        {categoryParam && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-800">
            <span>Filtre appliqué depuis le tableau de bord : <strong>{
              categoryParam === 'urgences' ? 'Urgences' :
              categoryParam === 'resultats' ? 'Résultats à consulter' :
              categoryParam === 'prescriptions' ? 'Ordonnances à signer' :
              categoryParam === 'messages' ? 'Messages patients' : categoryParam
            }</strong></span>
            <button
              onClick={clearCategoryFilter}
              className="ml-auto inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 cursor-pointer"
            >
              <X size={14} />
              <span>Effacer</span>
            </button>
          </div>
        )}

        {/* ── Horizontal Navigation Tabs (Matching Facturation & Patients) ── */}
        <div className="flex items-center gap-6 border-b border-slate-200 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const count = tab.key === 'toutes' ? kpis.pending :
                          tab.key === 'aujourdhui' ? kpis.today :
                          tab.key === 'en-retard' ? kpis.overdue :
                          tab.key === 'urgentes' ? kpis.urgent :
                          kpis.completed

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "pb-3 text-xs sm:text-sm font-medium transition-colors relative flex items-center gap-2 whitespace-nowrap cursor-pointer group",
                  isActive ? "text-blue-600 font-semibold" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold transition-colors",
                      isActive
                        ? "bg-blue-100/80 text-blue-700 font-bold"
                        : tab.key === 'en-retard' || tab.key === 'urgentes'
                        ? "bg-rose-100 text-rose-700 font-bold"
                        : "bg-slate-100 text-slate-600 font-medium"
                    )}
                  >
                    {count}
                  </span>
                )}
                {isActive && (
                  <motion.span
                    layoutId="tasks-tab-underline"
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* ── Search Bar + Priority Filter (Standard search strip) ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text"
              placeholder="Rechercher une tâche, patient..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs sm:text-sm font-normal text-slate-800 h-10 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all placeholder:text-slate-400 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                title="Effacer la recherche"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-auto">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="h-10 w-full sm:w-48 appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-9 text-xs sm:text-sm font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs cursor-pointer"
            >
              <option value="all">Toutes priorités</option>
              <option value="urgent">Urgente</option>
              <option value="high">Importante</option>
              <option value="normal">Normale</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={14} />
          </div>
        </div>

        {/* ── Main Task Container (Executive white card) ── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden min-h-[400px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
            <h2 className="text-base font-bold text-slate-900">Mes tâches</h2>
            <span className="text-xs font-semibold text-slate-500">
              {isLoading ? 'Chargement...' : `${filteredTasks.length} tâche${filteredTasks.length > 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="p-2 sm:p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-blue-500 h-8 w-8" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 mb-3 border border-slate-100">
                  <CheckCircle2 className="text-slate-300" size={28} />
                </div>
                <h3 className="text-base font-bold text-slate-900">Aucune tâche trouvée</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm">
                  {activeTab === 'terminees'
                    ? 'Les tâches que vous terminez apparaîtront ici.'
                    : activeTab === 'urgentes'
                    ? 'Aucune tâche urgente ou importante pour le moment.'
                    : activeTab === 'en-retard'
                    ? 'Aucune tâche en retard. Beau travail !'
                    : activeTab === 'aujourdhui'
                    ? "Aucune tâche prévue pour aujourd'hui."
                    : "Vous n'avez pas de tâches correspondant à ces filtres."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-7">
                {Object.entries(groupedTasks).map(([groupName, groupTasks]) => {
                  if (groupTasks.length === 0) return null
                  const isOverdue = groupName === 'En retard'
                  const isDoneGroup = groupName === 'Terminées'

                  return (
                    <div key={groupName}>
                      {/* ── Section header ── */}
                      <div className="flex items-center gap-3 mb-3 px-1">
                        <h3 className={cn(
                          'text-[11px] font-bold uppercase tracking-[0.08em]',
                          isOverdue ? 'text-rose-500' : isDoneGroup ? 'text-emerald-500' : 'text-slate-400'
                        )}>
                          {groupName}
                        </h3>
                        <span className={cn(
                          'flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-[10px] font-bold',
                          isOverdue
                            ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                            : isDoneGroup
                            ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        )}>
                          {groupTasks.length}
                        </span>
                        <div className={cn(
                          'flex-1 h-px',
                          isOverdue ? 'bg-rose-100' : isDoneGroup ? 'bg-emerald-100' : 'bg-slate-100'
                        )} />
                      </div>

                      {/* ── Task cards ── */}
                      <div className="flex flex-col gap-2">
                        {groupTasks.map((task) => {
                          const isCompleted = task.status === 'completed'
                          const isCancelled = task.status === 'cancelled'
                          const isDone = isCompleted || isCancelled
                          const isSelected = selectedTask?.id === task.id && drawerOpen
                          const category = getCategoryMeta(task.type)
                          const CategoryIcon = category.icon
                          const isUrgent = !isDone && (task.priority === 'urgent' || task.priority === 'critical')
                          const isHigh = !isDone && task.priority === 'high'
                          const showPriorityCue = isUrgent || isHigh

                          return (
                            <motion.div
                              key={task.id}
                              layout={!reduceMotion}
                              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={reduceMotion ? undefined : { opacity: 0, y: -4, transition: { duration: 0.15 } }}
                              transition={{ duration: 0.2 }}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleOpenDetail(task)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleOpenDetail(task) }}
                              className={cn(
                                'group relative flex items-center gap-3.5 rounded-[14px] px-4 py-3.5 cursor-pointer outline-none transition-all duration-200',
                                isSelected
                                  ? 'bg-blue-50 ring-[1.5px] ring-blue-500/30 shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
                                  : isDone
                                  ? 'bg-slate-50/70 opacity-60 hover:opacity-90 border border-slate-100'
                                  : 'bg-white border border-slate-100 shadow-[0_1px_6px_rgba(15,23,42,0.03)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:border-slate-200'
                              )}
                            >
                              {/* ── Checkbox ── */}
                              {isCancelled ? (
                                <span className="flex-shrink-0" title="Annulée">
                                  <Ban className="text-slate-300" size={18} />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleToggleStatus(task.id, task.status) }}
                                  disabled={toggleMutation.isPending}
                                  className="flex-shrink-0 focus:outline-none cursor-pointer"
                                  title={isCompleted ? 'Rouvrir' : 'Marquer comme terminée'}
                                >
                                  {isCompleted ? (
                                    <div className="h-[22px] w-[22px] rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_0_3px_rgba(16,185,129,0.15)]">
                                      <CheckCircle2 className="text-white" size={14} strokeWidth={3} />
                                    </div>
                                  ) : (
                                    <div className="h-[22px] w-[22px] rounded-full border-[2px] border-slate-200 transition-all duration-200 group-hover:border-blue-400 group-hover:bg-blue-50" />
                                  )}
                                </button>
                              )}

                              {/* ── Main content ── */}
                              <div className="flex flex-1 flex-col min-w-0 gap-1.5">
                                {/* Title row */}
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    'truncate text-[13.5px] font-semibold leading-tight transition-colors',
                                    isDone
                                      ? 'text-slate-400 line-through decoration-slate-300'
                                      : 'text-slate-800 group-hover:text-blue-700'
                                  )}>
                                    {task.title}
                                  </span>
                                  {isCancelled && (
                                    <span className="shrink-0 text-[11px] font-medium text-slate-400">Annulée</span>
                                  )}
                                </div>

                                {/* Metadata row */}
                                {/* Metadata: one line of plain text, no pills */}
                                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-slate-500">
                                  {showPriorityCue && (
                                    <>
                                      <span className="font-semibold text-slate-700">{getPriorityLabel(task.priority)}</span>
                                      <span className="text-slate-300">·</span>
                                    </>
                                  )}
                                  <span className="inline-flex items-center gap-1">
                                    <CategoryIcon size={12} strokeWidth={2} className="text-slate-400" />
                                    {category.label}
                                  </span>
                                  <span className="text-slate-300">·</span>
                                  {task.patientName ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (task.patient_id) navigate(`/patients/${task.patient_id}`)
                                      }}
                                      className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-700 hover:underline cursor-pointer"
                                      title="Ouvrir le dossier patient"
                                    >
                                      <User size={11} strokeWidth={2} className="text-slate-400" />
                                      {formatPatientName(task.patientName)}
                                    </button>
                                  ) : (
                                    <span className="text-slate-400">Aucun patient</span>
                                  )}
                                  {task.assigned_to === 'secretary' && (
                                    <><span className="text-slate-300">·</span><span>Secrétariat</span></>
                                  )}
                                  {task.description?.includes('[Consigne') && (
                                    <><span className="text-slate-300">·</span><span>Consigne Dr</span></>
                                  )}
                                  {task.description && !isDone && (
                                    <>
                                      <span className="hidden sm:inline text-slate-300">·</span>
                                      <span className="hidden sm:inline text-slate-400 truncate max-w-[180px]">
                                        {task.description.split('\n')[0].replace(/^\[.*?\]\s*/, '')}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* ── Due date (plain text) ── */}
                              <div className={cn(
                                'flex items-center gap-1.5 text-[11.5px] font-medium flex-shrink-0',
                                isOverdue ? 'text-rose-600' : 'text-slate-500'
                              )}>
                                <Calendar size={12} strokeWidth={2} className={isOverdue ? 'text-rose-500' : 'text-slate-400'} />
                                {formatDueDateShort(task.due_date, task.due_time)}
                              </div>

                              {/* ── Chevron ── */}
                              <ChevronRight
                                size={16}
                                className="flex-shrink-0 text-slate-200 opacity-0 -translate-x-1.5 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-blue-400"
                              />
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Task Detail Modal ── */}
      <TaskDetailModal
        task={selectedTask}
        open={drawerOpen}
        onClose={handleCloseDetail}
        onEdit={(task) => { handleCloseDetail(); setEditingTask(task) }}
        onToggleStatus={handleToggleStatus}
        isTogglingStatus={toggleMutation.isPending}
        onUpdateTask={(taskId, updates) => updateTaskMutation.mutateAsync({ taskId, updates })}
        isUpdatingTask={updateTaskMutation.isPending}
        onExecuteAction={(payload) => executeActionMutation.mutateAsync(payload)}
        isExecutingAction={executeActionMutation.isPending}
        onScheduleAppointment={handleScheduleAppointment}
      />

      {/* ── Create Task Modal ── */}
      <AddTaskModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={(task) => createMutation.mutate(task)}
        isPending={createMutation.isPending}
        patients={patients || []}
        currentUser={user || profile}
      />

      {/* ── Edit Task Modal ── */}
      <AddTaskModal
        open={Boolean(editingTask)}
        mode="edit"
        initialData={editingTask ? {
          title:       editingTask.title,
          description: editingTask.description || '',
          patientId:   editingTask.patient_id  || '',
          patientName: editingTask.patientName || '',
          type:        editingTask.type,
          priority:    editingTask.priority,
          dueDate:     editingTask.due_date    || '',
          dueTime:     editingTask.due_time    || '',
          assignedTo:  editingTask.assigned_to || 'me',
        } : null}
        onClose={() => setEditingTask(null)}
        onSubmit={(taskData) => editMutation.mutate(taskData)}
        isPending={editMutation.isPending}
        patients={patients || []}
        currentUser={user || profile}
      />

      {/* ── Schedule Appointment from Task ── */}
      {appointmentModalOpen && (
        <AppointmentFormModal
          open={appointmentModalOpen}
          initialPatient={appointmentTargetPatient}
          onClose={() => {
            setAppointmentModalOpen(false)
            setActiveTaskForAppointment(null)
            setAppointmentTargetPatient(null)
          }}
          onSuccess={handleAppointmentSuccess}
        />
      )}
    </div>
  )
}
