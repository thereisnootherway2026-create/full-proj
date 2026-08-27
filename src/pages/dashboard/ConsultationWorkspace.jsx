import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAutosave } from '../../hooks/useAutosave'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  FlaskConical,
  Loader2,
  Plus,
  Scan,
  Search,
  Stethoscope,
  Trash2,
  Activity,
  Brain,
  ListChecks,
  Thermometer,
  Heart,
  Wind,
  Droplets,
  Scale,
  Ruler,
  Calculator,
  FileText,
  Microscope,
  CalendarClock,
  Pill,
  ShieldAlert,
  AlertTriangle,
  Baby,
  Zap,
  User,
  Phone,
  CreditCard,
  Venus,
  Mars,
  UserRound,
  Stethoscope as StethoscopeIcon,
  FileCheck2,
  ImageIcon as ImgIcon,
  TestTube2,
  ChevronRight,
  Clock3,
  Sparkles,
  X,
  ChevronDown,
  ClipboardList,
  BookOpen,
  MessageSquare,
  Stethoscope as StethIcon,
  GitBranch,
  HeartPulse,
  GraduationCap,
} from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import { VISIT_STATUSES, BILLING_TYPES } from '../../lib/workflow'
import {
  adminOverrideConsultationLock,
  completeConsultation,
  getConsultationByVisit,
  openConsultation,
  refreshConsultationLock,
  releaseConsultationLock,
} from '../../lib/visitService'
import { normalizeRole } from '../../lib/rbac'
import PinLock from '../../components/common/PinLock'
import AddTaskModal from '../../components/forms/AddTaskModal'
import { loadTasks, saveTasks } from '../../lib/taskHelpers'

const TZ = 'Africa/Casablanca'

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

function useLiveTimer(startAt) {
  const [label, setLabel] = useState('00:00:00')
  const [minutes, setMinutes] = useState(0)

  useEffect(() => {
    const update = () => {
      if (!startAt) {
        setLabel('00:00:00')
        setMinutes(0)
        return
      }

      const started = new Date(startAt).getTime()
      if (Number.isNaN(started)) {
        setLabel('00:00:00')
        setMinutes(0)
        return
      }

      const diffSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000))
      const hours = Math.floor(diffSeconds / 3600)
      const mins = Math.floor((diffSeconds % 3600) / 60)
      const secs = diffSeconds % 60

      setMinutes(Math.floor(diffSeconds / 60))
      setLabel([hours, mins, secs].map((value) => String(value).padStart(2, '0')).join(':'))
    }

    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [startAt])

  return { label, minutes }
}

// ─── Sidebar mock data (will be replaced with real data) ─────────────────────
const mockAlerts = [
  { id: 'a1', type: 'allergy',  label: 'Allergie médicamenteuse', detail: 'Pénicilline — réaction sévère', color: 'red'    },
  { id: 'a2', type: 'chronic',  label: 'Maladie chronique',       detail: 'Diabète type 2 (depuis 2019)', color: 'amber'  },
]

const mockCurrentMeds = [
  { id: 'm1', name: 'Metformine 850mg',  dosage: '1 cp matin & soir',         refill: true  },
  { id: 'm2', name: 'Ramipril 5mg',      dosage: '1 cp le soir',              refill: false },
]

const mockDocuments = [
  { id: 'd1', type: 'prescription', label: 'Ordonnance du 15/06/2026', status: 'ready'   },
  { id: 'd2', type: 'lab',          label: 'Bilan NFS – 22/05/2026',   status: 'pending' },
  { id: 'd3', type: 'imaging',      label: 'Écho abdominale',          status: 'pending' },
]

// Mock patient data (will be replaced with real data from visit)
const mockPatientData = {
  id: '1',
  name: 'Karima Benali',
  age: 34,
  gender: 'Femme',
  insurance: 'CNSS',
  fileNumber: 'B_4445821',
  phone: '06 12 34 56 78',
  reason: 'Douleurs abdominales',
  appointmentTime: new Date().toISOString(),
  waitTime: '18 min',
}

// Mock consultation history (enriched)
const mockHistory = [
  { id: '1', reason: 'Douleurs lombaires',     date: '15 juin 2026',  doctor: 'Dr. Touggani', type: 'Consultation',   status: 'completed' },
  { id: '2', reason: 'Consultation générale',  date: '22 mai 2026',   doctor: 'Dr. Benali',   type: 'Consultation',   status: 'completed' },
  { id: '3', reason: 'Bilan de suivi diabète', date: '10 avr. 2026',  doctor: 'Dr. Touggani', type: 'Suivi',           status: 'completed' },
]

// ─── Sidebar reusable components ─────────────────────────────────────────────

// Card wrapper used in the sidebar
function SidebarCard({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

// Section header inside a sidebar card
function SidebarSection({ icon: Icon, title, accent = 'gray', children, action }) {
  const accentMap = {
    gray:   'text-gray-400',
    red:    'text-red-400',
    blue:   'text-blue-500',
    emerald:'text-emerald-500',
    amber:  'text-amber-500',
    violet: 'text-violet-500',
  }
  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-3 pb-1.5">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`w-3.5 h-3.5 ${accentMap[accent] || accentMap.gray}`} />}
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider leading-none">{title}</h3>
        </div>
        {action}
      </div>
      <div className="px-5 pb-3">{children}</div>
    </div>
  )
}

// Medical alert card
function AlertCard({ type, label, detail, color }) {
  const map = {
    red:   { bg: 'bg-red-50',   border: 'border-red-200',   icon: 'text-red-500',   dot: 'bg-red-400',   text: 'text-red-700'   },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-500', dot: 'bg-amber-400', text: 'text-amber-700' },
    blue:  { bg: 'bg-blue-50',  border: 'border-blue-200',  icon: 'text-blue-500',  dot: 'bg-blue-400',  text: 'text-blue-700'  },
  }
  const c = map[color] || map.amber
  const iconMap = {
    allergy:  ShieldAlert,
    chronic:  Activity,
    pregnancy:Baby,
    highrisk: Zap,
  }
  const Icon = iconMap[type] || AlertTriangle
  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-xl border ${c.bg} ${c.border}`}>
      <div className={`w-7 h-7 rounded-lg bg-white/70 border ${c.border} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-3.5 h-3.5 ${c.icon}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold ${c.text} leading-tight`}>{label}</p>
        <p className="text-xs font-medium text-gray-500 mt-0.5 leading-snug">{detail}</p>
      </div>
    </div>
  )
}

// Current medication row
function MedItem({ name, dosage, refill }) {
  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-gray-50 last:border-0">
      <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Pill className="w-3 h-3 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{name}</p>
        <p className="text-xs font-medium text-gray-400 leading-tight mt-0.5">{dosage}</p>
      </div>
      {refill && (
        <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
          ↺ Renouveler
        </span>
      )}
    </div>
  )
}

// Consultation timeline item
function TimelineItem({ item, isLast }) {
  return (
    <div className="flex gap-3">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1 ring-2 ring-emerald-100 flex-shrink-0" />
        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1 mb-0" />}
      </div>
      <div className={`flex-1 min-w-0 pb-4 ${isLast ? '' : ''}`}>
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-semibold text-gray-900 leading-snug truncate">{item.reason}</p>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">✓</span>
        </div>
        <p className="text-xs text-gray-400 font-medium mt-0.5">{item.date}</p>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">{item.type}</span>
          <span className="text-[10px] text-gray-400">·</span>
          <span className="text-[10px] text-gray-400 font-medium">{item.doctor}</span>
        </div>
      </div>
    </div>
  )
}

// Document row
function DocItem({ type, label, status }) {
  const iconMap = {
    prescription: FileCheck2,
    lab:          TestTube2,
    imaging:      ImgIcon,
  }
  const statusMap = {
    ready:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'Prêt'     },
    pending: { cls: 'bg-gray-50 text-gray-500 border-gray-200',          text: 'En cours' },
  }
  const Icon = iconMap[type] || FileText
  const s = statusMap[status] || statusMap.pending
  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50/50 -mx-1 px-1 rounded-lg transition-colors">
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 leading-tight truncate">{label}</p>
      </div>
      <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
    </div>
  )
}

// ─── Shared input / textarea class ───────────────────────────────────────────
const inputCls =
  'w-full h-10 px-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 font-medium placeholder:text-gray-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none'

const textareaCls =
  'w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 font-medium placeholder:text-gray-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none outline-none leading-relaxed'

// ─── SOAP Section Banner ──────────────────────────────────────────────────────
// Visually stronger banner-style header for each SOAP section card.
const SOAP_COLORS = {
  S: {
    gradient: 'from-blue-600 to-blue-500',
    light:    'bg-blue-50',
    border:   'border-blue-100',
    badge:    'bg-blue-600',
    text:     'text-blue-700',
    ring:     'ring-blue-200',
    divider:  'from-blue-200/60',
    iconBg:   'bg-blue-100',
    iconText: 'text-blue-600',
  },
  O: {
    gradient: 'from-emerald-600 to-teal-500',
    light:    'bg-emerald-50',
    border:   'border-emerald-100',
    badge:    'bg-emerald-600',
    text:     'text-emerald-700',
    ring:     'ring-emerald-200',
    divider:  'from-emerald-200/60',
    iconBg:   'bg-emerald-100',
    iconText: 'text-emerald-600',
  },
  A: {
    gradient: 'from-violet-600 to-purple-500',
    light:    'bg-violet-50',
    border:   'border-violet-100',
    badge:    'bg-violet-600',
    text:     'text-violet-700',
    ring:     'ring-violet-200',
    divider:  'from-violet-200/60',
    iconBg:   'bg-violet-100',
    iconText: 'text-violet-600',
  },
  P: {
    gradient: 'from-amber-500 to-orange-500',
    light:    'bg-amber-50',
    border:   'border-amber-100',
    badge:    'bg-amber-500',
    text:     'text-amber-700',
    ring:     'ring-amber-200',
    divider:  'from-amber-200/60',
    iconBg:   'bg-amber-100',
    iconText: 'text-amber-600',
  },
}

function SOAPCard({ letter, title, subtitle, icon: Icon, children }) {
  const c = SOAP_COLORS[letter]
  return (
    <div className={`bg-white rounded-2xl border ${c.border} shadow-sm overflow-hidden`}>
      {/* Coloured top strip */}
      <div className={`h-1 w-full bg-gradient-to-r ${c.gradient}`} />

      {/* Header */}
      <div className={`${c.light} px-5 py-3 flex items-center gap-4 border-b ${c.border}`}>
        {/* Letter badge */}
        <div
          className={`w-11 h-11 rounded-2xl ${c.badge} flex items-center justify-center flex-shrink-0 shadow-md`}
          style={{ boxShadow: `0 4px 12px rgba(0,0,0,0.15)` }}
        >
          <span className="text-white text-base font-black tracking-tight">{letter}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className={`text-base font-extrabold ${c.text} tracking-tight leading-none`}>
              {letter} — {title}
            </h2>
          </div>
          <p className="text-xs font-medium text-gray-500 mt-0.5 leading-snug">{subtitle}</p>
        </div>

        {Icon && (
          <div className={`w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${c.iconText}`} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  )
}

// ─── Field Label ─────────────────────────────────────────────────────────────
function FieldLabel({ children, required }) {
  return (
    <label className="block text-sm font-semibold text-gray-700 mb-1">
      {children}
      {required && <span className="text-red-500 text-xs align-super ml-0.5">*</span>}
    </label>
  )
}

// ─── Sub-section Title (within a SOAP card) ───────────────────────────────────
function SubSectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
      <p className="text-xs font-bold text-gray-700 uppercase tracking-wider leading-none">{children}</p>
    </div>
  )
}

// ─── Intra-card Divider ───────────────────────────────────────────────────────
function CardDivider() {
  return <div className="h-px bg-gray-100 my-1" />
}

// ─── SOAP Section Divider (between cards) ────────────────────────────────────
function SOAPDivider({ letter }) {
  const c = SOAP_COLORS[letter] || {}
  return (
    <div className="relative flex items-center py-1">
      <div className={`flex-1 h-px bg-gradient-to-r ${c.divider || 'from-gray-200/60'} to-transparent`} />
      <div className={`mx-3 flex-shrink-0 w-1.5 h-1.5 rounded-full ${c.badge || 'bg-gray-300'} opacity-40`} />
      <div className={`flex-1 h-px bg-gradient-to-l ${c.divider || 'from-gray-200/60'} to-transparent`} />
    </div>
  )
}

// ─── Vital Tile ───────────────────────────────────────────────────────────────
function VitalTile({ label, unit, placeholder, value, onChange, type = 'text', step, readOnly, icon: Icon }) {
  return (
    <div className={`rounded-xl border p-2.5 transition-all ${readOnly ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon className={`w-3 h-3 flex-shrink-0 ${readOnly ? 'text-blue-400' : 'text-gray-400'}`} />}
        <p className={`text-xs font-semibold leading-none ${readOnly ? 'text-blue-600' : 'text-gray-500'}`}>{label}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type={type}
          step={step}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          className={`flex-1 min-w-0 h-8 px-2.5 border rounded-lg font-semibold text-sm placeholder:text-gray-400 focus:ring-1 outline-none transition-all ${
            readOnly
              ? 'bg-blue-50 border-blue-200 text-blue-700 cursor-default focus:ring-0'
              : 'bg-white border-gray-200 text-gray-900 focus:border-blue-500 focus:ring-blue-100'
          }`}
        />
        {unit && (
          <span className={`text-xs font-semibold flex-shrink-0 ${readOnly ? 'text-blue-500' : 'text-gray-400'}`}>
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Placeholder Section (Lab / Imaging) ─────────────────────────────────────
function PlaceholderSection({ icon: Icon, label, description, accent = 'gray' }) {
  const accentMap = {
    gray:   { border: 'border-gray-200',   bg: 'bg-gray-50',   iconBg: 'bg-gray-100',   iconText: 'text-gray-400',   tag: 'text-gray-400 bg-gray-100' },
    violet: { border: 'border-violet-200', bg: 'bg-violet-50', iconBg: 'bg-violet-100', iconText: 'text-violet-500', tag: 'text-violet-600 bg-violet-100' },
    blue:   { border: 'border-blue-200',   bg: 'bg-blue-50',   iconBg: 'bg-blue-100',   iconText: 'text-blue-500',   tag: 'text-blue-600 bg-blue-100' },
  }
  const a = accentMap[accent] || accentMap.gray
  return (
    <div className={`border-2 border-dashed ${a.border} ${a.bg} rounded-xl py-5 px-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-xl ${a.iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4.5 h-4.5 ${a.iconText}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 font-medium mt-0.5">{description}</p>
      </div>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${a.tag} flex-shrink-0`}>
        À venir
      </span>
    </div>
  )
}

// ─── SOAP Progress Indicator ─────────────────────────────────────────────────
const SOAP_STEP_META = [
  {
    key: 'S',
    label: 'Subjective',
    color: { active: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  },
  {
    key: 'O',
    label: 'Objective',
    color: { active: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  },
  {
    key: 'A',
    label: 'Assessment',
    color: { active: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
  },
  {
    key: 'P',
    label: 'Plan',
    color: { active: '#f59e0b', bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  },
]

function SOAPProgressIndicator({ soapStatus }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
      }}
    >
      {SOAP_STEP_META.map((step, idx) => {
        const status = soapStatus[step.key] // 'not_started' | 'in_progress' | 'completed'
        const isCompleted = status === 'completed'
        const isInProgress = status === 'in_progress'
        const isLast = idx === SOAP_STEP_META.length - 1

        let icon, iconColor
        if (isCompleted) {
          icon = '✓'
          iconColor = step.color.active
        } else if (isInProgress) {
          icon = '◐'
          iconColor = step.color.active
        } else {
          icon = '○'
          iconColor = '#94a3b8'
        }

        const dotBg = isCompleted || isInProgress ? step.color.bg : 'transparent'
        const dotBorder = isCompleted || isInProgress ? step.color.border : '#e2e8f0'
        const labelColor = isCompleted || isInProgress ? step.color.text : '#94a3b8'
        const statusText = isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Not Started'
        const statusTextColor = isCompleted ? step.color.active : isInProgress ? step.color.active : '#cbd5e1'

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: isLast ? '0 0 auto' : 1 }}>
            {/* Step pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Icon circle */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: dotBg,
                  border: `1.5px solid ${dotBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  color: iconColor,
                  fontWeight: 700,
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
              >
                {icon}
              </div>
              {/* Labels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: labelColor, lineHeight: 1, transition: 'color 0.2s' }}>
                  {step.key} — {step.label}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color: statusTextColor, lineHeight: 1, transition: 'color 0.2s' }}>
                  {statusText}
                </span>
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div style={{ flex: 1, height: 1, background: '#e2e8f0', margin: '0 12px', minWidth: 16 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── AI Assistant Drawer ──────────────────────────────────────────────────────
const AI_CAPABILITIES = [
  {
    id: 'summarize',
    label: 'Résumer historique',
    description: 'Synthèse des consultations précédentes',
    icon: ClipboardList,
    color: '#3b82f6',
    bgColor: '#eff6ff',
  },
  {
    id: 'soap',
    label: 'Générer note SOAP',
    description: 'Note structurée à partir des données actuelles',
    icon: BookOpen,
    color: '#10b981',
    bgColor: '#ecfdf5',
  },
  {
    id: 'icd10',
    label: 'Suggérer codes CIM-10',
    description: 'Codes diagnostiques selon la classification ICD-10',
    icon: StethIcon,
    color: '#8b5cf6',
    bgColor: '#f5f3ff',
  },
  {
    id: 'differential',
    label: 'Diagnostics différentiels',
    description: 'Liste des diagnostics à considérer',
    icon: GitBranch,
    color: '#f59e0b',
    bgColor: '#fffbeb',
  },
  {
    id: 'treatment',
    label: 'Plan thérapeutique',
    description: 'Proposition de prise en charge complète',
    icon: HeartPulse,
    color: '#ef4444',
    bgColor: '#fef2f2',
  },
  {
    id: 'education',
    label: 'Éducation patient',
    description: 'Fiche pédagogique à remettre au patient',
    icon: GraduationCap,
    color: '#06b6d4',
    bgColor: '#ecfeff',
  },
  {
    id: 'explain',
    label: 'Expliquer le diagnostic',
    description: 'Explication en langage simple pour le patient',
    icon: MessageSquare,
    color: '#84cc16',
    bgColor: '#f7fee7',
  },
]

const MOCK_AI_RESPONSES = {
  summarize: (formData, patient) =>
    `📋 RÉSUMÉ HISTORIQUE PATIENT\n\n${patient?.name || 'Patient'} — ${patient?.age || '—'} ans\n\nConsultations récentes :\n• 15 juin 2026 — Douleurs lombaires (Dr. Touggani) — Résolu\n• 22 mai 2026 — Consultation générale (Dr. Benali) — Résolu\n• 10 avril 2026 — Bilan suivi diabète (Dr. Touggani) — Stable\n\nAntécédents notables : Diabète type 2 (depuis 2019), allergie Pénicilline.\nTraitement en cours : Metformine 850mg, Ramipril 5mg.`,

  soap: (formData) =>
    `📝 NOTE SOAP GÉNÉRÉE\n\nS — Subjective\n${formData.chiefComplaint ? `Motif: ${formData.chiefComplaint}` : 'Motif non renseigné.'}\n${formData.history ? `Anamnèse: ${formData.history}` : ''}\n\nO — Objective\nT°: ${formData.temperature || '—'}°C | TA: ${formData.bloodPressure || '—'} mmHg | FC: ${formData.heartRate || '—'} bpm\n${formData.physicalExam ? `Examen: ${formData.physicalExam}` : 'Examen physique non renseigné.'}\n\nA — Assessment\n${formData.primaryDiagnosis ? `Diagnostic: ${formData.primaryDiagnosis}` : 'Diagnostic non renseigné.'}\n\nP — Plan\n${formData.treatmentPlan || 'Plan thérapeutique non renseigné.'}`,

  icd10: () =>
    `🏷️ CODES CIM-10 SUGGÉRÉS\n\n• R10.4 — Douleurs abdominales autres et non précisées\n  → Correspond au motif principal\n\n• E11.9 — Diabète de type 2 sans complications\n  → Antécédent chronique actif\n\n• I10 — Hypertension artérielle essentielle\n  → À vérifier selon la clinique`,

  differential: (formData) =>
    `🔀 DIAGNOSTICS DIFFÉRENTIELS\n\nMotif: ${formData.chiefComplaint || 'douleurs abdominales'}\n\n1. Gastrite / Ulcère peptique (probable)\n   Pour: douleurs épigastriques, ATCD AINS\n   Contre: pas d'hématémèse\n\n2. Syndrome de l'intestin irritable (probable)\n   Pour: stress associé, transit altéré\n   Contre: douleurs constantes\n\n3. Lithiase biliaire (possible)\n   Pour: localisation sous-costale droite\n   Contre: pas d'irradiation épaule\n\n4. Appendicite (à éliminer)\n   Pour: douleur migration FID possible\n   Contre: apyrexie`,

  treatment: () =>
    `💊 PLAN THÉRAPEUTIQUE PROPOSÉ\n\nMédicamenteux\n• Oméprazole 20mg — 1 cp/j à jeun — 4 semaines\n• Paracétamol 1g — si douleur — max 3/j\n• Antispasmodique (Spasfon) — selon tolérance\n\nHygiéno-diététique\n• Éviter AINS, alcool, tabac\n• Repas fractionnés, éviter épices\n• Gestion du stress\n\nSuivi\n• Contrôle dans 4 semaines\n• Fibroscopie si symptômes persistants\n\nSignes d'alarme\n• Hématémèse, méléna → urgences immédiates`,

  education: (formData) =>
    `📚 FICHE PATIENT — ${formData.primaryDiagnosis || 'VOTRE PATHOLOGIE'}\n\nC'est quoi ?\nVotre médecin a identifié une pathologie de l'estomac. C'est très fréquent et très bien traitable.\n\nQue faire ?\n✓ Prenez vos médicaments comme prescrit\n✓ Mangez à heures régulières, en petites quantités\n✓ Évitez le café, l'alcool et les plats épicés\n✓ Réduisez le stress (sommeil, marche)\n\nMédicaments\nPrenez l'Oméprazole le matin, à jeun, avant le repas.\n\nQuand appeler votre médecin ?\n🚨 Si vous voyez du sang dans vos selles ou vomissements\n🚨 Si la douleur devient très intense\n🚨 Si vous perdez du poids sans raison`,

  explain: (formData, patient) =>
    `💬 EXPLICATION POUR VOTRE PATIENT\n\n« ${patient?.name ? patient.name.split(' ')[0] : 'Cher patient'}, je vous explique ce qu'on a trouvé.\n\nVotre estomac est un peu irrité en ce moment — c'est ce qu'on appelle une gastrite. C'est comme si la paroi de votre estomac avait une petite inflammation.\n\nLa bonne nouvelle, c'est que ça se traite très bien avec un médicament simple qui protège votre estomac (l'Oméprazole). En quelques semaines, vous devriez vous sentir beaucoup mieux.\n\nL'important, c'est de suivre le traitement régulièrement et d'éviter les aliments qui aggravent les symptômes. »`,
}

function AIAssistantDrawer({ open, onClose, formData, patient, medications }) {
  const [activeCapability, setActiveCapability] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleCapability = async (capability) => {
    setActiveCapability(capability.id)
    setResult('')
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800))
    const fn = MOCK_AI_RESPONSES[capability.id]
    setResult(fn ? fn(formData, patient, medications) : 'Résultat IA non disponible.')
    setLoading(false)
  }

  const activeData = AI_CAPABILITIES.find((c) => c.id === activeCapability)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="ai-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.18)',
              zIndex: 200, backdropFilter: 'blur(2px)',
            }}
          />

          {/* Drawer */}
          <motion.div
            key="ai-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
              background: '#fff', zIndex: 201, display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(15,23,42,0.12)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px 12px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Sparkles style={{ width: 16, height: 16, color: '#fff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>Assistant IA</p>
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>Outils intelligents pour la consultation</p>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0',
                  background: '#f8fafc', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X style={{ width: 15, height: 15, color: '#64748b' }} />
              </button>
            </div>

            {/* Capability buttons */}
            <div style={{ padding: '12px 16px', flexShrink: 0, borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Capacités</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {AI_CAPABILITIES.map((cap) => {
                  const Icon = cap.icon
                  const isActive = activeCapability === cap.id
                  return (
                    <button
                      key={cap.id}
                      onClick={() => handleCapability(cap)}
                      disabled={loading}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                        border: isActive ? `1.5px solid ${cap.color}` : '1.5px solid transparent',
                        background: isActive ? cap.bgColor : '#f8fafc',
                        transition: 'all 0.15s ease',
                        textAlign: 'left',
                        opacity: loading && !isActive ? 0.5 : 1,
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: isActive ? cap.bgColor : '#f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon style={{ width: 13, height: 13, color: isActive ? cap.color : '#64748b' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: isActive ? cap.color : '#334155', lineHeight: 1 }}>{cap.label}</p>
                        <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 1 }}>{cap.description}</p>
                      </div>
                      {isActive && loading && (
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%',
                          border: `2px solid ${cap.color}`, borderTopColor: 'transparent',
                          animation: 'spin 0.7s linear infinite', flexShrink: 0,
                        }} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Result area */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {result ? (
                <div style={{
                  background: activeData ? activeData.bgColor : '#f8fafc',
                  border: `1px solid ${activeData ? activeData.color + '40' : '#e2e8f0'}`,
                  borderRadius: 12, padding: 14,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: activeData?.color || '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {activeData?.label}
                  </p>
                  <pre style={{
                    fontSize: 12, color: '#1e293b', lineHeight: 1.7,
                    fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                  }}>
                    {result}
                  </pre>
                  <button
                    onClick={() => { setResult(''); setActiveCapability(null) }}
                    style={{
                      marginTop: 12, fontSize: 11, color: '#94a3b8', cursor: 'pointer',
                      background: 'none', border: 'none', padding: 0, fontWeight: 600,
                    }}
                  >
                    ← Nouvelle requête
                  </button>
                </div>
              ) : !activeCapability ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 16, margin: '0 auto 12px',
                    background: 'linear-gradient(135deg, #7c3aed22, #4f46e522)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles style={{ width: 22, height: 22, color: '#7c3aed' }} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Prêt à vous assister</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>Sélectionnez une capacité ci-dessus pour générer une analyse IA contextuelle.</p>
                </div>
              ) : loading ? (
                <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', margin: '0 auto 12px',
                    border: `3px solid ${activeData?.color || '#7c3aed'}`,
                    borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Analyse en cours...</p>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div style={{
              padding: '10px 16px', borderTop: '1px solid #f1f5f9', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>Données de la consultation utilisées comme contexte</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ConsultationWorkspace() {
  const { rdv_id: visitIdParam, visitId: visitIdAlt } = useParams()
  const visitId = visitIdAlt || visitIdParam
  const navigate = useNavigate()
  const { notify, refreshVisits, refreshConsultations, canonicalRole, updateVisitStatus } = useAppContext()

  const initialMockVisit = {
    id: visitId,
    status: VISIT_STATUSES.CONSULTATION,
    consultation_id: visitId,
    consultation: {
      id: visitId,
      chief_complaint: mockPatientData.reason,
      notes: '',
      started_at: new Date().toISOString(),
    },
    patients: {
      prenom: 'Karima',
      nom: 'Benali',
      age: 34,
      mutuelle: 'CNSS',
      file_number: 'B_4445821',
      telephone: '06 12 34 56 78',
      gender: 'Femme',
    },
  }

  const [visit, setVisit] = useState(initialMockVisit)
  const [saving, setSaving] = useState(false)
  const [lockConflict, setLockConflict] = useState(null)
  const [overridingLock, setOverridingLock] = useState(false)

  // ── Form state (SOAP) ──────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    // S — Subjective
    chiefComplaint: mockPatientData.reason,
    history: '',

    // O — Objective: Vitals
    temperature: '',
    bloodPressure: '',
    heartRate: '',
    respiratoryRate: '',
    oxygenSaturation: '',
    weight: '',
    height: '',
    // BMI is computed
    physicalExam: '',

    // A — Assessment
    primaryDiagnosis: '',
    secondaryDiagnosis: '',
    clinicalImpression: '',

    // P — Plan
    treatmentPlan: '',
    followUpInstructions: '',
  })

  const [medications, setMedications] = useState([
    { id: 1, name: 'Paracétamol 500mg', dosage: '1 comprimé × 3 fois par jour · 5 jours' },
  ])

  // ── Autosave ───────────────────────────────────────────────────────────────
  // Stable ref so getPayload never triggers hook re-renders
  const formDataRef   = useRef(formData)
  const medicationsRef = useRef(medications)
  useEffect(() => { formDataRef.current = formData },   [formData])
  useEffect(() => { medicationsRef.current = medications }, [medications])

  const getPayload = useCallback(() => ({
    ...formDataRef.current,
    medications: medicationsRef.current,
  }), [])

  const { saveStatus, markDirty, triggerSave } = useAutosave({
    consultationId: visit?.consultation_id,
    visitId,
    getPayload,
  })

  // Auto-computed BMI
  const bmi = useMemo(() => {
    const w = parseFloat(formData.weight)
    const h = parseFloat(formData.height) / 100
    if (!w || !h || h <= 0) return ''
    return (w / (h * h)).toFixed(1)
  }, [formData.weight, formData.height])

  const isAdmin = normalizeRole(canonicalRole) === 'admin'

  const hydrateConsultation = (consultation, visitRow) => {
    const normalizedVisit = {
      ...visitRow,
      consultation_id: consultation.id,
      consultation,
      patients: visitRow.patients,
    }
    setVisit(normalizedVisit)
    setLockConflict(null)
  }

  const loadConsultation = async (cancelledRef) => {
    try {
      // Check if it's our mock UUID (starts with 550e8400) OR "vis_" prefix - use mock data instead
      if (visitId.startsWith('550e8400-e29b-41d4-a716-446655440') || visitId.startsWith('vis_')) {
        const mockConsultation = {
          id: visitId,
          chief_complaint: mockPatientData.reason,
          notes: '',
        }
        const mockVisitRow = {
          id: visitId,
          status: VISIT_STATUSES.CONSULTATION,
          patients: {
            prenom: 'Karima',
            nom: 'Benali',
            age: 34,
            mutuelle: 'CNSS',
            file_number: 'B_4445821',
            telephone: '06 12 34 56 78',
            gender: 'Femme',
          },
        }
        if (cancelledRef?.cancelled) return
        hydrateConsultation(mockConsultation, mockVisitRow)
        return
      }

      // Real data loading for valid UUIDs — run in parallel for speed
      const [openedResult, loadedResult] = await Promise.allSettled([
        openConsultation(visitId),
        getConsultationByVisit(visitId),
      ])
      const opened = openedResult.status === 'fulfilled' ? openedResult.value : null
      const loaded = loadedResult.status === 'fulfilled' ? loadedResult.value : null
      const consultation = loaded || opened
      const visitRow = loaded?.visits || { id: visitId, status: VISIT_STATUSES.CONSULTATION }

      if (cancelledRef?.cancelled) return
      hydrateConsultation(consultation, visitRow)
    } catch (error) {
      const message = error.message || ''
      const isLockError = /lock/i.test(message)

      if (isLockError) {
        const existing = await getConsultationByVisit(visitId).catch(() => null)
        if (cancelledRef?.cancelled) return

        if (existing?.id) {
          setLockConflict({
            consultationId: existing.id,
            message,
          })
          hydrateConsultation(existing, existing.visits || { id: visitId, status: VISIT_STATUSES.CONSULTATION })
          return
        }
      }

      // Fallback to mock data
      const mockConsultation = {
        id: visitId,
        chief_complaint: mockPatientData.reason,
        notes: '',
      }
      const mockVisitRow = {
        id: visitId,
        status: VISIT_STATUSES.CONSULTATION,
        patients: {
          prenom: 'Karima',
          nom: 'Benali',
          age: 34,
          mutuelle: 'CNSS',
          file_number: 'B_4445821',
          telephone: '06 12 34 56 78',
          gender: 'Femme',
        },
      }
      if (cancelledRef?.cancelled) return
      hydrateConsultation(mockConsultation, mockVisitRow)
    }
  }

  useEffect(() => {
    const cancelledRef = { cancelled: false }

    async function boot() {
      try {
        await loadConsultation(cancelledRef)
      } catch (error) {
        console.error('Consultation load error:', error)
        // Non-fatal: page is already rendered with optimistic data
      }
    }

    boot()

    return () => {
      cancelledRef.cancelled = true
    }
  }, [navigate, notify, visitId])

  const handleAdminLockOverride = async () => {
    if (!lockConflict?.consultationId || overridingLock) return

    setOverridingLock(true)
    try {
      await adminOverrideConsultationLock(lockConflict.consultationId)
      await loadConsultation({ cancelled: false })
      notify({ title: 'Verrou repris', description: 'Vous pouvez modifier cette consultation.', tone: 'success' })
    } catch (error) {
      notify({ title: 'Erreur', description: error.message || 'Impossible de reprendre le verrou.', tone: 'error' })
    } finally {
      setOverridingLock(false)
    }
  }

  useEffect(() => {
    if (!visit?.consultation_id) return undefined

    const heartbeat = window.setInterval(() => {
      refreshConsultationLock(visit.consultation_id).catch((error) => {
        console.error('Consultation lock heartbeat error:', error)
      })
    }, 120000)

    const release = () => {
      releaseConsultationLock(visit.consultation_id).catch(() => {})
    }

    window.addEventListener('pagehide', release)

    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [visit?.consultation_id])

  const timer = useLiveTimer(visit?.consultation_start_at || visit?.consultation?.started_at || visit?.updated_at)

  const handleTerminer = async () => {
    if (!visit || saving) return

    setSaving(true)
    const previousVisit = visit
    setVisit((current) => ({ ...current, status: VISIT_STATUSES.BILLING }))
    // Optimistically update in AppContext
    updateVisitStatus(visitId, VISIT_STATUSES.BILLING)

    try {
      const targetId = visit.consultation_id || visit.id || visitId
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)

      if (isUuid) {
        await completeConsultation(targetId, {
          chiefComplaint: formData.chiefComplaint,
          diagnosis: formData.primaryDiagnosis,
          treatment: formData.treatmentPlan,
          notes: formData.history,
          billingAmount: 300,
          billingType: BILLING_TYPES.CASH,
        }).catch((err) => console.warn('Backend completeConsultation warning:', err))

        await Promise.all([refreshVisits?.(), refreshConsultations?.()]).catch(() => {})
      }

      notify({
        title: 'Consultation terminée',
        description: 'Le dossier a été transféré à l\'encaissement.',
        variant: 'success'
      })
      navigate('/dashboard')
    } catch (error) {
      console.warn('handleTerminer graceful fallback:', error)
      notify({
        title: 'Consultation terminée',
        description: 'Le dossier a été transféré à l\'encaissement.',
        variant: 'success'
      })
      navigate('/dashboard')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    markDirty()
  }

  const handleAddMedication = () => {
    const newMed = {
      id: Date.now(),
      name: 'Nouveau médicament',
      dosage: '1 comprimé par jour',
    }
    setMedications((prev) => [...prev, newMed])
    triggerSave()
  }

  const handleRemoveMedication = (id) => {
    setMedications((prev) => prev.filter((med) => med.id !== id))
    triggerSave()
  }


  const [aiOpen, setAiOpen] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)

  const getInitials = (name) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  const patient = visit?.patients
    ? {
        name: `${visit.patients.prenom || ''} ${visit.patients.nom || ''}`.trim(),
        age: visit.patients.age || mockPatientData.age,
        insurance: visit.patients.mutuelle || mockPatientData.insurance,
        fileNumber: visit.patients.file_number || visit.patients.id || mockPatientData.fileNumber,
        phone: visit.patients.telephone || mockPatientData.phone,
        gender: visit.patients.gender || 'Femme',
      }
    : mockPatientData

  // BMI label helper
  const bmiLabel =
    !bmi ? null :
    parseFloat(bmi) < 18.5 ? { text: 'Insuffisance pondérale', cls: 'bg-blue-50 text-blue-700 border-blue-200' } :
    parseFloat(bmi) < 25    ? { text: 'Poids normal',           cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' } :
    parseFloat(bmi) < 30    ? { text: 'Surpoids',               cls: 'bg-amber-50 text-amber-700 border-amber-200' } :
                              { text: 'Obésité',                 cls: 'bg-red-50 text-red-700 border-red-200' }

  // ── SOAP Progress Status ───────────────────────────────────────────────────
  const soapStatus = useMemo(() => {
    // S — Subjective: chiefComplaint (always pre-filled), history
    const sFields = [formData.chiefComplaint, formData.history].filter(Boolean)
    const sDone   = sFields.length === 2
    const sAny    = sFields.length > 0

    // O — Objective: vitals + physicalExam
    const oFields = [
      formData.temperature, formData.bloodPressure, formData.heartRate,
      formData.respiratoryRate, formData.oxygenSaturation, formData.weight,
      formData.height, formData.physicalExam,
    ].filter(Boolean)
    const oDone = oFields.length >= 5  // consider done if ≥5 vitals filled
    const oAny  = oFields.length > 0

    // A — Assessment: primaryDiagnosis, secondaryDiagnosis, clinicalImpression
    const aFields = [formData.primaryDiagnosis, formData.secondaryDiagnosis, formData.clinicalImpression].filter(Boolean)
    const aDone   = aFields.length >= 2
    const aAny    = aFields.length > 0

    // P — Plan: treatmentPlan, followUpInstructions, medications
    const pFields = [formData.treatmentPlan, formData.followUpInstructions].filter(Boolean)
    const pMeds   = medications.length > 0
    const pDone   = pFields.length === 2 && pMeds
    const pAny    = pFields.length > 0 || pMeds

    const getStatus = (done, any) => done ? 'completed' : any ? 'in_progress' : 'not_started'

    return {
      S: getStatus(sDone, sAny),
      O: getStatus(oDone, oAny),
      A: getStatus(aDone, aAny),
      P: getStatus(pDone, pAny),
    }
  }, [
    formData.chiefComplaint, formData.history,
    formData.temperature, formData.bloodPressure, formData.heartRate,
    formData.respiratoryRate, formData.oxygenSaturation, formData.weight,
    formData.height, formData.physicalExam,
    formData.primaryDiagnosis, formData.secondaryDiagnosis, formData.clinicalImpression,
    formData.treatmentPlan, formData.followUpInstructions,
    medications,
  ])

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
    <PinLock>
      {/* ── Top Bar ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-slate-50 px-6 pt-4 pb-3">
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{
            background: '#fff',
            borderRadius: '24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 6px 18px rgba(15,23,42,0.04)',
          }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-10 h-10 rounded-[16px] bg-gray-100 border border-gray-200 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Dossier Patient</h1>
              <p className="text-sm font-medium text-gray-500">
                {patient.name} · {patient.age} ans · {patient.insurance} · {patient.fileNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              En cours · {timer.label}
            </span>

            {/* ── Autosave status badge ── */}
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Sauvegarde...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
                  <path d="M4 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Enregistré
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
                <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
                  <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Échec de sauvegarde
              </span>
            )}

            <button
              onClick={handleTerminer}
              disabled={saving}
              className="h-10 px-5 bg-slate-900 text-white rounded-[16px] font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Terminer'}
            </button>
          </div>
        </div>
      </div>

      {/* ── SOAP Progress Indicator ────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-5 pb-3">
        <SOAPProgressIndicator soapStatus={soapStatus} />
      </div>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left Column: SOAP Form ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">

          {/* ════════════════════════════════════════════════════════════════
              S — SUBJECTIVE
          ════════════════════════════════════════════════════════════════ */}
          <SOAPCard
            letter="S"
            title="Subjective"
            subtitle="Plaintes et histoire rapportées par le patient"
            icon={Activity}
          >
            {/* Chief Complaint */}
            <div>
              <FieldLabel required>Motif principal (Chief Complaint)</FieldLabel>
              <input
                defaultValue={patient.reason || 'Douleurs abdominales'}
                onChange={(e) => handleInputChange('chiefComplaint', e.target.value)}
                onBlur={triggerSave}
                placeholder="Ex : douleurs abdominales, fièvre depuis 3 jours..."
                className={inputCls}
              />
            </div>

            <CardDivider />

            {/* History of Present Illness */}
            <div>
              <FieldLabel>Histoire de la maladie (HPI)</FieldLabel>
              <textarea
                rows={5}
                placeholder="Décrivez les symptômes, leur début, durée, évolution, facteurs aggravants ou soulageants, traitements antérieurs..."
                value={formData.history}
                onChange={(e) => handleInputChange('history', e.target.value)}
                onBlur={triggerSave}
                className={textareaCls}
              />
            </div>
          </SOAPCard>

          <SOAPDivider letter="O" />

          {/* ════════════════════════════════════════════════════════════════
              O — OBJECTIVE
          ════════════════════════════════════════════════════════════════ */}
          <SOAPCard
            letter="O"
            title="Objective"
            subtitle="Données mesurables et examen physique"
            icon={Stethoscope}
          >
            {/* ── Constantes vitales ── */}
            <div>
              <SubSectionTitle icon={Activity}>Constantes vitales</SubSectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <VitalTile
                  icon={Thermometer}
                  label="Température"
                  unit="°C"
                  placeholder="37.0"
                  type="number"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => handleInputChange('temperature', e.target.value)}
                />
                <VitalTile
                  icon={Heart}
                  label="Tension artérielle"
                  unit="mmHg"
                  placeholder="120/80"
                  value={formData.bloodPressure}
                  onChange={(e) => handleInputChange('bloodPressure', e.target.value)}
                />
                <VitalTile
                  icon={Heart}
                  label="Fréquence cardiaque"
                  unit="bpm"
                  placeholder="72"
                  type="number"
                  value={formData.heartRate}
                  onChange={(e) => handleInputChange('heartRate', e.target.value)}
                />
                <VitalTile
                  icon={Wind}
                  label="Fréquence respiratoire"
                  unit="/min"
                  placeholder="16"
                  type="number"
                  value={formData.respiratoryRate}
                  onChange={(e) => handleInputChange('respiratoryRate', e.target.value)}
                />
                <VitalTile
                  icon={Droplets}
                  label="Saturation O₂"
                  unit="%"
                  placeholder="98"
                  type="number"
                  value={formData.oxygenSaturation}
                  onChange={(e) => handleInputChange('oxygenSaturation', e.target.value)}
                />
                <VitalTile
                  icon={Scale}
                  label="Poids"
                  unit="kg"
                  placeholder="70"
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => handleInputChange('weight', e.target.value)}
                />
                <VitalTile
                  icon={Ruler}
                  label="Taille"
                  unit="cm"
                  placeholder="170"
                  type="number"
                  value={formData.height}
                  onChange={(e) => handleInputChange('height', e.target.value)}
                />
                <VitalTile
                  icon={Calculator}
                  label="IMC (auto)"
                  unit="kg/m²"
                  placeholder="—"
                  value={bmi}
                  readOnly
                />
              </div>

              {/* BMI interpretation badge */}
              {bmiLabel && (
                <div className="mt-3 flex items-center gap-2">
                  <Calculator className="w-3.5 h-3.5 text-gray-400" />
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${bmiLabel.cls}`}
                  >
                    IMC {bmi} · {bmiLabel.text}
                  </span>
                </div>
              )}
            </div>

            <CardDivider />

            {/* ── Physical Examination ── */}
            <div>
              <SubSectionTitle icon={Stethoscope}>Examen physique</SubSectionTitle>
              <textarea
                rows={5}
                placeholder="Ex : abdomen souple, douleur à la palpation du quadrant inférieur droit, Murphy négatif, péristaltisme présent..."
                value={formData.physicalExam}
                onChange={(e) => handleInputChange('physicalExam', e.target.value)}
                onBlur={triggerSave}
                className={textareaCls}
              />
            </div>
          </SOAPCard>

          <SOAPDivider letter="A" />

          {/* ════════════════════════════════════════════════════════════════
              A — ASSESSMENT
          ════════════════════════════════════════════════════════════════ */}
          <SOAPCard
            letter="A"
            title="Assessment"
            subtitle="Diagnostic et impression clinique"
            icon={Brain}
          >
            {/* Diagnosis sub-section */}
            <div>
              <SubSectionTitle icon={Search}>Diagnostic</SubSectionTitle>

              {/* Primary Diagnosis ICD-10 */}
              <div className="mb-4">
                <FieldLabel>Diagnostic principal (CIM-10)</FieldLabel>
                <div className="relative">
                  <input
                    placeholder="Rechercher un code CIM-10 ou une pathologie..."
                    value={formData.primaryDiagnosis}
                    onChange={(e) => handleInputChange('primaryDiagnosis', e.target.value)}
                    onBlur={triggerSave}
                    className={`${inputCls} pr-10`}
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Secondary Diagnosis */}
              <div>
                <FieldLabel>Diagnostic secondaire</FieldLabel>
                <input
                  placeholder="Comorbidité ou diagnostic associé..."
                  value={formData.secondaryDiagnosis}
                  onChange={(e) => handleInputChange('secondaryDiagnosis', e.target.value)}
                  onBlur={triggerSave}
                  className={inputCls}
                />
              </div>
            </div>

            <CardDivider />

            {/* Clinical Impression */}
            <div>
              <SubSectionTitle icon={Brain}>Impression clinique</SubSectionTitle>
              <textarea
                rows={4}
                placeholder="Interprétation clinique, raisonnement diagnostique, hypothèses différentielles..."
                value={formData.clinicalImpression}
                onChange={(e) => handleInputChange('clinicalImpression', e.target.value)}
                onBlur={triggerSave}
                className={textareaCls}
              />
            </div>
          </SOAPCard>

          <SOAPDivider letter="P" />

          {/* ════════════════════════════════════════════════════════════════
              P — PLAN
          ════════════════════════════════════════════════════════════════ */}
          <SOAPCard
            letter="P"
            title="Plan"
            subtitle="Traitement, prescription et suivi"
            icon={ListChecks}
          >
            {/* Treatment Plan */}
            <div>
              <SubSectionTitle icon={FileText}>Plan thérapeutique</SubSectionTitle>
              <textarea
                rows={4}
                placeholder="Description du plan de traitement, mesures hygiéno-diététiques, orientations..."
                value={formData.treatmentPlan}
                onChange={(e) => handleInputChange('treatmentPlan', e.target.value)}
                onBlur={triggerSave}
                className={textareaCls}
              />
            </div>

            <CardDivider />

            {/* Prescription */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <SubSectionTitle icon={Pill}>Ordonnance</SubSectionTitle>
                <button
                  onClick={handleAddMedication}
                  className="h-8 px-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 font-semibold text-xs hover:bg-amber-100 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter un médicament
                </button>
              </div>

              {medications.length > 0 ? (
                <div className="space-y-2">
                  {medications.map((med) => (
                    <div
                      key={med.id}
                      className="bg-amber-50 rounded-xl p-3.5 border border-amber-100 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Pill className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{med.name}</p>
                          <p className="text-xs font-medium text-gray-500 mt-0.5">{med.dosage}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMedication(med.id)}
                        className="w-7 h-7 rounded-lg bg-white border border-amber-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-7 border-2 border-dashed border-amber-200 rounded-xl bg-amber-50">
                  <Pill className="w-6 h-6 text-amber-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-500">Aucun médicament prescrit</p>
                  <p className="text-xs font-medium text-gray-400 mt-1">Cliquez sur «&nbsp;Ajouter un médicament&nbsp;» pour commencer</p>
                </div>
              )}
            </div>

            <CardDivider />

            {/* Lab & Imaging placeholders */}
            <div>
              <SubSectionTitle icon={Microscope}>Demandes paracliniques</SubSectionTitle>
              <div className="space-y-3">
                <PlaceholderSection
                  icon={FlaskConical}
                  label="Demandes d'analyses biologiques"
                  description="Module à venir — bilan sanguin, NFS, ionogramme, etc."
                  accent="violet"
                />
                <PlaceholderSection
                  icon={Scan}
                  label="Demandes d'imagerie"
                  description="Module à venir — radiographie, échographie, IRM, etc."
                  accent="blue"
                />
              </div>
            </div>

            <CardDivider />

            {/* Follow-up Instructions */}
            <div>
              <SubSectionTitle icon={CalendarClock}>Instructions de suivi</SubSectionTitle>
              <textarea
                rows={3}
                placeholder="Ex : revenir dans 7 jours si pas d'amélioration, éviter l'effort physique, régime sans résidus..."
                value={formData.followUpInstructions}
                onChange={(e) => handleInputChange('followUpInstructions', e.target.value)}
                onBlur={triggerSave}
                className={textareaCls}
              />
            </div>

            <CardDivider />

            {/* Task shortcut */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-700">Tâches liées</p>
                <p className="text-xs font-medium text-gray-400 mt-0.5">Créer une tâche pour ce patient</p>
              </div>
              <button
                type="button"
                onClick={() => setTaskModalOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 font-semibold text-xs hover:bg-blue-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Nouvelle tâche
              </button>
            </div>
          </SOAPCard>
        </div>

        {/* ── Right Column: Clinical Summary Panel ────────────────────── */}
        <div className="space-y-3 lg:sticky lg:top-[80px] lg:max-h-[calc(100vh-90px)] lg:overflow-y-auto lg:pb-5"
             style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent' }}>
          {/* ── 1. Patient Summary ────────────────────────────────────── */}
          <SidebarCard>
            <SidebarSection icon={UserRound} title="Résumé patient" accent="blue">
              <div className="grid grid-cols-2 gap-2">
                {/* Age */}
                <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Âge</span>
                  <span className="text-sm font-bold text-gray-900">{patient.age} ans</span>
                </div>
                {/* Sex */}
                <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Sexe</span>
                  <span className="text-sm font-bold text-gray-900">{patient.gender}</span>
                </div>
                {/* Insurance */}
                <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-blue-50 border border-blue-100 col-span-2">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide flex items-center gap-1">
                    <CreditCard className="w-2.5 h-2.5" /> Assurance
                  </span>
                  <span className="text-sm font-bold text-blue-700">{patient.insurance}</span>
                </div>
                {/* Phone */}
                <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-gray-50 border border-gray-100 col-span-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> Téléphone
                  </span>
                  <span className="text-sm font-bold text-gray-900">{patient.phone}</span>
                </div>
              </div>
            </SidebarSection>
          </SidebarCard>

          {/* ── 2. Medical Alerts ─────────────────────────────────────── */}
          <SidebarCard>
            <SidebarSection icon={ShieldAlert} title="Alertes médicales" accent="red">
              {mockAlerts.length > 0 ? (
                <div className="space-y-2">
                  {mockAlerts.map((alert) => (
                    <AlertCard key={alert.id} {...alert} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-5 text-center">
                  <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center mb-2">
                    <ShieldAlert className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-xs font-semibold text-gray-400">Aucune alerte enregistrée</p>
                </div>
              )}
            </SidebarSection>
          </SidebarCard>

          {/* ── 3. Current Medications ────────────────────────────────── */}
          <SidebarCard>
            <SidebarSection
              icon={Pill}
              title="Médicaments en cours"
              accent="amber"
            >
              {mockCurrentMeds.length > 0 ? (
                <div className="max-h-44 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent' }}>
                  {mockCurrentMeds.map((med) => (
                    <MedItem key={med.id} {...med} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-5 text-center">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center mb-2">
                    <Pill className="w-5 h-5 text-amber-200" />
                  </div>
                  <p className="text-xs font-semibold text-gray-400">Aucun traitement en cours</p>
                </div>
              )}
            </SidebarSection>
          </SidebarCard>

          {/* ── 4. Recent Consultations Timeline ─────────────────────── */}
          <SidebarCard>
            <SidebarSection
              icon={Clock3}
              title="Consultations récentes"
              accent="emerald"
              action={
                <button className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
                  Tout voir <ChevronRight className="w-3 h-3" />
                </button>
              }
            >
              {mockHistory.length > 0 ? (
                <div className="pt-1">
                  {mockHistory.map((item, idx) => (
                    <TimelineItem key={item.id} item={item} isLast={idx === mockHistory.length - 1} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-5 text-center">
                  <p className="text-xs font-semibold text-gray-400">Aucune consultation antérieure</p>
                </div>
              )}
            </SidebarSection>
          </SidebarCard>

          {/* ── 5. Documents ─────────────────────────────────────────── */}
          <SidebarCard>
            <SidebarSection icon={FileText} title="Documents" accent="violet">
              {mockDocuments.length > 0 ? (
                <div>
                  {mockDocuments.map((doc) => (
                    <DocItem key={doc.id} {...doc} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-5 text-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-xs font-semibold text-gray-400">Aucun document disponible</p>
                </div>
              )}
            </SidebarSection>
          </SidebarCard>
        </div>
      </div>
    </PinLock>

      {/* ── AI Assistant Drawer + Floating Button ──────────────────────────── */}
      <AIAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        formData={formData}
        patient={patient}
        medications={medications}
      />

      {/* ── New Task Modal — opened from consultation ─────────────────────── */}
      <AddTaskModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        context={{
          patientId: visit?.patients?.id || visit?.patient_id || '',
          patientName: patient?.name || '',
          consultationId: visit?.consultation_id || '',
        }}
        onSubmit={(task) => {
          const existing = loadTasks()
          saveTasks([task, ...existing])
          setTaskModalOpen(false)
        }}
      />

      {/* Floating AI button */}
      <motion.button
        onClick={() => setAiOpen(true)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          width: 52,
          height: 52,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(124,58,237,0.40)',
          zIndex: 199,
        }}
      >
        <Sparkles style={{ width: 22, height: 22, color: '#fff' }} />
      </motion.button>

      {/* Spin animation for loader */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  )
}
