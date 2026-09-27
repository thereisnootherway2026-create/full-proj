import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Loader2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  AlertTriangle,
  UserPlus,
  Clock,
  Sparkles,
  Stethoscope,
  RotateCcw,
  Check,
  Search,
  CheckCircle2,
  Shield,
  FileText
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import Modal from '../common/Modal'
import Select from '../common/Select'
import Button from '../common/Button'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppContext } from '../../context/AppContext'
import { useCabinetId } from '../../hooks/useCabinetId'
import { useAvailableSlots } from '../../hooks/useAvailableSlots'
import { createPatient, createRdv, getPatients, updateRdv as apiUpdateRdv } from '../../lib/api'
import {
  useAgendaConfig,
  bookableTimes,
  DURATION_CHOICES,
  findOverlappingAppointment,
  isOverlapError,
} from '../../lib/agendaConfig'

// Helper Functions for Appointment Meta
const META_PREFIX = '__AGENDA_META__'

const parseAppointmentMeta = (notes) => {
  if (!notes) {
    return {
      clinicalContext: '',
      doctorNote: '',
    }
  }

  if (!notes.startsWith(META_PREFIX)) {
    return {
      clinicalContext: notes,
      doctorNote: '',
    }
  }

  try {
    const parsed = JSON.parse(notes.slice(META_PREFIX.length))
    return {
      clinicalContext: parsed.clinicalContext || '',
      doctorNote: parsed.doctorNote || parsed.notesMedecin || '',
      ...parsed,
    }
  } catch {
    return {
      clinicalContext: '',
      doctorNote: '',
    }
  }
}

const buildAppointmentMeta = (notes, overrides) => {
  const current = parseAppointmentMeta(notes)
  return `${META_PREFIX}${JSON.stringify({
    confirmationState: current.confirmationState || 'PLANIFIE',
    confirmedAt: current.confirmedAt || null,
    confirmedBy: current.confirmedBy || null,
    clinicalContext: current.clinicalContext || '',
    doctorNote: current.doctorNote || '',
    patientName: current.patientName || '',
    phone: current.phone || '',
    type: current.type || 'Consultation',
    ...overrides,
  })}`
}

/**
 * Standard Appointment Types with color dot system:
 * blue = Consultation, purple = Suivi, green = Première consultation, red = Urgence
 */
const DEFAULT_APPOINTMENT_TYPES = [
  {
    value: 'Consultation',
    label: 'Consultation',
    description: 'Consultation standard ou bilan',
    dureeMinutes: 30,
    color: '#3b82f6',
    dotClass: 'bg-blue-500',
    icon: Stethoscope,
  },
  {
    value: 'Suivi',
    label: 'Suivi',
    description: 'Contrôle d’évolution & renouvellement',
    dureeMinutes: 20,
    color: '#8b5cf6',
    dotClass: 'bg-purple-500',
    icon: RotateCcw,
  },
  {
    value: 'Première consultation',
    label: 'Première consultation',
    description: 'Nouveau patient, dossier médical initial',
    dureeMinutes: 45,
    color: '#10b981',
    dotClass: 'bg-emerald-500',
    icon: UserPlus,
  },
  {
    value: 'Urgence',
    label: 'Urgence',
    description: 'Symptômes aigus, prise en charge immédiate',
    dureeMinutes: 15,
    color: '#ef4444',
    dotClass: 'bg-rose-500',
    icon: AlertTriangle,
  },
  {
    value: 'Examen / Analyse',
    label: 'Examen / Analyse',
    description: 'Examen clinique ciblé ou prélèvements',
    dureeMinutes: 30,
    color: '#0ea5e9',
    dotClass: 'bg-sky-500',
    icon: FileText,
  },
]

const MOTIF_SUGGESTIONS = [
  'Contrôle de routine',
  'Renouvellement ordonnance',
  'Résultats d’analyses',
  'Douleurs aiguës',
  'Suivi traitement',
]

/**
 * Motif Selector Component:
 * Single-select chips as primary input (filled state on selection).
 * "Autre" chip reveals an animated small textarea only when selected.
 */
function MotifField({ value = '', onChange, onBlur, error }) {
  const isPreset = MOTIF_SUGGESTIONS.some(
    (s) => s.toLowerCase() === (value || '').trim().toLowerCase()
  )
  const isAutre = Boolean(value && !isPreset)

  const [activeChip, setActiveChip] = useState(() => {
    if (!value) return ''
    if (isPreset) {
      return MOTIF_SUGGESTIONS.find(
        (s) => s.toLowerCase() === value.trim().toLowerCase()
      ) || ''
    }
    return 'Autre'
  })

  const [customText, setCustomText] = useState(() => (isAutre ? value : ''))

  useEffect(() => {
    if (!value) {
      setActiveChip('')
      setCustomText('')
    } else {
      const match = MOTIF_SUGGESTIONS.find(
        (s) => s.toLowerCase() === value.trim().toLowerCase()
      )
      if (match) {
        setActiveChip(match)
      } else {
        setActiveChip('Autre')
        setCustomText(value)
      }
    }
  }, [value])

  const handleChipClick = (suggestion) => {
    if (suggestion === 'Autre') {
      setActiveChip('Autre')
      onChange(customText)
    } else {
      setActiveChip(suggestion)
      onChange(suggestion)
    }
  }

  const handleCustomTextChange = (e) => {
    const text = e.target.value
    setCustomText(text)
    onChange(text)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {MOTIF_SUGGESTIONS.map((suggestion) => {
          const isSelected = activeChip === suggestion
          return (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleChipClick(suggestion)}
              className={cn(
                'inline-flex items-center px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all cursor-pointer border select-none',
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
              )}
            >
              {suggestion}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => handleChipClick('Autre')}
          className={cn(
            'inline-flex items-center px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all cursor-pointer border select-none',
            activeChip === 'Autre'
              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
          )}
        >
          Autre
        </button>
      </div>

      <AnimatePresence>
        {activeChip === 'Autre' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden pt-1"
          >
            <textarea
              value={customText}
              onChange={handleCustomTextChange}
              onBlur={onBlur}
              placeholder="Précisez le motif du rendez-vous..."
              rows={2}
              className={cn(
                'w-full resize-none rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all',
                error ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''
              )}
              autoFocus
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Merged Type & Durée Field:
 * Single row showing selected type (dot + label) as primary element,
 * with duration as a secondary badge button that opens an override dropdown.
 */
function TypeAndDurationField({
  typeValue,
  durationValue,
  onTypeChange,
  onDurationChange,
  availableTypes,
}) {
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const [showDurationDropdown, setShowDurationDropdown] = useState(false)
  const typeMenuRef = useRef(null)
  const durationMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target)) {
        setShowTypeDropdown(false)
      }
      if (durationMenuRef.current && !durationMenuRef.current.contains(e.target)) {
        setShowDurationDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedTypeObj = availableTypes.find(
    (t) => t.value.toLowerCase() === (typeValue || '').toLowerCase()
  ) || availableTypes[0]

  return (
    <div className="flex items-center gap-2 relative">
      {/* Primary Element: Consultation Type Selector */}
      <div ref={typeMenuRef} className="flex-1 relative">
        <button
          type="button"
          onClick={() => setShowTypeDropdown((prev) => !prev)}
          className="w-full h-[44px] px-3.5 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-[10px] text-[#111827] text-[14px] font-semibold flex items-center justify-between transition-all focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer shadow-2xs"
        >
          <div className="flex items-center gap-2.5 truncate">
            <span
              className={cn(
                'w-3 h-3 rounded-full flex-shrink-0',
                selectedTypeObj?.dotClass || 'bg-blue-500'
              )}
            />
            <span className="truncate">{selectedTypeObj?.label || typeValue}</span>
          </div>
          <ChevronDown size={16} className="text-slate-400 flex-shrink-0 ml-1" />
        </button>

        {showTypeDropdown && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-[10px] border border-slate-200 bg-white shadow-lg py-1.5 max-h-60 overflow-y-auto">
            {availableTypes.map((t) => {
              const isCurrent = t.value.toLowerCase() === (typeValue || '').toLowerCase()
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    onTypeChange(t.value, t.dureeMinutes)
                    setShowTypeDropdown(false)
                  }}
                  className={cn(
                    'w-full px-3.5 py-2.5 text-left flex items-center justify-between text-xs font-semibold transition-colors hover:bg-slate-50 cursor-pointer',
                    isCurrent ? 'bg-blue-50/60 text-blue-700' : 'text-slate-800'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn('w-2.5 h-2.5 rounded-full', t.dotClass || 'bg-blue-500')} />
                    <span>{t.label}</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400">{t.dureeMinutes} min</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Secondary Element: Duration Override Badge */}
      <div ref={durationMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setShowDurationDropdown((prev) => !prev)}
          className="h-[44px] px-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-[10px] text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs select-none"
          title="Modifier la durée"
        >
          <Clock size={14} className="text-slate-500" />
          <span>{durationValue} min</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>

        {showDurationDropdown && (
          <div className="absolute right-0 top-full mt-1 z-50 w-32 rounded-[10px] border border-slate-200 bg-white shadow-lg py-1.5">
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Durée
            </div>
            {DURATION_CHOICES.map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => {
                  onDurationChange(dur)
                  setShowDurationDropdown(false)
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs font-semibold transition-colors hover:bg-slate-50 cursor-pointer flex items-center justify-between',
                  dur === durationValue ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700'
                )}
              >
                <span>{dur} min</span>
                {dur === durationValue && <Check size={13} className="text-blue-600" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// French date format helpers (DD/MM/YYYY <-> YYYY-MM-DD)
const isoToFrDate = (iso) => {
  if (!iso || typeof iso !== 'string') return ''
  const parts = iso.split('-')
  if (parts.length === 3) {
    const [y, m, d] = parts
    if (y && m && d) {
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`
    }
  }
  return iso
}

const frDateToIso = (fr) => {
  if (!fr || typeof fr !== 'string') return ''
  const clean = fr.trim().replace(/[-.]/g, '/')
  const parts = clean.split('/')
  if (parts.length === 3) {
    const [d, m, y] = parts
    if (d && m && y && y.length === 4) {
      const day = parseInt(d, 10)
      const month = parseInt(m, 10)
      const year = parseInt(y, 10)
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
  }
  return ''
}

function ConsultationTypeCards({ availableTypes, value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {availableTypes.map((type) => {
        const Icon = type.icon || Stethoscope
        const isSelected = value.toLowerCase() === type.value.toLowerCase()

        return (
          <Button
            key={type.value}
            variant={isSelected ? 'accentOutline' : 'secondary'}
            aria-pressed={isSelected}
            onClick={() => onChange(type.value, type.dureeMinutes)}
            className={cn(
              'group grid w-full min-h-[62px] grid-cols-[2rem_minmax(0,1fr)] items-center justify-start gap-3 rounded-[10px] px-3 text-left whitespace-normal',
              isSelected
                ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/15 hover:bg-blue-100'
                : 'hover:border-blue-200'
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600'
              )}
            >
              <Icon size={16} />
            </span>
            <span className="min-w-0 self-center">
              <span className="block truncate text-xs font-bold">{type.label}</span>
              <span className={cn('mt-0.5 block text-[11px] font-medium', isSelected ? 'text-blue-600' : 'text-slate-400')}>
                {type.dureeMinutes} min
              </span>
            </span>
          </Button>
        )
      })}
    </div>
  )
}

/**
 * French Date Input with cleanly anchored picker positioning
 */
function FrenchDateInput({ value, onChange, onBlur, className }) {
  const pickerRef = useRef(null)
  const calendarRef = useRef(null)
  const [displayText, setDisplayText] = useState(() => isoToFrDate(value))
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [calendarPosition, setCalendarPosition] = useState(null)
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [year, month] = value.split('-').map(Number)
      return new Date(year, month - 1, 1)
    }
    return new Date()
  })

  useEffect(() => {
    setDisplayText(isoToFrDate(value))
    if (value && !isPickerOpen) {
      const [year, month] = value.split('-').map(Number)
      setViewDate(new Date(year, month - 1, 1))
    }
  }, [value, isPickerOpen])

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      const isInInput = pickerRef.current?.contains(event.target)
      const isInCalendar = calendarRef.current?.contains(event.target)
      if (!isInInput && !isInCalendar) {
        setIsPickerOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  const positionCalendar = () => {
    const trigger = pickerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const calendarWidth = Math.min(280, window.innerWidth - 16)
    const calendarHeight = 320
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const opensAbove = spaceBelow < calendarHeight && spaceAbove > spaceBelow

    setCalendarPosition({
      top: Math.max(8, opensAbove ? rect.top - calendarHeight - 8 : rect.bottom + 8),
      left: Math.min(Math.max(8, rect.left), window.innerWidth - calendarWidth - 8),
      width: calendarWidth,
      maxHeight: 'calc(100vh - 16px)',
      placement: opensAbove ? 'top' : 'bottom',
    })
  }

  const toggleCalendar = () => {
    if (!isPickerOpen) positionCalendar()
    setIsPickerOpen((open) => !open)
  }

  useEffect(() => {
    if (!isPickerOpen) return undefined

    positionCalendar()
    window.addEventListener('resize', positionCalendar)
    window.addEventListener('scroll', positionCalendar, true)
    return () => {
      window.removeEventListener('resize', positionCalendar)
      window.removeEventListener('scroll', positionCalendar, true)
    }
  }, [isPickerOpen])

  const handleTextChange = (e) => {
    const raw = e.target.value
    setDisplayText(raw)
    const iso = frDateToIso(raw)
    if (iso) {
      onChange(iso)
    }
  }

  const handleBlur = (e) => {
    const iso = frDateToIso(displayText)
    if (iso) {
      onChange(iso)
      setDisplayText(isoToFrDate(iso))
    } else if (value) {
      setDisplayText(isoToFrDate(value))
    }
    onBlur?.(e)
  }

  const selectDay = (day) => {
    const iso = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange(iso)
    setDisplayText(isoToFrDate(iso))
    setIsPickerOpen(false)
  }

  const selectToday = () => {
    const now = new Date()
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
    onChange(iso)
    setDisplayText(isoToFrDate(iso))
    setIsPickerOpen(false)
  }

  const selectedDay = value ? Number(value.split('-')[2]) : null
  const selectedMonth = value ? Number(value.split('-')[1]) - 1 : null
  const selectedYear = value ? Number(value.split('-')[0]) : null
  const today = new Date()
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  const firstWeekday = (monthStart.getDay() + 6) % 7
  const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(viewDate)

  return (
    <div ref={pickerRef} className="relative w-full">
      <div className="relative flex items-center group w-full">
        <input
          type="text"
          value={displayText}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder="JJ/MM/AAAA"
          className={cn(className, 'pr-10')}
        />
        <button
          type="button"
          onClick={toggleCalendar}
          aria-label="Choisir une date"
          aria-expanded={isPickerOpen}
          className="absolute right-2.5 top-1/2 z-20 -translate-y-1/2 rounded-[7px] p-1.5 text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-600 active:scale-95 focus:outline-none cursor-pointer"
        >
          <Calendar size={18} />
        </button>
      </div>
      {isPickerOpen && calendarPosition && createPortal(
        <motion.div
          ref={calendarRef}
          initial={{ opacity: 0, y: calendarPosition.placement === 'top' ? 6 : -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          style={calendarPosition}
          className="fixed z-[160] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2.5 shadow-[0_12px_24px_-12px_rgba(15,23,42,0.22)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} aria-label="Mois précédent" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95">
              <ChevronLeft size={17} />
            </button>
            <span className="capitalize text-sm font-bold text-slate-800">{monthLabel}</span>
            <button type="button" onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} aria-label="Mois suivant" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95">
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, index) => <span key={`empty-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
              const isSelected = selectedDay === day && selectedMonth === viewDate.getMonth() && selectedYear === viewDate.getFullYear()
              const isToday = today.getDate() === day && today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear()
              return (
                <button key={day} type="button" onClick={() => selectDay(day)} className={cn(
                  'flex h-8 items-center justify-center rounded-[8px] text-xs font-semibold transition-all active:scale-95',
                  isSelected ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25' : isToday ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-100' : 'text-slate-700 hover:bg-slate-100'
                )}>
                  {day}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={selectToday} className="mt-3 w-full rounded-[8px] border border-slate-200 bg-white py-2 text-xs font-bold text-blue-600 transition-all hover:border-blue-200 hover:bg-blue-50 active:scale-[0.98]">
            Aujourd’hui
          </button>
        </motion.div>,
        document.body
      )}
    </div>
  )
}

const mutuelles = [
  'Aucune',
  'CNSS',
  'RAMED',
  'CNOPS',
  'Assurance privée',
  'Autre',
]

const mutuelleOptions = mutuelles.map((m) => ({
  value: m,
  label: m,
}))

const hm = (iso) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const overlapMessage = (conflict) => {
  if (!conflict) {
    return 'Ce créneau chevauche un autre rendez-vous. Choisissez une autre heure ou une durée plus courte.'
  }
  const who = `${conflict.patients?.prenom || ''} ${conflict.patients?.nom || ''}`.trim() || 'un autre patient'
  const range = conflict.end_time ? `${hm(conflict.date_rdv)}–${hm(conflict.end_time)}` : hm(conflict.date_rdv)
  return `Ce créneau chevauche le rendez-vous de ${who} (${range}). Choisissez une autre heure ou une durée plus courte.`
}

const parseName = (fullName) => {
  const trimmed = fullName.trim()
  if (!trimmed) return { prenom: '', nom: '' }
  const cleaned = trimmed.replace(/^(Dr\.?|M\.?|Mme\.?|Mr\.?|Ms\.?)\s*/i, '')
  const parts = cleaned.split(' ')
  if (parts.length === 1) {
    return { prenom: parts[0], nom: '' }
  }
  const nom = parts.pop() || ''
  const prenom = parts.join(' ')
  return { prenom, nom }
}

const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, '')
  let formatted = ''

  if (digits.startsWith('212')) {
    formatted = '+212 '
    const rest = digits.slice(3)
    for (let i = 0; i < rest.length && i < 9; i++) {
      if (i === 1 || i === 3 || i === 5 || i === 7) formatted += ' '
      formatted += rest[i]
    }
  } else {
    for (let i = 0; i < digits.length && i < 10; i++) {
      if (i > 0 && i % 2 === 0) formatted += ' '
      formatted += digits[i]
    }
  }
  return formatted
}

function AppointmentFormModal({
  open,
  onClose,
  appointment,
  initialPatient,
  onSuccess,
  initialDate,
  initialTime,
  doctorId,
}) {
  const { notify, refreshRdv, refreshVisits } = useAppContext()
  const { cabinetId } = useCabinetId()
  const queryClient = useQueryClient()

  // Real Supabase patient list
  const { data: livePatients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: getPatients,
    enabled: open,
  })

  // Agenda settings & types
  const agenda = useAgendaConfig(cabinetId)

  // Map types with proper color dot classes
  const availableTypes = useMemo(() => {
    const list = agenda.types && agenda.types.length > 0 ? agenda.types : DEFAULT_APPOINTMENT_TYPES
    return list.map((t) => {
      const val = t.libelle || t.value
      const lower = val.toLowerCase()
      let dotClass = 'bg-blue-500'
      if (lower.includes('suivi')) dotClass = 'bg-purple-500'
      else if (lower.includes('première') || lower.includes('premiere')) dotClass = 'bg-emerald-500'
      else if (lower.includes('urgence')) dotClass = 'bg-rose-500'
      else if (lower.includes('examen') || lower.includes('analyse')) dotClass = 'bg-sky-500'

      return {
        value: val,
        label: val,
        description: t.description || '',
        dureeMinutes: t.duree_minutes || t.dureeMinutes || 30,
        color: t.couleur || t.color || '#3b82f6',
        dotClass,
        // Keep the visual identity supplied by the default consultation types.
        // Without this, every card falls back to Stethoscope below.
        icon: t.icon || DEFAULT_APPOINTMENT_TYPES.find((defaultType) =>
          defaultType.value.toLowerCase() === val.toLowerCase()
        )?.icon || Stethoscope,
      }
    })
  }, [agenda.types])

  const findType = (name) => {
    const key = String(name || '').trim().toLowerCase()
    return availableTypes.find((t) => t.value.trim().toLowerCase() === key) || null
  }

  const effectiveDuree = (form) =>
    form.duree || findType(form.type)?.dureeMinutes || agenda.settings.dureeDefautMinutes || 30

  const timeOptionsFor = (current, form) => {
    const times = bookableTimes(agenda.settings)
    if (current && !times.includes(current)) times.push(current)
    return times.sort().map((t) => {
      const isOccupied = Boolean(
        form?.date && !isSlotValid(form.date, t, effectiveDuree(form))
      )

      return {
        value: t,
        label: t,
        disabled: isOccupied,
        description: isOccupied ? 'Indisponible' : '',
      }
    })
  }

  const isSelectedTimeOccupied = (form) => Boolean(
    form?.date && form?.heure && !isSlotValid(form.date, form.heure, effectiveDuree(form))
  )

  // Columns sent to DB
  const scheduleFields = (form) =>
    agenda.schemaReady
      ? {
          duree_minutes: effectiveDuree(form),
          type_consultation_id: findType(form.type)?.id || null,
        }
      : {}

  // Overlap pre-check
  const blockedByOverlap = async (form) => {
    const conflict = await findOverlappingAppointment({
      cabinetId,
      startIso: new Date(`${form.date}T${form.heure}:00`).toISOString(),
      dureeMinutes: effectiveDuree(form),
      excludeId: appointment?.id,
      schemaReady: agenda.schemaReady,
    })
    if (!conflict) return false
    notify({
      title: 'Créneau déjà occupé',
      description: overlapMessage(conflict),
      variant: 'destructive',
    })
    return true
  }

  // State Management
  const [modalState, setModalState] = useState('existing')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})

  // Smart Slot Availability & Manual entry toggle
  const [selectedSlotKey, setSelectedSlotKey] = useState(null)
  const [showManualDateTime, setShowManualDateTime] = useState(false)
  const [slotConflictWarning, setSlotConflictWarning] = useState('')

  // Form Data State
  const [existingForm, setExistingForm] = useState({
    patientId: '',
    telephone: '',
    motif: '',
    date: '',
    heure: '08:00',
    type: 'Consultation',
    duree: 30,
    notes: '',
  })

  const [rdvRapideForm, setRdvRapideForm] = useState({
    nomPrenom: '',
    telephone: '',
    motif: '',
    date: '',
    heure: '08:00',
    type: 'Consultation',
    duree: 30,
    notes: '',
  })

  const [dossierCompletForm, setDossierCompletForm] = useState({
    nom: '',
    prenom: '',
    telephone: '',
    dateNaissance: '',
    sexe: '',
    cin: '',
    adresse: '',
    mutuelle: 'Aucune',
    motif: '',
    date: '',
    heure: '08:00',
    type: 'Consultation',
    duree: 30,
    notes: '',
  })

  // Hook for Smart Availability Suggestions
  const currentEffectiveDuration = effectiveDuree(existingForm)
  const {
    slots: smartSlots,
    isLoading: isSlotsLoading,
    isSlotValid,
  } = useAvailableSlots({
    cabinetId,
    doctorId,
    durationMinutes: currentEffectiveDuration,
    excludeAppointmentId: appointment?.id,
    enabled: open,
    lookaheadDays: 7,
  })

  // Initialize Data when Modal opens
  useEffect(() => {
    if (open) {
      const todayCasablanca = new Date().toLocaleDateString('fr-CA', {
        timeZone: 'Africa/Casablanca',
      })
      const initialDateValue = initialDate || todayCasablanca

      setModalState('existing')
      setSearchQuery('')
      setSelectedPatient(null)
      setShowDropdown(false)
      setTouched({})
      setErrors({})
      setSelectedSlotKey(null)
      setShowManualDateTime(false)
      setSlotConflictWarning('')

      if (appointment) {
        const meta = parseAppointmentMeta(appointment.notes)
        setSearchQuery(
          `${appointment.patients?.prenom || ''} ${appointment.patients?.nom || ''}`.trim()
        )
        setSelectedPatient(appointment.patients)
        const dt = new Date(appointment.date_rdv)
        const datePart = !isNaN(dt)
          ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
          : initialDateValue
        const timePart = !isNaN(dt)
          ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
          : initialTime || '08:00'

        const initialType = meta.type || 'Consultation'
        const initialDur = appointment.duree_minutes || findType(initialType)?.dureeMinutes || 30

        setExistingForm({
          patientId: appointment.patient_id || appointment.patientId,
          telephone: appointment.patients?.telephone || '',
          motif: meta.clinicalContext || '',
          date: datePart,
          heure: timePart,
          type: initialType,
          duree: initialDur,
          notes: meta.doctorNote || '',
        })
        setShowManualDateTime(true) // Keep manual open when editing existing rdv
      } else if (initialPatient) {
        const patientName = `${initialPatient.prenom || ''} ${initialPatient.nom || ''}`.trim()
        setSearchQuery(patientName)
        setSelectedPatient(initialPatient)
        setExistingForm({
          patientId: initialPatient.id,
          telephone: initialPatient.telephone || '',
          motif: '',
          date: initialDateValue,
          heure: initialTime || '08:00',
          type: 'Consultation',
          duree: 30,
          notes: '',
        })
      } else {
        setExistingForm({
          patientId: '',
          telephone: '',
          motif: '',
          date: initialDateValue,
          heure: initialTime || '08:00',
          type: 'Consultation',
          duree: 30,
          notes: '',
        })

        setRdvRapideForm({
          nomPrenom: '',
          telephone: '',
          motif: '',
          date: initialDateValue,
          heure: initialTime || '08:00',
          type: 'Consultation',
          duree: 30,
          notes: '',
        })

        setDossierCompletForm({
          nom: '',
          prenom: '',
          telephone: '',
          dateNaissance: '',
          sexe: '',
          cin: '',
          adresse: '',
          mutuelle: 'Aucune',
          motif: '',
          date: initialDateValue,
          heure: initialTime || '08:00',
          type: 'Consultation',
          duree: 30,
          notes: '',
        })
      }
    }
  }, [open, appointment, initialPatient, initialDate, initialTime])

  // Filter patients based on search query
  const filteredPatients = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return []
    return livePatients.filter(
      (p) =>
        `${p.prenom || ''} ${p.nom || ''}`.toLowerCase().includes(query) ||
        (p.telephone || '').includes(query) ||
        (p.cin || '').toLowerCase().includes(query)
    )
  }, [searchQuery, livePatients])

  // Handle Patient Selection
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient)
    setSearchQuery(`${patient.prenom || ''} ${patient.nom || ''}`.trim())
    setExistingForm((prev) => ({
      ...prev,
      patientId: patient.id,
      telephone: patient.telephone || '',
    }))
    setShowDropdown(false)
    setTouched((prev) => ({ ...prev, searchQuery: false }))
  }

  // Handle Clearing Patient to Reopen Search
  const handleClearPatient = () => {
    setSelectedPatient(null)
    setSearchQuery('')
    setShowDropdown(false)
  }

  // Handle Search Input Change
  const handleSearchChange = (value) => {
    setSearchQuery(value)
    setSelectedPatient(null)
    setShowDropdown(true)

    setTimeout(() => {
      if (value.trim() && selectedPatient === null) {
        const filtered = livePatients.filter(
          (p) =>
            `${p.prenom || ''} ${p.nom || ''}`.toLowerCase().includes(value.toLowerCase()) ||
            (p.telephone || '').includes(value) ||
            (p.cin || '').toLowerCase().includes(value)
        )
        if (filtered.length === 0) {
          setModalState('invitation')
          setShowDropdown(false)
        } else {
          setModalState('existing')
          setShowDropdown(true)
        }
      }
    }, 300)
  }

  // Handle Smart Slot Selection
  const handleSelectSlot = (slot) => {
    setSelectedSlotKey(`${slot.date}_${slot.time}`)
    setExistingForm((prev) => ({
      ...prev,
      date: slot.date,
      heure: slot.time,
    }))
    setShowManualDateTime(false)
    setSlotConflictWarning('')
  }

  // Re-validate Slot Fit on Duration Change
  const handleDurationChange = (newDuration) => {
    setExistingForm((prev) => {
      const updated = { ...prev, duree: Number(newDuration) }
      if (selectedSlotKey && prev.date && prev.heure) {
        const fits = isSlotValid(prev.date, prev.heure, Number(newDuration))
        if (!fits) {
          setSelectedSlotKey(null)
          setSlotConflictWarning(
            `Le créneau à ${prev.heure} n'est plus disponible pour une durée de ${newDuration} min. Veuillez choisir un autre créneau.`
          )
          setShowManualDateTime(true)
        } else {
          setSlotConflictWarning('')
        }
      }
      return updated
    })
  }

  // Handle Type Change
  const handleTypeChange = (newType, defaultDuration) => {
    setExistingForm((prev) => {
      const nextDur = defaultDuration || findType(newType)?.dureeMinutes || 30
      const updated = { ...prev, type: newType, duree: nextDur }
      if (selectedSlotKey && prev.date && prev.heure) {
        const fits = isSlotValid(prev.date, prev.heure, nextDur)
        if (!fits) {
          setSelectedSlotKey(null)
          setSlotConflictWarning(
            `Le créneau à ${prev.heure} n'est plus disponible pour la durée de ${nextDur} min (${newType}).`
          )
          setShowManualDateTime(true)
        } else {
          setSlotConflictWarning('')
        }
      }
      return updated
    })
  }

  const keepCreatedPatient = (patient, form) => {
    setSelectedPatient(patient)
    setSearchQuery(`${patient.prenom || ''} ${patient.nom || ''}`.trim())
    setExistingForm((prev) => ({
      ...prev,
      patientId: patient.id,
      telephone: patient.telephone || '',
      motif: form.motif,
      date: form.date,
      heure: form.heure,
      type: form.type,
      duree: form.duree,
      notes: form.notes || '',
    }))
    setModalState('existing')
    queryClient.invalidateQueries({ queryKey: ['patients'] })
  }

  // Modes transition
  const handleRdvRapide = () => {
    const parsed = parseName(searchQuery)
    setRdvRapideForm((prev) => ({
      ...prev,
      nomPrenom: searchQuery.trim(),
      prenom: parsed.prenom,
      nom: parsed.nom,
    }))
    setModalState('rdv-rapide')
  }

  const handleDossierComplet = () => {
    const parsed = parseName(searchQuery)
    setDossierCompletForm((prev) => ({
      ...prev,
      prenom: parsed.prenom,
      nom: parsed.nom,
    }))
    setModalState('dossier-complet')
  }

  const handleReturnToInvitation = () => {
    setModalState('invitation')
  }

  // Validations
  const validateExisting = () => {
    const newErrors = {}
    if (!selectedPatient) newErrors.searchQuery = 'Veuillez sélectionner un patient'
    if (!existingForm.date) newErrors.date = 'Date requise'
    if (!existingForm.heure) newErrors.heure = 'Heure requise'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateRdvRapide = () => {
    const newErrors = {}
    if (!rdvRapideForm.nomPrenom.trim()) newErrors.nomPrenom = 'Nom & Prénom requis'
    if (!rdvRapideForm.telephone.trim()) newErrors.telephone = 'Téléphone requis'
    if (!rdvRapideForm.date) newErrors.date = 'Date requise'
    if (!rdvRapideForm.heure) newErrors.heure = 'Heure requise'
    if (!rdvRapideForm.motif.trim()) newErrors.motif = 'Motif requis'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateDossierComplet = () => {
    const newErrors = {}
    if (!dossierCompletForm.nom.trim()) newErrors.nom = 'Nom requis'
    if (!dossierCompletForm.prenom.trim()) newErrors.prenom = 'Prénom requis'
    if (!dossierCompletForm.telephone.trim()) newErrors.telephone = 'Téléphone requis'
    if (!dossierCompletForm.date) newErrors.date = 'Date requise'
    if (!dossierCompletForm.heure) newErrors.heure = 'Heure requise'
    if (!dossierCompletForm.motif.trim()) newErrors.motif = 'Motif requis'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)

    try {
      let successMessage = 'Rendez-vous créé avec succès'

      if (modalState === 'existing') {
        if (!validateExisting()) return
        if (await blockedByOverlap(existingForm)) return

        if (appointment) {
          const currentNotes = appointment.notes
          const newNotes = buildAppointmentMeta(currentNotes, {
            type: existingForm.type,
            clinicalContext: existingForm.motif,
            doctorNote: existingForm.notes,
          })
          await apiUpdateRdv(appointment.id, {
            patient_id: existingForm.patientId,
            date_rdv: new Date(`${existingForm.date}T${existingForm.heure}:00`).toISOString(),
            status: 'confirme',
            notes: newNotes,
            ...scheduleFields(existingForm),
          })
        } else {
          const newNotes = buildAppointmentMeta(null, {
            type: existingForm.type,
            clinicalContext: existingForm.motif,
            doctorNote: existingForm.notes,
          })
          await createRdv({
            cabinet_id: cabinetId,
            rappel_envoye: false,
            patient_id: existingForm.patientId,
            date_rdv: new Date(`${existingForm.date}T${existingForm.heure}:00`).toISOString(),
            status: 'confirme',
            notes: newNotes,
            ...scheduleFields(existingForm),
          })
        }
      } else if (modalState === 'rdv-rapide') {
        if (!validateRdvRapide()) return
        if (await blockedByOverlap(rdvRapideForm)) return

        const { prenom, nom } = parseName(rdvRapideForm.nomPrenom)

        const createdPatient = await createPatient({
          cabinet_id: cabinetId,
          prenom,
          nom,
          telephone: rdvRapideForm.telephone.replace(/\s/g, ''),
        })

        const newNotes = buildAppointmentMeta(null, {
          type: rdvRapideForm.type,
          clinicalContext: rdvRapideForm.motif,
          doctorNote: rdvRapideForm.notes,
        })
        try {
          await createRdv({
            cabinet_id: cabinetId,
            rappel_envoye: false,
            patient_id: createdPatient.id,
            date_rdv: new Date(`${rdvRapideForm.date}T${rdvRapideForm.heure}:00`).toISOString(),
            status: 'confirme',
            notes: newNotes,
            ...scheduleFields(rdvRapideForm),
          })
        } catch (rdvError) {
          keepCreatedPatient(createdPatient, rdvRapideForm)
          throw rdvError
        }

        successMessage = "Rendez-vous créé — Le patient sera enregistré à l'arrivée"
      } else if (modalState === 'dossier-complet') {
        if (!validateDossierComplet()) return
        if (await blockedByOverlap(dossierCompletForm)) return

        const createdPatient = await createPatient({
          cabinet_id: cabinetId,
          nom: dossierCompletForm.nom,
          prenom: dossierCompletForm.prenom,
          telephone: dossierCompletForm.telephone.replace(/\s/g, ''),
          date_naissance: dossierCompletForm.dateNaissance || null,
          sexe: dossierCompletForm.sexe || null,
          cin: dossierCompletForm.cin || null,
          adresse: dossierCompletForm.adresse || null,
          mutuelle: dossierCompletForm.mutuelle,
        })

        const newNotes = buildAppointmentMeta(null, {
          type: dossierCompletForm.type,
          clinicalContext: dossierCompletForm.motif,
          doctorNote: dossierCompletForm.notes,
        })
        try {
          await createRdv({
            cabinet_id: cabinetId,
            rappel_envoye: false,
            patient_id: createdPatient.id,
            date_rdv: new Date(`${dossierCompletForm.date}T${dossierCompletForm.heure}:00`).toISOString(),
            status: 'confirme',
            notes: newNotes,
            ...scheduleFields(dossierCompletForm),
          })
        } catch (rdvError) {
          keepCreatedPatient(createdPatient, dossierCompletForm)
          throw rdvError
        }

        successMessage = 'Patient et rendez-vous créés avec succès'
      }

      queryClient.invalidateQueries({ queryKey: ['patients'] })
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['agenda-range'] })
      queryClient.invalidateQueries({ queryKey: ['available-slots-rdv'] })

      await Promise.all([refreshRdv?.(), refreshVisits?.()])

      notify({
        title: 'Succès',
        description: successMessage,
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      const errorMsg =
        typeof error === 'string'
          ? error
          : error?.message || error?.details || error?.hint || (error?.code ? `code ${error.code}` : 'erreur inconnue')
      console.error('Error creating appointment:', {
        message: errorMsg,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        error,
      })
      const isSameDayDuplicate =
        error?.code === '23505' && /rdv_one_active_per_patient_per_day/.test(errorMsg || error?.details || '')
      const isOverlap = isOverlapError(error)
      notify({
        title: isOverlap ? 'Créneau déjà occupé' : isSameDayDuplicate ? 'Rendez-vous en double' : 'Erreur',
        description: isOverlap
          ? overlapMessage(null)
          : isSameDayDuplicate
          ? 'Ce patient a déjà un rendez-vous prévu ce jour. Choisissez une autre date.'
          : `Impossible d'enregistrer le rendez-vous: ${errorMsg}`,
        variant: 'destructive',
      })
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  // Common Input styles
  const inputClass =
    'w-full h-[44px] px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-[#111827] text-[14px] font-medium placeholder:text-[#9CA3AF] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all hover:border-[#D1D5DB]'
  const labelClass = 'block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.06em] mb-[6px]'
  const sectionTitleClass = 'text-[13px] font-bold text-slate-800'

  // Patient initials
  const patientInitials = useMemo(() => {
    if (!selectedPatient) return 'P'
    const p = (selectedPatient.prenom || '').trim()[0] || ''
    const n = (selectedPatient.nom || '').trim()[0] || ''
    return `${p}${n}`.toUpperCase() || 'P'
  }, [selectedPatient])

  // Exactly one filled/accent button in footer; "Annuler" stays neutral/outline
  const footer = (
    <div className="flex gap-3">
      <Button
        variant="secondary"
        onClick={onClose}
        disabled={loading}
        className="flex-1 h-11 px-5"
      >
        Annuler
      </Button>
      {modalState !== 'invitation' && (
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 h-11 px-5"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Enregistrement...</span>
            </>
          ) : (
            <span>
              {modalState === 'existing'
                ? appointment
                  ? 'Modifier'
                  : 'Créer le rendez-vous'
                : modalState === 'rdv-rapide'
                ? 'Créer le RDV'
                : 'Créer patient et RDV'}
            </span>
          )}
        </Button>
      )}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalState === 'dossier-complet' ? 'Nouveau patient · Rendez-vous' : 'Nouveau rendez-vous'}
      width="max-w-[540px]"
      footer={footer}
      noScroll={false}
    >
      <div className="space-y-4">
        {/* Navigation links for quick creation flows */}
        {(modalState === 'rdv-rapide' || modalState === 'dossier-complet') && (
          <button
            type="button"
            onClick={handleReturnToInvitation}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            ← Revenir au choix du mode
          </button>
        )}

        {/* ─────────────────── ÉTAT 1 : RENDEZ-VOUS STANDARD ─────────────────── */}
        {modalState === 'existing' && (
          <div className="space-y-5">
            {/* 1. Patient Section */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className={sectionTitleClass}>Patient</h3>
                {selectedPatient && (
                  <span className="text-[11px] font-medium text-emerald-600">Patient sélectionné</span>
                )}
              </div>
              {!selectedPatient ? (
                <div className="relative">
                  <div
                    className={cn(
                      inputClass,
                      'flex items-center gap-3',
                      touched.searchQuery && errors.searchQuery
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                        : ''
                    )}
                  >
                    <Search size={18} className="text-slate-400 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="Rechercher par nom, prénom, téléphone..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => {
                        setTouched((prev) => ({ ...prev, searchQuery: true }))
                        setTimeout(() => setShowDropdown(false), 220)
                      }}
                      className="w-full bg-transparent outline-none text-[14px]"
                    />
                  </div>

                  {touched.searchQuery && errors.searchQuery && (
                    <p className="mt-1 text-xs font-medium text-red-600">{errors.searchQuery}</p>
                  )}

                  {/* Search Dropdown */}
                  {showDropdown && filteredPatients.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-[10px] border border-slate-200 bg-white shadow-xl py-1">
                      {filteredPatients.map((patient) => (
                        <button
                          key={patient.id}
                          type="button"
                          onMouseDown={() => handleSelectPatient(patient)}
                          className="flex w-full items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-slate-50 cursor-pointer"
                        >
                          <div>
                            <span className="text-sm font-semibold text-slate-900">
                              {patient.prenom} {patient.nom}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5">
                              <span>{patient.telephone || 'Sans téléphone'}</span>
                              {patient.cin && (
                                <>
                                  <span>•</span>
                                  <span>CIN: {patient.cin}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-[6px]">
                            Choisir
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Confirmed-State Card */
                <div className="p-3 rounded-[10px] border border-blue-200/80 bg-blue-50/40 flex items-center justify-between transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs flex-shrink-0">
                      {patientInitials}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[14px] text-slate-900 leading-tight">
                          {selectedPatient.prenom} {selectedPatient.nom}
                        </span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      </div>
                      <div className="text-[12px] font-medium text-slate-500 flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone size={11} className="text-slate-400" />
                          {selectedPatient.telephone || 'Non renseigné'}
                        </span>
                        {selectedPatient.cin && (
                          <span className="text-slate-400">• CIN: {selectedPatient.cin}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearPatient}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline px-2.5 py-1 rounded-[6px] hover:bg-blue-100/50 transition-colors cursor-pointer"
                  >
                    Changer
                  </button>
                </div>
              )}
            </div>

            {/* Appointment details */}
            <section className="border-t border-slate-100 pt-4 space-y-4">
              <div>
                <h3 className={sectionTitleClass}>Choisir la consultation</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  La durée est appliquée automatiquement.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {availableTypes.map((type) => {
                  const Icon = type.icon || Stethoscope
                  const isSelected = existingForm.type.toLowerCase() === type.value.toLowerCase()

                  return (
                    <Button
                      key={type.value}
                      variant={isSelected ? 'accentOutline' : 'secondary'}
                      aria-pressed={isSelected}
                      onClick={() => handleTypeChange(type.value, type.dureeMinutes)}
                      className={cn(
                        'group grid w-full min-h-[62px] grid-cols-[2rem_minmax(0,1fr)] items-center justify-start gap-3 rounded-[10px] px-3 text-left whitespace-normal',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/15 hover:bg-blue-100'
                          : 'hover:border-blue-200'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600'
                        )}
                      >
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 self-center">
                        <span className="block truncate text-xs font-bold">{type.label}</span>
                        <span className={cn('mt-0.5 block text-[11px] font-medium', isSelected ? 'text-blue-600' : 'text-slate-400')}>
                          {type.dureeMinutes} min
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>
            </section>

            {/* 4. Smart Slot Suggestions Row */}
            <section className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className={sectionTitleClass}>Créneau</h3>
                <span className="text-[11px] font-medium text-slate-400">Date et heure</span>
              </div>
              <div className="hidden">
              <div className="flex items-center justify-between">
                <label className={labelClass + ' mb-0 flex items-center gap-1.5'}>
                  <Sparkles size={13} className="text-blue-600" />
                  Créneaux disponibles suggérés
                </label>
                {smartSlots.length > 0 && (
                  <span className="text-[11px] font-medium text-slate-400">7 prochains jours</span>
                )}
              </div>

              {/* Loading State: Skeleton Chips */}
              {isSlotsLoading ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-8 w-28 rounded-[10px] bg-slate-100 animate-pulse flex-shrink-0"
                    />
                  ))}
                </div>
              ) : smartSlots.length === 0 ? (
                /* Empty State */
                <div className="rounded-[10px] border border-amber-200/70 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
                  <span>
                    Aucun créneau libre dans les 7 prochains jours. Choisissez une heure manuellement.
                  </span>
                </div>
              ) : (
                /* Horizontal Row of Tappable Chips */
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                  {smartSlots.map((slot) => {
                    const isSelected = selectedSlotKey === `${slot.date}_${slot.time}`
                    return (
                      <button
                        key={`${slot.date}_${slot.time}`}
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        className={cn(
                          'px-3 py-1.5 rounded-[10px] text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap flex-shrink-0 select-none',
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs ring-2 ring-blue-500/20'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700'
                        )}
                      >
                        {slot.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Conflict warning when duration changed and slot no longer fits */}
              {slotConflictWarning && (
                <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
                  <span>{slotConflictWarning}</span>
                </div>
              )}
              </div>

            {/* 5. Date & Time Scheduling: Compact Confirmed Box OR Manual Fields */}
              {selectedSlotKey && !showManualDateTime ? (
              <div className="rounded-[10px] border border-slate-200 bg-slate-50/70 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[8px] bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {isoToFrDate(existingForm.date)} à {existingForm.heure}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Durée: {currentEffectiveDuration} min
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowManualDateTime(true)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                >
                  Choisir une autre heure
                </button>
              </div>
              ) : (
              <div className="space-y-2">
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Date</label>
                    <FrenchDateInput
                      value={existingForm.date}
                      onChange={(val) => {
                        setExistingForm((prev) => ({ ...prev, date: val }))
                        setSelectedSlotKey(null)
                      }}
                      onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
                      className={cn(
                        inputClass,
                        touched.date && errors.date
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                          : ''
                      )}
                    />
                    {touched.date && errors.date && (
                      <p className="mt-1 text-xs font-medium text-red-600">{errors.date}</p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Heure</label>
                    <Select
                      value={existingForm.heure}
                      onChange={(val) => {
                        setExistingForm((prev) => ({ ...prev, heure: val }))
                        setSelectedSlotKey(null)
                      }}
                      options={timeOptionsFor(existingForm.heure, existingForm)}
                      icon={Clock}
                      placement="auto"
                    />
                    {touched.heure && errors.heure && (
                      <p className="mt-1 text-xs font-medium text-red-600">{errors.heure}</p>
                    )}
                    {!loading && isSelectedTimeOccupied(existingForm) && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-rose-600">
                        <AlertTriangle size={13} /> Ce créneau n’est pas disponible. Choisissez une autre heure.
                      </p>
                    )}
                  </div>
                </div>

                {selectedSlotKey && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setShowManualDateTime(false)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                    >
                      Masquer la saisie manuelle
                    </button>
                  </div>
                )}
              </div>
              )}
            </section>

            {/* 6. Note pour le médecin (Optionnel) */}
            <section className="border-t border-slate-100 pt-4">
              <h3 className={sectionTitleClass + ' mb-2'}>Informations complémentaires</h3>
              <label className={labelClass}>Note pour le médecin (optionnel)</label>
              <textarea
                value={existingForm.notes}
                onChange={(e) => setExistingForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Ex: amène ses résultats d'analyses, première consultation, suivi post-opératoire..."
                rows={2}
                className="w-full resize-none rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 text-[14px] font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all hover:border-[#D1D5DB]"
              />
            </section>
          </div>
        )}

        {/* ─────────────────── ÉTAT 2 : INVITATION (AUCUN PATIENT) ─────────────────── */}
        {modalState === 'invitation' && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Patient</label>
              <div className="relative">
                <div className={`${inputClass} flex items-center gap-3`}>
                  <Search size={18} className="text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => {
                      if (filteredPatients.length > 0) setModalState('existing')
                      setShowDropdown(true)
                    }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    className="w-full bg-transparent outline-none text-[14px]"
                  />
                </div>
              </div>
            </div>

            <div className="py-6 flex flex-col items-center justify-center text-center">
              <p className="text-[15px] font-semibold text-slate-800 mb-1">
                Aucun patient trouvé
              </p>
              <p className="text-sm text-slate-500 mb-6">
                Aucun patient ne correspond à « {searchQuery} ».
              </p>

              <div className="flex flex-col gap-3 w-full max-w-sm mx-auto">
                <button
                  type="button"
                  onClick={handleDossierComplet}
                  className="w-full flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                >
                  <UserPlus size={16} />
                  Créer un nouveau patient (dossier)
                </button>
                <button
                  type="button"
                  onClick={handleRdvRapide}
                  className="w-full flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Créer un RDV rapide sans dossier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────── ÉTAT 3A : RDV RAPIDE ─────────────────── */}
        {modalState === 'rdv-rapide' && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nom & Prénom</label>
              <div
                className={cn(
                  inputClass,
                  'flex items-center gap-3',
                  touched.nomPrenom && errors.nomPrenom
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                    : ''
                )}
              >
                <User size={18} className="text-slate-400" />
                <input
                  type="text"
                  value={rdvRapideForm.nomPrenom}
                  onChange={(e) =>
                    setRdvRapideForm((prev) => ({ ...prev, nomPrenom: e.target.value }))
                  }
                  onBlur={() => setTouched((prev) => ({ ...prev, nomPrenom: true }))}
                  className="w-full bg-transparent outline-none text-[14px]"
                />
              </div>
              {touched.nomPrenom && errors.nomPrenom && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.nomPrenom}</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Téléphone</label>
              <div
                className={cn(
                  inputClass,
                  'flex items-center gap-3',
                  touched.telephone && errors.telephone
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                    : ''
                )}
              >
                <Phone size={18} className="text-slate-400" />
                <input
                  type="text"
                  value={rdvRapideForm.telephone}
                  onChange={(e) =>
                    setRdvRapideForm((prev) => ({
                      ...prev,
                      telephone: formatPhoneNumber(e.target.value),
                    }))
                  }
                  onBlur={() => setTouched((prev) => ({ ...prev, telephone: true }))}
                  placeholder="06 12 34 56 78"
                  className="w-full bg-transparent outline-none text-[14px]"
                />
              </div>
              {touched.telephone && errors.telephone && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.telephone}</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Motif</label>
              <MotifField
                value={rdvRapideForm.motif}
                onChange={(text) => setRdvRapideForm((prev) => ({ ...prev, motif: text }))}
                onBlur={() => setTouched((prev) => ({ ...prev, motif: true }))}
                error={touched.motif && errors.motif}
              />
              {touched.motif && errors.motif && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.motif}</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Choisir la consultation</label>
              <p className="mb-2 text-xs font-medium text-slate-500">La durée est appliquée automatiquement.</p>
              <ConsultationTypeCards
                availableTypes={availableTypes}
                value={rdvRapideForm.type}
                onChange={(val, dur) =>
                  setRdvRapideForm((prev) => ({
                    ...prev,
                    type: val,
                    duree: dur || findType(val)?.dureeMinutes || 30,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <FrenchDateInput
                  value={rdvRapideForm.date}
                  onChange={(val) => setRdvRapideForm((prev) => ({ ...prev, date: val }))}
                  onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
                  className={cn(
                    inputClass,
                    touched.date && errors.date
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                      : ''
                  )}
                />
                {touched.date && errors.date && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.date}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Heure</label>
                <Select
                  value={rdvRapideForm.heure}
                  onChange={(val) => setRdvRapideForm((prev) => ({ ...prev, heure: val }))}
                  options={timeOptionsFor(rdvRapideForm.heure, rdvRapideForm)}
                  icon={Clock}
                  placement="auto"
                />
                {touched.heure && errors.heure && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.heure}</p>
                )}
                {!loading && isSelectedTimeOccupied(rdvRapideForm) && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-rose-600">
                    <AlertTriangle size={13} /> Ce créneau n’est pas disponible. Choisissez une autre heure.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className={labelClass}>Note pour le médecin (optionnel)</label>
              <textarea
                value={rdvRapideForm.notes}
                onChange={(e) => setRdvRapideForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Ex: amène ses résultats d'analyses..."
                rows={2}
                className="w-full resize-none rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 text-[14px] font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all hover:border-[#D1D5DB]"
              />
            </div>
          </div>
        )}

        {/* ─────────────────── ÉTAT 3B : DOSSIER COMPLET ─────────────────── */}
        {modalState === 'dossier-complet' && (
          <div className="space-y-[14px]">
            <div className="grid grid-cols-2 gap-[10px]">
              <div>
                <label className={labelClass}>Nom</label>
                <input
                  type="text"
                  value={dossierCompletForm.nom}
                  onChange={(e) =>
                    setDossierCompletForm((prev) => ({ ...prev, nom: e.target.value }))
                  }
                  onBlur={() => setTouched((prev) => ({ ...prev, nom: true }))}
                  className={cn(
                    inputClass,
                    touched.nom && errors.nom
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                      : ''
                  )}
                />
                {touched.nom && errors.nom && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.nom}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Prénom</label>
                <input
                  type="text"
                  value={dossierCompletForm.prenom}
                  onChange={(e) =>
                    setDossierCompletForm((prev) => ({ ...prev, prenom: e.target.value }))
                  }
                  onBlur={() => setTouched((prev) => ({ ...prev, prenom: true }))}
                  className={cn(
                    inputClass,
                    touched.prenom && errors.prenom
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                      : ''
                  )}
                />
                {touched.prenom && errors.prenom && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.prenom}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-[10px]">
              <div>
                <label className={labelClass}>Téléphone</label>
                <div
                  className={cn(
                    inputClass,
                    'flex items-center gap-3',
                    touched.telephone && errors.telephone
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                      : ''
                  )}
                >
                  <Phone size={18} className="text-[#9CA3AF] flex-shrink-0" />
                  <input
                    type="text"
                    value={dossierCompletForm.telephone}
                    onChange={(e) =>
                      setDossierCompletForm((prev) => ({
                        ...prev,
                        telephone: formatPhoneNumber(e.target.value),
                      }))
                    }
                    onBlur={() => setTouched((prev) => ({ ...prev, telephone: true }))}
                    placeholder="06 12 34 56 78"
                    className="w-full bg-transparent outline-none text-[14px]"
                  />
                </div>
                {touched.telephone && errors.telephone && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.telephone}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>CIN</label>
                <input
                  type="text"
                  value={dossierCompletForm.cin}
                  onChange={(e) =>
                    setDossierCompletForm((prev) => ({ ...prev, cin: e.target.value }))
                  }
                  placeholder="AB123456"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-[10px]">
              <div>
                <label className={labelClass}>Date de naissance</label>
                <input
                  type="date"
                  value={dossierCompletForm.dateNaissance}
                  onChange={(e) =>
                    setDossierCompletForm((prev) => ({ ...prev, dateNaissance: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Sexe</label>
                <div className="flex gap-[10px]" role="radiogroup" aria-label="Sexe du patient">
                  <button
                    type="button"
                    onClick={() => setDossierCompletForm((prev) => ({ ...prev, sexe: 'homme' }))}
                    className={cn(
                      'flex-1 h-[44px] px-4 rounded-[10px] text-[14px] font-medium transition-all flex items-center justify-center cursor-pointer',
                      dossierCompletForm.sexe === 'homme'
                        ? 'bg-[#EFF6FF] border border-[#3B82F6] text-[#3B82F6] font-semibold'
                        : 'bg-white border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB] hover:border-[#D1D5DB]'
                    )}
                  >
                    Homme
                  </button>
                  <button
                    type="button"
                    onClick={() => setDossierCompletForm((prev) => ({ ...prev, sexe: 'femme' }))}
                    className={cn(
                      'flex-1 h-[44px] px-4 rounded-[10px] text-[14px] font-medium transition-all flex items-center justify-center cursor-pointer',
                      dossierCompletForm.sexe === 'femme'
                        ? 'bg-[#EFF6FF] border border-[#3B82F6] text-[#3B82F6] font-semibold'
                        : 'bg-white border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB] hover:border-[#D1D5DB]'
                    )}
                  >
                    Femme
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Adresse</label>
              <textarea
                value={dossierCompletForm.adresse}
                onChange={(e) =>
                  setDossierCompletForm((prev) => ({ ...prev, adresse: e.target.value }))
                }
                placeholder="12 Rue des Lilas, Casablanca"
                className={cn(inputClass, 'h-[65px] py-2.5 resize-none')}
              />
            </div>

            <div>
              <label className={labelClass}>Mutuelle</label>
              <Select
                value={dossierCompletForm.mutuelle}
                onChange={(val) =>
                  setDossierCompletForm((prev) => ({ ...prev, mutuelle: val }))
                }
                options={mutuelleOptions}
                icon={Shield}
                placement="top"
              />
            </div>

            <div>
              <label className={labelClass}>Motif du RDV</label>
              <MotifField
                value={dossierCompletForm.motif}
                onChange={(text) =>
                  setDossierCompletForm((prev) => ({ ...prev, motif: text }))
                }
                onBlur={() => setTouched((prev) => ({ ...prev, motif: true }))}
                error={touched.motif && errors.motif}
              />
              {touched.motif && errors.motif && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.motif}</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Choisir la consultation</label>
              <p className="mb-2 text-xs font-medium text-slate-500">La durée est appliquée automatiquement.</p>
              <ConsultationTypeCards
                availableTypes={availableTypes}
                value={dossierCompletForm.type}
                onChange={(val, dur) =>
                  setDossierCompletForm((prev) => ({
                    ...prev,
                    type: val,
                    duree: dur || findType(val)?.dureeMinutes || 30,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <FrenchDateInput
                  value={dossierCompletForm.date}
                  onChange={(val) => setDossierCompletForm((prev) => ({ ...prev, date: val }))}
                  onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
                  className={cn(
                    inputClass,
                    touched.date && errors.date
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                      : ''
                  )}
                />
                {touched.date && errors.date && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.date}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Heure</label>
                <Select
                  value={dossierCompletForm.heure}
                  onChange={(val) => setDossierCompletForm((prev) => ({ ...prev, heure: val }))}
                  options={timeOptionsFor(dossierCompletForm.heure, dossierCompletForm)}
                  icon={Clock}
                  placement="auto"
                />
                {touched.heure && errors.heure && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.heure}</p>
                )}
                {!loading && isSelectedTimeOccupied(dossierCompletForm) && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-rose-600">
                    <AlertTriangle size={13} /> Ce créneau n’est pas disponible. Choisissez une autre heure.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className={labelClass}>Note pour le médecin (optionnel)</label>
              <textarea
                value={dossierCompletForm.notes}
                onChange={(e) =>
                  setDossierCompletForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Ex: amène ses résultats d'analyses..."
                rows={2}
                className="w-full resize-none rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 text-[14px] font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all hover:border-[#D1D5DB]"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default AppointmentFormModal
