
import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Loader2,
  Calendar,
  ChevronDown,
  User,
  Phone,
  Lock,
  AlertTriangle,
  UserPlus,
  FileText,
  Clock,
  Sparkles,
  Stethoscope,
  RotateCcw,
  Activity,
  Shield,
  Check
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import Modal from '../common/Modal'
import Select from '../common/Select'
import Chip from '../common/Chip'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppContext } from '../../context/AppContext'
import { useCabinetId } from '../../hooks/useCabinetId'
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
    }
  }

  if (!notes.startsWith(META_PREFIX)) {
    return {
      clinicalContext: notes,
    }
  }

  try {
    return JSON.parse(notes.slice(META_PREFIX.length))
  } catch {
    return {
      clinicalContext: '',
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
    patientName: current.patientName || '',
    phone: current.phone || '',
    type: current.type || 'Consultation',
    ...overrides,
  })}`
}

const APPOINTMENT_TYPES = [
  {
    value: 'Consultation',
    label: 'Consultation',
    description: 'Consultation standard ou bilan',
    badge: '30 min',
    color: '#3b82f6',
    pillClass: 'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700',
    activePillClass: 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20 font-semibold shadow-xs',
    icon: Stethoscope,
  },
  {
    value: 'Suivi',
    label: 'Suivi',
    description: 'Contrôle d’évolution & renouvellement',
    badge: '20 min',
    color: '#8b5cf6',
    pillClass: 'hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700',
    activePillClass: 'bg-purple-50 border-purple-500 text-purple-700 ring-2 ring-purple-500/20 font-semibold shadow-xs',
    icon: RotateCcw,
  },
  {
    value: 'Urgence',
    label: 'Urgence',
    description: 'Symptômes aigus, prise en charge immédiate',
    badge: '15 min',
    color: '#ef4444',
    pillClass: 'hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700',
    activePillClass: 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20 font-semibold shadow-xs',
    icon: AlertTriangle,
  },
  {
    value: 'Examen / Analyse',
    label: 'Examen / Analyse',
    description: 'Examen clinique ciblé ou prélèvements',
    badge: '30 min',
    color: '#0ea5e9',
    pillClass: 'hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700',
    activePillClass: 'bg-sky-50 border-sky-500 text-sky-700 ring-2 ring-sky-500/20 font-semibold shadow-xs',
    icon: FileText,
  },
]

const typesRDV = APPOINTMENT_TYPES.map(t => t.value)

const MOTIF_SUGGESTIONS = [
  'Contrôle de routine',
  'Renouvellement ordonnance',
  'Résultats d’analyses',
  'Douleurs aiguës',
  'Suivi traitement',
]

// Motif component: patient-specific reason input with quick shortcuts
function MotifField({ value = '', onChange, onBlur, placeholder = 'Pourquoi vient le patient ?' }) {
  return (
    <div className="space-y-2">
      <div className="rounded-[10px] border border-[#E5E7EB] bg-white transition-all hover:border-[#D1D5DB] focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={2}
          className="w-full resize-none bg-transparent px-3 py-2 text-[14px] font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none min-h-[54px]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {MOTIF_SUGGESTIONS.map((suggestion) => {
          const isSelected = value.trim().toLowerCase() === suggestion.toLowerCase()
          return (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(suggestion)}
              className={cn(
                "inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium transition-all cursor-pointer border select-none",
                isSelected
                  ? "bg-blue-50 border-blue-400 text-blue-700 shadow-2xs font-semibold"
                  : "bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563] hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300"
              )}
            >
              {suggestion}
            </button>
          )
        })}
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

function FrenchDateInput({
  value,
  onChange,
  onBlur,
  className,
}) {
  const pickerRef = useRef(null)
  const [displayText, setDisplayText] = useState(() => isoToFrDate(value))

  useEffect(() => {
    setDisplayText(isoToFrDate(value))
  }, [value])

  const handleTextChange = (e) => {
    const raw = e.target.value
    setDisplayText(raw)
    const iso = frDateToIso(raw)
    if (iso) {
      onChange(iso)
    }
  }

  const handlePickerChange = (e) => {
    const iso = e.target.value
    if (iso) {
      onChange(iso)
      setDisplayText(isoToFrDate(iso))
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

  const openPicker = () => {
    try {
      if (pickerRef.current?.showPicker) {
        pickerRef.current.showPicker()
      } else {
        pickerRef.current?.focus()
      }
    } catch {
      pickerRef.current?.focus()
    }
  }

  return (
    <div className="relative flex items-center group">
      <input
        type="text"
        value={displayText}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder="JJ/MM/AAAA"
        className={cn(className, "pr-10")}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Choisir une date"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors z-20 cursor-pointer"
      >
        <Calendar size={18} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        onChange={handlePickerChange}
        tabIndex={-1}
        aria-label="Date du rendez-vous"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 opacity-0 pointer-events-none"
      />
    </div>
  )
}

const mutuelles = [
  'Aucune',
  'CNSS',
  'RAMED',
  'CNOPS',
  'Assurance privée',
  'Autre'
]

const mutuelleOptions = mutuelles.map(m => ({
  value: m,
  label: m,
}))

// Two different conflicts, two different messages — the secretary has to know which one she's
// looking at to fix it:
//  - overlap (23P01, rdv_no_overlap_per_cabinet): the time slot is taken by ANOTHER appointment;
//  - same-day duplicate (23505, rdv_one_active_per_patient_per_day): THIS patient already has
//    an appointment that day.
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

// Helper Functions
const parseName = (fullName) => {
  const trimmed = fullName.trim()
  if (!trimmed) return { prenom: '', nom: '' }
  // Remove titles like "Dr.", "M.", "Mme"
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
  initialTime
}) {
  const { notify, refreshRdv, refreshVisits } = useAppContext()
  const { cabinetId } = useCabinetId()
  const queryClient = useQueryClient()

  const { data: livePatients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: getPatients,
    enabled: open,
  })

  // Consultation types (with durations) + agenda settings for this cabinet. Before the agenda
  // migration is applied this returns the historical defaults and schemaReady = false.
  const agenda = useAgendaConfig(cabinetId)
  const findType = (name) => {
    const key = String(name || '').trim().toLowerCase()
    return agenda.types.find((t) => t.libelle.trim().toLowerCase() === key) || null
  }
  // A form's duration: the one picked by hand, else the type's, else the cabinet default.
  const effectiveDuree = (form) => form.duree || findType(form.type)?.dureeMinutes || agenda.settings.dureeDefautMinutes
  const typeOptionsFor = (current) => {
    const opts = agenda.types
      .filter((t) => t.actif !== false || t.libelle === current)
      .map((t) => ({ value: t.libelle, label: t.libelle, description: t.description, color: t.couleur, badge: `${t.dureeMinutes} min` }))
    // An edited appointment may carry a type that no longer exists: keep it selectable as is.
    if (current && !opts.some((o) => o.value === current)) opts.push({ value: current, label: current })
    return opts
  }
  const timeOptionsFor = (current) => {
    const times = bookableTimes(agenda.settings)
    if (current && !times.includes(current)) times.push(current)
    return times.sort().map((t) => ({ value: t, label: t }))
  }
  const durationOptionsFor = (current) => {
    const values = [...new Set([...DURATION_CHOICES, current].filter(Boolean))].sort((a, b) => a - b)
    return values.map((v) => ({ value: String(v), label: `${v} min` }))
  }
  // Columns only sent once the migration exists; before that the insert keeps its old shape.
  const scheduleFields = (form) => (agenda.schemaReady
    ? { duree_minutes: effectiveDuree(form), type_consultation_id: findType(form.type)?.id || null }
    : {})

  // Same-slot check before saving, so the message can name the appointment in the way.
  // Returns true when the save must stop.
  const blockedByOverlap = async (form) => {
    const conflict = await findOverlappingAppointment({
      cabinetId,
      startIso: new Date(`${form.date}T${form.heure}:00`).toISOString(),
      dureeMinutes: effectiveDuree(form),
      excludeId: appointment?.id,
      schemaReady: agenda.schemaReady,
    })
    if (!conflict) return false
    notify({ title: 'Créneau déjà occupé', description: overlapMessage(conflict), variant: 'destructive' })
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
  
  // Button hover/pressed state
  const [cancelHovered, setCancelHovered] = useState(false)
  const [cancelPressed, setCancelPressed] = useState(false)
  const [submitHovered, setSubmitHovered] = useState(false)
  const [submitPressed, setSubmitPressed] = useState(false)

  // Form Data State
  const [rdvRapideForm, setRdvRapideForm] = useState({
    nomPrenom: '',
    telephone: '',
    motif: '',
    date: '',
    heure: '08:00',
    type: 'Consultation',
    duree: null,
    notes: ''
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
    duree: null,
    notes: ''
  })

  const [existingForm, setExistingForm] = useState({
    patientId: '',
    telephone: '',
    motif: '',
    date: '',
    heure: '08:00',
    type: 'Consultation',
    duree: null,
    notes: ''
  })

  // Initialize Data
  useEffect(() => {
    if (open) {
      const todayCasablanca = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
      const initialDateValue = initialDate || todayCasablanca
      
      setModalState('existing')
      setSearchQuery('')
      setSelectedPatient(null)
      setShowDropdown(false)
      setTouched({})
      setErrors({})
      
      if (appointment) {
        // `appointment` here is the raw rdv row passed by AppointmentsPage's
        // "Modifier l'heure" flow (snake_case: patient_id, notes) — it is
        // NOT the mapped Appointment shape (camelCase: patientId, motif)
        // used elsewhere in this file's own type definitions. Reading
        // appointment.patientId/.motif directly always returned undefined,
        // and motif was hardcoded to '' — since validateExisting() requires
        // a non-empty motif, every edit-time submission was silently
        // blocked by "Motif requis" unless the user happened to retype it.
        const meta = parseAppointmentMeta(appointment.notes)
        setSearchQuery(`${appointment.patients?.prenom || ''} ${appointment.patients?.nom || ''}`)
        setSelectedPatient(appointment.patients)
        const dt = new Date(appointment.date_rdv)
        const datePart = !isNaN(dt) ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : initialDateValue
        const timePart = !isNaN(dt) ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : initialTime || '08:00'

        setExistingForm({
          patientId: appointment.patient_id || appointment.patientId,
          telephone: appointment.patients?.telephone || '',
          motif: meta.clinicalContext || '',
          date: datePart,
          heure: timePart,
          type: meta.type || 'Consultation',
          duree: appointment.duree_minutes || null,
          notes: ''
        })
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
          duree: null,
          notes: ''
        })
      } else {
        setExistingForm({
          patientId: '',
          telephone: '',
          motif: '',
          date: initialDateValue,
          heure: initialTime || '08:00',
          type: 'Consultation',
          duree: null,
          notes: ''
        })

        setRdvRapideForm({
          nomPrenom: '',
          telephone: '',
          motif: '',
          date: initialDateValue,
          heure: initialTime || '08:00',
          type: 'Consultation',
          duree: null,
          notes: ''
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
          duree: null,
          notes: ''
        })
      }
    }
  }, [open, appointment, initialPatient, initialDate, initialTime])

  // Filter patients based on search query
  const filteredPatients = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return []
    return livePatients.filter(p =>
      `${p.prenom} ${p.nom}`.toLowerCase().includes(query) ||
      (p.telephone || '').includes(query)
    )
  }, [searchQuery, livePatients])

  // Handle Patient Selection
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient)
    setSearchQuery(`${patient.prenom} ${patient.nom}`)
    setExistingForm(prev => ({ 
      ...prev, 
      patientId: patient.id, 
      telephone: patient.telephone,
      type: 'Consultation',
      duree: null
    }))
    setShowDropdown(false)
  }

  // Handle Search Input Change
  const handleSearchChange = (value) => {
    setSearchQuery(value)
    setSelectedPatient(null)
    setShowDropdown(true)

    setTimeout(() => {
      if (value.trim() && selectedPatient === null) {
        const filtered = livePatients.filter(p =>
          `${p.prenom} ${p.nom}`.toLowerCase().includes(value.toLowerCase()) ||
          (p.telephone || '').includes(value)
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

  // Handle RDV Rapide
  const handleRdvRapide = () => {
    const parsed = parseName(searchQuery)
    setRdvRapideForm(prev => ({ 
      ...prev, 
      nomPrenom: searchQuery.trim(),
      prenom: parsed.prenom,
      nom: parsed.nom
    }))
    setModalState('rdv-rapide')
  }

  // Handle Dossier Complet
  const handleDossierComplet = () => {
    const parsed = parseName(searchQuery)
    setDossierCompletForm(prev => ({
      ...prev,
      prenom: parsed.prenom,
      nom: parsed.nom
    }))
    setModalState('dossier-complet')
  }

  // Handle Return to Invitation
  const handleReturnToInvitation = () => {
    setModalState('invitation')
  }

  // Handle Return to Search
  const handleReturnToSearch = () => {
    setModalState('existing')
    setSearchQuery('')
    setSelectedPatient(null)
  }

  // Validation Functions
  const validateExisting = () => {
    const newErrors = {}
    if (!selectedPatient) newErrors.searchQuery = 'Veuillez sélectionner un patient'
    if (!existingForm.date) newErrors.date = 'Date requise'
    if (!existingForm.heure) newErrors.heure = 'Heure requise'
    // Motif was never actually persisted by any create/edit path (see
    // handleSubmit below — buildAppointmentMeta never stored it), so an
    // existing appointment's motif is always empty and there is nothing
    // real to prefill. Requiring it only made sense for brand-new
    // appointments (force the user to type a reason); requiring it to edit
    // an existing one's time made every "Modifier l'heure" submission
    // silently fail validation with no realistic way to satisfy it.
    if (!appointment && !existingForm.motif.trim()) newErrors.motif = 'Motif requis'
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
    // Synchronous guard: `loading` only disables the button after a re-render, a ref closes
    // that gap so one save can never be sent twice.
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
        // Before creating the patient, so a taken slot doesn't leave an orphan patient behind.
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
        })
        await createRdv({
          cabinet_id: cabinetId,
          rappel_envoye: false,
          patient_id: createdPatient.id,
          date_rdv: new Date(`${rdvRapideForm.date}T${rdvRapideForm.heure}:00`).toISOString(),
          status: 'confirme',
          notes: newNotes,
          ...scheduleFields(rdvRapideForm),
        })
        
        successMessage = 'Rendez-vous créé — Le patient sera enregistré à l\'arrivée'
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
        })
        await createRdv({
          cabinet_id: cabinetId,
          rappel_envoye: false,
          patient_id: createdPatient.id,
          date_rdv: new Date(`${dossierCompletForm.date}T${dossierCompletForm.heure}:00`).toISOString(),
          status: 'confirme',
          notes: newNotes,
          ...scheduleFields(dossierCompletForm),
        })
        
        successMessage = 'Patient et rendez-vous créés avec succès'
      }

      queryClient.invalidateQueries({ queryKey: ['patients'] })
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['agenda-range'] })
      
      await Promise.all([
        refreshRdv?.(),
        refreshVisits?.(),
      ])
      
      notify({
        title: 'Succès',
        description: successMessage
      })
      
      onSuccess?.()
      onClose()
    } catch (error) {
      // Same unwrapping as InvoiceFormModal: PostgREST errors are plain objects, never String() them.
      const errorMsg = typeof error === 'string'
        ? error
        : error?.message || error?.details || error?.hint || (error?.code ? `code ${error.code}` : 'erreur inconnue')
      // PostgREST errors carry far more than .message (code/details/hint) —
      // logging the full object is the only way to tell which underlying
      // query actually failed when the message alone is ambiguous (e.g.
      // "permission denied for table patients" during an rdv save, where
      // rdv's own update never references patients directly).
      console.error('Error creating appointment:', { message: errorMsg, code: error?.code, details: error?.details, hint: error?.hint, error })
      // 23505 = unique_violation. Only translate the specific one-per-day
      // constraint to a clean French message — the database stays the real
      // authority (this is UX only), any other error still shows the raw
      // technical message so nothing genuinely wrong is hidden.
      // 23P01 = exclusion_violation on rdv_no_overlap_per_cabinet: the slot overlaps ANOTHER
      // appointment (reaches here when two people book the same slot at the same moment, after
      // the pre-check). Kept apart from the same-patient case on purpose — different fix.
      const isSameDayDuplicate = error?.code === '23505' && /rdv_one_active_per_patient_per_day/.test(errorMsg || error?.details || '')
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

  // Input styles
  const inputClass = "w-full h-[44px] px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-[#111827] text-[14px] font-medium placeholder:text-[#9CA3AF] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all hover:border-[#D1D5DB]"
  const labelClass = "block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.06em] mb-[6px]"

  // Footer buttons
  const footer = (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        style={{
          backgroundColor: cancelHovered ? '#F9FAFB' : '#FFFFFF',
          color: '#374151',
          border: `2px solid ${cancelHovered ? '#D1D5DB' : '#E5E7EB'}`,
          padding: '0.625rem 1.25rem',
          minHeight: '44px',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          whiteSpace: 'nowrap',
          fontSize: '14px',
          fontWeight: 'bold',
          width: 'auto',
          flex: 1,
          transform: cancelPressed ? 'translateY(-1px) scale(0.98)' : cancelHovered ? 'translateY(-2px)' : 'translateY(0)',
          boxShadow: cancelHovered ? '0 6px 16px -4px rgba(148, 163, 184, 0.15)' : 'none',
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
        onMouseEnter={() => setCancelHovered(true)}
        onMouseLeave={() => { setCancelHovered(false); setCancelPressed(false); }}
        onMouseDown={() => setCancelPressed(true)}
        onMouseUp={() => setCancelPressed(false)}
      >
        Annuler
      </button>
      {modalState !== 'invitation' && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            backgroundColor: submitHovered ? '#2563EB' : '#3B82F6',
            color: '#FFFFFF',
            border: `2px solid ${submitHovered ? '#1E40AF' : '#60A5FA'}`,
            padding: '0.625rem 1.25rem',
            minHeight: '44px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            whiteSpace: 'nowrap',
            fontSize: '14px',
            fontWeight: 'bold',
            width: 'auto',
            flex: 1,
            transform: submitPressed ? 'translateY(-1px) scale(0.98)' : submitHovered ? 'translateY(-2px)' : 'translateY(0)',
            boxShadow: submitHovered ? '0 6px 16px -4px rgba(37, 99, 235, 0.15)' : 'none',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
          onMouseEnter={() => setSubmitHovered(true)}
          onMouseLeave={() => { setSubmitHovered(false); setSubmitPressed(false); }}
          onMouseDown={() => setSubmitPressed(true)}
          onMouseUp={() => setSubmitPressed(false)}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Création...
            </>
          ) : (
            modalState === 'existing' ? (
              appointment ? 'Modifier' : 'Créer le rendez-vous'
            ) : modalState === 'rdv-rapide' ? (
              'Créer le RDV'
            ) : (
              'Créer patient et RDV'
            )
          )}
        </button>
      )}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalState === 'dossier-complet' ? "Nouveau patient · Rendez-vous" : "Nouveau rendez-vous"}
      width="max-w-[520px]"
      footer={footer}
      noScroll={modalState !== 'dossier-complet'}
    >
      <div className="space-y-4">
        {/* Links de retour */}
        {(modalState === 'rdv-rapide' || modalState === 'dossier-complet') && (
          <button
            type="button"
            onClick={handleReturnToInvitation}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            ← Revenir au choix du mode
          </button>
        )}

        {/* -------------------------- ÉTAT 1 : EXISTANT -------------------------- */}
        {modalState === 'existing' && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Patient</label>
              {!selectedPatient ? (
                <div className="relative">
                  <div className={`${inputClass} flex items-center gap-3 ${
                    touched.searchQuery && errors.searchQuery ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''
                  }`}>
                    <User size={18} className="text-slate-500" />
                    <input
                      type="text"
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => {
                        setTouched(prev => ({ ...prev, searchQuery: true }))
                        setTimeout(() => setShowDropdown(false), 200)
                      }}
                      className="w-full bg-transparent outline-none"
                    />
                  </div>
                  {touched.searchQuery && errors.searchQuery && (
                    <p className="mt-1 text-xs font-medium text-red-600">{errors.searchQuery}</p>
                  )}

                  {/* Search Dropdown */}
                  {showDropdown && filteredPatients.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      {filteredPatients.map(patient => (
                        <button
                          key={patient.id}
                          type="button"
                          onMouseDown={() => handleSelectPatient(patient)}
                          className="flex w-full flex-col border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50"
                        >
                          <span className="text-sm font-semibold text-slate-900">
                            {patient.prenom} {patient.nom}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                            <span>{patient.telephone}</span>
                            {patient.derniereVisite && (
                              <>
                                <span>•</span>
                                <span>Dernière visite: {patient.derniereVisite}</span>
                              </>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-[10px] border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                      <User size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-[14px] text-slate-900 leading-tight">
                        {selectedPatient.prenom} {selectedPatient.nom}
                      </p>
                      <p className="text-[12px] font-medium text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <Phone size={11} /> {selectedPatient.telephone || 'Non renseigné'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null)
                      setSearchQuery('')
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="text-xl leading-none -mt-0.5">×</span>
                  </button>
                </div>
              )}
            </div>

            {/* Motif */}
            <div>
              <label className={labelClass}>Motif</label>
              <MotifField
                value={existingForm.motif}
                onChange={(text) => setExistingForm(prev => ({ ...prev, motif: text }))}
                onBlur={() => setTouched(prev => ({ ...prev, motif: true }))}
              />
              {touched.motif && errors.motif && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.motif}</p>
              )}
            </div>

            {/* Date + Heure + Type + Durée in 2x2 grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <FrenchDateInput
                  value={existingForm.date}
                  onChange={(val) => setExistingForm(prev => ({ ...prev, date: val }))}
                  onBlur={() => setTouched(prev => ({ ...prev, date: true }))}
                  className={cn(inputClass, touched.date && errors.date ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : '')}
                />
                {touched.date && errors.date && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.date}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Heure</label>
                <Select
                  value={existingForm.heure}
                  onChange={(val) => setExistingForm(prev => ({ ...prev, heure: val }))}
                  options={timeOptionsFor(existingForm.heure)}
                  icon={Clock}
                  placement="top"
                />
                {touched.heure && errors.heure && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.heure}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <Select
                  value={existingForm.type}
                  onChange={(val) => setExistingForm(prev => ({ ...prev, type: val, duree: null }))}
                  options={typeOptionsFor(existingForm.type)}
                  placement="top"
                />
              </div>
              <div>
                <label className={labelClass}>Durée</label>
                <Select
                  value={String(effectiveDuree(existingForm))}
                  onChange={(val) => setExistingForm(prev => ({ ...prev, duree: Number(val) }))}
                  options={durationOptionsFor(effectiveDuree(existingForm))}
                  icon={Clock}
                  placement="top"
                />
              </div>
            </div>

          </div>
        )}

        {/* -------------------------- ÉTAT 2 : INVITATION -------------------------- */}
        {modalState === 'invitation' && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Patient</label>
              <div className="relative">
                <div className={`${inputClass} flex items-center gap-3`}>
                  <User size={18} className="text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => {
                      if (filteredPatients.length > 0) setModalState('existing')
                      setShowDropdown(true)
                    }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    className="w-full bg-transparent outline-none"
                  />
                </div>
                {showDropdown && filteredPatients.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    {filteredPatients.map(patient => (
                      <button
                        key={patient.id}
                        type="button"
                        onMouseDown={() => handleSelectPatient(patient)}
                        className="flex w-full flex-col border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50"
                      >
                        <span className="text-sm font-semibold text-slate-900">
                          {patient.prenom} {patient.nom}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                          <span>{patient.telephone}</span>
                          {patient.derniereVisite && (
                            <>
                              <span>•</span>
                              <span>Dernière visite: {patient.derniereVisite}</span>
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Carte d'invitation (Aucun patient) */}
            <div className="py-6 flex flex-col items-center justify-center text-center">
              <p className="text-[15px] font-semibold text-slate-800 mb-1">
                Aucun patient trouvé
              </p>
              <p className="text-sm text-slate-500 mb-6">
                Aucun patient correspondant à votre recherche.
              </p>
              
              <div className="flex flex-col gap-3 w-full max-w-sm mx-auto">
                <button
                  type="button"
                  onClick={handleDossierComplet}
                  className="w-full flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <UserPlus size={16} />
                  Créer un nouveau patient
                </button>
                <button
                  type="button"
                  onClick={handleRdvRapide}
                  className="w-full flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Créer un RDV rapide sans dossier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------- ÉTAT 3A : RDV RAPIDE -------------------------- */}
        {modalState === 'rdv-rapide' && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nom & Prénom</label>
              <div className={`${inputClass} flex items-center gap-3 ${
                touched.nomPrenom && errors.nomPrenom ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''
              }`}>
                <User size={18} className="text-slate-500" />
                <input
                  type="text"
                  value={rdvRapideForm.nomPrenom}
                  onChange={(e) => setRdvRapideForm(prev => ({ ...prev, nomPrenom: e.target.value }))}
                  onBlur={() => setTouched(prev => ({ ...prev, nomPrenom: true }))}
                  className="w-full bg-transparent outline-none"
                />
              </div>
              {touched.nomPrenom && errors.nomPrenom && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.nomPrenom}</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Téléphone</label>
              <div className={`${inputClass} flex items-center gap-3 ${
                touched.telephone && errors.telephone ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''
              }`}>
                <Phone size={18} className="text-slate-500" />
                <input
                  type="text"
                  value={rdvRapideForm.telephone}
                  onChange={(e) => setRdvRapideForm(prev => ({ ...prev, telephone: formatPhoneNumber(e.target.value) }))}
                  onBlur={() => setTouched(prev => ({ ...prev, telephone: true }))}
                  placeholder="06 12 34 56 78"
                  className="w-full bg-transparent outline-none"
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
                onChange={(text) => setRdvRapideForm(prev => ({ ...prev, motif: text }))}
                onBlur={() => setTouched(prev => ({ ...prev, motif: true }))}
              />
              {touched.motif && errors.motif && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.motif}</p>
              )}
            </div>

            {/* Date + Heure + Type + Durée in 2x2 grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <FrenchDateInput
                  value={rdvRapideForm.date}
                  onChange={(val) => setRdvRapideForm(prev => ({ ...prev, date: val }))}
                  onBlur={() => setTouched(prev => ({ ...prev, date: true }))}
                  className={cn(inputClass, touched.date && errors.date ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : '')}
                />
                {touched.date && errors.date && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.date}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Heure</label>
                <Select
                  value={rdvRapideForm.heure}
                  onChange={(val) => setRdvRapideForm(prev => ({ ...prev, heure: val }))}
                  options={timeOptionsFor(rdvRapideForm.heure)}
                  icon={Clock}
                  placement="top"
                />
                {touched.heure && errors.heure && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.heure}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <Select
                  value={rdvRapideForm.type}
                  onChange={(val) => setRdvRapideForm(prev => ({ ...prev, type: val, duree: null }))}
                  options={typeOptionsFor(rdvRapideForm.type)}
                  placement="top"
                />
              </div>
              <div>
                <label className={labelClass}>Durée</label>
                <Select
                  value={String(effectiveDuree(rdvRapideForm))}
                  onChange={(val) => setRdvRapideForm(prev => ({ ...prev, duree: Number(val) }))}
                  options={durationOptionsFor(effectiveDuree(rdvRapideForm))}
                  icon={Clock}
                  placement="top"
                />
              </div>
            </div>

          </div>
        )}

        {/* -------------------------- ÉTAT 3B : DOSSIER COMPLET -------------------------- */}
        {modalState === 'dossier-complet' && (
          <div className="space-y-[14px]">
            {/* Nom & Prénom */}
            <div className="grid grid-cols-2 gap-[10px]">
              <div>
                <label className={labelClass}>Nom</label>
                <input
                  type="text"
                  value={dossierCompletForm.nom}
                  onChange={(e) => setDossierCompletForm(prev => ({ ...prev, nom: e.target.value }))}
                  onBlur={() => setTouched(prev => ({ ...prev, nom: true }))}
                  className={cn(inputClass, touched.nom && errors.nom ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : '')}
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
                  onChange={(e) => setDossierCompletForm(prev => ({ ...prev, prenom: e.target.value }))}
                  onBlur={() => setTouched(prev => ({ ...prev, prenom: true }))}
                  className={cn(inputClass, touched.prenom && errors.prenom ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : '')}
                />
                {touched.prenom && errors.prenom && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.prenom}</p>
                )}
              </div>
            </div>

            {/* Téléphone & CIN */}
            <div className="grid grid-cols-2 gap-[10px]">
              <div>
                <label className={labelClass}>Téléphone</label>
                <div className={`${inputClass} flex items-center gap-3 ${
                  touched.telephone && errors.telephone ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''
                }`}>
                  <Phone size={18} className="text-[#9CA3AF] flex-shrink-0" />
                  <input
                    type="text"
                    value={dossierCompletForm.telephone}
                    onChange={(e) => setDossierCompletForm(prev => ({ ...prev, telephone: formatPhoneNumber(e.target.value) }))}
                    onBlur={() => setTouched(prev => ({ ...prev, telephone: true }))}
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
                  onChange={(e) => setDossierCompletForm(prev => ({ ...prev, cin: e.target.value }))}
                  placeholder="AB123456"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Date de naissance & Sexe */}
            <div className="grid grid-cols-[1fr_1fr] gap-[10px]">
              <div>
                <label className={labelClass}>Date de naissance</label>
                <input
                  type="date"
                  value={dossierCompletForm.dateNaissance}
                  onChange={(e) => setDossierCompletForm(prev => ({ ...prev, dateNaissance: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Sexe</label>
                <div className="flex gap-[10px]" role="radiogroup" aria-label="Sexe du patient">
                  <button
                    type="button"
                    onClick={() => setDossierCompletForm(prev => ({ ...prev, sexe: 'homme' }))}
                    className={cn(
                      "flex-1 h-[44px] px-4 rounded-[10px] text-[14px] font-medium transition-all flex items-center justify-center",
                      dossierCompletForm.sexe === 'homme'
                        ? "bg-[#EFF6FF] border border-[#3B82F6] text-[#3B82F6] font-semibold"
                        : "bg-white border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB] hover:border-[#D1D5DB]"
                    )}
                  >
                    Homme
                  </button>
                  <button
                    type="button"
                    onClick={() => setDossierCompletForm(prev => ({ ...prev, sexe: 'femme' }))}
                    className={cn(
                      "flex-1 h-[44px] px-4 rounded-[10px] text-[14px] font-medium transition-all flex items-center justify-center",
                      dossierCompletForm.sexe === 'femme'
                        ? "bg-[#EFF6FF] border border-[#3B82F6] text-[#3B82F6] font-semibold"
                        : "bg-white border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB] hover:border-[#D1D5DB]"
                    )}
                  >
                    Femme
                  </button>
                </div>
              </div>
            </div>

            {/* Adresse */}
            <div>
              <label className={labelClass}>Adresse</label>
              <textarea
                value={dossierCompletForm.adresse}
                onChange={(e) => setDossierCompletForm(prev => ({ ...prev, adresse: e.target.value }))}
                placeholder="12 Rue des Lilas, Casablanca"
                className={cn(inputClass, "h-[70px] py-3 resize-none")}
              />
            </div>

            {/* Mutuelle */}
            <div>
              <label className={labelClass}>Mutuelle</label>
              <Select
                value={dossierCompletForm.mutuelle}
                onChange={(val) => setDossierCompletForm(prev => ({ ...prev, mutuelle: val }))}
                options={mutuelleOptions}
                icon={Shield}
                placement="top"
              />
            </div>

            {/* Motif du RDV */}
            <div>
              <label className={labelClass}>Motif du RDV</label>
              <MotifField
                value={dossierCompletForm.motif}
                onChange={(text) => setDossierCompletForm(prev => ({ ...prev, motif: text }))}
                onBlur={() => setTouched(prev => ({ ...prev, motif: true }))}
              />
              {touched.motif && errors.motif && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.motif}</p>
              )}
            </div>

            {/* Date + Heure + Type + Durée in 2x2 grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <FrenchDateInput
                  value={dossierCompletForm.date}
                  onChange={(val) => setDossierCompletForm(prev => ({ ...prev, date: val }))}
                  onBlur={() => setTouched(prev => ({ ...prev, date: true }))}
                  className={cn(inputClass, touched.date && errors.date ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : '')}
                />
                {touched.date && errors.date && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.date}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Heure</label>
                <Select
                  value={dossierCompletForm.heure}
                  onChange={(val) => setDossierCompletForm(prev => ({ ...prev, heure: val }))}
                  options={timeOptionsFor(dossierCompletForm.heure)}
                  icon={Clock}
                  placement="top"
                />
                {touched.heure && errors.heure && (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors.heure}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <Select
                  value={dossierCompletForm.type}
                  onChange={(val) => setDossierCompletForm(prev => ({ ...prev, type: val, duree: null }))}
                  options={typeOptionsFor(dossierCompletForm.type)}
                  placement="top"
                />
              </div>
              <div>
                <label className={labelClass}>Durée</label>
                <Select
                  value={String(effectiveDuree(dossierCompletForm))}
                  onChange={(val) => setDossierCompletForm(prev => ({ ...prev, duree: Number(val) }))}
                  options={durationOptionsFor(effectiveDuree(dossierCompletForm))}
                  icon={Clock}
                  placement="top"
                />
              </div>
            </div>

          </div>
        )}
      </div>
    </Modal>
  )
}

export default AppointmentFormModal
