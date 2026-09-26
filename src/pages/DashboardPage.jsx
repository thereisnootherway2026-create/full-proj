import { forwardRef, useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  BriefcaseBusiness,
  Clock3,
  RefreshCw,
  Users,
  ArrowRight,
  X,
  Calendar,
  RotateCcw,
  Timer,
  CheckCircle2,
  AlertCircle,
  FileText,
  Pill,
  MessageSquare,
  Stethoscope,
  CalendarClock,
  ArrowLeft,
  Archive,
  Plus,
  UserPlus,
  Search,
  Phone,
  Printer,
  Receipt,
  Banknote,
  CreditCard,
  Landmark,
  ShieldCheck
} from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { RDV_STATUSES, VISIT_STATUSES, VISIT_STATUS_LABELS, VISIT_STATUS_COLORS } from '../lib/workflow'
import Button from '../components/common/Button'
import Badge from '../components/common/Badge'
import Select from '../components/common/Select'
import {
  addAppointmentToWaitingRoom,
  callPatient,
  openConsultation,
  createWalkInVisit,
  undoAddToWaitingRoom,
  subscribeClinicVisits,
  processVisitPayment,
  getVisitBillingBalance,
} from '../lib/visitService'

// Import existing modal
import Modal from '../components/common/Modal'
import PaymentModal from '../components/common/PaymentModal'
import AddTaskModal from '../components/forms/AddTaskModal'
import { loadTasks, saveTasks, taskToLegacy } from '../lib/taskHelpers'
import { fetchTasks, createTask } from '../lib/taskService'
import { createPatient } from '../lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { openPrintWindow } from '../components/common/ReceiptPrint'
import { cancelAppointment, rescheduleAppointment } from '../lib/appointmentService'
import { motion, AnimatePresence, useReducedMotion, useIsPresent } from 'framer-motion'
import { isToday, isPast, parseISO } from 'date-fns'
import ExamsToReviewBanner from '../components/dashboard/ExamsToReviewBanner'

const TZ = 'Africa/Casablanca'
const fmtMAD = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' MAD'

// Amount due for a visit. The payment row written when the consultation was finished
// (surfaced as billing_amount) is authoritative; the 300 default only applies to a
// visit that has no billing figure at all.
// A visit still in billing that was billed on an earlier day is a carried-over balance, not
// same-day activity. The billed date comes from the visit's own billing_at (set when the
// consultation was sent to the cashier), falling back to its queue date.
const QUEUE_TZ = 'Africa/Casablanca'
const dayKey = (date) => new Date(date).toLocaleDateString('fr-CA', { timeZone: QUEUE_TZ })
const billedAt = (visit) => visit?.queue_date || visit?.billing_at || null
const isCarriedOver = (visit) => (
  visit?.status === VISIT_STATUSES.BILLING && Boolean(billedAt(visit)) && dayKey(billedAt(visit)) < dayKey(new Date())
)
// Partly paid (some collected, a balance left): it leaves the live queue for Historique, where it is
// shown with its "Reste à payer" chip and can still be collected.
const isPartiallyPaid = (visit) => (
  visit?.status === VISIT_STATUSES.BILLING && Number(visit.total_paid) > 0 && Number(visit.remaining_balance) > 0
)
const fmtBilledDay = (visit) => new Date(billedAt(visit)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: QUEUE_TZ })

const visitTotalDue = (visit) => {
  const actes = visit?.sessionActes?.reduce((sum, a) => sum + a.montant, 0) || 0
  return actes > 0 ? actes : (visit?.billing_amount || visit?.consultations?.billing_amount || 300)
}

const getPaymentMethodMeta = (method) => {
  switch (method) {
    case 'card':
      return { label: 'Carte bancaire', Icon: CreditCard, badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/80', iconClass: 'bg-blue-100 text-blue-700' }
    case 'transfer':
      return { label: 'Virement', Icon: Landmark, badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/80', iconClass: 'bg-purple-100 text-purple-700' }
    case 'insurance':
      return { label: 'Tiers payant', Icon: ShieldCheck, badgeClass: 'bg-teal-50 text-teal-700 border-teal-200/80', iconClass: 'bg-teal-100 text-teal-700' }
    case 'cash':
    default:
      return { label: 'Espèces', Icon: Banknote, badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80', iconClass: 'bg-emerald-100 text-emerald-700' }
  }
}

function formatTime(date) {
  if (!date) return '--:--'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '--:--'
  return parsed.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  })
}

function getPatientName(rdv) {
  return [rdv?.patients?.prenom, rdv?.patients?.nom].filter(Boolean).join(' ') || 'Patient'
}

function getInitials(rdv) {
  const name = getPatientName(rdv)
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

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

function FilterChips() {
  return (
    <button
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
    >
      Historique
    </button>
  )
}

// forwardRef for the same reason as PatientCard below: it is listed under an
// AnimatePresence mode="popLayout" (the Aperçu du jour panel), which needs a ref on its direct
// child to animate items leaving the list cleanly.
const PreviewRdvBar = forwardRef(function PreviewRdvBar({ rdv, index = 0, doctors, selectedDoctorId, onSelectDoctor, isBusy, onAddToQueue, onCancel, onShowDatePicker, showDatePicker, onConfirmDate, onBack, isHovered, onHover }, ref) {
  const { can } = useAppContext()
  const reduceMotion = useReducedMotion()
  const initials = getInitials(rdv)
  const [newDate, setNewDate] = useState(rdv.date_rdv)
  const [addIconHovered, setAddIconHovered] = useState(false)
  const [addIconPressed, setAddIconPressed] = useState(false)
  const [cancelIconHovered, setCancelIconHovered] = useState(false)
  const [cancelIconPressed, setCancelIconPressed] = useState(false)

  return (
    <motion.div
      ref={ref}
      className="PreviewRdvBar py-3 px-4 rounded-xl mb-3"
      data-rdv-id={rdv.id}
      style={{ 
        border: '1px solid #e2e8f0', 
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
      }}
      // Same small local entrance as the queue's PatientCard, for a consistent feel across the
      // dashboard. This list (Prévisualisation) has its own AnimatePresence and its own keys, never
      // shared with the queue's — there was no travel risk here — it just used to pop in at full
      // opacity instead of appearing calmly like everything else.
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: reduceMotion ? 0.12 : 0.2, ease: 'easeOut', delay: reduceMotion ? 0 : Math.min(index, 8) * 0.035 } }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
      willChange="transform, opacity, height, margin, padding"
    >
      <div className="flex items-start gap-3">
        <div 
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: '#f1efe8' }}
        >
          <span className="text-xs font-medium text-slate-600">
            {initials}
          </span>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">
            {getPatientName(rdv)}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {formatTime(rdv.date_rdv)} · {rdv.motif || 'Consultation'}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {!showDatePicker ? (
          <motion.div 
            className="flex gap-2 mt-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {can('waiting_room.add_patient') && (
            <button
              onClick={onAddToQueue}
              disabled={isBusy}
              className="flex items-center justify-center gap-1.5 rounded-[0.625rem] font-semibold text-sm disabled:opacity-50"
              style={{
                backgroundColor: '#eff6ff',
                color: '#1e40af',
                border: '2px solid #bfdbfe',
                padding: '0.625rem 1rem',
                minHeight: '44px',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
                fontSize: '14px',
                width: 'auto',
                fontWeight: 'bold',
              }}
              onMouseEnter={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.backgroundColor = '#dbeafe';
                  e.currentTarget.style.borderColor = '#60a5fa';
                  e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(37,99,235,0.15)';
                  setAddIconHovered(true);
                }
              }}
              onMouseLeave={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.backgroundColor = '#eff6ff';
                  e.currentTarget.style.borderColor = '#bfdbfe';
                  e.currentTarget.style.boxShadow = 'none';
                  setAddIconHovered(false);
                  setAddIconPressed(false);
                }
              }}
              onMouseDown={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)';
                  e.currentTarget.style.boxShadow = '0 3px 8px -2px rgba(37,99,235,0.1)';
                  setAddIconPressed(true);
                }
              }}
              onMouseUp={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(37,99,235,0.15)';
                  setAddIconPressed(false);
                }
              }}
            >
              <span>Ajouter à la salle</span>
              <ArrowRight
                size={18}
                style={{
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: addIconPressed ? 'translateX(5px)' : addIconHovered ? 'translateX(3px)' : 'translateX(0)'
                }}
              />
            </button>
            )}
            {can('appointments.cancel') && (
            <button
              onClick={onCancel}
              disabled={isBusy}
              className="flex items-center justify-center gap-1.5 rounded-[0.625rem] font-semibold text-sm disabled:opacity-50"
              style={{
                backgroundColor: '#fef2f2',
                color: '#991b1b',
                border: '2px solid #fecaca',
                padding: '0.625rem 1rem',
                minHeight: '44px',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
                fontSize: '14px',
                width: 'auto',
                fontWeight: 'bold',
              }}
              onMouseEnter={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.backgroundColor = '#fee2e2';
                  e.currentTarget.style.borderColor = '#f87171';
                  e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(220,38,38,0.15)';
                  setCancelIconHovered(true);
                }
              }}
              onMouseLeave={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                  e.currentTarget.style.borderColor = '#fecaca';
                  e.currentTarget.style.boxShadow = 'none';
                  setCancelIconHovered(false);
                  setCancelIconPressed(false);
                }
              }}
              onMouseDown={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)';
                  e.currentTarget.style.boxShadow = '0 3px 8px -2px rgba(220,38,38,0.1)';
                  setCancelIconPressed(true);
                }
              }}
              onMouseUp={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(220,38,38,0.15)';
                  setCancelIconPressed(false);
                }
              }}
            >
              <span>Annuler RDV</span>
              <X
                size={18}
                style={{
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: cancelIconPressed ? 'rotate(135deg) scale(0.95)' : cancelIconHovered ? 'rotate(90deg) scale(1.1)' : 'rotate(0deg) scale(1)'
                }}
              />
            </button>
            )}
          </motion.div>
        ) : (
          <motion.div 
            className="mt-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                <RotateCcw size={14} />
                <span>Retour</span>
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-500" />
                <input
                  type="datetime-local"
                  value={newDate ? new Date(newDate).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                onClick={() => onConfirmDate(newDate)}
                className="px-3 py-2 rounded-[10px] bg-[#22c55e] text-white text-sm font-medium hover:bg-[#16a34a] transition-all h-[44px]"
              >
                Confirmer
              </button>
            </div>
            <button
              onClick={() => onCancel('permanent')}
              className="px-3 py-2 rounded-[10px] bg-white border border-[#ef4444] text-[#ef4444] text-sm font-medium hover:bg-[#fef2f2] transition-all h-[44px]"
            >
              Annuler définitivement
            </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})

function CancelledRdvBar({ rdv }) {
  const initials = getInitials(rdv)
  return (
    <motion.div 
      className="py-3"
      style={{ borderBottom: '1px solid #f1f5f9' }}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      willChange="transform, opacity"
    >
      <div className="flex items-center gap-3">
        <div 
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: '#f1f5f9' }}
        >
          <span className="text-xs font-medium text-slate-400">
            {initials}
          </span>
        </div>
        
        <div className="flex-1 min-w-0 flex items-center justify-between">
          <p className="truncate text-base font-medium text-slate-400 line-through">
            {getPatientName(rdv)}
          </p>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
            RDV annulé
          </span>
        </div>
      </div>
    </motion.div>
  )
}

function PreviewCard({ rdvList, cancelledRdvs, isBusy, onAddToQueue, onCancel, onShowDatePicker, showDatePickerMap, onConfirmDate, onBack }) {
  const scheduledAppointments = useMemo(
    () => (rdvList || [])
      // arrival_status must also be checked — an rdv keeps status='confirme'
      // after being added to the waiting room (only arrival_status changes),
      // so without this a patient already in the queue (added from this
      // page, from /salle-attente, or in another tab) kept showing an
      // "Ajouter à la salle" button that would always fail server-side with
      // "patient has already arrived or left" — a correct guard, but a
      // confusing, always-broken-looking button.
      .filter((rdv) => 
        ['confirme', 'scheduled', 'CONFIRME', 'SCHEDULED'].includes(rdv.status) &&
        (!rdv.arrival_status || ['NOT_ARRIVED', 'not_arrived'].includes(rdv.arrival_status))
      )
      .sort((a, b) => new Date(a.date_rdv).getTime() - new Date(b.date_rdv).getTime()),
    [rdvList]
  )

  return (
    <section className="rounded-[21px] border border-[#e2e8f0] bg-white px-5 py-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)] w-full h-full">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">
          Prévisualisation
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-600">
          RDVs programmés pour aujourd'hui
        </p>
      </div>

      {scheduledAppointments.length === 0 && cancelledRdvs.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-slate-500">
            Aucun rendez-vous programmé
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          <AnimatePresence mode="popLayout">
            {scheduledAppointments.map((rdv, index) => (
              <PreviewRdvBar
                key={rdv.id}
                rdv={rdv}
                index={index}
                isBusy={Boolean(isBusy[rdv.id])}
                onAddToQueue={() => onAddToQueue(rdv)}
                onCancel={(type) => type === 'permanent' ? onCancel(rdv) : onShowDatePicker(rdv.id)}
                showDatePicker={showDatePickerMap[rdv.id]}
                onConfirmDate={(date) => onConfirmDate(rdv.id, date)}
                onBack={() => onBack(rdv.id)}
              />
            ))}
          </AnimatePresence>
          {cancelledRdvs.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-slate-600">
                RDV annulés
              </h3>
              <div className="bg-slate-50 rounded-lg">
                {cancelledRdvs.map((rdv) => (
                  <CancelledRdvBar key={rdv.id} rdv={rdv} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const TACHES_DU_JOUR_CATEGORIES = [
  { key: 'urgences', label: 'Urgences' },
  { key: 'resultats', label: 'Résultats à consulter' },
  { key: 'prescriptions', label: 'Ordonnances à signer' },
  { key: 'messages', label: 'Messages patients' },
]

function TachesDuJourCard({ isExpanded }) {
  const navigate = useNavigate();
  const { patients, profile, notify } = useAppContext();
  const queryClient = useQueryClient();
  const [voirToutesHovered, setVoirToutesHovered] = useState(false);
  const [voirToutesPressed, setVoirToutesPressed] = useState(false);
  const [addIconHovered, setAddIconHovered] = useState(false);
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', profile?.cabinet_id],
    queryFn: () => fetchTasks(profile?.cabinet_id),
    enabled: Boolean(profile?.cabinet_id)
  });

  const createMutation = useMutation({
    mutationFn: (taskData) => {
      return createTask(profile?.cabinet_id, profile?.id, taskData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', profile?.cabinet_id] })
      setAddTaskModalOpen(false)
      notify?.({ title: 'Tâche créée', description: 'La tâche a été ajoutée.', variant: 'success' })
    }
  });

  const getTaskCount = (categoryKey) => {
    const pendingTasks = tasks.filter(t => t.status !== 'completed');
    if (categoryKey === 'urgences') {
      return pendingTasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length;
    } else if (categoryKey === 'resultats') {
      return pendingTasks.filter(t => t.type === 'results').length;
    } else if (categoryKey === 'prescriptions') {
      return pendingTasks.filter(t => t.type === 'prescription').length;
    } else if (categoryKey === 'messages') {
      return pendingTasks.filter(t => t.type === 'patient_followup' || t.type === 'other').length;
    }
    return 0;
  };
  
  const handleCategoryClick = (category) => {
    navigate(`/taches?category=${category}`);
  };
  
  return (
    <section
      className="sidebar-apercu relative rounded-[21px] border border-slate-200 bg-white px-5 py-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)] overflow-hidden w-full"
    >
      <div className="sidebar-content">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Tâches du jour</h2>
            <p className="text-sm font-medium text-slate-600 mt-1">Priorités à traiter aujourd&apos;hui</p>
          </div>
          <button
            className="flex items-center justify-center w-10 h-10 rounded-[10px] transition-all duration-300"
            style={{
              backgroundColor: addIconHovered ? '#1e40af' : '#2563eb',
              border: '2px solid ' + (addIconHovered ? '#1e3a8a' : '#60a5fa'),
              boxShadow: addIconHovered ? '0 6px 16px -4px rgba(37,99,235,0.4)' : 'none',
              transform: addIconHovered ? 'translateY(-2px) scale(1.1)' : 'translateY(0) scale(1)'
            }}
            onMouseEnter={() => setAddIconHovered(true)}
            onMouseLeave={() => setAddIconHovered(false)}
            onClick={() => setAddTaskModalOpen(true)}
            aria-label="Ajouter une tâche"
          >
            <motion.div
              animate={{ 
                rotate: addIconHovered ? [0, -10, 10, -5, 5, 0] : 0, 
                scale: addIconHovered ? 1.15 : 1 
              }}
              transition={{ 
                duration: 0.5, 
                ease: "easeInOut"
              }}
            >
              <Plus size={22} className="text-white" strokeWidth={2.5} />
            </motion.div>
          </button>
        </div>
        
        {/* Task list */}
        <div className="space-y-1">
          {TACHES_DU_JOUR_CATEGORIES.map(({ key, label }, index) => {
            const count = getTaskCount(key);
            return (
              <button
                key={key}
                type="button"
                className={`group w-full flex items-center justify-between text-left py-3.5 cursor-pointer transition-colors duration-200 ease-out ${
                  index < TACHES_DU_JOUR_CATEGORIES.length - 1 ? 'border-b border-slate-200' : ''
                }`}
                onClick={() => handleCategoryClick(key)}
              >
                <span className="inline-block text-base font-semibold text-slate-700 transition-all duration-200 ease-out group-hover:text-slate-900 group-hover:-translate-y-0.5 group-hover:drop-shadow-[0_4px_6px_rgba(15,23,42,0.12)]">
                  {label}
                </span>
                {!isLoading && count > 0 && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    key === 'urgences' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        
        {/* Bottom button */}
        <div className="mt-6">
          <button 
            onClick={() => {
              navigate('/taches');
            }}
            className="w-full px-4 py-2 rounded-[0.625rem] font-semibold text-sm"
            style={{
              backgroundColor: voirToutesHovered ? '#f8fafc' : '#ffffff',
              color: '#475569',
              border: '2px solid ' + (voirToutesHovered ? '#cbd5e1' : '#e2e8f0'),
              padding: '0.75rem 1.25rem',
              minHeight: '50px',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              whiteSpace: 'nowrap',
              fontSize: '15px',
              width: '100%',
              fontWeight: 'bold',
              transform: voirToutesPressed ? 'translateY(-1px) scale(0.98)' : voirToutesHovered ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: voirToutesHovered ? '0 6px 16px -4px rgba(148,163,184,0.15)' : 'none'
            }}
            onMouseEnter={() => setVoirToutesHovered(true)}
            onMouseLeave={() => { setVoirToutesHovered(false); setVoirToutesPressed(false); }}
            onMouseDown={() => setVoirToutesPressed(true)}
            onMouseUp={() => setVoirToutesPressed(false)}
          >
            Voir toutes les tâches
          </button>
        </div>
      </div>

      {/* Add Task Modal — redesigned */}
      <AddTaskModal
        open={addTaskModalOpen}
        onClose={() => setAddTaskModalOpen(false)}
        patients={patients || []}
        onSubmit={(task) => createMutation.mutate(task)}
        isPending={createMutation.isPending}
        currentUser={profile}
      />
    </section>
  );
}

// Forwards its ref to the root motion.div: AnimatePresence's mode="popLayout" (used where this card
// is listed — the live queue and Historique) needs a ref on its direct child to measure and freeze an
// exiting card's position while its siblings reflow. Without it React warns ("Function components
// cannot be given refs") and that measurement silently fails — reproduced live: switching the
// Médecin/Secrétaire POV changes which cards are in view (a card in "encaissement"/billing status
// only shows for the secretary), and the resulting enter/exit broke instead of animating cleanly.
// How long the ↩ "annuler l'ajout" arrow stays on a just-added patient's card. Mis-clicks are
// noticed within seconds; the server-side limit (10 min) is a safety margin, not a target.
const UNDO_WINDOW_MS = 3 * 60 * 1000

const PatientCard = forwardRef(function PatientCard({ rdv, index, isBusy, onAction, isDoctor, isAlertActive, onAcknowledgeAlert, onEncaisser, onViewReceipt, paidVisits, allPayments, onViewPaymentHistory, isHistoryCard = false, totalPaid = 0, onOpenDossier, onUndo, isUndoable, balanceChips = false }, ref) {
  const { can } = useAppContext()
  console.log('=== PatientCard Debug ===');
  console.log('rdv:', rdv);
  // Get status - normalize status
  const normalizedStatus = rdv.status || VISIT_STATUSES.WAITING;
  const isSecretary = !isDoctor;

  // Calculate payment info
  const totalAmount = visitTotalDue(rdv);
  const visitPayments = allPayments[rdv.id] || [];
  const calculatedPaid = visitPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPaidSoFar = calculatedPaid || rdv.total_paid || (rdv.billing_amount ? rdv.billing_amount - (rdv.remaining_balance || 0) : (isHistoryCard ? (rdv.isPartial ? 150 : 300) : 0));
  const reste = rdv.remaining_balance !== undefined ? rdv.remaining_balance : Math.max(0, totalAmount - totalPaidSoFar);

  const isPartial = rdv.status === 'PARTIEL' || rdv.status === 'partiel' || rdv.status === VISIT_STATUSES.PARTIEL || (isHistoryCard && reste > 0);
  const isPartialInHistory = isHistoryCard && isPartial;

  let statusColors = VISIT_STATUS_COLORS[normalizedStatus] || VISIT_STATUS_COLORS[VISIT_STATUSES.WAITING];
  let statusLabel = (rdv.status && VISIT_STATUS_LABELS[rdv.status]) || rdv.time_status || 'En attente';

  if (balanceChips) {
    // A balance from an earlier visit, shown because the patient is back today.
    statusColors = { border: '#f59e0b', badgeBg: '#fef3c7', badgeText: '#92400e' };
    statusLabel = 'Solde à encaisser';
  } else if (isHistoryCard || isPartial || rdv.status === 'PARTIEL' || rdv.status === 'TERMINÉ' || normalizedStatus === VISIT_STATUSES.COMPLETED) {
    if (isPartial || reste > 0) {
      statusColors = { border: '#f59e0b', badgeBg: '#fef3c7', badgeText: '#92400e' };
      statusLabel = `Payé partiellement: ${totalPaidSoFar} MAD / ${totalAmount} MAD`;
    } else {
      statusColors = { border: '#16a34a', badgeBg: '#dcfce7', badgeText: '#166534' };
      statusLabel = `Payé: ${totalPaidSoFar > 0 ? totalPaidSoFar : totalAmount} MAD`;
    }
  }
  
  // State for button effects
  const [encaisserHovered, setEncaisserHovered] = useState(false);
  const [encaisserPressed, setEncaisserPressed] = useState(false);
  const [viewReceiptHovered, setViewReceiptHovered] = useState(false);
  const [viewReceiptPressed, setViewReceiptPressed] = useState(false);
  const [viewHistoryHovered, setViewHistoryHovered] = useState(false);
  const [viewHistoryPressed, setViewHistoryPressed] = useState(false);
  const [undoHovered, setUndoHovered] = useState(false);
  const [undoPressed, setUndoPressed] = useState(false);

  // Motion variants — a small, purely local entrance/exit. No `layout`, no `layoutId`, no shared
  // motion identity: this card only ever animates relative to itself (its own opacity/position),
  // never relative to where it (or another card) was previously rendered. That, combined with the
  // POV-namespaced keys above, is what stops a card from visually travelling between the Médecin and
  // Secrétaire views — there is nothing here left that computes a delta between two renders.
  const reduceMotion = useReducedMotion();
  // A long list would otherwise queue up a very visible cascade; cap how many cards actually stagger.
  const staggerDelay = reduceMotion ? 0 : Math.min(index, 8) * 0.035;
  const cardVariants = {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 },
    normal: {
      opacity: 1,
      y: 0,
      scale: 1,
      boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
      transition: { duration: reduceMotion ? 0.12 : 0.2, ease: 'easeOut', delay: staggerDelay }
    },
    alert: {
      opacity: 1,
      y: -3,
      scale: 1,
      boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
      transition: { duration: 0.2, ease: 'easeOut' }
    },
    leave: {
      opacity: 0,
      y: reduceMotion ? 0 : 6,
      scale: reduceMotion ? 1 : 0.99,
      transition: { duration: reduceMotion ? 0.1 : 0.15, ease: 'easeIn' }
    }
  };

  const isPaid = paidVisits.has(rdv.id);
  // Billing entries say when the balance originated: today, or the earlier day it was billed.
  const showBilledOn = isSecretary && !isHistoryCard && normalizedStatus === VISIT_STATUSES.BILLING;
  // Balance cards are always from an earlier day (unpaid, or closed after a partial payment).
  const carriedOver = (showBilledOn && isCarriedOver(rdv)) || (isSecretary && balanceChips && Boolean(billedAt(rdv)));
  const canCollectBalance = balanceChips && reste > 0;
  const accentColor = carriedOver ? '#d97706' : statusColors.border;
  // Doctor's Historique: the consultation is done — what matters is that, not the payment
  // breakdown (that's the secretary's job). One quiet status, no pills, no accent bar; an
  // outstanding balance is still mentioned, as plain text.
  const doctorHistory = isDoctor && (isHistoryCard || balanceChips);
  const doctorStatus = normalizedStatus === VISIT_STATUSES.BILLING
    ? { label: 'En encaissement', dot: 'bg-amber-400', text: 'text-amber-700' }
    : { label: 'Terminée', dot: 'bg-emerald-500', text: 'text-emerald-700' };

  return (
    <motion.div
      ref={ref}
      // Deliberately no `layout` (and no `layoutId`) prop: that's what let a card interpolate a
      // transform between its old and new rendered position instead of just fading in fresh. A card
      // that changes row now simply re-fades at its new spot via popLayout's normal reflow, with no
      // animated delta computed between the two — see cardVariants above for the full reasoning.
      className={`mb-3 rounded-[16px] border bg-white shadow-sm p-4 flex items-center gap-4 relative overflow-hidden ${carriedOver ? 'border-amber-300' : 'border-slate-200'}`}
      initial="initial"
      animate={isSecretary && isAlertActive ? 'alert' : 'normal'}
      exit="leave"
      variants={cardVariants}
      onClick={isSecretary && isAlertActive ? () => onAcknowledgeAlert(rdv.id) : undefined}
      style={{ cursor: isSecretary && isAlertActive ? 'pointer' : 'default' }}
    >
      {/* Left accent bar (4px, no radius) — not in the doctor's Historique */}
      {!doctorHistory && <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accentColor }} />}

      {/* Patient avatar */}
      <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 ml-4">
        {rdv.avatar ? (
          <img src={rdv.avatar} alt={getPatientName(rdv)} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-semibold text-slate-600">
            {getInitials(rdv)}
          </span>
        )}
      </div>
      {/* Patient info */}
      <div className="flex-1 min-w-0">
        {/* Row 1 - identity: who, and where they are in the flow */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-base font-bold text-slate-900">{rdv.patient_name || getPatientName(rdv)}</span>
          {doctorHistory ? (
            <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${doctorStatus.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${doctorStatus.dot}`} />
              {doctorStatus.label}
            </span>
          ) : (
            <Badge size="md" className="font-bold" style={{ backgroundColor: statusColors.badgeBg, color: statusColors.badgeText }}>
              {statusLabel}
            </Badge>
          )}
          {isSecretary && isAlertActive && <Badge tone="blue" size="md">Envoyé au docteur</Badge>}
        </div>
        {/* Row 2 - details: reason, then matching chips (when it started, paid, left to pay) */}
        <div className="mt-1.5 flex items-center gap-x-2 gap-y-1.5 flex-wrap text-sm font-medium text-slate-500">
          <span>{rdv.reason || rdv.motif || 'Consultation'}</span>
          {carriedOver && (
            <Badge tone="amber" icon={CalendarClock} title="Solde d'une visite précédente">Depuis le {fmtBilledDay(rdv)}</Badge>
          )}
          {isSecretary && balanceChips && rdv.returnsTodayAt !== undefined && (
            <Badge tone="blue" title="Le patient revient aujourd'hui">
              {rdv.returnsTodayAt ? `RDV aujourd'hui ${rdv.returnsTodayAt}` : "Présent aujourd'hui"}
            </Badge>
          )}
          {doctorHistory ? (
            reste > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="font-semibold text-amber-700">{reste} MAD restant</span>
              </>
            )
          ) : isHistoryCard || balanceChips ? (
            <>
              {(isHistoryCard || totalPaidSoFar > 0) && <Badge tone="neutral">Payé : {totalPaidSoFar} MAD</Badge>}
              {reste > 0 && <Badge tone="amber">Reste à payer : {reste} MAD</Badge>}
            </>
          ) : (
            // Live queue: the amount is just information, not a status chip
            normalizedStatus === VISIT_STATUSES.BILLING && reste > 0 && (
              <span className="font-semibold text-slate-700">Reste à payer : {reste} MAD</span>
            )
          )}
        </div>
      </div>
      {/* Right side info */}
      <div className="flex flex-col items-end gap-1">
        {/* Undo arrow — icon only, sits above the wait time */}
        {isUndoable && onUndo && (
          <button
            onClick={(e) => { e.stopPropagation(); onUndo(); }}
            onMouseEnter={() => setUndoHovered(true)}
            onMouseLeave={() => { setUndoHovered(false); setUndoPressed(false); }}
            onMouseDown={() => setUndoPressed(true)}
            onMouseUp={() => setUndoPressed(false)}
            title="Annuler l'ajout à la salle"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              color: undoHovered ? '#1e40af' : '#3b82f6',
              backgroundColor: undoHovered ? '#dbeafe' : '#eff6ff',
              border: `1.5px solid ${undoHovered ? '#93c5fd' : '#bfdbfe'}`,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: undoPressed ? 'scale(0.88)' : undoHovered ? 'scale(1.1)' : 'scale(1)',
              boxShadow: undoHovered ? '0 4px 10px -2px rgba(59,130,246,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
              flexShrink: 0,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'transform 0.2s ease',
                transform: undoHovered ? 'translateX(-1px)' : 'translateX(0)',
              }}
            >
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
        )}
        {rdv.duration && (
          <span className="text-xs font-medium text-slate-500">Durée: {rdv.duration}</span>
        )}

        {rdv.wait_time && (
          <span className="text-sm font-medium text-slate-600">Attente: {rdv.wait_time}</span>
        )}
        {rdv.see_notes && (
          <button className="text-sm font-semibold text-blue-600 underline">Voir notes</button>
        )}
        {isSecretary && isAlertActive && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onAcknowledgeAlert(rdv.id);
            }}
            className="px-4 py-2 rounded-[10px] bg-yellow-600 text-white text-sm font-semibold hover:bg-yellow-700 transition-all"
          >
            Envoyé
          </button>
        )}
        {isSecretary && can('billing.collect') && (normalizedStatus === VISIT_STATUSES.BILLING || canCollectBalance) && !isPaid && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onEncaisser(rdv);
            }}
            className="px-4 py-2 rounded-[10px] text-sm font-semibold disabled:opacity-50"
            style={{
              backgroundColor: encaisserHovered ? '#CA8A04' : '#EAB308',
              color: '#422006',
              border: '2px solid ' + (encaisserHovered ? '#A16207' : '#FDE047'),
              minHeight: '44px',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: encaisserPressed ? 'translateY(-1px) scale(0.98)' : encaisserHovered ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: encaisserHovered ? '0 6px 16px -4px rgba(202, 138, 4, 0.15)' : 'none'
            }}
            onMouseEnter={() => setEncaisserHovered(true)}
            onMouseLeave={() => { setEncaisserHovered(false); setEncaisserPressed(false); }}
            onMouseDown={() => setEncaisserPressed(true)}
            onMouseUp={() => setEncaisserPressed(false)}
          >
            Encaisser
          </button>
        )}
        {isSecretary && (isPaid || isHistoryCard) && (!isPartialInHistory || can('billing.collect')) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isPartialInHistory && onEncaisser) {
                onEncaisser(rdv);
              } else {
                onViewPaymentHistory(rdv);
              }
            }}
            className="px-4 py-2 rounded-[0.625rem] text-sm font-semibold"
            style={{
              backgroundColor: isPartialInHistory
                ? (viewHistoryHovered ? '#d97706' : '#f59e0b')
                : (viewHistoryHovered ? '#15803D' : '#16A34A'),
              color: '#FFFFFF',
              border: '2px solid ' + (isPartialInHistory
                ? (viewHistoryHovered ? '#b45309' : '#fbbf24')
                : (viewHistoryHovered ? '#166534' : '#4ADE80')),
              padding: '0.625rem 1rem',
              minHeight: '44px',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              whiteSpace: 'nowrap',
              fontSize: '14px',
              width: 'auto',
              fontWeight: 'bold',
              transform: viewHistoryPressed ? 'translateY(-1px) scale(0.98)' : viewHistoryHovered ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: viewHistoryHovered ? `0 6px 16px -4px ${isPartialInHistory ? 'rgba(245,158,11,0.3)' : 'rgba(22,163,74,0.15)'}` : 'none'
            }}
            onMouseEnter={() => setViewHistoryHovered(true)}
            onMouseLeave={() => { setViewHistoryHovered(false); setViewHistoryPressed(false); }}
            onMouseDown={() => setViewHistoryPressed(true)}
            onMouseUp={() => setViewHistoryPressed(false)}
          >
            {isPartialInHistory ? `Régler le reste (${reste} MAD)` : 'Historique paiements'}
          </button>
        )}
        {/* Historique (doctor): open the patient's file */}
        {isDoctor && onOpenDossier && (
          <Button
            variant="secondary"
            iconOnly
            aria-label="Ouvrir le dossier patient"
            title="Ouvrir le dossier patient"
            onClick={(e) => {
              e.stopPropagation();
              const patientId = rdv.patient_id || rdv.patients?.id;
              if (patientId) onOpenDossier(patientId);
            }}
          >
            <FileText className="h-5 w-5" />
          </Button>
        )}
        {isDoctor && (normalizedStatus === VISIT_STATUSES.WAITING) && (
          <Button variant="accent" onClick={() => onAction(rdv, 'open_consultation')} disabled={isBusy}>
            Commencer
          </Button>
        )}
      </div>
    </motion.div>
  )
})

// Reveal for the "Arrivée sans RDV" panel. Opening and closing are mirror images: height, its bottom margin,
// opacity and position animate together and finish at the same moment, so nothing snaps at the end of the
// close (the margin used to stay until unmount and the queue jumped up). The patient dropdown may overflow
// only once the panel is fully open; it is clipped again the instant closing starts.
const WALKIN_EASE_OUT = [0.16, 1, 0.3, 1]
const WALKIN_EASE_IN_OUT = [0.4, 0, 0.2, 1]
function WalkInReveal({ children }) {
  const isPresent = useIsPresent()
  const reduceMotion = useReducedMotion()
  const [settled, setSettled] = useState(false)
  const k = reduceMotion ? 0 : 1
  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.98, y: -16 }}
      animate={{
        opacity: 1, height: 'auto', marginBottom: 24, scale: 1, y: 0,
        transition: {
          opacity: { duration: 0.26 * k, ease: 'easeOut' },
          height: { duration: 0.36 * k, ease: WALKIN_EASE_OUT },
          marginBottom: { duration: 0.36 * k, ease: WALKIN_EASE_OUT },
          scale: { duration: 0.36 * k, ease: WALKIN_EASE_OUT },
          y: { duration: 0.36 * k, ease: WALKIN_EASE_OUT },
        },
      }}
      exit={{
        opacity: 0, height: 0, marginBottom: 0, scale: 0.98, y: -12,
        transition: { duration: 0.3 * k, ease: WALKIN_EASE_IN_OUT },
      }}
      onAnimationComplete={() => { if (isPresent) setSettled(true) }}
      style={{ overflow: isPresent && settled ? 'visible' : 'hidden' }}
      className="relative z-30"
    >
      {children}
    </motion.div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const {
    rdvList,
    visits,
    outstandingVisits,
    doctors,
    patients,
    consultations,
    profile,
    role,
    canonicalRole,
    devRoleOverride,
    setDevRoleOverride,
    notify,
    refreshRdv,
    refreshVisits,
    refreshConsultations,
    refreshPatients,
    updateVisitStatus,
    removeVisit,
    updatePatientDebt,
    dataErrors,
    cabinetId,
    can,
  } = useAppContext()
  const [localRdvList, setLocalRdvList] = useState(rdvList)
  const [selectedDoctors, setSelectedDoctors] = useState({})
  const [cancelledRdvs, setCancelledRdvs] = useState([])
  const [busyMap, setBusyMap] = useState({})
  const [showDatePickerMap, setShowDatePickerMap] = useState({})
  const [newRdvs, setNewRdvs] = useState(new Set())
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [walkInPatientId, setWalkInPatientId] = useState('')
  const [walkInDoctorId, setWalkInDoctorId] = useState('')
  const [walkInSearchQuery, setWalkInSearchQuery] = useState('')
  const [showWalkInPatientDropdown, setShowWalkInPatientDropdown] = useState(false)
  const [walkInAddHovered, setWalkInAddHovered] = useState(false)
  const [walkInAddPressed, setWalkInAddPressed] = useState(false)
  const [walkInCancelHovered, setWalkInCancelHovered] = useState(false)
  const [walkInCancelPressed, setWalkInCancelPressed] = useState(false)
  const [walkInCreatingPatient, setWalkInCreatingPatient] = useState(false)
  const [walkInNewPatientPhone, setWalkInNewPatientPhone] = useState('')
  // Patients just added to the queue that can still be taken back out (the ↩ arrow on their
  // card): visitId -> patient name. Each entry expires after UNDO_WINDOW_MS; the server allows
  // a little more (undo_add_to_waiting_room: 10 min, patient still waiting).
  const [undoableVisits, setUndoableVisits] = useState(() => new Map())
  const undoTimersRef = useRef(new Map())
  const [localQueueVisits, setLocalQueueVisits] = useState([])
  const fileDattenteRef = useRef(null)

  const toggleWalkIn = () => setShowWalkIn((open) => !open)

  const closeWalkIn = () => {
    setShowWalkIn(false)
    setWalkInPatientId('')
    setWalkInDoctorId('')
    setWalkInSearchQuery('')
    setShowWalkInPatientDropdown(false)
    setWalkInCreatingPatient(false)
    setWalkInNewPatientPhone('')
  }

  // Sync localQueueVisits with AppContext visits to prevent stale data.
  //
  // "Ajouter à la salle" (handleAddToQueue) calls add_to_waiting_room, which
  // only updates rdv.arrival_status — it never creates a row in `visits` at
  // all (that's a separate table, populated by walk-ins/create_visit_from_rdv,
  // neither of which this button uses). The optimistic entry it pushes into
  // localQueueVisits will therefore NEVER show up in `visits`, no matter how
  // long we wait. This effect used to blindly replace localQueueVisits with
  // visits.filter(...) on every change — the instant ANY realtime event
  // touched `visits` for an unrelated reason (another patient's status,
  // a payment elsewhere in the clinic), that optimistic card was wiped out
  // rather than genuinely persisted, which is why it could fail to "stick"
  // in File d'attente. Now it merges: entries not yet (and never going to
  // be) backed by a real visits row are preserved alongside the fresh ones.
  useEffect(() => {
    const fromVisits = visits.filter(v => ['waiting', 'called', 'consultation'].includes(v.status))
    setLocalQueueVisits(current => {
      const visitIds = new Set(fromVisits.map(v => v.id))
      const pendingOnly = current.filter(v => !visitIds.has(v.id))
      return [...pendingOnly, ...fromVisits]
    })
  }, [visits])

  const walkInSearchContainerRef = useRef(null)
  const [ghost, setGhost] = useState(null)
  const [activeAlerts, setActiveAlerts] = useState(new Set()) // IDs of visits in alert state
  const audioRef = useRef(null)
  
  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [currentPaymentVisit, setCurrentPaymentVisit] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [processingPayment, setProcessingPayment] = useState(false)
  // Set once the payment is recorded: switches the payment modal to its "Générer le reçu ?" step.
  const [paymentDone, setPaymentDone] = useState(null)
  
  // Payment history modal state
  const [paymentHistoryModalOpen, setPaymentHistoryModalOpen] = useState(false)
  const [currentHistoryVisit, setCurrentHistoryVisit] = useState(null)

  // Add Task modal state is managed inside TachesDuJourCard
  
  // Queue vs History view state
  const [showingHistory, setShowingHistory] = useState(false)
  
  // Paid visits state to show receipt button
  const [paidVisits, setPaidVisits] = useState(new Set())
  
  // State for payment modal button effects
  
  // Payment records for all visits (supports multiple partial payments per visit)
  const [allPayments, setAllPayments] = useState({}); // key: visitId, value: array of payments
  // State for payment modal new fields
  const [paymentModalMontantPaye, setPaymentModalMontantPaye] = useState('');
  
  // Helper: calculate "reste à payer" for a visit
  const calculateResteAPayer = (visitId, totalMontant) => {
    const visitPayments = allPayments[visitId] || [];
    const totalPaid = visitPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    return Math.max(0, Number(totalMontant) - totalPaid);
  };
  
  // Load initial state from localStorage
  const [isExpanded, setIsExpandedState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarClosed');
      return saved === 'true';
    }
    return false;
  });

  // Update localStorage when state changes
  const setIsExpanded = (newValue) => {
    setIsExpandedState(newValue);
    localStorage.setItem('sidebarClosed', newValue.toString());
  };

  // Debug: log all role-related vars
  console.log("DashboardPage role debug:", { canonicalRole, role, profileRole: profile?.role, devRoleOverride })
  const isDoctor = canonicalRole === 'doctor' || ['docteur', 'medecin', 'médecin'].includes(String(role || '').toLowerCase())
  console.log("isDoctor:", isDoctor)
  const isSecretary = !isDoctor

  // The walk-in panel is a secretary-only feature (see the render gate below, which is not
  // wrapped in AnimatePresence for exactly this reason). If it's left open while switching to
  // the doctor POV (e.g. the dev role switcher), reset it here too, so a later switch back to
  // secretary starts clean instead of the panel silently reappearing already open.
  useEffect(() => {
    if (!isDoctor) return
    setShowWalkIn(false)
    setWalkInPatientId('')
    setWalkInDoctorId('')
    setWalkInSearchQuery('')
    setShowWalkInPatientDropdown(false)
    setWalkInCreatingPatient(false)
    setWalkInNewPatientPhone('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDoctor])
  const userRole = canonicalRole || role
  const currentDoctorId = profile?.id
  const showPreviewPanel = isSecretary


  // Play notification sound
  const playNotificationSound = () => {
    if (!audioRef.current) {
      // Create a simple beep sound programmatically
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } else {
      audioRef.current.play();
    }
  };

  // Acknowledge alert
  const acknowledgeAlert = (visitId) => {
    setActiveAlerts(prev => {
      const next = new Set(prev);
      next.delete(visitId);
      return next;
    });
  };

  // Open payment modal
  const handleEncaisser = async (queuedVisit) => {
    // Read the real balance from the database: the card's figures can be stale or incomplete.
    let visit = queuedVisit;
    try {
      const balance = await getVisitBillingBalance(queuedVisit.id);
      if (balance) {
        visit = { ...queuedVisit, billing_amount: balance.billed, total_paid: balance.collected, remaining_balance: balance.remaining };
      }
    } catch (err) {
      console.warn('Could not load the visit balance, using the queue figures:', err);
    }
    setCurrentPaymentVisit(visit);
    // Priority: sessionActes total > billing_amount on visit root (set by updateVisitStatus) > consultations sub-object > default 300
    const totalAmount = visitTotalDue(visit);
    // Calculate reste à payer already existing (before new payment)
    // The server's remaining_balance (billed - collected) is authoritative; the local
    // allPayments ledger only covers payments made in this browser session.
    const resteBefore = visit?.remaining_balance ?? calculateResteAPayer(visit.id, totalAmount);
    setPaymentModalMontantPaye(String(resteBefore)); // default to full remaining balance
    setPaymentMethod('cash');
    setPaymentDone(null);
    setPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setPaymentModalOpen(false);
    setPaymentDone(null);
  };

  // Handle payment confirmation
  const handleConfirmPayment = async () => {
    if (!currentPaymentVisit) return;
    setProcessingPayment(true);
    try {
      const visitId = currentPaymentVisit.id;
      const totalAmount = visitTotalDue(currentPaymentVisit);
      const amountToPay = Number(paymentModalMontantPaye);

      // Create new payment record
      const newPayment = {
        id: `payment_${Date.now()}`,
        amount: amountToPay,
        method: paymentMethod,
        timestamp: new Date().toISOString(),
        patientId: currentPaymentVisit.patientId || currentPaymentVisit.patients?.id || null,
        cabinetId: profile?.cabinet_id || null,
        visitId: visitId
      };

      // NOTE: this used to also call recordPayment(currentPaymentVisit.id, ...),
      // a separate RPC that expects an rdv id — but currentPaymentVisit.id is
      // a visit id, so that call always raised "appointment not found" and
      // aborted before processVisitPayment (the real, working billing RPC)
      // ever ran. Confirmed live this dashboard "Encaisser" flow was broken;
      // BillingPage.jsx's equivalent flow only ever called processVisitPayment.
      // Collected so far and remaining balance, from the server figures when present.
      const previousPayments = allPayments[visitId] || [];
      const previousTotalPaid = currentPaymentVisit.total_paid
        ?? previousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const resteBefore = currentPaymentVisit.remaining_balance ?? Math.max(0, totalAmount - previousTotalPaid);
      // A collection below the remaining balance is only sent when it is an explicit partial
      // payment; the RPC rejects any other short payment.
      await processVisitPayment(currentPaymentVisit.id, paymentMethod, amountToPay, { partial: amountToPay < resteBefore });

      const newTotalPaid = previousTotalPaid + amountToPay;
      const reste = Math.max(0, totalAmount - newTotalPaid);

      // A short payment leaves the visit open in billing (the server keeps it there with its
      // remaining balance); only a fully collected visit is settled and moved out of the queue.
      const newStatus = reste === 0 ? VISIT_STATUSES.COMPLETED : VISIT_STATUSES.BILLING;

      if (reste === 0) {
        setAllPayments(prev => ({
          ...prev,
          [visitId]: [...(prev[visitId] || []), newPayment]
        }));
        setPaidVisits(p => new Set([...p, visitId]));
      }
      updateVisitStatus(visitId, newStatus, {
        method: paymentMethod,
        amount: totalAmount, // visit.billing_amount is the BILLED total, not this collection
        reste: reste,
        remaining_balance: reste,
        totalPaid: newTotalPaid,
        total_paid: newTotalPaid,
        isPartial: reste > 0
      });

      const patientId = currentPaymentVisit.patientId || currentPaymentVisit.patients?.id || currentPaymentVisit.patient_id;
      if (patientId) {
        updatePatientDebt(patientId, reste);
      }

      setLocalQueueVisits(v => v.map(visit =>
        visit.id === visitId ? { 
          ...visit, 
          status: newStatus, 
          billing_amount: totalAmount, 
          remaining_balance: reste, 
          total_paid: newTotalPaid,
          isPartial: reste > 0 
        } : visit
      ));

      // Trigger global real-time event & refresh calls
      window.dispatchEvent(new CustomEvent('mm:payments-changed'));
      refreshVisits?.();
      refreshConsultations?.();

      // The payment is recorded. The receipt is only prepared here; the modal now asks
      // "Générer le reçu ? Oui / Non" and prints it on Oui.
      setPaymentDone({
        paid: amountToPay,
        reste,
        receipt: {
          recuNo: `REC-${(visitId || '').slice(-6).toUpperCase() || '2026-01'}`,
          patientName: getPatientName(currentPaymentVisit),
          patientCin: currentPaymentVisit?.patients?.cin || 'N/A',
          patientPhone: currentPaymentVisit?.patients?.telephone || 'N/A',
          patientAssurance: currentPaymentVisit?.patients?.assurance || 'N/A',
          date: new Date().toLocaleDateString('fr-FR'),
          montantTotal: totalAmount,
          montantPaye: newTotalPaid,
          resteAPayer: reste,
          paymentMethod: paymentMethod === 'cash' ? 'Espèces' : paymentMethod === 'card' ? 'TPE / Carte bancaire' : paymentMethod === 'insurance' ? 'Tiers payant' : 'Virement',
          notes: currentPaymentVisit?.reason || currentPaymentVisit?.motif || 'Consultation Médicale',
          title: reste > 0 ? 'REÇU DE PAIEMENT PARTIEL' : 'REÇU DE PAIEMENT MÉDICAL',
          isPaid: reste === 0
        }
      });

      // Success notification
      notify({
        title: reste === 0 ? 'Paiement final confirmé' : 'Paiement partiel confirmé',
        description: reste === 0
          ? 'Le paiement a été enregistré avec succès, consultation terminée.'
          : `Le paiement a été enregistré, reste à payer: ${reste} MAD.`
      });
    } catch (error) {
      console.error('Payment error:', error);
      notify({
        title: 'Erreur',
        // Surface the server's reason (e.g. amount above the remaining balance) instead of a bare failure.
        description: error?.message ? `Impossible de traiter le paiement : ${error.message}` : 'Impossible de traiter le paiement.',
        tone: 'error'
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  // Handle view payment history
  const handleViewPaymentHistory = (visit) => {
    setCurrentHistoryVisit(visit);
    setPaymentHistoryModalOpen(true);
  };
  
  // Handle view receipt
  const handleViewReceipt = (visit) => {
    // Use openPrintWindow from ReceiptPrint.jsx
    const patientName = getPatientName(visit);
    openPrintWindow({
      title: 'Reçu de paiement',
      subtitle: `${patientName} • ${new Date().toLocaleDateString('fr-FR')}`,
      sections: [
        {
          title: 'Détails du paiement',
          content: `
            <div style="padding: 8px 0;">
              <p><strong>Patient:</strong> ${patientName}</p>
              <p><strong>Montant:</strong> ${visit?.consultations?.billing_amount || 300} MAD</p>
              <p><strong>Mode de paiement:</strong> Espèces</p>
              <p><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
              <p><strong>Motif:</strong> ${visit?.reason || visit?.motif || 'Consultation'}</p>
            </div>
          `
        }
      ]
    });
  };

  // Handle WebSocket changes - for secretary alert
  const handleVisitChange = (payload) => {
    if (!isSecretary) return;
    // Check if the change is a status update from WAITING to CONSULTATION
    if (payload.eventType === 'UPDATE') {
      const oldStatus = payload.old.status;
      const newStatus = payload.new.status;
      if (oldStatus === VISIT_STATUSES.WAITING && newStatus === VISIT_STATUSES.CONSULTATION) {
        const visitId = payload.new.id;
        // Activate alert for this visit
        setActiveAlerts(prev => new Set([...prev, visitId]));
        // Play sound
        playNotificationSound();
        // Auto-acknowledge after 20 seconds
        setTimeout(() => {
          setActiveAlerts(prev => {
            const next = new Set(prev);
            next.delete(visitId);
            return next;
          });
        }, 20000);
      }
    }
  };

  // Subscribe to WebSocket for visit changes
  useEffect(() => {
    const clinicId = profile?.cabinet_id;
    if (!clinicId) return;
    const subscription = subscribeClinicVisits(clinicId, handleVisitChange);
    return () => subscription.unsubscribe();
  }, [profile?.cabinet_id]);
  
  // Close walk-in patient dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (walkInSearchContainerRef.current && !walkInSearchContainerRef.current.contains(event.target)) {
        setShowWalkInPatientDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => { setLocalRdvList(rdvList) }, [rdvList])

  const filteredQueue = useMemo(() => {
    const map = new Map()
    // localQueueVisits first so that AppContext visits (which carry sessionActes from updateVisitStatus) win
    localQueueVisits.forEach(visit => map.set(visit.id, visit))
    ;(visits || []).forEach(visit => map.set(visit.id, visit))
    const combined = Array.from(map.values())
    
    // Exclude COMPLETED, TERMINÉ, PARTIEL, and paidVisits from active queue immediately
    const activeQueue = combined.filter(visit => {
      const normalizedStatus = visit.status || VISIT_STATUSES.WAITING
      const isPaid = paidVisits.has(visit.id)
      const hasPayments = (allPayments[visit.id] || []).length > 0
      const isDoneOrPartial = normalizedStatus === VISIT_STATUSES.COMPLETED || normalizedStatus === VISIT_STATUSES.PARTIEL || visit.status === 'PARTIEL' || visit.status === 'TERMINÉ' || visit.status === 'completed' || visit.status === 'partiel'
      if (isDoctor) return ['waiting', 'called', VISIT_STATUSES.WAITING, VISIT_STATUSES.CALLED].includes(normalizedStatus) && !isPaid && !hasPayments
      return !isDoneOrPartial && !isPaid && !hasPayments && !isPartiallyPaid(visit)
    })
    
    // Sort: 
    // - For Secretary: BILLING first
    // - For Doctor: newly added waiting patients first, then the remaining waiting patients
    const result = [...activeQueue].sort((a, b) => {
      const getPriority = (status) => {
        if (isDoctor) {
          switch(status) {
            case VISIT_STATUSES.WAITING: return 0; // highest
            case VISIT_STATUSES.CONSULTATION: return 1;
            case VISIT_STATUSES.BILLING: return 2; // lowest
            default: return 3;
          }
        } else {
          // Secretary
          switch(status) {
            case VISIT_STATUSES.BILLING: return 0; // highest
            default: return 1;
          }
        }
      }
      
      const aStatus = a.status || VISIT_STATUSES.WAITING
      const bStatus = b.status || VISIT_STATUSES.WAITING
      const aPriority = getPriority(aStatus);
      const bPriority = getPriority(bStatus);
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      if (isDoctor) {
        const aIsRecentlyAdded = localQueueVisits.some(visit => visit.id === a.id)
        const bIsRecentlyAdded = localQueueVisits.some(visit => visit.id === b.id)
        if (aIsRecentlyAdded !== bIsRecentlyAdded) return aIsRecentlyAdded ? -1 : 1
      }
      return 0; // keep original order for same status
    })
    return result
  }, [localQueueVisits, visits, isDoctor, paidVisits, allPayments])

  const activeConsultation = useMemo(() => {
    return (visits || []).find(visit => ['consultation', VISIT_STATUSES.CONSULTATION].includes(visit.status))
  }, [visits])

  const filteredHistory = useMemo(() => {
    const map = new Map()
    // localQueueVisits first so that AppContext visits win (fresher data)
    localQueueVisits.forEach(visit => map.set(visit.id, visit))
    ;(visits || []).forEach(visit => map.set(visit.id, visit))
    const combined = Array.from(map.values())
    return combined.filter(visit => {
      const isPaid = paidVisits.has(visit.id)
      const hasPayments = (allPayments[visit.id] || []).length > 0
      const isDoneOrPartial = visit.status === VISIT_STATUSES.COMPLETED || visit.status === VISIT_STATUSES.PARTIEL || visit.status === 'PARTIEL' || visit.status === 'TERMINÉ' || visit.status === 'completed' || visit.status === 'partiel'
      return isDoneOrPartial || isPaid || hasPayments
    })
  }, [localQueueVisits, visits, paidVisits, allPayments])

  // Balances from an earlier visit, shown ONLY for a patient who is back today (an active
  // appointment or a visit today) — so the secretary knows to collect it this time. Every
  // other open balance lives in Facturation > Débiteurs, not on the dashboard. A partial
  // payment closes its visit (migration 20260923060000), so today's partly-paid visits sit in
  // "Terminées aujourd'hui", not here. A balance fully paid in this session drops out at once.
  const historyBalances = useMemo(() => {
    const returning = new Map() // patient_id -> today's time label ("10:30") or '' for a walk-in
    ;(rdvList || []).forEach((r) => {
      const s = String(r.status || '').toLowerCase()
      if (!r.patient_id || ['cancelled', 'annule', 'no_show', 'absent'].includes(s)) return
      if (!returning.has(r.patient_id)) returning.set(r.patient_id, r.date_rdv ? formatTime(r.date_rdv) : '')
    })
    const todayVisits = new Map()
    localQueueVisits.forEach(visit => todayVisits.set(visit.id, visit))
    ;(visits || []).forEach(visit => todayVisits.set(visit.id, visit))
    todayVisits.forEach((v) => { if (v.patient_id && !returning.has(v.patient_id)) returning.set(v.patient_id, '') })

    return (outstandingVisits || [])
      .filter(visit => !paidVisits.has(visit.id) && returning.has(visit.patient_id))
      .map(visit => ({ ...visit, returnsTodayAt: returning.get(visit.patient_id) }))
      .sort((a, b) => String(a.queue_date || '').localeCompare(String(b.queue_date || '')))
  }, [localQueueVisits, visits, outstandingVisits, paidVisits, rdvList])
  // Collecting a previous balance is the secretary's job: the doctor's Historique doesn't list them.
  const shownBalances = isDoctor ? [] : historyBalances

  // Filtered patients for walk-in search
  const filteredWalkInPatients = useMemo(() => {
    if (!walkInSearchQuery.trim()) return patients || []
    const query = walkInSearchQuery.toLowerCase()
    return (patients || []).filter(patient => {
      const fullName = `${patient.prenom || ''} ${patient.nom || ''}`.toLowerCase()
      const phone = (patient.telephone || '').toLowerCase()
      return fullName.includes(query) || phone.includes(query)
    })
  }, [patients, walkInSearchQuery])
  
  // Get selected patient name
  const selectedWalkInPatientName = useMemo(() => {
    if (!walkInPatientId) return ''
    const patient = (patients || []).find(p => p.id === walkInPatientId)
    if (!patient) return ''
    return `${patient.prenom || ''} ${patient.nom || ''}`.trim()
  }, [patients, walkInPatientId])

  const setBusy = (rdvId, isBusy) => {
    setBusyMap(current => {
      if (!isBusy) {
        const next = { ...current }
        delete next[rdvId]
        return next
      }
      return { ...current, [rdvId]: true }
    })
  }

  const applyOptimisticVisitStatus = (visitId, status) => {
    setLocalVisits(current => current.map(visit => visit.id === visitId ? { ...visit, status, updated_at: new Date().toISOString() } : visit))
  }

  const forgetUndoable = (visitId) => {
    window.clearTimeout(undoTimersRef.current.get(visitId))
    undoTimersRef.current.delete(visitId)
    setUndoableVisits(current => {
      if (!current.has(visitId)) return current
      const next = new Map(current)
      next.delete(visitId)
      return next
    })
  }

  // Offer the ↩ arrow on a just-added patient's card for a short while.
  const rememberUndoable = (visitData, name) => {
    const visit = Array.isArray(visitData) ? visitData[0] : visitData
    if (!visit?.id) return
    setUndoableVisits(current => new Map(current).set(visit.id, name))
    window.clearTimeout(undoTimersRef.current.get(visit.id))
    undoTimersRef.current.set(visit.id, window.setTimeout(() => forgetUndoable(visit.id), UNDO_WINDOW_MS))
  }

  useEffect(() => () => undoTimersRef.current.forEach(timer => window.clearTimeout(timer)), [])

  // Takes a just-added patient back out of the queue, on the server: the visit is withdrawn and
  // the appointment (if any) returns to the RDV list as "not arrived", still booked.
  const handleUndo = async (visit) => {
    const name = undoableVisits.get(visit.id)
    if (!name) return
    forgetUndoable(visit.id)
    setBusy(visit.id, true)
    try {
      await undoAddToWaitingRoom(visit.id)
      setLocalQueueVisits(current => current.filter(item => item.id !== visit.id))
      removeVisit(visit.id)
      await Promise.all([refreshVisits?.(), refreshRdv?.()])
      notify({
        title: 'Ajout annulé',
        description: visit.rdv_id
          ? `${name} a été retiré de la file d'attente et remis dans les rendez-vous.`
          : `${name} a été retiré de la file d'attente.`,
      })
    } catch (error) {
      const message = String(error?.message || '')
      notify({
        title: 'Annulation impossible',
        description: /no longer waiting/i.test(message)
          ? "Le patient a déjà été appelé : l'ajout ne peut plus être annulé."
          : /expired/i.test(message)
            ? "Le délai pour annuler cet ajout est dépassé."
            : error?.code === 'PGRST202' || /undo_add_to_waiting_room/.test(message)
              ? "Cette action nécessite une mise à jour de la base de données (undo_add_to_waiting_room)."
              : message || "Impossible d'annuler l'ajout.",
        tone: 'error',
      })
    } finally {
      setBusy(visit.id, false)
    }
  }

  const handleAddToQueue = async (rdv) => {
    setBusy(rdv.id, true)
    try {
      const doctorId = selectedDoctors[rdv.id] || (doctors && doctors.length > 0 ? doctors[0].id : null)
      const { addAppointmentToWaitingRoom } = await import('../lib/visitService')
      const visit = await addAppointmentToWaitingRoom(rdv.id, doctorId)

      // Authoritatively reload visits and rdv from Supabase (the single source of truth!)
      await Promise.all([
        refreshVisits?.(),
        refreshRdv?.(),
      ])

      setLocalRdvList(current => current.filter(item => item.id !== rdv.id))
      rememberUndoable(visit, getPatientName(rdv))
      notify({ title: 'Patient ajouté', description: `${getPatientName(rdv)} a été ajouté à la file d'attente`, variant: 'success' })
    } catch (error) {
      console.error('Error adding patient to queue:', error)
      notify({ title: 'Erreur', description: error?.message || 'Impossible d\'ajouter le patient à la salle d\'attente', tone: 'error' })
    } finally {
      setBusy(rdv.id, false)
    }
  }

  const handleCancelRdv = async (rdv) => {
    setBusy(rdv.id, true)
    try {
      const { cancelAppointment } = await import('../lib/api')
      await cancelAppointment(rdv.id)
      
      setLocalRdvList(current => current.filter(item => item.id !== rdv.id))
      setCancelledRdvs(current => [rdv, ...current])
      setShowDatePickerMap(prev => {
        const newMap = { ...prev }
        delete newMap[rdv.id]
        return newMap
      })
      notify({ title: 'RDV annulé', description: `${getPatientName(rdv)} a été annulé` })
    } catch (error) {
      console.error(error)
      notify({ title: 'Erreur', description: 'Impossible d\'annuler ce rendez-vous', tone: 'error' })
    } finally {
      setBusy(rdv.id, false)
    }
  }

  const handleShowDatePicker = (rdvId) => setShowDatePickerMap(prev => ({ ...prev, [rdvId]: true }))
  const handleBack = (rdvId) => setShowDatePickerMap(prev => {
    const newMap = { ...prev }
    delete newMap[rdvId]
    return newMap
  })

  const handleConfirmDate = async (rdvId, newDate) => {
    setBusy(rdvId, true)
    try {
      await rescheduleAppointment(rdvId, newDate)
      await refreshRdv?.()
      setLocalRdvList(current => current.map(rdv => rdv.id === rdvId ? { ...rdv, date_rdv: newDate } : rdv))
      setShowDatePickerMap(prev => {
        const newMap = { ...prev }
        delete newMap[rdvId]
        return newMap
      })
      notify({ title: 'Date mise à jour', description: 'Le rendez-vous a ete reprogramme.' })
    } catch (error) {
      // 23505 = unique_violation on rdv_one_active_per_patient_per_day
      // (one active appointment per patient per calendar day) — translate
      // to a clean French message; anything else keeps the real error.
      const isSameDayDuplicate = error?.code === '23505' && /rdv_one_active_per_patient_per_day/.test(error?.message || error?.details || '')
      notify({
        title: 'Erreur',
        description: isSameDayDuplicate ? 'Ce patient a déjà un rendez-vous prévu ce jour.' : (error.message || 'Impossible de reprogrammer ce rendez-vous.'),
        tone: 'error',
      })
    } finally {
      setBusy(rdvId, false)
    }
  }

  const handleWalkInSubmit = async () => {
    if (!walkInPatientId || !walkInDoctorId) {
      notify({ title: 'Champs obligatoires', description: 'Veuillez selectionner un patient et un medecin.', tone: 'error' })
      return
    }
    setBusy('walk-in', true)
    try {
      const visit = await createWalkInVisit(walkInPatientId, walkInDoctorId)
      await refreshVisits?.()
      rememberUndoable(visit, selectedWalkInPatientName || 'Le patient')
      closeWalkIn()
      notify({ title: 'Patient ajouté', description: 'Le patient a été ajouté à la file d\'attente.' })
    } catch (error) {
      notify({ title: 'Erreur', description: error.message || 'Impossible d ajouter ce patient.', tone: 'error' })
    } finally {
      setBusy('walk-in', false)
    }
  }

  const handlePatientAction = (rdv, action) => {
    switch (action) {
      case 'call_patient':
      case 'open_consultation':
        setBusy(rdv.id, true)
        // Optimistically update the visit status in AppContext and localQueueVisits
        updateVisitStatus(rdv.id, VISIT_STATUSES.CONSULTATION)
        setLocalQueueVisits(current => current.map(visit => 
          visit.id === rdv.id ? { ...visit, status: VISIT_STATUSES.CONSULTATION } : visit
        ))
        // Get patient ID from rdv
        const patientId = rdv.patient_id || rdv.patients?.id
        // Land on the patient workspace (Historique first); the doctor opens the
        // consultation sheet from "+ Nouvelle consultation".
        navigate(`/patient-workspace/${patientId}?visitId=${rdv.id}`)
        // We can release the busy state after navigation has been triggered
        setTimeout(() => setBusy(rdv.id, false), 100)
        break
      case 'view_file':
        const patId = rdv.patient_id || rdv.patients?.id
        navigate(`/patient-workspace/${patId}?visitId=${rdv.id}`)
        break
      default:
        notify({ title: 'Action en cours', description: `Action "${action}" bientot disponible`, tone: 'info' })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const revenueToday = (consultations || []).filter(c => c.date_consult === today && c.statut === 'paye').reduce((sum, c) => sum + (Number(c.montant) || 0), 0)

  const dashboardError = dataErrors?.appointments || dataErrors?.visits || dataErrors?.consultations
  if (dashboardError) {
    return (
      <div className="min-h-full bg-slate-50 px-6 py-5">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-600" size={32} />
          <h1 className="text-lg font-bold text-red-900">Erreur de chargement</h1>
          <p className="mt-2 text-sm text-red-800">{dashboardError.message || 'Impossible de charger les données de la clinique.'}</p>
          <button onClick={() => { refreshRdv?.(); refreshVisits?.(); refreshConsultations?.() }} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-slate-50 px-6 py-5">
      {/* Temporary dev role switcher — dev builds only, never rendered in production */}
      {import.meta.env.DEV && (
        <div className="mx-auto w-full mb-4">
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setDevRoleOverride('doctor')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                (devRoleOverride || canonicalRole) === 'doctor'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Médecin
            </button>
            <button
              onClick={() => setDevRoleOverride('secretary')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                (devRoleOverride || canonicalRole) === 'secretary'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Secrétaire
            </button>
            <button
              onClick={() => setDevRoleOverride(null)}
              className="px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Active Consultation Bar — the doctor's shortcut back into the running consultation.
          Not for the secretary: she can't resume it, and the queue card already shows who is in. */}
      {isDoctor && activeConsultation && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-full mb-4 rounded-[21px] border border-blue-200 bg-blue-50 px-6 py-4 shadow-[0_2px_12px_rgba(37,99,235,0.08)]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100">
                <Stethoscope className="w-5.5 h-5.5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                  En consultation
                </p>
                <p className="text-base font-bold text-slate-900">
                  {getPatientName(activeConsultation)}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const patientId = activeConsultation.patient_id || activeConsultation.patients?.id
                navigate(`/patient-workspace/${patientId}?visitId=${activeConsultation.id}`)
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-[12px] text-sm font-semibold hover:bg-blue-700 transition-all shadow-[0_2px_8px_rgba(37,99,235,0.25)]"
            >
              Reprendre la consultation
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
      {isDoctor && <ExamsToReviewBanner />}
      <div className="mx-auto flex w-full flex-col gap-5">
        {/* Unified grid layout to align everything */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-min">
          {/* Stat 1 */}
          <StatCard icon={Activity} iconWrap="bg-[#fff2e3]" iconColor="text-[#ff851f]" label="Salle d'attente" value={filteredQueue.length} />
          {/* Stat 2 */}
          <StatCard icon={Clock3} iconWrap="bg-[#dbeafe]" iconColor="text-[#3b82f6]" label="RDV du jour" value={localRdvList.filter(rdv => rdv.status === RDV_STATUSES.SCHEDULED).length} />
          {/* Stat 3 */}
          <StatCard icon={BriefcaseBusiness} iconWrap="bg-[#ecfdf3]" iconColor="text-[#22c55e]" label="Revenu du jour" value={revenueToday} suffix="MAD" />

          {/* Doctor POV: File d'attente on LEFT (col 1-2), Apercu on RIGHT (col3) */}
          {/* Secretary POV: same as before */}
          <section
            ref={fileDattenteRef}
            className="main-content relative rounded-[21px] border border-slate-200 bg-white px-5 py-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)] xl:col-span-2"
            style={{
              width: '100%',
              transition: 'transform 0.6s cubic-bezier(0.32, 0.72, 0, 1), width 0.6s cubic-bezier(0.32, 0.72, 0, 1), padding 0.6s cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'width, padding, transform'
            }}
          >
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                {showingHistory ? (
                  <>
                    <h2 className="text-xl font-bold text-slate-900">Historique</h2>
                    <p className="text-sm font-medium text-slate-600 mt-1">
                      {filteredHistory.length} consultation{filteredHistory.length > 1 ? 's' : ''} terminée{filteredHistory.length > 1 ? 's' : ''} aujourd'hui
                      {shownBalances.length > 0 && ` · ${shownBalances.length} solde${shownBalances.length > 1 ? 's' : ''} en attente`}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-slate-900">File d'attente</h2>
                    <p className="text-sm font-medium text-slate-600 mt-1">
                      {filteredQueue.length === 0 ? 'Aucun patient en attente ce matin' : `${filteredQueue.length} patient${filteredQueue.length > 1 ? 's' : ''} en attente ce matin`}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {showingHistory ? (
                  <Button variant="secondary" onClick={() => setShowingHistory(false)}>
                    <ArrowLeft className="h-4 w-4" />
                    File d'attente
                  </Button>
                ) : (
                  <>
                    {!isDoctor && can('waiting_room.add_patient') && (
                      <Button
                        variant={showWalkIn ? "accent" : "accentOutline"}
                        onClick={toggleWalkIn}
                        className="relative overflow-hidden transition-all duration-300"
                        title={showWalkIn ? "Fermer l'arrivée sans RDV" : "Ajouter une arrivée sans RDV"}
                      >
                        <motion.div
                          animate={{ rotate: showWalkIn ? 45 : 0 }}
                          transition={{ type: 'spring', damping: 16, stiffness: 280 }}
                          className="flex items-center justify-center"
                        >
                          <Plus className="h-4 w-4" />
                        </motion.div>
                        <span>Arrivée sans RDV</span>
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => setShowingHistory(true)}>
                      <Archive className="h-4 w-4" />
                      Historique
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            <AnimatePresence mode="wait">
                {!showingHistory ? (
                  <motion.div
                    key="queue"
                    // The view itself only fades; each card handles its own entrance below. The card
                    // list itself is POV-isolated further down (see the AnimatePresence around
                    // filteredQueue.map), not here — nesting a key change inside this mode="wait"
                    // AnimatePresence alongside its own nested AnimatePresence children risked getting
                    // stuck mid-exit, confirmed in an isolated repro; a plain key on the card list
                    // itself is the same guarantee via React's own (unconditional) remount, no
                    // animation-completion timing involved.
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    {/* Gated outside AnimatePresence: when the POV flips to doctor, this whole
                        branch must unmount at once, not play WalkInReveal's exit animation —
                        that animation is only for the secretary explicitly closing the panel. */}
                    {!isDoctor && can('waiting_room.add_patient') && (
                    <AnimatePresence>
                      {showWalkIn && (
                        <WalkInReveal key="walk-in-panel">
                          <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-b from-blue-50/40 via-white to-white p-5 shadow-[0_12px_32px_-8px_rgba(37,99,235,0.12),0_2px_8px_rgba(15,23,42,0.04)] space-y-4 relative z-30">
                            {/* Header */}
                            <motion.div 
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.24, delay: 0.05 }}
                              className="flex items-center justify-between pb-3 border-b border-slate-100"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm ring-4 ring-blue-50/80">
                                  <UserPlus className="w-4 h-4" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-bold text-slate-900">Arrivée sans rendez-vous</h3>
                                  <p className="text-xs font-medium text-slate-500">Ajouter directement un patient dans la file d'attente</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={closeWalkIn}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                                aria-label="Fermer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </motion.div>

                            {/* Fields Grid */}
                            <motion.div 
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.28, delay: 0.09 }}
                              className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start relative z-40"
                            >
                          {/* Left: Patient Search / Selection */}
                          <div className="relative z-50">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                              Patient
                            </label>
                            {walkInPatientId ? (
                              <div className="flex items-center justify-between h-[44px] px-3.5 bg-blue-50/80 border border-blue-200 rounded-xl">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                    {(selectedWalkInPatientName || 'P').slice(0, 2).toUpperCase()}
                                  </div>
                                  <span className="text-sm font-bold text-blue-900 truncate">
                                    {selectedWalkInPatientName}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => { setWalkInPatientId(''); setWalkInSearchQuery(''); }}
                                  className="text-blue-500 hover:text-blue-800 p-1 hover:bg-blue-100/80 rounded-lg transition-colors cursor-pointer"
                                  title="Changer de patient"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div ref={walkInSearchContainerRef} className="relative z-50">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="text"
                                  value={walkInSearchQuery}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    setWalkInSearchQuery(val)
                                    setShowWalkInPatientDropdown(val.trim().length > 0)
                                  }}
                                  onFocus={() => {
                                    if (walkInSearchQuery.trim().length > 0) {
                                      setShowWalkInPatientDropdown(true)
                                    }
                                  }}
                                  placeholder="Rechercher par nom ou téléphone..."
                                  className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 text-sm font-medium h-[44px] bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                />
                                <AnimatePresence>
                                  {showWalkInPatientDropdown && walkInSearchQuery.trim().length > 0 && (
                                    <motion.div
                                      initial={{ opacity: 0, y: -6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: -6 }}
                                      className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-50 scrollbar-thin"
                                    >
                                      {filteredWalkInPatients.length === 0 ? (
                                        walkInSearchQuery.trim() ? (
                                          walkInCreatingPatient ? (
                                            <div className="p-3.5 space-y-3 bg-slate-50/70">
                                              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                <UserPlus className="w-4 h-4 text-blue-600" />
                                                <span>Nouveau patient : <span className="text-blue-600 font-semibold">{walkInSearchQuery}</span></span>
                                              </div>
                                              <div className="relative">
                                                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                                <input
                                                  type="tel"
                                                  placeholder="Téléphone (ex: 06 12 34 56 78)"
                                                  value={walkInNewPatientPhone}
                                                  onChange={(e) => setWalkInNewPatientPhone(e.target.value)}
                                                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                                                  autoFocus
                                                />
                                              </div>
                                              <div className="flex items-center gap-2 pt-1">
                                                <Button
                                                  variant="primary"
                                                  size="sm"
                                                  disabled={Boolean(busyMap['walk-in-create'])}
                                                  onClick={async () => {
                                                    if (!walkInNewPatientPhone.trim()) {
                                                      notify({ title: 'Téléphone requis', tone: 'error' })
                                                      return
                                                    }
                                                    setBusy('walk-in-create', true)
                                                    try {
                                                      const parts = walkInSearchQuery.trim().split(' ')
                                                      const prenom = parts[0] || ''
                                                      const nom = parts.slice(1).join(' ') || parts[0] || ''
                                                      const newPatient = await createPatient({
                                                        cabinet_id: cabinetId,
                                                        prenom,
                                                        nom,
                                                        telephone: walkInNewPatientPhone.trim(),
                                                      })
                                                      setWalkInPatientId(newPatient.id)
                                                      setWalkInCreatingPatient(false)
                                                      setWalkInSearchQuery(`${prenom} ${nom}`.trim())
                                                      setShowWalkInPatientDropdown(false)
                                                      await refreshPatients?.()
                                                      notify({ title: 'Patient créé', description: 'Sélectionnez maintenant un médecin.' })
                                                    } catch (err) {
                                                      notify({ title: 'Erreur', description: err.message || 'Impossible de créer ce patient.', tone: 'error' })
                                                    } finally {
                                                      setBusy('walk-in-create', false)
                                                    }
                                                  }}
                                                >
                                                  Créer et continuer
                                                </Button>
                                                <Button
                                                  variant="secondary"
                                                  size="sm"
                                                  onClick={() => setWalkInCreatingPatient(false)}
                                                >
                                                  Annuler
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => setWalkInCreatingPatient(true)}
                                              className="w-full p-3.5 text-left text-sm text-blue-600 font-semibold hover:bg-blue-50/70 flex items-center gap-2 transition-colors cursor-pointer"
                                            >
                                              <UserPlus className="w-4 h-4" />
                                              <span>Créer « {walkInSearchQuery} » comme nouveau patient</span>
                                            </button>
                                          )
                                        ) : (
                                          <div className="p-3 text-sm text-slate-500 text-center">Aucun patient trouvé</div>
                                        )
                                      ) : (
                                        filteredWalkInPatients.map(patient => (
                                          <button
                                            key={patient.id}
                                            type="button"
                                            onClick={() => {
                                              setWalkInPatientId(patient.id)
                                              setWalkInSearchQuery('')
                                              setShowWalkInPatientDropdown(false)
                                            }}
                                            className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50/60 transition-colors text-sm flex items-center justify-between group cursor-pointer"
                                          >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                              <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                                                {(patient.prenom?.[0] || '') + (patient.nom?.[0] || '')}
                                              </div>
                                              <div className="min-w-0">
                                                <div className="font-semibold text-slate-800 group-hover:text-blue-950 truncate">
                                                  {patient.prenom} {patient.nom}
                                                </div>
                                                {patient.telephone && (
                                                  <div className="text-xs text-slate-400 group-hover:text-blue-600/80">{patient.telephone}</div>
                                                )}
                                              </div>
                                            </div>
                                          </button>
                                        ))
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>

                          {/* Right: Doctor Selection */}
                          <div className="relative z-30">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                              Médecin traitant
                            </label>
                            <Select
                              value={walkInDoctorId}
                              onChange={setWalkInDoctorId}
                              icon={Stethoscope}
                              avatars
                              aria-label="Médecin traitant"
                              placeholder="Sélectionner un médecin..."
                              emptyText="Aucun médecin disponible"
                              options={(doctors || []).map(doctor => ({
                                value: doctor.id,
                                label: doctor.nom_complet || [doctor.first_name, doctor.last_name].filter(Boolean).join(' ') || doctor.email,
                              }))}
                            />
                          </div>
                        </motion.div>

                        {/* Actions */}
                        <motion.div 
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.28, delay: 0.13 }}
                          className="flex items-center gap-3 pt-2 relative z-10"
                        >
                          <Button
                            variant="primary"
                            disabled={Boolean(busyMap['walk-in']) || !walkInPatientId || !walkInDoctorId}
                            onClick={handleWalkInSubmit}
                          >
                            <Plus className="w-4 h-4" strokeWidth={2.5} />
                            Ajouter à la file
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={closeWalkIn}
                          >
                            Annuler
                          </Button>
                        </motion.div>
                      </div>
                    </WalkInReveal>
                      )}
                    </AnimatePresence>
                    )}

                    {filteredQueue.length === 0 ? (
                      <motion.div className="flex min-h-[440px] flex-col items-center justify-center text-center relative z-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Users className="h-[66px] w-[66px] text-slate-200" strokeWidth={1.6} />
                        <p className="mt-5 text-lg font-semibold text-slate-900">Aucun patient en attente</p>
                        <p className="mt-2 text-sm font-medium text-slate-600 max-w-[360px]">Les patients arrivés ou en attente apparaîtront ici automatiquement.</p>
                      </motion.div>
                    ) : (
                      <div className="space-y-1 relative z-0">
                        {/* Keyed by POV: React fully unmounts/remounts this whole list when the
                            Médecin/Secrétaire switch happens (plain React remount, not an animated
                            exit — see the note above), so a patient who qualifies for both POVs'
                            queues never keeps the same card instance across the boundary. */}
                        <AnimatePresence mode="popLayout" key={isDoctor ? 'pov-doctor' : 'pov-secretary'}>
                          {filteredQueue.map((rdv, index) => (
                            <PatientCard
                              key={rdv.id}
                              rdv={rdv}
                              index={index} 
                              isBusy={Boolean(busyMap[rdv.id])} 
                              onAction={handlePatientAction} 
                              isDoctor={isDoctor} 
                              isAlertActive={activeAlerts.has(rdv.id)} 
                              onAcknowledgeAlert={acknowledgeAlert}
                              onEncaisser={handleEncaisser}
                              onViewReceipt={handleViewReceipt}
                              paidVisits={paidVisits}
                              allPayments={allPayments}
                              onViewPaymentHistory={handleViewPaymentHistory}
                              isUndoable={!isDoctor && undoableVisits.has(rdv.id) && (rdv.status || VISIT_STATUSES.WAITING) === VISIT_STATUSES.WAITING}
                              onUndo={() => handleUndo(rdv)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    {shownBalances.length > 0 && (
                      <div className="mb-5" key={isDoctor ? 'pov-doctor' : 'pov-secretary'}>
                        <div className="mb-2 flex items-center gap-2">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Soldes en attente</h3>
                          <Badge tone="amber">{shownBalances.length}</Badge>
                        </div>
                        {shownBalances.map((visit, index) => (
                          <PatientCard
                            key={visit.id}
                            rdv={visit}
                            index={index}
                            isBusy={Boolean(busyMap[visit.id])}
                            onAction={() => {}}
                            isDoctor={isDoctor}
                            isAlertActive={false}
                            onAcknowledgeAlert={() => {}}
                            onEncaisser={handleEncaisser}
                            onViewReceipt={handleViewReceipt}
                            paidVisits={paidVisits}
                            allPayments={allPayments}
                            onViewPaymentHistory={handleViewPaymentHistory}
                            onOpenDossier={(patientId) => navigate(`/patient-workspace/${patientId}`)}
                          balanceChips
                          />
                        ))}
                      </div>
                    )}
                    {shownBalances.length > 0 && filteredHistory.length > 0 && (
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Terminées aujourd'hui</h3>
                        {isDoctor
                          ? <span className="text-xs font-semibold text-slate-400">{filteredHistory.length}</span>
                          : <Badge tone="neutral">{filteredHistory.length}</Badge>}
                      </div>
                    )}
                    {filteredHistory.length === 0 ? (shownBalances.length > 0 ? null : (
                      <motion.div className="flex min-h-[440px] flex-col items-center justify-center text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Users className="h-[66px] w-[66px] text-slate-200" strokeWidth={1.6} />
                        <p className="mt-5 text-lg font-semibold text-slate-900">Aucune consultation terminée aujourd'hui</p>
                        <p className="mt-2 text-sm font-medium text-slate-600 max-w-[360px]">Les consultations terminées apparaîtront ici automatiquement.</p>
                      </motion.div>
                    )) : (
                      <div className="space-y-1" key={isDoctor ? 'pov-doctor' : 'pov-secretary'}>
                        {filteredHistory.map((rdv, index) => {
                          // Compute total paid for this visit
                          const visitPayments = allPayments[rdv.id] || [];
                          const totalPaid = visitPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                          
                          // Create a modified rdv for PatientCard that always shows COMPLETED status
                          const historyRdv = {
                            ...rdv,
                            status: VISIT_STATUSES.COMPLETED
                          };
                          
                          return (
                            <PatientCard 
                              key={historyRdv.id} 
                              rdv={historyRdv} 
                              index={index} 
                              isBusy={false} 
                              onAction={() => {}} 
                              isDoctor={isDoctor} 
                              isAlertActive={false} 
                              onAcknowledgeAlert={() => {}}
                              onEncaisser={handleEncaisser}
                              onViewReceipt={() => handleViewPaymentHistory(historyRdv)}
                              paidVisits={new Set()}
                              allPayments={allPayments}
                              onViewPaymentHistory={() => handleViewPaymentHistory(historyRdv)}
                              isHistoryCard={true}
                              totalPaid={totalPaid}
                              onOpenDossier={(patientId) => navigate(`/patient-workspace/${patientId}`)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            

          </section>

          {/* Doctor POV: always show Apercu du Jour (no Preview) */}
          {(isDoctor ? true : (showPreviewPanel || !isExpanded)) && (
            <div className={isDoctor ? "xl:row-start-2 xl:col-start-3" : "xl:row-start-2"}>
              {isDoctor ? (
                <TachesDuJourCard isExpanded={isExpanded} />
              ) : (
                showPreviewPanel ? (
                  <PreviewCard rdvList={localRdvList} cancelledRdvs={cancelledRdvs} isBusy={busyMap} onAddToQueue={handleAddToQueue} onCancel={handleCancelRdv} onShowDatePicker={handleShowDatePicker} showDatePickerMap={showDatePickerMap} onConfirmDate={handleConfirmDate} onBack={handleBack} />
                ) : (
                  <TachesDuJourCard isExpanded={isExpanded} />
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Payment modal: amount + method, Confirmer, then "Générer le reçu ? Oui / Non" */}
      {(() => {
        const visit = currentPaymentVisit
        const total = visit ? visitTotalDue(visit) : 0
        const alreadyPaid = visit ? (visit.total_paid ?? (allPayments[visit.id] || []).reduce((sum, p) => sum + Number(p.amount), 0)) : 0
        const reste = visit ? (visit.remaining_balance ?? Math.max(0, total - alreadyPaid)) : 0
        return (
          <PaymentModal
            open={paymentModalOpen}
            patientName={visit ? getPatientName(visit) : ''}
            total={total}
            alreadyPaid={alreadyPaid}
            reste={reste}
            amount={paymentModalMontantPaye}
            onAmountChange={setPaymentModalMontantPaye}
            method={paymentMethod}
            onMethodChange={setPaymentMethod}
            processing={processingPayment}
            onConfirm={handleConfirmPayment}
            onCancel={closePaymentModal}
            done={paymentDone}
            onReceiptYes={() => { if (paymentDone?.receipt) openPrintWindow(paymentDone.receipt); closePaymentModal() }}
            onReceiptNo={closePaymentModal}
          />
        )
      })()}
      
      {/* Payment History Modal */}
      <Modal
        open={paymentHistoryModalOpen}
        title="Historique des paiements"
        description={
          currentHistoryVisit ? (
            <span>Patient : <strong className="font-semibold text-slate-800">{getPatientName(currentHistoryVisit)}</strong></span>
          ) : undefined
        }
        onClose={() => setPaymentHistoryModalOpen(false)}
        width="max-w-lg"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <Button
              variant="primary"
              onClick={() => {
                if (currentHistoryVisit) {
                  const total = currentHistoryVisit?.consultations?.billing_amount || currentHistoryVisit?.billing_amount || 300
                  const paid = currentHistoryVisit?.total_paid || total
                  const reste = currentHistoryVisit?.remaining_balance || 0
                  openPrintWindow({
                    recuNo: `REC-${(currentHistoryVisit.id || '').slice(-6).toUpperCase() || '2026-01'}`,
                    patientName: getPatientName(currentHistoryVisit),
                    patientCin: currentHistoryVisit?.patients?.cin || 'N/A',
                    patientPhone: currentHistoryVisit?.patients?.telephone || 'N/A',
                    patientAssurance: currentHistoryVisit?.patients?.assurance || 'N/A',
                    date: new Date().toLocaleDateString('fr-FR'),
                    montantTotal: total,
                    montantPaye: paid,
                    resteAPayer: reste,
                    paymentMethod: currentHistoryVisit?.billing_type || 'cash',
                    notes: currentHistoryVisit?.reason || currentHistoryVisit?.motif || 'Consultation Médicale',
                    title: 'REÇU DE PAIEMENT MÉDICAL',
                    isPaid: true
                  })
                }
              }}
            >
              <Printer className="w-4 h-4" />
              Imprimer le reçu officiel
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPaymentHistoryModalOpen(false)}
            >
              Fermer
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          {currentHistoryVisit ? (
            <div className="space-y-4">
              {/* Financial Summary Box */}
              {(() => {
                const totalDue = currentHistoryVisit?.consultations?.billing_amount || currentHistoryVisit?.billing_amount || 300
                const paidAmount = currentHistoryVisit?.total_paid || currentHistoryVisit?.billing_amount || 300
                const remaining = currentHistoryVisit?.remaining_balance || 0
                const isSettled = remaining <= 0

                return (
                  <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Honoraires dus</p>
                      <p className="text-base font-bold text-slate-900">{fmtMAD(totalDue)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-700">Montant versé</p>
                      <p className="text-base font-bold text-emerald-700">{fmtMAD(paidAmount)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className={`text-[11px] uppercase tracking-wider font-bold ${!isSettled ? 'text-amber-700' : 'text-slate-500'}`}>
                        Reste à payer
                      </p>
                      <p className={`text-base font-bold ${!isSettled ? 'text-amber-700' : 'text-slate-600'}`}>
                        {fmtMAD(remaining)}
                      </p>
                    </div>
                  </div>
                )
              })()}

              {/* Transactions List */}
              {(() => {
                const payments = (allPayments[currentHistoryVisit.id]?.length > 0
                  ? allPayments[currentHistoryVisit.id]
                  : [
                      {
                        id: `pay_${currentHistoryVisit.id}`,
                        amount: currentHistoryVisit?.total_paid || currentHistoryVisit?.billing_amount || 300,
                        method: currentHistoryVisit?.billing_type || 'cash',
                        timestamp: currentHistoryVisit?.updated_at || new Date().toISOString()
                      }
                    ]
                )

                return (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Détails des versements enregistrés
                      </p>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {payments.length} {payments.length > 1 ? 'versements' : 'versement'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {payments.map((payment, idx) => {
                        const meta = getPaymentMethodMeta(payment.method)
                        const MethodIcon = meta.Icon
                        const dateFormatted = new Date(payment.timestamp).toLocaleDateString('fr-FR')
                        const timeFormatted = new Date(payment.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

                        return (
                          <div
                            key={payment.id || idx}
                            className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-blue-200 transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.iconClass}`}>
                                <MethodIcon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-slate-900">{fmtMAD(payment.amount)}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.badgeClass}`}>
                                    {meta.label}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
                                  <Clock3 className="w-3.5 h-3.5 text-slate-400 inline" />
                                  <span>{dateFormatted} à {timeFormatted}</span>
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="accentOutline"
                              size="sm"
                              onClick={() => {
                                openPrintWindow({
                                  recuNo: `REC-${(currentHistoryVisit.id || '').slice(-6).toUpperCase() || '2026-01'}`,
                                  patientName: getPatientName(currentHistoryVisit),
                                  patientCin: currentHistoryVisit?.patients?.cin || 'N/A',
                                  patientPhone: currentHistoryVisit?.patients?.telephone || 'N/A',
                                  patientAssurance: currentHistoryVisit?.patients?.assurance || 'N/A',
                                  date: dateFormatted,
                                  montantTotal: currentHistoryVisit?.consultations?.billing_amount || currentHistoryVisit?.billing_amount || 300,
                                  montantPaye: payment.amount,
                                  resteAPayer: currentHistoryVisit?.remaining_balance || 0,
                                  paymentMethod: payment.method || 'cash',
                                  notes: currentHistoryVisit?.reason || currentHistoryVisit?.motif || 'Consultation Médicale',
                                  title: 'REÇU DE PAIEMENT MÉDICAL',
                                  isPaid: true
                                })
                              }}
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              Voir reçu
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Receipt className="w-10 h-10 text-slate-300 mb-2" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-slate-700">Aucun détail de paiement trouvé</p>
              <p className="text-xs text-slate-400 mt-0.5">Aucun versement n'a encore été enregistré pour cette consultation.</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
