import { useRef, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  X, Calendar, Clock, CheckCircle2, RotateCcw, Edit2, Loader2, ExternalLink, Phone,
  FileText, MessageCircle, User, CalendarDays, ShieldCheck, Ban, Wallet, Loader,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { isToday, isTomorrow, isPast, parseISO, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useAppContext } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { executeTaskAction } from '../../lib/taskService'
import { getCategoryMeta } from '../../lib/taskCategories'
import { formatProfessionalName, initialsOf } from '../../lib/professionalName'

// ─── Helpers ──────────────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  urgent: { label: 'Urgente', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', dot: '#DC2626' },
  high: { label: 'Importante', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: '#D97706' },
  normal: { label: 'Normale', text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', dot: '#94A3B8' },
  low: { label: 'Faible', text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', dot: '#CBD5E1' },
}

const STATUS_CONFIG = {
  pending: { label: 'À faire', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Clock },
  in_progress: { label: 'En cours', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: Loader },
  completed: { label: 'Terminée', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
  cancelled: { label: 'Annulée', bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', icon: Ban },
}

const formatPatientName = (name) => {
  if (!name) return ''
  return name.toLowerCase().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatDueDate(dueDate, dueTime) {
  if (!dueDate) return { label: 'Aucune échéance', status: 'none' }
  try {
    const d = parseISO(dueDate)
    let dateStr
    let status = 'future'
    if (isToday(d)) { dateStr = "Aujourd'hui"; status = 'today' }
    else if (isTomorrow(d)) { dateStr = 'Demain'; status = 'tomorrow' }
    else if (isPast(d)) { dateStr = format(d, 'd MMM yyyy', { locale: fr }); status = 'past' }
    else { dateStr = format(d, 'd MMM yyyy', { locale: fr }); status = 'future' }
    return { label: dueTime ? `${dateStr} à ${dueTime}` : dateStr, status }
  } catch {
    return { label: dueDate, status: 'none' }
  }
}

function formatDateTime(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), "d MMM yyyy 'à' HH:mm", { locale: fr }) } catch { return iso }
}

// A profile's role, mapped to the one-word label used across this modal.
function roleLabel(role) {
  const r = String(role || '').toLowerCase()
  if (r === 'doctor' || r === 'docteur' || r === 'medecin' || r === 'médecin') return 'Médecin'
  if (r === 'secretary' || r === 'secretaire' || r === 'sécrétaire') return 'Secrétariat'
  if (r === 'admin') return 'Administration'
  return 'Cabinet'
}

// ─── Main Component ──────────────────────────────────────────────────────
export default function TaskDetailModal({
  task,
  open,
  onClose,
  onEdit,
  onToggleStatus,
  isTogglingStatus = false,
  onUpdateTask,
  isUpdatingTask = false,
  onExecuteAction,
  isExecutingAction = false,
  onScheduleAppointment,
}) {
  const navigate = useNavigate()
  const closeRef = useRef(null)
  const { patients, user, profile, canonicalRole, notify, outstandingVisits } = useAppContext()
  const isDoctorAuthorized = canonicalRole === 'doctor' || canonicalRole === 'admin'
  const [isCancelling, setIsCancelling] = useState(false)
  const [isValidatingPrescription, setIsValidatingPrescription] = useState(false)

  // Real names for whoever created/completed/is assigned to this task — read
  // through the same RLS that already lets any member of a clinic see a
  // colleague's administrative profile (profiles_read_same_clinic). One
  // lightweight query per clinic, not per task.
  const cabinetId = profile?.clinic_id || profile?.cabinet_id || null
  const membersQ = useQuery({
    queryKey: ['cabinet-members', cabinetId],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, nom_complet, role').eq('clinic_id', cabinetId)
      if (error) throw error
      return data || []
    },
    enabled: open && Boolean(cabinetId),
    staleTime: 5 * 60 * 1000,
  })
  const membersById = useMemo(() => new Map((membersQ.data || []).map((m) => [m.id, m])), [membersQ.data])

  const resolveMember = (id) => {
    if (!id) return null
    if (id === user?.id || id === profile?.id) {
      return { name: 'Vous', role: roleLabel(canonicalRole) }
    }
    const m = membersById.get(id)
    if (m) return { name: formatProfessionalName(m.nom_complet, m.role), role: roleLabel(m.role) }
    return null
  }

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (open) setTimeout(() => closeRef.current?.focus(), 80)
  }, [open])

  const status = STATUS_CONFIG[task?.status] || STATUS_CONFIG.pending
  const StatusIcon = status.icon
  const isCompleted = task?.status === 'completed'
  const isCancelled = task?.status === 'cancelled'
  const isClosed = isCompleted || isCancelled
  const category = getCategoryMeta(task?.type)
  const CategoryIcon = category.icon
  // Priority is only worth a badge when it's above normal — a "Normale" chip on
  // every single task would just be noise (see task list redesign, same rule).
  const showPriority = task?.priority === 'urgent' || task?.priority === 'high'
  const priority = PRIORITY_CONFIG[task?.priority] || PRIORITY_CONFIG.normal

  const dueInfo = useMemo(() => formatDueDate(task?.due_date, task?.due_time), [task?.due_date, task?.due_time])
  const isDuePast = dueInfo.status === 'past' && !isClosed

  const createdBy = useMemo(() => resolveMember(task?.created_by), [task?.created_by, membersById, user, profile, canonicalRole])
  const completedBy = useMemo(() => resolveMember(task?.completed_by), [task?.completed_by, membersById, user, profile, canonicalRole])
  const assignee = useMemo(() => {
    if (!task?.assigned_to) return { name: 'Secrétariat du cabinet', role: 'Secrétariat' }
    return resolveMember(task.assigned_to) || { name: 'Membre du cabinet', role: 'Cabinet' }
  }, [task?.assigned_to, membersById, user, profile, canonicalRole])

  const linkedPatient = useMemo(() => {
    if (!task?.patient_id) return null
    return patients?.find((p) => p.id === task.patient_id) || null
  }, [task?.patient_id, patients])

  // Real billing context for the linked patient — from AppContext's own
  // outstanding-balance list (the same data the cashier queue uses), not a
  // guess: only shown when there is an actual unpaid visit for this patient.
  const outstandingForPatient = useMemo(() => {
    if (!task?.patient_id || !outstandingVisits?.length) return null
    const visit = outstandingVisits.find((v) => v.patient_id === task.patient_id)
    return visit && Number(visit.remaining_balance) > 0 ? visit : null
  }, [task?.patient_id, outstandingVisits])

  const whatsappUrl = useMemo(() => {
    if (!linkedPatient?.telephone) return null
    let digits = String(linkedPatient.telephone).replace(/\D/g, '')
    if (digits.startsWith('0')) digits = '212' + digits.slice(1)
    else if (!digits.startsWith('212') && digits.length === 9) digits = '212' + digits
    const pName = formatPatientName(task?.patientName) || 'Patient'
    const text = `Bonjour ${pName},\nLe cabinet médical vous contacte à propos de votre dossier médical.`
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
  }, [linkedPatient?.telephone, task?.patientName])

  // Real activity only: creation and completion are structured events (real
  // columns). Older tasks may also carry "[Actor · date] note" lines appended
  // by the previous action system directly in the description — those are
  // genuine past notes, so they're kept and shown as notes, just not
  // presented as a fabricated step-by-step timeline.
  const parsedDescription = useMemo(() => {
    if (!task?.description) return { base: '', notes: [] }
    const lines = task.description.split('\n')
    const base = []
    const notes = []
    lines.forEach((line) => {
      const trimmed = line.trim()
      const m = trimmed.match(/^\[(.*?)\]\s*(.*)$/)
      if (m) notes.push({ meta: m[1], text: m[2] })
      else if (trimmed) base.push(trimmed)
    })
    return { base: base.join('\n'), notes }
  }, [task?.description])

  const activity = useMemo(() => {
    const events = []
    if (task?.created_at) {
      events.push({ label: createdBy ? `Créée par ${createdBy.name}` : 'Créée', at: task.created_at, icon: CalendarDays })
    }
    if (isCompleted && task?.completed_at) {
      events.push({ label: completedBy ? `Terminée par ${completedBy.name}` : 'Terminée', at: task.completed_at, icon: CheckCircle2 })
    }
    return events
  }, [task?.created_at, task?.completed_at, isCompleted, createdBy, completedBy])

  // Is this a prescription-renewal task the current doctor can validate? The
  // only remaining "business action": it generates the real signed document
  // in the patient's dossier, not just a status flip — kept as its own
  // clearly-labelled primary action instead of buried in a menu of buttons.
  const canValidatePrescription = task?.type === 'prescription' && isDoctorAuthorized && !isClosed && !task?.document_id

  const handleValidatePrescription = async () => {
    if (isValidatingPrescription) return
    setIsValidatingPrescription(true)
    try {
      const payload = { taskId: task.id, actionKey: 'doctor_validate_prescription', actionRole: 'doctor', note: 'Ordonnance de renouvellement validée au dossier patient.', status: 'completed' }
      if (onExecuteAction) await onExecuteAction(payload)
      else await executeTaskAction(payload)
      notify?.({ title: 'Ordonnance validée', description: 'Le document a été généré dans le dossier du patient.', variant: 'success' })
    } catch (err) {
      notify?.({ title: 'Action impossible', description: err.message || 'Impossible de valider le renouvellement.', variant: 'destructive' })
    } finally {
      setIsValidatingPrescription(false)
    }
  }

  const handleCancel = async () => {
    if (isCancelling || !onUpdateTask) return
    setIsCancelling(true)
    try {
      await onUpdateTask(task.id, { status: 'cancelled' })
      notify?.({ title: 'Tâche annulée', description: task.title, variant: 'success' })
    } catch (err) {
      notify?.({ title: 'Erreur', description: err.message || "Impossible d'annuler la tâche.", variant: 'destructive' })
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <AnimatePresence>
      {open && task && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-black/40 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-detail-modal-title"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[640px] bg-white rounded-[16px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col my-auto max-h-[88vh] border border-slate-200/90"
          >
            {/* ── Header ── */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-semibold border ${status.bg} ${status.text} ${status.border}`}>
                    <StatusIcon size={11} className={task.status === 'in_progress' ? 'animate-spin' : ''} />
                    {status.label}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                    <CategoryIcon size={11} className={category.tint} />
                    {category.label}
                  </span>
                  {showPriority && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-semibold border ${priority.bg} ${priority.text} ${priority.border}`}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: priority.dot }} />
                      {priority.label}
                    </span>
                  )}
                  {task.document_id && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <ShieldCheck size={11} /> Ordonnance signée
                    </span>
                  )}
                </div>
                <h2 id="task-detail-modal-title" className={`text-[16.5px] font-semibold tracking-tight leading-snug ${isClosed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  {task.title}
                </h2>
              </div>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer"
                className="w-8 h-8 rounded-[8px] bg-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors flex-shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 bg-slate-50/30 space-y-3">

              {/* Patient context */}
              {task.patient_id ? (
                <div className="rounded-[12px] border border-slate-200/90 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Patient</span>
                    <button type="button" onClick={() => { onClose(); navigate(`/patients/${task.patient_id}`) }}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                      <span>Voir le dossier</span>
                      <ExternalLink size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[10px] bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center border border-blue-200/80 shrink-0">
                      {initialsOf(task.patientName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[14px] font-bold text-slate-900 truncate leading-snug">{formatPatientName(task.patientName)}</h4>
                      {linkedPatient?.telephone ? (
                        <p className="text-[12px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Phone size={11} className="text-slate-400 shrink-0" />
                          <a href={`tel:${linkedPatient.telephone}`} className="hover:text-blue-600 font-medium text-slate-700">{linkedPatient.telephone}</a>
                          {linkedPatient?.cin && (<><span className="text-slate-300">·</span><span className="text-slate-500 font-normal">CIN: {linkedPatient.cin}</span></>)}
                        </p>
                      ) : (
                        <p className="text-[12px] text-slate-400">Téléphone non renseigné</p>
                      )}
                    </div>
                  </div>

                  {outstandingForPatient && (
                    <div className="flex items-center gap-2 rounded-[8px] bg-amber-50/70 border border-amber-200 px-3 py-2">
                      <Wallet size={13} className="text-amber-600 shrink-0" />
                      <p className="text-[12px] font-semibold text-amber-800">
                        Solde impayé : {Number(outstandingForPatient.remaining_balance).toLocaleString('fr-FR')} MAD
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100">
                    {linkedPatient?.telephone ? (
                      <>
                        <a href={`tel:${linkedPatient.telephone}`}
                          className="h-[32px] px-2 rounded-[8px] text-[12px] font-semibold bg-white text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                          <Phone size={12} /> Appeler
                        </a>
                        {whatsappUrl ? (
                          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                            className="h-[32px] px-2 rounded-[8px] text-[12px] font-semibold bg-emerald-50/70 text-emerald-800 border border-emerald-200 flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-colors">
                            <MessageCircle size={12} /> WhatsApp
                          </a>
                        ) : <div />}
                      </>
                    ) : <div className="col-span-2" />}
                    <button type="button" onClick={() => onScheduleAppointment?.(task, linkedPatient)}
                      className="h-[32px] px-2 rounded-[8px] text-[12px] font-semibold bg-blue-50/80 text-blue-700 border border-blue-200 flex items-center justify-center gap-1.5 hover:bg-blue-100 transition-colors">
                      <Calendar size={12} /> Planifier
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-slate-200 bg-white px-4 py-3 flex items-center gap-2.5">
                  <User size={14} className="text-slate-300 shrink-0" />
                  <p className="text-[12.5px] font-medium text-slate-500">Tâche générale du cabinet — aucun patient associé</p>
                </div>
              )}

              {task.document_id && (
                <div className="rounded-[12px] border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-[8px] bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0"><FileText size={15} /></div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-bold text-emerald-950 truncate leading-snug">Ordonnance médicale officielle générée</p>
                      <p className="text-[11px] text-emerald-700 font-medium truncate">Classée et disponible dans le dossier patient</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { onClose(); navigate(`/patients/${task.patient_id}`) }}
                    className="h-[30px] px-2.5 rounded-[6px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] inline-flex items-center gap-1 ml-3 shrink-0">
                    Consulter <ExternalLink size={10} />
                  </button>
                </div>
              )}

              {/* Task context */}
              {parsedDescription.base && (
                <div className="rounded-[12px] border border-slate-200/90 bg-white p-4 space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Description</span>
                  <div className="text-[13px] text-slate-700 leading-relaxed bg-slate-50/70 rounded-[8px] p-3 border border-slate-100 border-l-[3px] border-l-blue-500 whitespace-pre-wrap">
                    {parsedDescription.base}
                  </div>
                </div>
              )}

              {parsedDescription.notes.length > 0 && (
                <div className="rounded-[12px] border border-slate-200/90 bg-white p-4 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Notes</span>
                  <div className="space-y-1.5">
                    {parsedDescription.notes.map((n, i) => (
                      <p key={i} className="text-[12.5px] text-slate-700 leading-snug">
                        <span className="text-slate-400 font-medium">{n.meta} — </span>{n.text}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Assignment & deadline */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[10px] border border-slate-200/90 bg-white p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Échéance</span>
                    {isDuePast && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-[4px] border border-red-200">En retard</span>}
                    {dueInfo.status === 'today' && !isClosed && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-[4px] border border-amber-200">Aujourd'hui</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800">
                    <CalendarDays size={13} className={isDuePast ? 'text-red-500 shrink-0' : 'text-slate-400 shrink-0'} />
                    <span className={`truncate ${isDuePast ? 'text-red-600 font-bold' : ''}`}>{dueInfo.label}</span>
                  </div>
                </div>

                <div className="rounded-[10px] border border-slate-200/90 bg-white p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Assignée à</span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-[4px]">{assignee.role}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800 truncate">
                    <User size={13} className="text-slate-400 shrink-0" />
                    <span className="truncate">{assignee.name}</span>
                  </div>
                </div>
              </div>

              {/* Activity — real events only */}
              {activity.length > 0 && (
                <div className="rounded-[12px] border border-slate-200/90 bg-white p-4 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Historique</span>
                  <div className="space-y-2 pl-1">
                    {activity.map((ev, i) => {
                      const EvIcon = ev.icon
                      return (
                        <div key={i} className="flex items-start gap-2 text-[12px]">
                          <EvIcon size={13} className="text-slate-300 mt-0.5 shrink-0" />
                          <p className="text-slate-600"><span className="font-medium text-slate-800">{ev.label}</span> · {formatDateTime(ev.at)}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between gap-3 flex-shrink-0">
              <div>
                {!isClosed && (
                  <button type="button" onClick={handleCancel} disabled={isCancelling || isUpdatingTask}
                    className="text-[12.5px] font-semibold text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50">
                    {isCancelling ? 'Annulation...' : 'Annuler la tâche'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button type="button" onClick={() => onEdit?.(task)} disabled={isTogglingStatus || isUpdatingTask}
                  className="h-[36px] px-4 rounded-[8px] font-semibold text-[13px] flex items-center gap-2 border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50">
                  <Edit2 size={13} /> Modifier
                </button>

                {canValidatePrescription ? (
                  <button type="button" onClick={handleValidatePrescription} disabled={isValidatingPrescription || isExecutingAction}
                    className="h-[36px] px-4 rounded-[8px] font-semibold text-[13px] text-white flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
                    {isValidatingPrescription || isExecutingAction ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                    Valider le renouvellement
                  </button>
                ) : !isCancelled ? (
                  // A cancelled task has no "Terminer" — that button belongs to the
                  // pending/completed toggle only; cancelling is a distinct, final state.
                  <button type="button" onClick={() => onToggleStatus(task.id, task.status)} disabled={isTogglingStatus || isUpdatingTask}
                    className="h-[36px] px-4 rounded-[8px] font-semibold text-[13px] text-white flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isTogglingStatus || isUpdatingTask ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : isCompleted ? (
                      <><RotateCcw size={13} /> Rouvrir la tâche</>
                    ) : (
                      <><CheckCircle2 size={14} /> Terminer la tâche</>
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
