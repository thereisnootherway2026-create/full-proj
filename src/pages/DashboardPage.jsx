import { useEffect, useMemo, useState, useRef } from 'react'
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
  Plus
} from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { RDV_STATUSES, VISIT_STATUSES, VISIT_STATUS_LABELS, VISIT_STATUS_COLORS } from '../lib/workflow'
import {
  addAppointmentToWaitingRoom,
  callPatient,
  openConsultation,
  createWalkInVisit,
  subscribeClinicVisits,
  processVisitPayment,
} from '../lib/visitService'

// Import existing modal
import Modal from '../components/common/Modal'
import AddTaskModal from '../components/forms/AddTaskModal'
import { loadTasks, saveTasks, taskToLegacy } from '../lib/taskHelpers'
import { openPrintWindow } from '../components/common/ReceiptPrint'
import { can } from '../lib/rbac'
import { cancelAppointment, rescheduleAppointment } from '../lib/appointmentService'
import { motion, AnimatePresence } from 'framer-motion'

const TZ = 'Africa/Casablanca'
const fmtMAD = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' MAD'

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

function PreviewRdvBar({ rdv, doctors, selectedDoctorId, onSelectDoctor, isBusy, onAddToQueue, onCancel, onShowDatePicker, showDatePicker, onConfirmDate, onBack, isHovered, onHover }) {
  const initials = getInitials(rdv)
  const [newDate, setNewDate] = useState(rdv.date_rdv)
  const [addIconHovered, setAddIconHovered] = useState(false)
  const [addIconPressed, setAddIconPressed] = useState(false)
  const [cancelIconHovered, setCancelIconHovered] = useState(false)
  const [cancelIconPressed, setCancelIconPressed] = useState(false)

  return (
    <motion.div 
      className="PreviewRdvBar py-3 px-4 rounded-xl mb-3"
      data-rdv-id={rdv.id}
      style={{ 
        border: '1px solid #e2e8f0', 
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
      }}
      initial={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
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
}

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
    () => rdvList
      .filter((rdv) => rdv.status === RDV_STATUSES.SCHEDULED)
      .sort((a, b) => new Date(a.date_rdv).getTime() - new Date(b.date_rdv).getTime()),
    [rdvList]
  )

  return (
    <section className="rounded-[21px] border border-[#e2e8f0] bg-white px-5 py-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)] w-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
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
            {scheduledAppointments.map((rdv) => (
              <PreviewRdvBar
                key={rdv.id}
                rdv={rdv}
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
  const { patients } = useAppContext();
  const [voirToutesHovered, setVoirToutesHovered] = useState(false);
  const [voirToutesPressed, setVoirToutesPressed] = useState(false);
  const [addIconHovered, setAddIconHovered] = useState(false);
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  
  const handleCategoryClick = (category) => {
    navigate(`/taches?category=${category}`);
  };
  
  return (
    <section 
      className="sidebar-apercu relative rounded-[21px] border border-slate-200 bg-white px-5 py-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)] overflow-hidden w-full"
      style={{
        opacity: isExpanded ? 0 : 1,
        transition: 'opacity 0.4s ease',
        willChange: 'opacity'
      }}
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
          {TACHES_DU_JOUR_CATEGORIES.map(({ key, label }, index) => (
            <button
              key={key}
              type="button"
              className={`group w-full text-left py-3.5 cursor-pointer transition-colors duration-200 ease-out ${
                index < TACHES_DU_JOUR_CATEGORIES.length - 1 ? 'border-b border-slate-200' : ''
              }`}
              onClick={() => handleCategoryClick(key)}
            >
              <span className="inline-block text-base font-semibold text-slate-700 transition-all duration-200 ease-out group-hover:text-slate-900 group-hover:-translate-y-0.5 group-hover:drop-shadow-[0_4px_6px_rgba(15,23,42,0.12)]">
                {label}
              </span>
            </button>
          ))}
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
        onSubmit={(task) => {
          const existing = loadTasks()
          saveTasks([task, ...existing])
          setAddTaskModalOpen(false)
        }}
      />
    </section>
  );
}

function PatientCard({ rdv, index, isBusy, onAction, isDoctor, isAlertActive, onAcknowledgeAlert, onEncaisser, onViewReceipt, paidVisits, allPayments, onViewPaymentHistory, isHistoryCard = false, totalPaid = 0, onViewDossier, onUndo, isUndoable }) {
  console.log('=== PatientCard Debug ===');
  console.log('rdv:', rdv);
  // Get status - normalize status
  const normalizedStatus = rdv.status || VISIT_STATUSES.WAITING;
  const isSecretary = !isDoctor;

  // Calculate payment info
  const totalAmount = rdv?.consultations?.billing_amount || rdv?.billing_amount || 300;
  const visitPayments = allPayments[rdv.id] || [];
  const calculatedPaid = visitPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPaidSoFar = calculatedPaid || rdv.total_paid || (rdv.billing_amount ? rdv.billing_amount - (rdv.remaining_balance || 0) : (isHistoryCard ? (rdv.isPartial ? 150 : 300) : 0));
  const reste = rdv.remaining_balance !== undefined ? rdv.remaining_balance : Math.max(0, totalAmount - totalPaidSoFar);

  const isPartial = rdv.status === 'PARTIEL' || rdv.status === 'partiel' || rdv.status === VISIT_STATUSES.PARTIEL || (isHistoryCard && reste > 0);
  const isPartialInHistory = isHistoryCard && isPartial;

  let statusColors = VISIT_STATUS_COLORS[normalizedStatus] || VISIT_STATUS_COLORS[VISIT_STATUSES.WAITING];
  let statusLabel = (rdv.status && VISIT_STATUS_LABELS[rdv.status]) || rdv.time_status || 'En attente';

  if (isHistoryCard || isPartial || rdv.status === 'PARTIEL' || rdv.status === 'TERMINÉ' || normalizedStatus === VISIT_STATUSES.COMPLETED) {
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
  const [commencerHovered, setCommencerHovered] = useState(false);
  const [commencerPressed, setCommencerPressed] = useState(false);
  const [voirDossierHovered, setVoirDossierHovered] = useState(false);
  const [voirDossierPressed, setVoirDossierPressed] = useState(false);
  const [undoHovered, setUndoHovered] = useState(false);
  const [undoPressed, setUndoPressed] = useState(false);

  // Motion variants
  const cardVariants = {
    initial: { opacity: 0, y: 20 },
    normal: {
      opacity: 1,
      y: 0,
      boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
      transition: { duration: 0.3, ease: 'easeOut', delay: index * 0.05 }
    },
    alert: {
      opacity: 1,
      y: -3,
      boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
      transition: { duration: 0.25, ease: 'easeOut' }
    }
  };

  const isPaid = paidVisits.has(rdv.id);

  return (
    <motion.div 
      className="mb-3 rounded-[16px] border border-slate-200 bg-white shadow-sm p-4 flex items-center gap-4 relative overflow-hidden"
      initial="initial"
      animate={isSecretary && isAlertActive ? 'alert' : 'normal'}
      variants={cardVariants}
      onClick={isSecretary && isAlertActive ? () => onAcknowledgeAlert(rdv.id) : undefined}
      style={{ cursor: isSecretary && isAlertActive ? 'pointer' : 'default' }}
    >
      {/* Left accent bar (4px, no radius) */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: statusColors.border }} />

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
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-base font-bold text-slate-900">{rdv.patient_name || getPatientName(rdv)}</span>
          <span className="px-2.5 py-1 rounded-md text-xs font-bold" style={{ backgroundColor: statusColors.badgeBg, color: statusColors.badgeText }}>
            {statusLabel}
          </span>
          {isSecretary && isAlertActive && (
            <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Envoyé au docteur
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-slate-500 font-medium flex-wrap">
          <span>{rdv.reason || rdv.motif || 'Consultation'}</span>
          {isHistoryCard ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-700 font-semibold">Payé : {totalPaidSoFar} MAD</span>
              {reste > 0 && (
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  Reste à payer : {reste} MAD
                </span>
              )}
            </div>
          ) : (
            normalizedStatus === VISIT_STATUSES.BILLING && reste > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {totalPaidSoFar > 0 && <span className="text-slate-700 font-semibold">Payé : {totalPaidSoFar} MAD</span>}
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  Reste à payer : {reste} MAD
                </span>
              </div>
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
        {isSecretary && normalizedStatus === VISIT_STATUSES.BILLING && !isPaid && (
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
        {isSecretary && (isPaid || isHistoryCard) && (
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
        {isDoctor && (normalizedStatus === VISIT_STATUSES.WAITING) && (
          <div className="flex gap-2">
            {/* Commencer button */}
            <button 
              onClick={() => onAction(rdv, 'open_consultation')}
              disabled={isBusy}
              className="px-4 py-2 rounded-[0.625rem] font-semibold text-sm disabled:opacity-50"
              style={{
                backgroundColor: commencerHovered ? '#1E40AF' : '#2563EB',
                color: '#FFFFFF',
                border: '2px solid ' + (commencerHovered ? '#1E3A8A' : '#60A5FA'),
                padding: '0.625rem 1rem',
                minHeight: '44px',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
                fontSize: '14px',
                width: 'auto',
                fontWeight: 'bold',
                transform: commencerPressed ? 'translateY(-1px) scale(0.98)' : commencerHovered ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: commencerHovered ? '0 6px 16px -4px rgba(37,99,235,0.15)' : 'none'
              }}
              onMouseEnter={() => setCommencerHovered(true)}
              onMouseLeave={() => { setCommencerHovered(false); setCommencerPressed(false); }}
              onMouseDown={() => setCommencerPressed(true)}
              onMouseUp={() => setCommencerPressed(false)}
            >
              Commencer
            </button>
            
            {/* Voir dossier button */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                // Get patient id from rdv (could be patient_id or patients.id)
                const patientId = rdv.patient_id || rdv.patients?.id;
                if (patientId && onViewDossier) {
                  onViewDossier(patientId);
                }
              }}
              className="px-4 py-2 rounded-[0.625rem] font-semibold text-sm"
              style={{
                backgroundColor: voirDossierHovered ? '#F1F5F9' : '#FFFFFF',
                color: '#334155',
                border: '2px solid ' + (voirDossierHovered ? '#94A3B8' : '#CBD5E1'),
                padding: '0.625rem 1rem',
                minHeight: '44px',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
                fontSize: '14px',
                width: 'auto',
                fontWeight: 'bold',
                transform: voirDossierPressed ? 'translateY(-1px) scale(0.98)' : voirDossierHovered ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: voirDossierHovered ? '0 6px 16px -4px rgba(148,163,184,0.15)' : 'none'
              }}
              onMouseEnter={() => setVoirDossierHovered(true)}
              onMouseLeave={() => { setVoirDossierHovered(false); setVoirDossierPressed(false); }}
              onMouseDown={() => setVoirDossierPressed(true)}
              onMouseUp={() => setVoirDossierPressed(false)}
            >
              Voir dossier
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const {
    rdvList,
    visits,
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
    updateVisitStatus,
    updatePatientDebt,
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
  const [lastUndoableAction, setLastUndoableAction] = useState(null)
  const [localQueueVisits, setLocalQueueVisits] = useState([])
  const fileDattenteRef = useRef(null)
  const walkInSearchContainerRef = useRef(null)
  const [ghost, setGhost] = useState(null)
  const [activeAlerts, setActiveAlerts] = useState(new Set()) // IDs of visits in alert state
  const audioRef = useRef(null)
  
  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [currentPaymentVisit, setCurrentPaymentVisit] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('300')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [processingPayment, setProcessingPayment] = useState(false)
  
  // Payment history modal state
  const [paymentHistoryModalOpen, setPaymentHistoryModalOpen] = useState(false)
  const [currentHistoryVisit, setCurrentHistoryVisit] = useState(null)

  // Add Task modal state is managed inside TachesDuJourCard
  
  // Queue vs History view state
  const [showingHistory, setShowingHistory] = useState(false)
  
  // Paid visits state to show receipt button
  const [paidVisits, setPaidVisits] = useState(new Set())
  
  // State for payment modal button effects
  const [modalCancelHovered, setModalCancelHovered] = useState(false);
  const [modalCancelPressed, setModalCancelPressed] = useState(false);
  const [modalConfirmHovered, setModalConfirmHovered] = useState(false);
  const [modalConfirmPressed, setModalConfirmPressed] = useState(false);
  
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
  const userRole = canonicalRole || role
  const currentDoctorId = profile?.id
  const showPreviewPanel = isSecretary

  // Mock data matching secretary queue requirements
  const mockVisits = [
    { id: '550e8400-e29b-41d4-a716-446655440000', patient_name: 'Karima Benali', age: 34, reason: 'Douleurs abdominales', time_label: '09:30', time_status: 'Encaissement', status_type: 'Standard', status_label: 'ENCAISSEMENT', patient_id: 'pat_karima', status: VISIT_STATUSES.BILLING, billing_amount: 300, billing_type: 'cash' },
    { id: '550e8400-e29b-41d4-a716-446655440006', patient_name: 'Ahmed Benali', age: 38, reason: 'Contrôle tension artérielle', time_label: '09:45', time_status: 'Encaissement', status_type: 'Standard', status_label: 'ENCAISSEMENT', patient_id: 'pat_ahmed', status: VISIT_STATUSES.BILLING, billing_amount: 300, billing_type: 'cash' },
    { id: '550e8400-e29b-41d4-a716-446655440005', patient_name: 'Fatima El Amrani', age: 42, reason: 'Consultation générale', time_label: '10:00', time_status: 'Encaissement', status_type: 'Standard', status_label: 'ENCAISSEMENT', patient_id: 'patient-id-5', status: VISIT_STATUSES.BILLING, billing_amount: 350, billing_type: 'card' },
    { id: '550e8400-e29b-41d4-a716-446655440007', patient_name: 'Hind Boukili', age: 31, reason: 'Suivi gynécologie', time_label: '10:15', time_status: 'Encaissement', status_type: 'Standard', status_label: 'ENCAISSEMENT', patient_id: 'pat_hind', status: VISIT_STATUSES.BILLING, billing_amount: 300, billing_type: 'cash' },
    { id: '550e8400-e29b-41d4-a716-446655440001', patient_name: 'Marie-Claire Fontaine', age: 54, reason: 'Consultation annuelle', time_label: '10:30', time_status: 'Actuel', status_type: 'Actuel', status_label: 'EN COURS', duration: '12 min', patient_id: 'patient-id-1', status: VISIT_STATUSES.CONSULTATION },
    { id: '550e8400-e29b-41d4-a716-446655440002', patient_name: 'Jean-Pierre Bertrand', age: 72, reason: 'Douleurs thoraciques', time_label: '10:45', time_status: 'En attente', status_type: 'Urgence', status_label: 'URGENCE', wait_time: '8 min', see_notes: true, patient_id: 'patient-id-2', status: VISIT_STATUSES.WAITING },
  ]

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
  const handleEncaisser = (visit) => {
    setCurrentPaymentVisit(visit);
    // Try to get total amount from visit, default 300
    const totalAmount = visit?.consultations?.billing_amount || 300;
    setPaymentAmount(String(totalAmount)); // montant total dû (read-only)
    // Calculate reste à payer already existing (before new payment)
    const resteBefore = calculateResteAPayer(visit.id, totalAmount);
    setPaymentModalMontantPaye(String(resteBefore)); // default to full remaining balance
    setPaymentMethod('cash');
    setPaymentModalOpen(true);
  };

  // Handle payment confirmation
  const handleConfirmPayment = async () => {
    if (!currentPaymentVisit) return;
    setProcessingPayment(true);
    try {
      const visitId = currentPaymentVisit.id;
      const totalAmount = currentPaymentVisit?.consultations?.billing_amount || 300;
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

      // Check if it's a real DB visit
      if (!currentPaymentVisit.id.startsWith('550e') && !currentPaymentVisit.id.startsWith('vis_')) {
        try {
          await processVisitPayment(currentPaymentVisit.id, paymentMethod, amountToPay);
        } catch (e) {
          console.warn('DB processVisitPayment fallback to memory state:', e)
        }
      }

      // Calculate new total paid & remaining balance cleanly
      const previousPayments = allPayments[visitId] || [];
      const previousTotalPaid = previousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const newTotalPaid = previousTotalPaid + amountToPay;
      const reste = Math.max(0, totalAmount - newTotalPaid);

      // Update allPayments state
      setAllPayments(prev => ({
        ...prev,
        [visitId]: [...(prev[visitId] || []), newPayment]
      }));

      // Handle status update: COMPLETED / TERMINÉ if fully paid, PARTIEL if partial!
      const newStatus = reste === 0 ? VISIT_STATUSES.COMPLETED : VISIT_STATUSES.PARTIEL;

      setPaidVisits(p => new Set([...p, visitId]));
      updateVisitStatus(visitId, newStatus, {
        method: paymentMethod,
        amount: amountToPay,
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

      // Generate receipt
      openPrintWindow({
        recuNo: `REC-${(visitId || '').slice(-6).toUpperCase() || '2026-01'}`,
        patientName: getPatientName(currentPaymentVisit),
        patientCin: currentPaymentVisit?.patients?.cin || 'N/A',
        patientPhone: currentPaymentVisit?.patients?.telephone || 'N/A',
        patientAssurance: currentPaymentVisit?.patients?.assurance || 'N/A',
        date: new Date().toLocaleDateString('fr-FR'),
        montantTotal: totalAmount,
        montantPaye: newTotalPaid,
        resteAPayer: reste,
        paymentMethod: paymentMethod === 'cash' ? 'Espèces' : paymentMethod === 'card' ? 'TPE / Carte bancaire' : 'Virement',
        notes: currentPaymentVisit?.reason || currentPaymentVisit?.motif || 'Consultation Médicale',
        title: reste > 0 ? 'REÇU DE PAIEMENT PARTIEL' : 'REÇU DE PAIEMENT MÉDICAL',
        isPaid: reste === 0
      });

      // Success notification
      notify({
        title: reste === 0 ? 'Paiement final confirmé' : 'Paiement partiel confirmé',
        description: reste === 0
          ? 'Le paiement a été enregistré avec succès, consultation terminée.'
          : `Le paiement a été enregistré, reste à payer: ${reste} MAD.`
      });
      setPaymentModalOpen(false);
    } catch (error) {
      console.error('Payment error:', error);
      notify({
        title: 'Erreur',
        description: 'Impossible de traiter le paiement.',
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
    ;(visits || []).forEach(visit => map.set(visit.id, visit))
    localQueueVisits.forEach(visit => map.set(visit.id, visit))
    const combined = Array.from(map.values())
    
    // Exclude COMPLETED, TERMINÉ, PARTIEL, and paidVisits from active queue immediately
    const activeQueue = combined.filter(visit => {
      const isPaid = paidVisits.has(visit.id)
      const hasPayments = (allPayments[visit.id] || []).length > 0
      const isDoneOrPartial = visit.status === VISIT_STATUSES.COMPLETED || visit.status === VISIT_STATUSES.PARTIEL || visit.status === 'PARTIEL' || visit.status === 'TERMINÉ' || visit.status === 'completed' || visit.status === 'partiel'
      return !isDoneOrPartial && !isPaid && !hasPayments
    })
    
    // Sort: 
    // - For Secretary: BILLING first
    // - For Doctor: WAITING first, then CONSULTATION, then BILLING
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
      
      const aPriority = getPriority(a.status);
      const bPriority = getPriority(b.status);
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return 0; // keep original order for same status
    })
    return result
  }, [localQueueVisits, visits, isDoctor, paidVisits, allPayments])

  const filteredHistory = useMemo(() => {
    const map = new Map()
    ;(visits || []).forEach(visit => map.set(visit.id, visit))
    localQueueVisits.forEach(visit => map.set(visit.id, visit))
    const combined = Array.from(map.values())
    return combined.filter(visit => {
      const isPaid = paidVisits.has(visit.id)
      const hasPayments = (allPayments[visit.id] || []).length > 0
      const isDoneOrPartial = visit.status === VISIT_STATUSES.COMPLETED || visit.status === VISIT_STATUSES.PARTIEL || visit.status === 'PARTIEL' || visit.status === 'TERMINÉ' || visit.status === 'completed' || visit.status === 'partiel'
      return isDoneOrPartial || isPaid || hasPayments
    })
  }, [localQueueVisits, visits, paidVisits, allPayments])
  
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

  const handleUndo = () => {
    if (!lastUndoableAction) return;

    if (lastUndoableAction.type === 'ADD_TO_QUEUE') {
      // Revert: remove from localQueueVisits, add back to localRdvList at original index
      setLocalQueueVisits(current => current.filter(visit => visit.id !== lastUndoableAction.rdv.id))
      setLocalRdvList(current => {
        const newList = [...current];
        const originalIndex = lastUndoableAction.originalIndex;
        if (originalIndex !== -1) {
          newList.splice(originalIndex, 0, lastUndoableAction.rdv);
        } else {
          newList.push(lastUndoableAction.rdv);
        }
        return newList;
      })
      setLastUndoableAction(null)
      notify({ title: 'Action annulée', description: `${getPatientName(lastUndoableAction.rdv)} a été rétabli dans les rendez-vous` })
    }
  }

  const handleAddToQueue = async (rdv) => {
    setBusy(rdv.id, true)
    const originalRdvIndex = localRdvList.findIndex(item => item.id === rdv.id)
    
    // Instant add
    setLocalQueueVisits(current => [{
      id: rdv.id,
      patient_name: getPatientName(rdv),
      age: 'N/A',
      reason: rdv.motif || 'Consultation',
      time_label: formatTime(rdv.date_rdv),
      time_status: 'En attente',
      status_type: 'Standard',
      status_label: 'NOUVEAU',
      wait_time: '0 min'
    }, ...current])
    setNewRdvs(prev => new Set([...prev, rdv.id]))
    // Remove from preview
    setLocalRdvList(current => current.filter(item => item.id !== rdv.id))
    // Save undo action
    setLastUndoableAction({
      type: 'ADD_TO_QUEUE',
      rdv: rdv,
      originalIndex: originalRdvIndex,
    })
    setBusy(rdv.id, false)
    notify({ title: 'Patient ajouté', description: `${getPatientName(rdv)} a été ajouté à la file d'attente` })
    setTimeout(() => {
      setNewRdvs(prev => {
        const newSet = new Set(prev)
        newSet.delete(rdv.id)
        return newSet
      })
    }, 1000)
  }

  const handleCancelRdv = async (rdv) => {
    setBusy(rdv.id, true)
    setTimeout(() => {
      setLocalRdvList(current => current.filter(item => item.id !== rdv.id))
      setCancelledRdvs(current => [rdv, ...current])
      setShowDatePickerMap(prev => {
        const newMap = { ...prev }
        delete newMap[rdv.id]
        return newMap
      })
      setBusy(rdv.id, false)
      notify({ title: 'RDV annulé', description: `${getPatientName(rdv)} a été annulé` })
    }, 220)
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
      notify({ title: 'Erreur', description: error.message || 'Impossible de reprogrammer ce rendez-vous.', tone: 'error' })
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
      await createWalkInVisit(walkInPatientId, walkInDoctorId)
      await refreshVisits?.()
      setShowWalkIn(false)
      setWalkInPatientId('')
      setWalkInDoctorId('')
      notify({ title: 'Patient ajoute', description: 'Le patient a ete ajoute a la file d attente.' })
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
        // Navigate immediately!
        navigate(`/consultation/${rdv.id}`)
        // We can release the busy state after navigation has been triggered
        setTimeout(() => setBusy(rdv.id, false), 100)
        break
      case 'view_file':
        navigate(`/consultation/${rdv.id}`)
        break
      default:
        notify({ title: 'Action en cours', description: `Action "${action}" bientot disponible`, tone: 'info' })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const revenueToday = (consultations || []).filter(c => c.date_consult === today && c.statut === 'paye').reduce((sum, c) => sum + (Number(c.montant) || 0), 0)

  return (
    <div className="min-h-full bg-slate-50 px-6 py-5">
      {/* Temporary dev role switcher */}
      <div className="mx-auto max-w-[1320px] mb-4">
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
      <div className="mx-auto flex max-w-[1320px] flex-col gap-5">
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
            <div className="flex items-center justify-between mb-6">
              <div>
                {showingHistory ? (
                  <>
                    <h2 className="text-xl font-bold text-slate-900">Historique</h2>
                    <p className="text-sm font-medium text-slate-600 mt-1">{filteredHistory.length} consultations terminées aujourd'hui</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-slate-900">File d'attente</h2>
                    <p className="text-sm font-medium text-slate-600 mt-1">{filteredQueue.length} patients en attente ce matin</p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {showingHistory ? (
                  <button onClick={() => setShowingHistory(false)} className="flex items-center gap-2 px-4 py-2 h-[44px] rounded-[10px] border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    File d'attente
                  </button>
                ) : (
                  <>
                    <button onClick={() => setShowingHistory(true)} className="flex items-center gap-2 px-4 py-2 h-[44px] rounded-[10px] border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v4H3z"/><path d="M19 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2z"/><path d="M8 13h8"/><path d="M8 17h4"/></svg>
                      Historique
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <AnimatePresence mode="wait">
                {!showingHistory ? (
                  <motion.div
                    key="queue"
                    initial={{ opacity: 0, x: -24, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24, scale: 0.98 }}
                    transition={{ 
                      opacity: { duration: 0.22, ease: [0.4, 0, 1, 1] },
                      x: { duration: 0.22, ease: [0.4, 0, 1, 1] },
                      scale: { duration: 0.22, ease: [0.4, 0, 1, 1] }
                    }}
                  >
                    {!isDoctor && can(userRole, 'visits:queue') && (
                      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        {!showWalkIn ? (
                          <button type="button" onClick={() => setShowWalkIn(true)} className="text-sm font-semibold text-blue-700 hover:text-blue-800">
                            + Arrivée sans RDV
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm font-semibold text-slate-900">Arrivée sans rendez-vous</p>
                            {/* Intelligent Patient Search */}
                            <div ref={walkInSearchContainerRef} className="relative">
                              <input
                                type="text"
                                value={selectedWalkInPatientName || walkInSearchQuery}
                                onChange={(e) => {
                                  setWalkInSearchQuery(e.target.value)
                                  setWalkInPatientId('')
                                  setShowWalkInPatientDropdown(true)
                                }}
                                onFocus={() => setShowWalkInPatientDropdown(true)}
                                placeholder="Rechercher un patient par nom ou téléphone"
                                className="w-full rounded-[10px] border border-[#e5e7eb] px-3 py-2 text-sm font-medium h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                              />
                              <AnimatePresence>
                                {showWalkInPatientDropdown && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="absolute top-full left-0 right-0 mt-1 bg-white rounded-[10px] border border-slate-200 shadow-lg z-50 max-h-64 overflow-y-auto"
                                  >
                                    {filteredWalkInPatients.length === 0 ? (
                                      <div className="p-3 text-sm text-slate-500">Aucun patient trouvé</div>
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
                                          className="w-full text-left px-3 py-2 hover:bg-slate-100 transition-colors text-sm"
                                        >
                                          <div className="font-medium text-slate-900">
                                            {patient.prenom} {patient.nom}
                                          </div>
                                          {patient.telephone && (
                                            <div className="text-xs text-slate-500">{patient.telephone}</div>
                                          )}
                                        </button>
                                      ))
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                            <select value={walkInDoctorId} onChange={e => setWalkInDoctorId(e.target.value)} className="w-full rounded-[10px] border border-[#e5e7eb] px-3 py-2 text-sm font-medium h-[44px] bg-white">
                              <option value="">Sélectionner un médecin</option>
                              {(doctors || []).map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.nom_complet || [doctor.first_name, doctor.last_name].filter(Boolean).join(' ')}</option>)}
                            </select>
                            <div className="flex gap-2">
                              {/* Ajouter à la file button */}
                              <button
                                type="button"
                                disabled={Boolean(busyMap['walk-in'])}
                                onClick={handleWalkInSubmit}
                                className="flex items-center justify-center gap-1.5 rounded-[0.625rem] font-semibold disabled:opacity-50"
                                style={{
                                  backgroundColor: walkInAddHovered ? '#2563eb' : '#3b82f6',
                                  color: '#ffffff',
                                  border: '2px solid ' + (walkInAddHovered ? '#1d4ed8' : '#60a5fa'),
                                  padding: '0.625rem 1rem',
                                  minHeight: '44px',
                                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                  whiteSpace: 'nowrap',
                                  fontSize: '14px',
                                  width: 'auto',
                                  fontWeight: 'bold',
                                  transform: walkInAddPressed ? 'translateY(-1px) scale(0.98)' : walkInAddHovered ? 'translateY(-2px)' : 'translateY(0)',
                                  boxShadow: walkInAddHovered ? '0 6px 16px -4px rgba(37,99,235,0.15)' : 'none'
                                }}
                                onMouseEnter={() => setWalkInAddHovered(true)}
                                onMouseLeave={() => { setWalkInAddHovered(false); setWalkInAddPressed(false) }}
                                onMouseDown={() => setWalkInAddPressed(true)}
                                onMouseUp={() => setWalkInAddPressed(false)}
                              >
                                Ajouter à la file
                              </button>
                              
                              {/* Annuler button */}
                              <button
                                type="button"
                                onClick={() => { setShowWalkIn(false); setWalkInPatientId(''); setWalkInDoctorId(''); setWalkInSearchQuery(''); }}
                                className="flex items-center justify-center gap-1.5 rounded-[0.625rem] font-semibold"
                                style={{
                                  backgroundColor: walkInCancelHovered ? '#f3f4f6' : '#ffffff',
                                  color: '#374151',
                                  border: '2px solid ' + (walkInCancelHovered ? '#d1d5db' : '#e5e7eb'),
                                  padding: '0.625rem 1rem',
                                  minHeight: '44px',
                                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                  whiteSpace: 'nowrap',
                                  fontSize: '14px',
                                  width: 'auto',
                                  fontWeight: 'bold',
                                  transform: walkInCancelPressed ? 'translateY(-1px) scale(0.98)' : walkInCancelHovered ? 'translateY(-2px)' : 'translateY(0)',
                                  boxShadow: walkInCancelHovered ? '0 6px 16px -4px rgba(156,163,175,0.15)' : 'none'
                                }}
                                onMouseEnter={() => setWalkInCancelHovered(true)}
                                onMouseLeave={() => { setWalkInCancelHovered(false); setWalkInCancelPressed(false) }}
                                onMouseDown={() => setWalkInCancelPressed(true)}
                                onMouseUp={() => setWalkInCancelPressed(false)}
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {filteredQueue.length === 0 ? (
                      <motion.div className="flex min-h-[440px] flex-col items-center justify-center text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Users className="h-[66px] w-[66px] text-slate-200" strokeWidth={1.6} />
                        <p className="mt-5 text-lg font-semibold text-slate-900">Aucun patient en attente</p>
                        <p className="mt-2 text-sm font-medium text-slate-600 max-w-[360px]">Les patients arrivés ou en attente apparaîtront ici automatiquement.</p>
                      </motion.div>
                    ) : (
                      <div className="space-y-1">
                        <AnimatePresence mode="popLayout">
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
                              onViewDossier={(patientId) => navigate(`/patients/${patientId}`)}
                              isUndoable={!isDoctor && lastUndoableAction?.rdv?.id === rdv.id}
                              onUndo={handleUndo}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0, x: 24, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -24, scale: 0.98 }}
                    transition={{ 
                      opacity: { duration: 0.28, ease: [0, 0, 0.2, 1], delay: 0.07 },
                      x: { duration: 0.28, ease: [0, 0, 0.2, 1], delay: 0.07 },
                      scale: { duration: 0.28, ease: [0, 0, 0.2, 1], delay: 0.07 }
                    }}
                  >
                    {filteredHistory.length === 0 ? (
                      <motion.div className="flex min-h-[440px] flex-col items-center justify-center text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Users className="h-[66px] w-[66px] text-slate-200" strokeWidth={1.6} />
                        <p className="mt-5 text-lg font-semibold text-slate-900">Aucune consultation terminée aujourd'hui</p>
                        <p className="mt-2 text-sm font-medium text-slate-600 max-w-[360px]">Les consultations terminées apparaîtront ici automatiquement.</p>
                      </motion.div>
                    ) : (
                      <div className="space-y-1">
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
                              onEncaisser={() => {}}
                              onViewReceipt={() => handleViewPaymentHistory(historyRdv)}
                              paidVisits={new Set()}
                              allPayments={allPayments}
                              onViewPaymentHistory={() => handleViewPaymentHistory(historyRdv)}
                              isHistoryCard={true}
                              totalPaid={totalPaid}
                            />
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            
            {/* Expand/collapse button - only for doctor view */}
            {!showPreviewPanel && (
              <button
                className="toggle-sidebar-btn absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition-all duration-300 z-20"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-label={isExpanded ? "Afficher l'aperçu du jour" : "Masquer l'aperçu du jour"}
              >
                <svg 
                  className="toggle-arrow" 
                  viewBox="0 0 24 24" 
                  width="20" 
                  height="20"
                  style={{
                    transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}
                >
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
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

      {/* Payment Confirmation Modal */}
      <Modal
        open={paymentModalOpen}
        title="Confirmer le paiement"
        description={`Patient: ${currentPaymentVisit ? getPatientName(currentPaymentVisit) : ''}`}
        onClose={() => setPaymentModalOpen(false)}
        footer={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPaymentModalOpen(false)}
              className="px-5 py-2 text-sm font-semibold"
              style={{
                backgroundColor: modalCancelHovered ? '#fee2e2' : '#fef2f2',
                color: '#991b1b',
                border: '2px solid ' + (modalCancelHovered ? '#f87171' : '#fecaca'),
                borderRadius: '0.625rem',
                minHeight: '44px',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: modalCancelPressed ? 'translateY(-1px) scale(0.98)' : modalCancelHovered ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: modalCancelHovered ? '0 6px 16px -4px rgba(220,38,38,0.15)' : 'none'
              }}
              onMouseEnter={() => setModalCancelHovered(true)}
              onMouseLeave={() => { setModalCancelHovered(false); setModalCancelPressed(false); }}
              onMouseDown={() => setModalCancelPressed(true)}
              onMouseUp={() => setModalCancelPressed(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirmPayment}
              disabled={processingPayment}
              className="px-5 py-2 text-sm font-semibold disabled:opacity-50"
              style={{
                backgroundColor: modalConfirmHovered ? '#15803d' : '#16A34A',
                color: '#ffffff',
                border: '2px solid ' + (modalConfirmHovered ? '#166534' : '#4ade80'),
                borderRadius: '0.625rem',
                minHeight: '44px',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: modalConfirmPressed ? 'translateY(-1px) scale(0.98)' : modalConfirmHovered ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: modalConfirmHovered ? '0 6px 16px -4px rgba(22,163,74,0.15)' : 'none'
              }}
              onMouseEnter={() => setModalConfirmHovered(true)}
              onMouseLeave={() => { setModalConfirmHovered(false); setModalConfirmPressed(false); }}
              onMouseDown={() => setModalConfirmPressed(true)}
              onMouseUp={() => setModalConfirmPressed(false)}
            >
              {processingPayment ? 'Traitement...' : 'Confirmer & générer reçu'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Montant total dû (MAD)</label>
            <input
              type="number"
              value={paymentAmount}
              readOnly
              className="w-full min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Montant payé maintenant (MAD)</label>
            <input
              type="number"
              value={paymentModalMontantPaye}
              onChange={(e) => setPaymentModalMontantPaye(e.target.value)}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Mode de paiement</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
            >
              <option value="cash">Espèces</option>
              <option value="card">Carte bancaire</option>
              <option value="transfer">Virement</option>
            </select>
          </div>
          
          {/* Reste à payer - live */}
          <div className="bg-slate-50 px-4 py-3.5 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-600">Reste à payer</span>
              <span className="text-sm font-bold text-slate-900">
                {(() => {
                  if (!currentPaymentVisit) return '0';
                  const totalAmount = currentPaymentVisit?.consultations?.billing_amount || 300;
                  const totalPaidSoFar = (allPayments[currentPaymentVisit.id] || []).reduce((sum, p) => sum + Number(p.amount), 0);
                  const totalPaidAfter = totalPaidSoFar + Number(paymentModalMontantPaye);
                  return Math.max(0, Number(totalAmount) - totalPaidAfter);
                })()} MAD
              </span>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Payment History Modal */}
      <Modal
        open={paymentHistoryModalOpen}
        title="Historique des paiements"
        description={`Patient: ${currentHistoryVisit ? getPatientName(currentHistoryVisit) : ''}`}
        onClose={() => setPaymentHistoryModalOpen(false)}
        footer={
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
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
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all hover:-translate-y-0.5 active:scale-95"
            >
              Imprimer le reçu officiel
            </button>
            <button
              type="button"
              onClick={() => setPaymentHistoryModalOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Fermer
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          {currentHistoryVisit ? (
            <div className="space-y-3">
              {/* Financial Summary Box */}
              <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Honoraires Dûs</p>
                  <p className="text-sm font-bold text-slate-900">{fmtMAD(currentHistoryVisit?.consultations?.billing_amount || currentHistoryVisit?.billing_amount || 300)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-emerald-600">Montant Versé</p>
                  <p className="text-sm font-bold text-emerald-700">{fmtMAD(currentHistoryVisit?.total_paid || currentHistoryVisit?.billing_amount || 300)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-amber-600">Reste à Payer</p>
                  <p className="text-sm font-bold text-amber-700">{fmtMAD(currentHistoryVisit?.remaining_balance || 0)}</p>
                </div>
              </div>

              {/* Transactions List */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-900">Détails des versements enregistrés</p>
                {(allPayments[currentHistoryVisit.id]?.length > 0
                  ? allPayments[currentHistoryVisit.id]
                  : [
                      {
                        id: `pay_${currentHistoryVisit.id}`,
                        amount: currentHistoryVisit?.total_paid || currentHistoryVisit?.billing_amount || 300,
                        method: currentHistoryVisit?.billing_type || 'cash',
                        timestamp: currentHistoryVisit?.updated_at || new Date().toISOString()
                      }
                    ]
                ).map((payment, idx) => (
                  <div key={payment.id || idx} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{fmtMAD(payment.amount)}</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {payment.method === 'cash' ? '💵 Espèces' : payment.method === 'card' ? '💳 TPE' : '🏦 Virement'} • {new Date(payment.timestamp).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        openPrintWindow({
                          recuNo: `REC-${(currentHistoryVisit.id || '').slice(-6).toUpperCase() || '2026-01'}`,
                          patientName: getPatientName(currentHistoryVisit),
                          patientCin: currentHistoryVisit?.patients?.cin || 'N/A',
                          patientPhone: currentHistoryVisit?.patients?.telephone || 'N/A',
                          patientAssurance: currentHistoryVisit?.patients?.assurance || 'N/A',
                          date: new Date(payment.timestamp).toLocaleDateString('fr-FR'),
                          montantTotal: currentHistoryVisit?.consultations?.billing_amount || currentHistoryVisit?.billing_amount || 300,
                          montantPaye: payment.amount,
                          resteAPayer: currentHistoryVisit?.remaining_balance || 0,
                          paymentMethod: payment.method || 'cash',
                          notes: currentHistoryVisit?.reason || currentHistoryVisit?.motif || 'Consultation Médicale',
                          title: 'REÇU DE PAIEMENT MÉDICAL',
                          isPaid: true
                        })
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200/60"
                    >
                      Voir reçu
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-500 py-6 text-xs font-medium">Aucun détail de paiement trouvé</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
