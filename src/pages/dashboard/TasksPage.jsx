import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Calendar, AlertCircle, CheckCircle2, Circle, Clock, ChevronDown, Loader2 } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import AddTaskModal from '../../components/forms/AddTaskModal'
import TaskDetailDrawer from '../../components/taches/TaskDetailDrawer'
import { isToday, isTomorrow, isPast, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { fetchTasks, toggleTaskStatus, createTask, updateTask } from '../../lib/taskService'

// ─── Filter tab definitions ───────────────────────────────────────────────────
const TABS = [
  { id: 'toutes',     label: 'Toutes' },
  { id: 'aujourdhui', label: "Aujourd'hui" },
  { id: 'en-retard',  label: 'En retard' },
  { id: 'urgentes',   label: 'Urgentes' },
  { id: 'terminees',  label: 'Terminées' },
]

export default function TasksPage() {
  const { profile, notify, patients, user } = useAppContext()
  const queryClient = useQueryClient()

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]               = useState('toutes')
  const [searchQuery, setSearchQuery]           = useState('')
  const [priorityFilter, setPriorityFilter]     = useState('all')
  const [showAddModal, setShowAddModal]         = useState(false)
  // edit mode state — when set, AddTaskModal opens in edit mode
  const [editingTask, setEditingTask]           = useState(null)
  // detail drawer
  const [selectedTask, setSelectedTask]         = useState(null)
  const [drawerOpen, setDrawerOpen]             = useState(false)

  // ── Fetch tasks ───────────────────────────────────────────────────────────
  const { data: tasks = [], isLoading, isError } = useQuery({
    queryKey: ['tasks', profile?.cabinet_id],
    queryFn:  () => fetchTasks(profile?.cabinet_id),
    enabled:  Boolean(profile?.cabinet_id),
  })

  // ── Create mutation ───────────────────────────────────────────────────────
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

  // ── Edit mutation ─────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: (taskData) => updateTask(editingTask.id, taskData),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', profile?.cabinet_id] })
      // Keep drawer open and refresh the task shown, with the latest data
      setSelectedTask(updated)
      setEditingTask(null)
      notify?.({ title: 'Tâche modifiée', description: 'Les modifications ont été enregistrées.', variant: 'success' })
    },
    onError: () => {
      notify?.({ title: 'Erreur', description: 'Impossible de modifier la tâche.', variant: 'destructive' })
    },
  })

  // ── Toggle status mutation (optimistic) ───────────────────────────────────
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
      // Keep drawer in sync if it's showing this task
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
    // Keep selectedTask around during exit animation, then clear
    setTimeout(() => setSelectedTask(null), 350)
  }

  const handleOpenEdit = (task) => {
    setEditingTask(task)
  }

  const handleEditSubmit = (taskData) => {
    editMutation.mutate(taskData)
  }

  const handleCloseEdit = () => {
    setEditingTask(null)
  }

  // ── Filtering (real, applied to task data) ────────────────────────────────
  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    // Tab filter
    switch (activeTab) {
      case 'aujourdhui':
        result = result.filter((t) =>
          t.status !== 'completed' &&
          t.status !== 'cancelled' &&
          t.due_date &&
          isToday(parseISO(t.due_date))
        )
        break
      case 'en-retard':
        result = result.filter((t) =>
          t.status !== 'completed' &&
          t.status !== 'cancelled' &&
          t.due_date &&
          isPast(parseISO(t.due_date)) &&
          !isToday(parseISO(t.due_date))
        )
        break
      case 'urgentes':
        result = result.filter((t) =>
          t.status !== 'completed' &&
          t.status !== 'cancelled' &&
          (t.priority === 'urgent' || t.priority === 'high')
        )
        break
      case 'terminees':
        result = result.filter((t) => t.status === 'completed')
        break
      default: // 'toutes'
        result = result.filter((t) => t.status !== 'completed')
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

    // Priority dropdown filter
    if (priorityFilter !== 'all') {
      result = result.filter((t) => t.priority === priorityFilter)
    }

    // Sort by date ascending, no-date tasks last
    return result.sort((a, b) => {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
  }, [tasks, activeTab, searchQuery, priorityFilter])

  // ── Grouping (for display under section headers) ──────────────────────────
  const groupedTasks = useMemo(() => {
    const groups = { 'En retard': [], "Aujourd'hui": [], 'Demain': [], 'Plus tard': [], 'Terminées': [] }
    filteredTasks.forEach((t) => {
      if (t.status === 'completed') { groups['Terminées'].push(t); return }
      if (!t.due_date) { groups['Plus tard'].push(t); return }
      const d = parseISO(t.due_date)
      if (isPast(d) && !isToday(d))   groups['En retard'].push(t)
      else if (isToday(d))             groups["Aujourd'hui"].push(t)
      else if (isTomorrow(d))          groups['Demain'].push(t)
      else                             groups['Plus tard'].push(t)
    })
    return groups
  }, [filteredTasks])

  // ── KPIs — always derived from ALL tasks, independent of active tab ───────
  const kpis = useMemo(() => ({
    pending:   tasks.filter((t) => t.status !== 'completed').length,
    urgent:    tasks.filter((t) => t.status !== 'completed' && (t.priority === 'high' || t.priority === 'urgent')).length,
    overdue:   tasks.filter((t) => t.status !== 'completed' && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))).length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  }), [tasks])

  // ── Label helpers ─────────────────────────────────────────────────────────
  const getPriorityColors = (priority) => {
    switch (priority) {
      case 'urgent':
      case 'critical': return 'text-red-600 bg-red-50 border-red-200'
      case 'high':     return 'text-amber-600 bg-amber-50 border-amber-200'
      default:         return 'text-slate-600 bg-slate-50 border-slate-200'
    }
  }
  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'urgent':
      case 'critical': return 'Urgent'
      case 'high':     return 'Important'
      case 'low':      return 'Faible'
      default:         return 'Normal'
    }
  }
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

  const formatDueDateShort = (dueDate, dueTime) => {
    if (!dueDate) return 'Aucune date'
    try {
      const d = parseISO(dueDate)
      let dateStr
      if (isToday(d))      dateStr = "Aujourd'hui"
      else if (isTomorrow(d)) dateStr = 'Demain'
      else                 dateStr = format(d, 'd MMM', { locale: fr })
      return dueTime ? `${dateStr} · ${dueTime}` : dateStr
    } catch { return dueDate }
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="w-full px-6 pb-10 pt-0 bg-slate-50 min-h-screen">
      <div className="w-full rounded-[20px] border border-rose-200 bg-white p-8 text-center shadow-sm mt-5">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900">Erreur de chargement</h2>
          <p className="mt-2 text-slate-500">Impossible de charger les tâches. Veuillez réessayer plus tard.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-6 pb-10 pt-0 bg-slate-50 min-h-screen">
      <div className="w-full space-y-5">

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[26px] font-black text-slate-900 leading-tight">Tâches</h1>
            <p className="mt-0.5 text-[15px] font-medium text-slate-500">Gérez vos tâches et priorités</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_2px_10px_rgba(37,99,235,0.2)] transition-all hover:bg-blue-700 hover:shadow-[0_4px_14px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Nouvelle tâche</span>
          </button>
        </div>

        {/* ── KPI Cards — global, never filtered by tab ────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { value: kpis.pending,   label: 'À faire',    icon: CheckCircle2, iconClass: 'bg-blue-50 text-blue-600' },
            { value: kpis.urgent,    label: 'Urgentes',   icon: AlertCircle,  iconClass: 'bg-red-50 text-red-600' },
            { value: kpis.overdue,   label: 'En retard',  icon: Clock,        iconClass: 'bg-amber-50 text-amber-600' },
            { value: kpis.completed, label: 'Terminées',  icon: CheckCircle2, iconClass: 'bg-emerald-50 text-emerald-600' },
          ].map(({ value, label, icon: Icon, iconClass }) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col">
                <span className="text-[28px] font-bold text-slate-900 leading-none">
                  {isLoading ? <Loader2 className="animate-spin text-slate-300 h-7 w-7" /> : value}
                </span>
                <span className="mt-1 text-sm font-medium text-slate-500">{label}</span>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconClass}`}>
                <Icon size={20} strokeWidth={2} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar (tabs + search + priority) ──────────────────────── */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-2">
          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/50" role="tablist" aria-label="Filtres de tâches">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-700 shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search + priority filter */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Rechercher une tâche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="relative">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">Priorité (Toutes)</option>
                <option value="urgent">Urgente</option>
                <option value="high">Importante</option>
                <option value="normal">Normale</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={16} />
            </div>
          </div>
        </div>

        {/* ── Task list container ──────────────────────────────────────── */}
        <div className="rounded-[20px] border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[400px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Mes tâches</h2>
            <span className="text-sm font-semibold text-slate-500">
              {isLoading ? 'Chargement...' : `${filteredTasks.length} tâche${filteredTasks.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-blue-500 h-10 w-10" />
              </div>
            ) : filteredTasks.length === 0 ? (
              /* ── Empty state ── */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 mb-4">
                  <CheckCircle2 className="text-slate-300" size={32} />
                </div>
                <h3 className="text-[17px] font-bold text-slate-900">Aucune tâche trouvée</h3>
                <p className="mt-1.5 text-sm font-medium text-slate-500">
                  {activeTab === 'terminees'
                    ? 'Les tâches que vous terminez apparaîtront ici.'
                    : activeTab === 'urgentes'
                    ? "Aucune tâche urgente ou importante pour le moment."
                    : activeTab === 'en-retard'
                    ? "Aucune tâche en retard. Beau travail !"
                    : activeTab === 'aujourdhui'
                    ? "Aucune tâche prévue pour aujourd'hui."
                    : "Vous n'avez pas de tâches correspondant à ces filtres."}
                </p>
              </div>
            ) : (
              /* ── Grouped task list ── */
              <div className="flex flex-col gap-6 p-4">
                {Object.entries(groupedTasks).map(([groupName, groupTasks]) => {
                  if (groupTasks.length === 0) return null
                  return (
                    <div key={groupName}>
                      <h3 className="mb-3 px-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
                        {groupName}
                      </h3>
                      <div className="flex flex-col gap-1.5">
                        {groupTasks.map((task) => {
                          const isCompleted = task.status === 'completed'
                          const isSelected  = selectedTask?.id === task.id && drawerOpen
                          return (
                            /* ── Task row — fully clickable, keyboard accessible ── */
                            <div
                              key={task.id}
                              role="button"
                              tabIndex={0}
                              aria-label={`Voir la tâche : ${task.title}`}
                              onClick={() => handleOpenDetail(task)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDetail(task) } }}
                              className={`group flex items-center gap-4 rounded-xl border px-4 py-3 cursor-pointer transition-all outline-none ${
                                isSelected
                                  ? 'border-blue-200 bg-blue-50/60 shadow-sm'
                                  : isCompleted
                                  ? 'border-transparent bg-slate-50 opacity-75 hover:border-slate-200 hover:bg-slate-100/60'
                                  : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50/80 hover:shadow-sm'
                              } focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1`}
                            >
                              {/* Checkbox — stopPropagation prevents row click */}
                              <button
                                type="button"
                                aria-label={isCompleted ? 'Rouvrir la tâche' : 'Marquer comme terminée'}
                                onClick={(e) => { e.stopPropagation(); handleToggleStatus(task.id, task.status) }}
                                onKeyDown={(e) => e.stopPropagation()}
                                disabled={toggleMutation.isPending}
                                className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-full disabled:opacity-50"
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="text-emerald-500" size={24} />
                                ) : (
                                  <Circle className="text-slate-300 transition-colors group-hover:text-blue-400" size={24} />
                                )}
                              </button>

                              {/* Main content */}
                              <div className="flex flex-1 flex-col min-w-0">
                                <span className={`truncate text-[15px] font-bold transition-colors ${
                                  isCompleted ? 'text-slate-500 line-through' : 'text-slate-900'
                                }`}>
                                  {task.title}
                                </span>
                                <span className="truncate text-[13px] font-medium text-slate-500 mt-0.5">
                                  {task.patientName || 'Sans patient'} &middot; {getTypeLabel(task.type)}
                                </span>
                              </div>

                              {/* Date + priority badge */}
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-500">
                                  <Calendar size={14} />
                                  <span>{formatDueDateShort(task.due_date, task.due_time)}</span>
                                </div>
                                {!isCompleted && (
                                  <div className={`flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${getPriorityColors(task.priority)}`}>
                                    {getPriorityLabel(task.priority)}
                                  </div>
                                )}
                              </div>

                              {/* Voir button — stopPropagation so row click doesn't double-fire */}
                              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                                <button
                                  type="button"
                                  aria-label={`Voir la tâche : ${task.title}`}
                                  onClick={(e) => { e.stopPropagation(); handleOpenDetail(task) }}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 hover:border-blue-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                >
                                  Voir
                                </button>
                              </div>
                            </div>
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

      {/* ── Task Detail Drawer ─────────────────────────────────────────── */}
      <TaskDetailDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={handleCloseDetail}
        onEdit={handleOpenEdit}
        onToggleStatus={handleToggleStatus}
        isTogglingStatus={toggleMutation.isPending}
      />

      {/* ── Create task modal ──────────────────────────────────────────── */}
      <AddTaskModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={(task) => createMutation.mutate(task)}
        isPending={createMutation.isPending}
        patients={patients || []}
        currentUser={user || profile}
      />

      {/* ── Edit task modal (reuses AddTaskModal in edit mode) ─────────── */}
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
        onClose={handleCloseEdit}
        onSubmit={handleEditSubmit}
        isPending={editMutation.isPending}
        patients={patients || []}
        currentUser={user || profile}
      />
    </div>
  )
}
