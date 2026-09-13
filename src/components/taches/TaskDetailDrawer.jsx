import { useRef, useEffect } from 'react'
import { X, User, Calendar, Clock, Tag, AlertCircle, CheckCircle2, RotateCcw, Edit2, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { isToday, isTomorrow, isPast, parseISO, format } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TYPE_LABELS = {
  patient_followup: 'Suivi patient',
  clinical:         'Clinique',
  clinic:           'Clinique',
  prescription:     'Ordonnance',
  results:          'Résultats',
  administrative:   'Administratif',
  appointment:      'Rendez-vous',
  other:            'Autre',
}

const PRIORITY_CONFIG = {
  urgent:   { label: 'Urgente',    bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: '#EF4444' },
  high:     { label: 'Importante', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: '#F59E0B' },
  normal:   { label: 'Normale',    bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200',  dot: '#94A3B8' },
  low:      { label: 'Faible',     bg: 'bg-slate-50',  text: 'text-slate-500',  border: 'border-slate-200',  dot: '#CBD5E1' },
}

const STATUS_CONFIG = {
  completed: { label: 'Terminée',   bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  pending:   { label: 'À faire',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  cancelled: { label: 'Annulée',    bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200'   },
}

function formatDueDate(dueDate, dueTime) {
  if (!dueDate) return 'Aucune date'
  try {
    const d = parseISO(dueDate)
    let dateStr
    if (isToday(d))      dateStr = "Aujourd'hui"
    else if (isTomorrow(d)) dateStr = 'Demain'
    else if (isPast(d))  dateStr = `${format(d, 'd MMM yyyy', { locale: fr })} (En retard)`
    else                 dateStr = format(d, 'd MMM yyyy', { locale: fr })
    return dueTime ? `${dateStr} · ${dueTime}` : dateStr
  } catch {
    return dueDate
  }
}

function formatDateTime(iso) {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), "d MMM yyyy 'à' HH:mm", { locale: fr })
  } catch {
    return iso
  }
}

// ─── Row component for the detail table ──────────────────────────────────────
function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-[13px] font-medium text-slate-500 flex-shrink-0 w-36">{label}</span>
      <span className="text-[13px] font-semibold text-slate-900 text-right flex-1">{children}</span>
    </div>
  )
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────
export default function TaskDetailDrawer({
  task,
  open,
  onClose,
  onEdit,
  onToggleStatus,
  isTogglingStatus = false,
}) {
  const closeRef = useRef(null)

  // Keyboard: Esc closes
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus the close button on open
  useEffect(() => {
    if (open) setTimeout(() => closeRef.current?.focus(), 80)
  }, [open])

  const priority = PRIORITY_CONFIG[task?.priority] || PRIORITY_CONFIG.normal
  const status   = STATUS_CONFIG[task?.status]    || STATUS_CONFIG.pending
  const isCompleted = task?.status === 'completed'

  const dueDateLabel  = formatDueDate(task?.due_date, task?.due_time)
  const isDuePast     = task?.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date)) && !isCompleted

  return (
    <AnimatePresence>
      {open && task && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9000] bg-slate-900/30 backdrop-blur-[1px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Détail de la tâche"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 bottom-0 z-[9001] w-full max-w-[420px] bg-white shadow-2xl flex flex-col"
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border ${status.bg} ${status.text} ${status.border}`}>
                    {isCompleted ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                    {status.label}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border ${priority.bg} ${priority.text} ${priority.border}`}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: priority.dot }} />
                    {priority.label}
                  </span>
                </div>
                <h2 className={`text-[17px] font-bold leading-snug ${isCompleted ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                  {task.title}
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label="Fermer"
              >
                <X size={17} />
              </button>
            </div>

            {/* ── Body ────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Description */}
              {task.description && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description</p>
                  <p className="text-[14px] text-slate-700 leading-relaxed bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                    {task.description}
                  </p>
                </div>
              )}

              {/* Detail table */}
              <div className="rounded-xl border border-slate-100 bg-white px-4 py-1">
                {task.patientName && (
                  <DetailRow label="Patient">
                    <span className="text-blue-700">{task.patientName}</span>
                  </DetailRow>
                )}
                <DetailRow label="Type">
                  {TYPE_LABELS[task.type] || task.type || 'Général'}
                </DetailRow>
                <DetailRow label="Échéance">
                  <span className={isDuePast ? 'text-red-600' : ''}>
                    {dueDateLabel}
                  </span>
                </DetailRow>
                <DetailRow label="Assigné à">
                  {task.assigned_to === 'me' || !task.assigned_to ? 'Moi-même' : task.assigned_to}
                </DetailRow>
              </div>

              {/* Metadata */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-1">
                <DetailRow label="Créée le">
                  {formatDateTime(task.created_at)}
                </DetailRow>
                {task.completed_at && (
                  <DetailRow label="Terminée le">
                    {formatDateTime(task.completed_at)}
                  </DetailRow>
                )}
              </div>

            </div>

            {/* ── Footer ──────────────────────────────────────────── */}
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-2.5 flex-shrink-0">

              {/* Edit button — secondary */}
              <button
                type="button"
                onClick={() => onEdit?.(task)}
                className="h-[36px] px-4 rounded-[8px] font-semibold text-[13px] flex items-center gap-1.5 flex-shrink-0"
                style={{
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  border: '1.5px solid #e2e8f0',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.backgroundColor = '#f1f5f9'
                  e.currentTarget.style.borderColor = '#cbd5e1'
                  e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(148,163,184,0.18)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.backgroundColor = '#f8fafc'
                  e.currentTarget.style.borderColor = '#e2e8f0'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
                  e.currentTarget.style.boxShadow = '0 3px 8px -2px rgba(148,163,184,0.12)'
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(148,163,184,0.18)'
                }}
              >
                <Edit2 size={14} />
                Modifier
              </button>

              {/* Complete / Reopen — fills remaining space, primary */}
              <button
                type="button"
                onClick={() => onToggleStatus?.(task.id, task.status)}
                disabled={isTogglingStatus}
                className="h-[36px] px-4 rounded-[8px] font-semibold text-[13px] text-white flex items-center justify-center gap-2 flex-1 disabled:opacity-70"
                style={{
                  backgroundColor: isCompleted ? '#475569' : '#2563eb',
                  border: `1.5px solid ${isCompleted ? '#64748b' : '#3b82f6'}`,
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  if (isTogglingStatus) return
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.backgroundColor = isCompleted ? '#334155' : '#1d4ed8'
                  e.currentTarget.style.boxShadow = isCompleted
                    ? '0 6px 16px -4px rgba(71,85,105,0.3)'
                    : '0 6px 16px -4px rgba(37,99,235,0.4)'
                }}
                onMouseLeave={(e) => {
                  if (isTogglingStatus) return
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.backgroundColor = isCompleted ? '#475569' : '#2563eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                onMouseDown={(e) => {
                  if (isTogglingStatus) return
                  e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
                }}
                onMouseUp={(e) => {
                  if (isTogglingStatus) return
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
              >
                {isTogglingStatus ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : isCompleted ? (
                  <><RotateCcw size={14} /> Rouvrir la tâche</>
                ) : (
                  <><CheckCircle2 size={14} /> Terminer la tâche</>
                )}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
