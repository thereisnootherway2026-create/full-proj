import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Loader2,
  Mic,
  PanelLeft,
  PanelRight,
  Pill,
  Plus,
  Search,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react'
import { getPatientMedications, getPatientVitals } from '../../lib/dossierApi'
import { DEPUIS_OPTIONS, EVOLUTION_OPTIONS, listCompletedEncounters } from '../../lib/encounterService'
import { computeProgress, finalizeWarnings } from '../../lib/consultationProgress'
// ConsultationFields only used for BillingPill in legacy section — unused after rail migration (kept for potential future use)
import SmartMotifInput from './SmartMotifInput'
import SuggestionsTrigger from './SuggestionsTrigger'
import VitalsGrid from './VitalsGrid'
import StageSection from './StageSection'
import Button from '../common/Button'
import IconButton from '../common/IconButton'
import { BlockHeader, DiagnosisPicker, FollowUpBlock, Panel, allergyMatch, allergyTokens } from './PlanBlocks'
import PatientContextSidebar from './PatientContextSidebar'
import ConsultationRail from './ConsultationRail'
import { DiscardDialog, DoneScreen, FinalizeDialog } from './ConsultationDialogs'
import OrdonnancePreviewModal from './OrdonnancePreviewModal'
import { useDocumentHeader } from './DocumentComposer'
import { MEDICATIONS } from '../../data/medicationSuggestions'
import { resolveClinicalStatus } from '../../lib/clinical/clinicalStatus'
import { prescribingReadiness } from '../../lib/clinical/prescribingReadiness'
import PrescribingGate from '../clinical/PrescribingGate'
import RenewalPanel from './RenewalPanel'
import { useAppContext } from '../../context/AppContext'
import { getOrdonnancesForPatient } from '../../lib/api'
import { applyRenewal, lastActiveOrdonnance, motifFlow, prefillRenewalEdit } from '../../lib/consultationFlow'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'

function SaveStatus({ draft }) {
  const [flash, setFlash] = useState(false)
  const lastSavedRef = useRef(draft.savedAt)

  useEffect(() => {
    if (draft.savedAt && draft.savedAt !== lastSavedRef.current) {
      lastSavedRef.current = draft.savedAt
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1000)
      return () => clearTimeout(t)
    }
  }, [draft.savedAt])

  const { status, savedAt, isDirty, offline } = draft

  if (status === 'loading') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-slate-500 font-medium">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" /> Chargement…
      </span>
    )
  }
  if (status === 'conflict') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-red-600">
        <AlertTriangle className="h-3.5 w-3.5" /> Conflit de version
      </span>
    )
  }
  if (offline || draft.isOffline) {
    const timeStr = savedAt ? savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span>Enregistré localement{timeStr ? ` à ${timeStr}` : ''}</span>
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Enregistrement en attente
      </span>
    )
  }
  if (status === 'saving' || isDirty) {
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-300 animate-pulse" />
        <span>Enregistrement…</span>
      </span>
    )
  }
  if (savedAt) {
    const timeStr = savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
        <span className={`h-2 w-2 rounded-full bg-emerald-500 transition-all ${flash ? 'scale-150 ring-2 ring-emerald-300 animate-ping' : ''}`} />
        <span>Enregistré à {timeStr}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span>Brouillon synchronisé</span>
    </span>
  )
}

export default function ConsultationSheet({
  open,
  onClose,
  patient,
  age,
  patientId,
  note,
  setNote,
  draft,
  acts = [],
  billingAmount = 0,
  visitLinked = false,
  onAddActe,
  onCompleted,
  onDiscarded,
  patientConsultations = [],
  startInReview = false,
  initialSection = 1,
  initialOpenGroup = 'ordonnance',
  initialEditingIdx = null,
  initialActiveDoc = null,
  initialLeftCollapsed = false,
  initialRightCollapsed = false,
}) {
  const [mode, setMode] = useState('note')
  const [showFinalize, setShowFinalize] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [result, setResult] = useState(null)
  const [contextOpen, setContextOpen] = useState(false)
  const [gateMissing, setGateMissing] = useState(null)
  const [gateNext, setGateNext] = useState('add')
  const [lightStage, setLightStage] = useState('choose')
  const [forceFull, setForceFull] = useState(false)
  const [motifError, setMotifError] = useState(false)
  const [billToCaisse, setBillToCaisse] = useState(true)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(initialLeftCollapsed)
  const [rightRailCollapsed, setRightRailCollapsed] = useState(initialRightCollapsed)

  // Ordonnance modal & validation state
  const [showOrdonnanceModal, setShowOrdonnanceModal] = useState(false)
  const [ordonnanceSnapshot, setOrdonnanceSnapshot] = useState(null)
  const [prescriptionRowErrors, setPrescriptionRowErrors] = useState({})
  const header = useDocumentHeader()

  // Exactly ONE section expanded at a time: activeSection (1, 2, or 3)
  const [activeSection, setActiveSection] = useState(initialSection)
  const [direction, setDirection] = useState(1)
  // Section validation states
  const [validatedSections, setValidatedSections] = useState({ 1: false, 2: false, 3: false })

  // Suggestion panel states
  const [suggHistoireOpen, setSuggHistoireOpen] = useState(false)
  const [suggHistoireGroup, setSuggHistoireGroup] = useState(null)
  const [suggExamenOpen, setSuggExamenOpen] = useState(false)
  const [suggExamenGroup, setSuggExamenGroup] = useState(null)
  const [suggConduiteOpen, setSuggConduiteOpen] = useState(false)
  const [suggConduiteGroup, setSuggConduiteGroup] = useState(null)

  const reduceMotion = useReducedMotion()
  const inFlight = useRef(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (open) {
      setMode('note')
      setActionError(null)
      setResult(null)
      setShowFinalize(startInReview)
      setShowDiscard(false)
      setShowOrdonnanceModal(false)
      setOrdonnanceSnapshot(note.ordonnance?.lines?.length ? JSON.stringify(note.ordonnance.lines) : null)
      setPrescriptionRowErrors({})
      setLightStage('choose')
      setForceFull(false)
      setDirection(1)
      setActiveSection(initialSection || 1)
      setValidatedSections({ 1: false, 2: false, 3: false })
      setMotifError(false)
      setBillToCaisse(true)
    }
  }, [open, startInReview, initialSection])

  const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  const isOrdonnanceDirty = useMemo(() => {
    if (!ordonnanceSnapshot) return false
    const currentClean = (note.traitements || []).filter((r) => r.medicament?.trim())
    return JSON.stringify(currentClean) !== ordonnanceSnapshot
  }, [note.traitements, ordonnanceSnapshot])

  useEffect(() => {
    if (note.ordonnance?.generated_at && !ordonnanceSnapshot) {
      const cleanRows = (note.traitements || []).filter((r) => r.medicament?.trim())
      setOrdonnanceSnapshot(JSON.stringify(cleanRows))
    }
  }, [note.ordonnance, ordonnanceSnapshot, note.traitements])

  const validatePrescriptionRows = () => {
    const tokens = allergyTokens(patient?.allergies)
    const errors = {}
    let firstErrIdx = -1

    ;(note.traitements || []).forEach((r, i) => {
      const medTrim = (r.medicament || '').trim()
      const posTrim = (r.posologie || '').trim()
      const dosTrim = (r.dosage || '').trim()
      const durTrim = (r.duree || '').trim()

      if (medTrim && !posTrim) {
        errors[i] = 'La posologie est obligatoire pour ce traitement.'
        if (firstErrIdx === -1) firstErrIdx = i
      } else if (!medTrim && (dosTrim || posTrim || durTrim)) {
        errors[i] = 'Veuillez indiquer le nom du médicament.'
        if (firstErrIdx === -1) firstErrIdx = i
      } else if (medTrim) {
        const matchedMed = MEDICATIONS.find((m) => fold(m.nom) === fold(medTrim))
        const hit = allergyMatch(medTrim, tokens) || (matchedMed?.molecule ? allergyMatch(matchedMed.molecule, tokens) : null)
        if (hit && !r.overrideAllergy) {
          errors[i] = 'Confirmation requise pour prescrire malgré l\'allergie déclarée.'
          if (firstErrIdx === -1) firstErrIdx = i
        }
      }
    })

    return { errors, firstErrIdx, isValid: Object.keys(errors).length === 0 }
  }

  const handleGenerateOrdonnance = () => {
    const { errors, firstErrIdx, isValid } = validatePrescriptionRows()
    if (!isValid) {
      setPrescriptionRowErrors(errors)
      setDirection(3 > activeSection ? 1 : -1)
      setActiveSection(3)
      setTimeout(() => {
        const el = document.getElementById(`prescription-line-${firstErrIdx}`) || document.getElementById('plan')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
      notify?.({
        title: 'Veuillez compléter ou confirmer les lignes de traitement.',
        tone: 'warning',
      })
      return
    }

    setPrescriptionRowErrors({})
    const cleanRows = (note.traitements || []).filter((r) => r.medicament?.trim())
    const ordoObj = {
      generated_at: new Date().toISOString(),
      lines: cleanRows,
    }
    setNote((n) => ({
      ...n,
      ordonnance: ordoObj,
    }))
    setOrdonnanceSnapshot(JSON.stringify(cleanRows))
    notify?.({ title: 'Ordonnance générée ✓', tone: 'success' })
    setShowOrdonnanceModal(true)
  }

  const { profile, notify } = useAppContext()
  const cabinetId = profile?.cabinet_id
  const currency = profile?.cabinets?.currency || profile?.cabinets?.devise || profile?.currency || profile?.devise || '€'
  const flow = forceFull ? 'full' : motifFlow(note.motif)
  const lightweight = flow === 'lightweight'

  useEffect(() => {
    if (!lightweight) setLightStage('choose')
  }, [lightweight])

  const followUpKind = lightweight ? 'renouvellement' : 'controle'
  useEffect(() => {
    if (open) setNote((n) => (n.followUpKind === followUpKind ? n : { ...n, followUpKind }))
  }, [open, followUpKind, setNote])

  // Context queries
  const ordonnancesQ = useQuery({
    queryKey: ['patient-real-ordonnances', cabinetId, patientId],
    queryFn: () => getOrdonnancesForPatient(cabinetId, patientId),
    enabled: open && lightweight && Boolean(cabinetId && patientId),
  })
  const lastOrdonnance = useMemo(() => lastActiveOrdonnance(ordonnancesQ.data), [ordonnancesQ.data])

  const vitalsQ = useQuery({
    queryKey: ['consult-ctx-vitals', patientId],
    queryFn: () => getPatientVitals(patientId),
    enabled: open && Boolean(patientId),
  })
  const medsQ = useQuery({
    queryKey: ['consult-ctx-meds', patientId],
    queryFn: () => getPatientMedications(patientId),
    enabled: open && Boolean(patientId),
  })
  const encountersQ = useQuery({
    queryKey: ['encounters', patientId],
    queryFn: () => listCompletedEncounters(patientId),
    enabled: open && Boolean(patientId),
  })

  const vitalsRows = useMemo(() => {
    const rows = Array.isArray(vitalsQ.data) ? [...vitalsQ.data] : []
    rows.sort((a, b) => new Date(b.date_mesure) - new Date(a.date_mesure))
    return rows
  }, [vitalsQ.data])
  const lastVitals = vitalsRows[0] || null
  const activeMeds = useMemo(() => (Array.isArray(medsQ.data) ? medsQ.data.filter((m) => m.status === 'Actif') : []), [medsQ.data])

  const setField = (key) => (value) => setNote((n) => ({ ...n, [key]: value }))
  const setVital = (key) => (e) => setNote((n) => ({ ...n, vitals: { ...n.vitals, [key]: e.target.value } }))
  const applyLastVital = (key, value) => setNote((n) => ({ ...n, vitals: { ...n.vitals, [key]: String(value) } }))
  const confirmVital = (key) => setNote((n) => {
    const value = key === 'bloodPressure'
      ? `${String(n.vitals.bloodPressureSystolic).trim()}/${String(n.vitals.bloodPressureDiastolic).trim()}`
      : String(n.vitals[key]).trim()
    return { ...n, vitalsConfirmed: { ...n.vitalsConfirmed, [key]: value } }
  })

  const fmtDate = (d) => {
    if (!d) return ''
    const date = new Date(d)
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000)
    if (days === 0) return 'aujourd\'hui'
    if (days === 1) return 'hier'
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }
  const when = lastVitals ? fmtDate(lastVitals.date_mesure) : ''

  // Speech dictation
  const speechHistoire = useSpeechRecognition({
    onFinalChunk: (chunk) => {
      setNote((n) => {
        const prev = n.histoire || ''
        const space = prev.length > 0 && !/\s$/.test(prev) ? ' ' : ''
        return { ...n, histoire: prev + space + chunk }
      })
    },
  })

  const speechExamen = useSpeechRecognition({
    onFinalChunk: (chunk) => {
      setNote((n) => {
        const prev = n.examen || ''
        const space = prev.length > 0 && !/\s$/.test(prev) ? ' ' : ''
        return { ...n, examen: prev + space + chunk }
      })
    },
  })

  const progress = computeProgress(note, { ready: draft.ready, ageYears: age, flow, done: mode === 'done' })
  const warnings = finalizeWarnings(note, { flow })
  const { blockers } = progress
  const tokens = allergyTokens(patient?.allergies)
  const allergyHits = note.traitements.map((r) => allergyMatch(r.medicament, tokens)).filter(Boolean)

  const patientName = `${patient?.prenom || ''} ${patient?.nom || ''}`.trim() || 'Patient'
  const totalActionsCount =
    (note.traitements || []).filter((r) => r.medicament?.trim()).length +
    (note.examens || []).length +
    (note.documents || []).length +
    acts.length

  // Section status determinations
  const section1Status = motifError
    ? 'a_completer'
    : validatedSections[1]
      ? 'valide'
      : (note.motif?.trim() || note.histoire?.trim() || note.depuis || note.evolution)
        ? 'en_cours'
        : 'a_completer'

  const hasAnyVital = Object.values(note.vitals || {}).some((v) => String(v || '').trim() !== '')
  const section2Status = validatedSections[2]
    ? 'valide'
    : (hasAnyVital || note.examen?.trim())
      ? 'en_cours'
      : 'a_completer'

  const hasSection3Data = (note.diagnostics?.length > 0) || note.conduite?.trim() || note.traitements?.some((t) => t.medicament?.trim()) || note.examens?.length > 0 || note.documents?.length > 0
  const section3Status = validatedSections[3]
    ? 'valide'
    : hasSection3Data
      ? 'en_cours'
      : 'a_completer'

  // Prescribing gate
  const addTreatmentRow = () => setNote((n) => (n.traitements.length >= 30 ? n : { ...n, traitements: [...n.traitements, { medicament: '', posologie: '', duree: '' }] }))
  const withPrescribingGate = (next, action) => {
    const r = prescribingReadiness(patient, note)
    if (r.ready) { setGateMissing(null); action(); return }
    setGateNext(next)
    setGateMissing(r.missing)
  }
  const requestAddTreatment = () => withPrescribingGate('add', addTreatmentRow)

  const handleSelectSection = (target) => {
    if (target === activeSection) return
    setDirection(target > activeSection ? 1 : -1)
    setActiveSection(target)
    if (scrollRef.current && scrollRef.current.scrollTop > 40) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleValidateAndContinueSection1 = () => {
    if (!note.motif || !note.motif.trim()) {
      setMotifError(true)
      return
    }
    setMotifError(false)
    setValidatedSections((v) => ({ ...v, 1: true }))
    const next = lightweight ? 3 : 2
    setDirection(1)
    setActiveSection(next)
    if (scrollRef.current && scrollRef.current.scrollTop > 40) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleValidateAndContinueSection2 = () => {
    setValidatedSections((v) => ({ ...v, 2: true }))
    setDirection(1)
    setActiveSection(3)
    if (scrollRef.current && scrollRef.current.scrollTop > 40) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const sectionVariants = {
    enter: (dir) => (reduceMotion ? {
      opacity: 0,
    } : {
      opacity: 0,
      y: 8,
      x: dir > 0 ? -12 : 12,
    }),
    center: {
      opacity: 1,
      y: 0,
      x: 0,
      transition: reduceMotion ? {
        duration: 0.15,
      } : {
        duration: 0.2,
        delay: 0.05,
        ease: 'easeOut',
      },
    },
    exit: (dir) => (reduceMotion ? {
      opacity: 0,
      transition: { duration: 0.15 },
    } : {
      opacity: 0,
      y: -8,
      x: dir > 0 ? 12 : -12,
      transition: { duration: 0.15, ease: 'easeIn' },
    }),
  }

  const doRenew = () => {
    setNote((n) => applyRenewal(n, lastOrdonnance))
    setActionError(null)
    setShowFinalize(true)
  }
  const openRenewalEdit = () => {
    setNote((n) => prefillRenewalEdit(n, lastOrdonnance))
    setLightStage('edit')
    setDirection(1)
    setActiveSection(3)
    if (scrollRef.current && scrollRef.current.scrollTop > 40) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const onGateContinue = () => {
    setGateMissing(null)
    if (gateNext === 'renew') doRenew()
    else if (gateNext === 'modify') openRenewalEdit()
    else addTreatmentRow()
  }

  const goBack = async () => {
    if (mode === 'done') { onCompleted?.(result); return }
    try { await draft.flush() } catch {
      if (!window.confirm('Les dernières modifications n\'ont pas pu être enregistrées. Quitter quand même ?')) return
    }
    onClose()
  }

  const triggerRef = useRef(null)

  const openFinalize = (e) => {
    if (e?.currentTarget) triggerRef.current = e.currentTarget
    else if (document.activeElement) triggerRef.current = document.activeElement
    handleFinishConsultation()
  }

  const closeFinalize = () => {
    setShowFinalize(false)
    setTimeout(() => triggerRef.current?.focus?.(), 50)
  }

  const openDiscard = (e) => {
    if (e?.currentTarget) triggerRef.current = e.currentTarget
    else if (document.activeElement) triggerRef.current = document.activeElement
    setActionError(null)
    setShowDiscard(true)
  }

  const closeDiscard = () => {
    setShowDiscard(false)
    setTimeout(() => triggerRef.current?.focus?.(), 50)
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showFinalize && !busy) closeFinalize()
        else if (showDiscard && !busy) closeDiscard()
        else if (!showFinalize && !showDiscard) goBack()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (showFinalize) {
          if (!busy) finalize()
          return
        }
        if (showDiscard) return

        if (activeSection === 1) {
          handleValidateAndContinueSection1()
        } else if (activeSection === 2) {
          handleValidateAndContinueSection2()
        } else if (activeSection === 3) {
          openFinalize()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, showFinalize, showDiscard, busy, activeSection, lightweight, note.motif])

  // Finishing flow validation
  const handleFinishConsultation = () => {
    setActionError(null)
    if (!note.motif || !note.motif.trim()) {
      setMotifError(true)
      setDirection(-1)
      setActiveSection(1)
      if (scrollRef.current && scrollRef.current.scrollTop > 40) {
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
      setTimeout(() => {
        const input = document.querySelector('input[placeholder*="Motif"]')
        if (input) input.focus()
      }, 150)
      return
    }
    setMotifError(false)

    // Finalize validation: block if any line is incomplete or has unconfirmed allergy
    const { errors, firstErrIdx, isValid } = validatePrescriptionRows()
    if (!isValid) {
      setPrescriptionRowErrors(errors)
      setDirection(3 > activeSection ? 1 : -1)
      setActiveSection(3)
      setTimeout(() => {
        const el = document.getElementById(`prescription-line-${firstErrIdx}`) || document.getElementById('plan')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
      notify?.({
        title: 'Veuillez compléter ou confirmer les lignes de traitement avant de valider.',
        tone: 'warning',
      })
      return
    }

    setPrescriptionRowErrors({})
    setShowFinalize(true)
  }

  const finalize = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setActionError(null)
    try {
      const billingProposed = (visitLinked && billToCaisse) ? billingAmount : null
      const res = await draft.complete({ billingAmount: billingProposed, billingType: 'cash' })
      setResult(res)
      setShowFinalize(false)
      const hasOrdonnance = Boolean(note.ordonnance && note.traitements?.some((t) => t.medicament?.trim()))
      const toastMsg = hasOrdonnance
        ? 'Consultation enregistrée ✓ — Ordonnance disponible'
        : 'Consultation enregistrée ✓'
      notify?.({ title: toastMsg, tone: 'success' })
      setMode('done')
    } catch (e) {
      setActionError(e?.message || 'Impossible de finaliser la visite.')
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  const discard = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setActionError(null)
    try {
      await draft.discard()
      setShowDiscard(false)
      onDiscarded?.()
    } catch (e) {
      setActionError(e?.message || 'Impossible d\'abandonner le brouillon.')
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  const loading = draft.status === 'loading' || draft.status === 'idle'
  const openError = draft.status === 'open_error' && draft.error?.code === 'forbidden'

  const prescribingGate = gateMissing && (
    <PrescribingGate
      patient={patient}
      patientId={patientId}
      missing={gateMissing}
      pregnancyStatus={note.pregnancyStatus}
      onPregnancy={setField('pregnancyStatus')}
      onContinue={onGateContinue}
      onCancel={() => setGateMissing(null)}
    />
  )


  // ── COLLAPSED SUMMARIES (Max 2 lines, clean text) ──
  const section1Summary = useMemo(() => {
    const parts = [
      note.motif?.trim(),
      note.depuis ? `depuis ${note.depuis.toLowerCase()}` : null,
      note.evolution ? note.evolution.toLowerCase() : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : '—'
  }, [note.motif, note.depuis, note.evolution])

  const section2Summary = useMemo(() => {
    const v = note.vitals || {}
    const num = (val) => {
      const n = parseFloat(String(val ?? '').replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    // Only VALID complete values
    // TA: both systolic and diastolic must be valid integers > 0
    const sys = parseInt(String(v.bloodPressureSystolic || '').trim(), 10)
    const dia = parseInt(String(v.bloodPressureDiastolic || '').trim(), 10)
    const validTa = (Number.isInteger(sys) && sys > 0 && Number.isInteger(dia) && dia > 0)
      ? `TA ${sys}/${dia}`
      : null

    // T: must be between 30 and 45
    const temp = num(v.temperature)
    const validTemp = (temp != null && temp >= 30 && temp <= 45)
      ? `T ${String(v.temperature).replace('.', ',')}°C`
      : null

    // FC: valid integer
    const fc = parseInt(String(v.heartRate || '').trim(), 10)
    const validFc = (Number.isInteger(fc) && fc > 0 && fc <= 300)
      ? `FC ${fc}`
      : null

    // IMC: weight and height must be valid
    const w = parseFloat(String(v.weight || '').replace(',', '.'))
    const h = parseFloat(String(v.height || '').replace(',', '.'))
    const imc = (Number.isFinite(w) && Number.isFinite(h) && h > 0 && w > 0)
      ? (w / Math.pow(h / 100, 2)).toFixed(1).replace('.', ',')
      : null
    const validImc = imc ? `IMC ${imc}` : null

    // SpO2: valid integer between 1 and 100
    const spo2 = parseInt(String(v.oxygenSaturation || '').trim(), 10)
    const validSpo2 = (Number.isInteger(spo2) && spo2 > 0 && spo2 <= 100)
      ? `SpO₂ ${spo2}%`
      : null

    // Weight if no IMC
    const validWeight = (!validImc && Number.isFinite(w) && w > 0)
      ? `Poids ${String(v.weight).replace('.', ',')} kg`
      : null

    // EVA: valid integer between 0 and 10
    const eva = parseInt(String(v.painScore ?? '').trim(), 10)
    const validEva = (!isNaN(eva) && eva >= 0 && eva <= 10 && String(v.painScore).trim() !== '')
      ? `EVA ${eva}/10`
      : null

    const vitalsParts = [
      validTa,
      validTemp,
      validFc,
      validImc,
      validSpo2,
      validWeight,
      validEva,
    ].filter(Boolean)

    return vitalsParts.length > 0 ? vitalsParts.join(' · ') : '—'
  }, [note.vitals])

  const section3Summary = useMemo(() => {
    const diagList = (note.diagnostics || []).filter(Boolean)
    const diagStr = diagList.length > 0
      ? (diagList.slice(0, 3).join(', ') + (diagList.length > 3 ? ` (+${diagList.length - 3})` : ''))
      : null

    const activeMeds = (note.traitements || []).filter((t) => t.medicament?.trim())
    const medStr = activeMeds.length > 0
      ? `${activeMeds.length} médicament${activeMeds.length > 1 ? 's' : ''}`
      : null

    const examStr = note.examens?.length > 0
      ? `${note.examens.length} examen${note.examens.length > 1 ? 's' : ''}`
      : null

    const ctrlStr = note.followUpDate
      ? `contrôle ${new Date(`${note.followUpDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
      : null

    const parts = [diagStr, medStr, examStr, ctrlStr].filter(Boolean)
    if (parts.length > 0) return parts.join(' · ')
    if (note.conduite?.trim()) return 'Conduite clinique définie'
    return 'Diagnostic, traitement et suite'
  }, [note.diagnostics, note.traitements, note.followUpDate, note.conduite, note.examens])

  const s1Completed = Boolean(note.motif?.trim())
  const s1RequiredEmpty = !s1Completed

  const s2HasContent = Boolean(
    note.examen?.trim() ||
    Object.values(note.vitals || {}).some((v) => v !== undefined && v !== null && String(v).trim() !== '')
  )

  const s3HasContent = Boolean(
    (note.diagnostics || []).filter(Boolean).length > 0 ||
    note.conduite?.trim() ||
    (note.traitements || []).some((t) => t.medicament?.trim()) ||
    (note.examens || []).length > 0 ||
    (note.documents || []).length > 0 ||
    note.followUpDate
  )


  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="consultation-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Nouvelle consultation"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex flex-col bg-[#F8FAFC]"
        >
          {/* ═══════════════════════════════════════
              STICKY FULL-WIDTH HEADER
             ═══════════════════════════════════════ */}
          <header className="sticky top-0 z-30 flex h-14 w-full flex-shrink-0 items-center justify-between border-b border-slate-200/90 bg-white px-4 sm:px-6 shadow-2xs">
            {/* Left side: Back to dossier + Left sidebar toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Retour au dossier</span>
              </button>

              <div className="hidden lg:block h-4 w-px bg-slate-200" />

              {/* Desktop left sidebar toggle */}
              <button
                type="button"
                onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
                className={`hidden lg:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] font-medium transition-colors shadow-2xs ${
                  leftSidebarCollapsed
                    ? 'border-blue-200 bg-blue-50/70 text-[#1A56DB] hover:bg-blue-100/70'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
                title={leftSidebarCollapsed ? 'Afficher le volet patient' : 'Masquer le volet patient'}
                aria-label={leftSidebarCollapsed ? 'Afficher le volet patient' : 'Masquer le volet patient'}
              >
                <PanelLeft className="h-3.5 w-3.5 text-slate-500" />
                <span>{leftSidebarCollapsed ? patientName : 'Volet patient'}</span>
              </button>
            </div>

            {/* Right side: SaveStatus, Actions toggle, Abandonner, Finaliser */}
            <div className="flex items-center gap-2 sm:gap-3">
              <SaveStatus draft={draft} />

              {/* Mobile Drawer Trigger */}
              <button
                type="button"
                onClick={() => setContextOpen(true)}
                className="lg:hidden inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                <PanelLeft className="h-3.5 w-3.5" />
                <span>Contexte</span>
              </button>

              {/* Desktop right rail toggle */}
              <button
                type="button"
                onClick={() => setRightRailCollapsed(!rightRailCollapsed)}
                className={`hidden xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] font-medium transition-colors shadow-2xs ${
                  rightRailCollapsed
                    ? 'border-blue-200 bg-blue-50/70 text-[#1A56DB] hover:bg-blue-100/70'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
                title={rightRailCollapsed ? 'Afficher les actions cliniques' : 'Masquer les actions cliniques'}
                aria-label={rightRailCollapsed ? 'Afficher les actions cliniques' : 'Masquer les actions cliniques'}
              >
                <PanelRight className="h-3.5 w-3.5 text-slate-500" />
                <span>{rightRailCollapsed ? `Actions (${totalActionsCount})` : 'Actions rapides'}</span>
              </button>

              <Button
                variant="ghost"
                size="sm"
                className="!text-slate-500 hover:!text-slate-800 text-[13px]"
                onClick={openDiscard}
              >
                Abandonner
              </Button>

              <Button
                variant="primary"
                size="sm"
                disabled={!draft.ready}
                className="!bg-[#1A56DB] hover:!bg-blue-700 !text-white !font-semibold !px-4 !py-2 !rounded-xl shadow-xs"
                onClick={openFinalize}
              >
                Finaliser la visite
              </Button>
            </div>
          </header>

          {/* ═══════════════════════════════════════
              MAIN AREA (Left Sidebar + Content Area)
             ═══════════════════════════════════════ */}
          <div className="flex min-h-0 flex-1 relative overflow-hidden">
            {/* Left Sidebar */}
            <PatientContextSidebar
              patient={patient}
              patientId={patientId}
              age={age}
              meds={activeMeds}
              medsState={medsQ.isLoading ? 'loading' : medsQ.isError ? 'error' : 'ok'}
              vitalsRows={vitalsRows}
              vitalsState={vitalsQ.isLoading ? 'loading' : vitalsQ.isError ? 'error' : 'ok'}
              encounters={encountersQ.data || []}
              encountersState={encountersQ.isLoading ? 'loading' : encountersQ.isError ? 'error' : 'ok'}
              isCollapsed={leftSidebarCollapsed}
              onToggleCollapse={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
              className={leftSidebarCollapsed ? 'hidden lg:flex w-14 flex-shrink-0' : 'hidden lg:flex w-[320px] flex-shrink-0'}
            />

            {/* Center Content Workspace */}
            <main ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto bg-[#F8FAFC]">
              {openError ? (
                <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
                  <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" />
                  <p className="text-[15px] font-bold text-slate-900">
                    {draft.error?.code === 'forbidden' ? 'Accès réservé au médecin praticien' : 'Consultation indisponible'}
                  </p>
                  <p className="mt-1.5 text-[13px] text-slate-600 leading-relaxed">
                    {draft.error?.code === 'forbidden'
                      ? 'La conduite et la saisie de la consultation clinique sont strictement réservées au médecin.'
                      : (draft.error?.message || 'Impossible d\'ouvrir la consultation.')}
                  </p>
                  <div className="mt-5 flex justify-center gap-2.5">
                    <Button variant="primary" size="sm" onClick={onClose}>Retour au dossier</Button>
                    {draft.error?.code !== 'forbidden' && (
                      <Button variant="secondary" size="sm" onClick={draft.retryOpen}>Réessayer</Button>
                    )}
                  </div>
                </div>
              ) : mode === 'done' ? (
                <DoneScreen
                  note={note}
                  patientName={patientName}
                  result={result}
                  onContinue={() => onCompleted?.(result)}
                />
              ) : loading && !draft.ready ? (
                <div className="flex h-full items-center justify-center gap-2 text-[14px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" /> Chargement de la consultation…
                </div>
              ) : (
                <div className={`grid grid-cols-1 ${rightRailCollapsed ? 'xl:grid-cols-[1fr_20px_56px]' : 'xl:grid-cols-[1fr_20px_320px]'} items-start px-4 py-4 pb-20 sm:px-6 lg:px-8 max-w-[1520px] mx-auto w-full transition-all`}>
                  {/* ── COLUMN 1: MAIN CONTENT ── */}
                  <div className="min-w-0 col-span-1">
                  {/* Offline / Local Mode Banner */}
                  {(draft.offline || draft.isOffline) && (
                    <div className="mb-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-2.5 flex items-center justify-between text-[12.5px] text-amber-900 shadow-2xs">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>Connexion réseau indisponible. Vos données restent affichées et sont enregistrées localement dans votre navigateur.</span>
                      </span>
                      {draft.retry && (
                        <button
                          type="button"
                          onClick={draft.retry}
                          className="text-[12px] font-semibold text-amber-800 hover:text-amber-950 underline px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                        >
                          Réessayer la synchronisation
                        </button>
                      )}
                    </div>
                  )}

                  {/* Draft Restore Banner: h-10, single line, clock icon, [Commencer à zéro ghost][Reprendre blue solid][✕ dismiss] */}
                  {draft.existingDraft && (
                    <div className="mb-3.5 flex h-10 items-center justify-between gap-3 rounded-xl border border-blue-200/90 bg-blue-50/90 px-3.5 text-blue-950 shadow-2xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="h-4 w-4 text-[#1A56DB] shrink-0" />
                        <span className="font-semibold text-slate-800 text-[12.5px] truncate">
                          Reprendre le brouillon de {draft.existingDraft.time}&nbsp;?
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={draft.startFresh}
                          className="!text-slate-600 hover:!text-slate-900 !px-2.5 !py-1 text-[12px]"
                        >
                          Commencer à zéro
                        </Button>
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={draft.clearExistingDraft}
                          className="!bg-[#1A56DB] hover:!bg-blue-700 !px-3 !py-1 text-[12px]"
                        >
                          Reprendre
                        </Button>
                        <button
                          type="button"
                          onClick={draft.startFresh}
                          aria-label="Ignorer le brouillon"
                          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-blue-100/50 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ═══════════════════════════════════════
                      STICKY 3-STAGE CLINICAL PROGRESS NAVIGATOR
                     ═══════════════════════════════════════ */}
                  <nav
                    aria-label="Progression de la consultation"
                    className="sticky top-0 z-20 py-2.5 bg-[#F8FAFC]/95 backdrop-blur-xs border-b border-slate-200/80 mb-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                        {/* Step 1: Motif & symptômes */}
                        <button
                          type="button"
                          onClick={() => handleSelectSection(1)}
                          title={section1Summary !== '—' ? section1Summary : 'Motif & symptômes'}
                          className={`inline-flex items-center gap-2 h-8 px-3.5 rounded-xl text-[13px] font-semibold transition-all whitespace-nowrap shadow-2xs ${
                            activeSection === 1
                              ? 'bg-[#1A56DB] text-white shadow-xs font-semibold'
                              : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span>1 · Motif & symptômes</span>
                          {s1Completed && (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                              <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                            </span>
                          )}
                          {s1RequiredEmpty && activeSection !== 1 && (
                            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" title="Motif obligatoire" />
                          )}
                        </button>

                        {/* Step 2: Examen clinique */}
                        {!lightweight && (
                          <button
                            type="button"
                            onClick={() => handleSelectSection(2)}
                            title={section2Summary !== '—' ? section2Summary : 'Examen clinique'}
                            className={`inline-flex items-center gap-2 h-8 px-3.5 rounded-xl text-[13px] font-semibold transition-all whitespace-nowrap shadow-2xs ${
                              activeSection === 2
                                ? 'bg-[#1A56DB] text-white shadow-xs font-semibold'
                                : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <span>2 · Examen clinique</span>
                            {s2HasContent && (
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                                <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                              </span>
                            )}
                          </button>
                        )}

                        {/* Step 3: Évaluation & conduite */}
                        <button
                          type="button"
                          onClick={() => handleSelectSection(3)}
                          title={section3Summary !== '—' ? section3Summary : 'Évaluation & conduite'}
                          className={`inline-flex items-center gap-2 h-8 px-3.5 rounded-xl text-[13px] font-semibold transition-all whitespace-nowrap shadow-2xs ${
                            activeSection === 3
                              ? 'bg-[#1A56DB] text-white shadow-xs font-semibold'
                              : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span>3 · Évaluation & conduite</span>
                          {s3HasContent && (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                              <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                            </span>
                          )}
                        </button>
                      </div>

                      <div className="hidden sm:flex items-center gap-1.5 text-[11.5px] font-medium text-slate-400 shrink-0">
                        <span>Étape {activeSection} sur {lightweight ? '2' : '3'}</span>
                      </div>
                    </div>
                  </nav>

                  {/* ═══════════════════════════════════════
                      SINGLE-VIEWPORT CONSULTATION SECTION (AnimatePresence)
                     ═══════════════════════════════════════ */}
                  <AnimatePresence mode="wait" initial={false} custom={direction}>
                    {activeSection === 1 && (
                      <motion.div
                        key="section-1"
                        custom={direction}
                        variants={sectionVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="min-h-[420px]"
                      >
                        <StageSection
                          id="subjectif"
                          index={1}
                          title="Motif & symptômes"
                          hint="Pourquoi le patient consulte aujourd'hui"
                          summary={section1Summary}
                          isExpanded={true}
                          status={section1Status}
                          isValidated={validatedSections[1]}
                          onValidateAndContinue={handleValidateAndContinueSection1}
                          validateButtonLabel="Valider et continuer →"
                        >
                      {/* Motif de consultation * */}
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Motif de consultation
                        </label>
                        <SmartMotifInput
                          value={note.motif || ''}
                          onChange={(val) => {
                            setField('motif')(val)
                            if (val && val.trim()) setMotifError(false)
                          }}
                          placeholder="Motif principal de la consultation..."
                          autoFocus={activeSection === 1}
                        />
                        {motifError && (
                          <p className="mt-1.5 text-[12px] font-medium text-amber-700 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>Le motif de consultation est obligatoire pour valider ou finaliser la visite.</span>
                          </p>
                        )}
                      </div>

                      {/* Lightweight Renewal Panel if renewal flow */}
                      <AnimatePresence initial={false}>
                        {lightweight && (
                          <RenewalPanel
                            key="renewal"
                            ordonnance={lastOrdonnance}
                            loading={ordonnancesQ.isLoading}
                            error={ordonnancesQ.isError}
                            retrying={ordonnancesQ.isFetching}
                            onRetry={() => ordonnancesQ.refetch()}
                            stage={lightStage}
                            gate={lightStage === 'choose' ? prescribingGate : null}
                            onRenew={() => withPrescribingGate('renew', doRenew)}
                            onModify={() => withPrescribingGate('modify', openRenewalEdit)}
                            onValidate={() => { setActionError(null); setShowFinalize(true) }}
                            onFullForm={() => { setForceFull(true); setGateMissing(null) }}
                          />
                        )}
                      </AnimatePresence>

                      {/* Symptômes / histoire actuelle with integrated DEPUIS & ÉVOLUTION */}
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                            Symptômes / histoire actuelle
                          </label>
                          <div className="flex items-center gap-1.5">
                            {/* Ghost-icon Dicter */}
                            <button
                              type="button"
                              onClick={() => speechHistoire.toggleListening()}
                              className={`inline-flex items-center gap-1 h-7 px-2 text-[12px] font-medium rounded-lg transition-colors ${
                                speechHistoire.isListening
                                  ? 'bg-red-50 text-red-600 animate-pulse'
                                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                              }`}
                              aria-label={speechHistoire.isListening ? 'Arrêter la dictée' : 'Dicter'}
                            >
                              <Mic className={`h-3.5 w-3.5 ${speechHistoire.isListening ? 'text-red-600' : 'text-slate-400'}`} />
                              <span>{speechHistoire.isListening ? 'Écoute…' : 'Dicter'}</span>
                            </button>

                            {/* Ghost-icon Suggestions */}
                            <SuggestionsTrigger
                              kind="histoire"
                              value={note.histoire}
                              onChange={setField('histoire')}
                              open={suggHistoireOpen}
                              onOpenChange={setSuggHistoireOpen}
                              group={suggHistoireGroup}
                              onGroupChange={setSuggHistoireGroup}
                            />
                          </div>
                        </div>

                        {/* 4 rows, auto-grow textarea (min-h-[96px]) */}
                        <textarea
                          rows={4}
                          value={note.histoire || ''}
                          onChange={(e) => setField('histoire')(e.target.value)}
                          onInput={(e) => {
                            e.target.style.height = 'auto'
                            e.target.style.height = `${Math.max(96, e.target.scrollHeight)}px`
                          }}
                          placeholder="Début, évolution, intensité, facteurs aggravants ou soulageants, traitements déjà essayés..."
                          className="w-full resize-y min-h-[96px] max-h-[320px] rounded-xl border border-slate-200/90 bg-white p-3.5 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:border-[#1A56DB] focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs transition-all leading-relaxed"
                        />

                        {/* DEPUIS & ÉVOLUTION chips directly under textarea (smaller 28px height, 12px labels without colon) */}
                        <div className="space-y-2 pt-1">
                          {/* DEPUIS */}
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-[12px] font-semibold text-slate-500 w-20 shrink-0">
                              Depuis
                            </span>
                            <div
                              className="flex flex-wrap gap-1.5"
                              role="radiogroup"
                              aria-label="Depuis"
                              onKeyDown={(e) => {
                                const curIdx = DEPUIS_OPTIONS.indexOf(note.depuis)
                                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  const nextIdx = curIdx < 0 ? 0 : (curIdx + 1) % DEPUIS_OPTIONS.length
                                  setField('depuis')(DEPUIS_OPTIONS[nextIdx])
                                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  const prevIdx = curIdx < 0 ? DEPUIS_OPTIONS.length - 1 : (curIdx - 1 + DEPUIS_OPTIONS.length) % DEPUIS_OPTIONS.length
                                  setField('depuis')(DEPUIS_OPTIONS[prevIdx])
                                }
                              }}
                            >
                              {DEPUIS_OPTIONS.map((o, idx) => {
                                const isSelected = note.depuis === o
                                return (
                                  <button
                                    key={o}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    tabIndex={isSelected || (idx === 0 && !note.depuis) ? 0 : -1}
                                    onClick={() => setField('depuis')(isSelected ? '' : o)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        setField('depuis')(isSelected ? '' : o)
                                      }
                                    }}
                                    className={`h-7 px-3 text-[12px] rounded-full transition-all flex items-center border ${
                                      isSelected
                                        ? 'bg-blue-50 text-blue-700 border-blue-300 font-medium'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                    }`}
                                  >
                                    {o}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* ÉVOLUTION */}
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-[12px] font-semibold text-slate-500 w-20 shrink-0">
                              Évolution
                            </span>
                            <div
                              className="flex flex-wrap gap-1.5"
                              role="radiogroup"
                              aria-label="Évolution"
                              onKeyDown={(e) => {
                                const curIdx = EVOLUTION_OPTIONS.indexOf(note.evolution)
                                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  const nextIdx = curIdx < 0 ? 0 : (curIdx + 1) % EVOLUTION_OPTIONS.length
                                  setField('evolution')(EVOLUTION_OPTIONS[nextIdx])
                                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  const prevIdx = curIdx < 0 ? EVOLUTION_OPTIONS.length - 1 : (curIdx - 1 + EVOLUTION_OPTIONS.length) % EVOLUTION_OPTIONS.length
                                  setField('evolution')(EVOLUTION_OPTIONS[prevIdx])
                                }
                              }}
                            >
                              {EVOLUTION_OPTIONS.map((o, idx) => {
                                const isSelected = note.evolution === o
                                return (
                                  <button
                                    key={o}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    tabIndex={isSelected || (idx === 0 && !note.evolution) ? 0 : -1}
                                    onClick={() => setField('evolution')(isSelected ? '' : o)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        setField('evolution')(isSelected ? '' : o)
                                      }
                                    }}
                                    className={`h-7 px-3 text-[12px] rounded-full transition-all flex items-center border ${
                                      isSelected
                                        ? 'bg-blue-50 text-blue-700 border-blue-300 font-medium'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                    }`}
                                  >
                                    {o}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </StageSection>
                  </motion.div>
                )}

                {/* ── SECTION 2: EXAMEN CLINIQUE ── */}
                {activeSection === 2 && !lightweight && (
                  <motion.div
                    key="section-2"
                    custom={direction}
                    variants={sectionVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="min-h-[420px]"
                  >
                    <StageSection
                      id="objectif"
                      index={2}
                      title="Examen clinique"
                      hint="Constantes et observations"
                      summary={section2Summary}
                      isExpanded={true}
                      status={section2Status}
                      isValidated={validatedSections[2]}
                      onValidateAndContinue={handleValidateAndContinueSection2}
                      validateButtonLabel="Valider l'examen →"
                    >
                      {/* Constantes Grid */}
                      <VitalsGrid
                          vitals={note.vitals}
                          setVital={setVital}
                          applyLast={applyLastVital}
                          lastVitals={lastVitals}
                          when={when}
                          age={age}
                          review={progress.vitalsReview}
                          onConfirm={confirmVital}
                        />

                        {/* Observations cliniques */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                              Observations et éléments pertinents de l'examen clinique
                            </label>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => speechExamen.toggleListening()}
                                className={`inline-flex items-center gap-1 h-7 px-2 text-[12px] font-medium rounded-lg transition-colors ${
                                  speechExamen.isListening
                                    ? 'bg-red-50 text-red-600 animate-pulse'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                                }`}
                                aria-label={speechExamen.isListening ? 'Arrêter la dictée' : 'Dicter'}
                              >
                                <Mic className={`h-3.5 w-3.5 ${speechExamen.isListening ? 'text-red-600' : 'text-slate-400'}`} />
                                <span>{speechExamen.isListening ? 'Écoute…' : 'Dicter'}</span>
                              </button>

                              <SuggestionsTrigger
                                kind="examen"
                                value={note.examen}
                                onChange={setField('examen')}
                                open={suggExamenOpen}
                                onOpenChange={setSuggExamenOpen}
                                group={suggExamenGroup}
                                onGroupChange={setSuggExamenGroup}
                              />
                            </div>
                          </div>

                          <textarea
                            rows={4}
                            value={note.examen || ''}
                            onChange={(e) => setField('examen')(e.target.value)}
                            placeholder="Observations et éléments pertinents de l'examen clinique..."
                            className="w-full resize-y min-h-[100px] max-h-[260px] rounded-xl border border-slate-200/90 bg-white p-3.5 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:border-[#1A56DB] focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs transition-all leading-relaxed"
                          />
                        </div>
                      </StageSection>
                    </motion.div>
                  )}

                  {/* ── SECTION 3: DÉCISION CLINIQUE & SUIVI ── */}
                  {activeSection === 3 && (
                    <motion.div
                      key="section-3"
                      custom={direction}
                      variants={sectionVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      className="min-h-[420px]"
                    >
                      <StageSection
                        id="plan"
                        index={3}
                        title="Évaluation & conduite"
                        hint="Diagnostic et suivi"
                        summary={section3Summary}
                        isExpanded={true}
                        status={section3Status}
                        isValidated={validatedSections[3]}
                        onValidateAndContinue={openFinalize}
                        validateButtonLabel="Finaliser la visite"
                        footerClassName="xl:hidden"
                      >
                        {/* SINGLE COLUMN: Decision clinique & suivi */}
                        <div className="space-y-6">
                          {/* Diagnostic picker */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                                Diagnostic(s) retenu(s)
                              </label>
                              {note.diagnostics?.length > 0 && (
                                <span className="inline-flex items-center rounded-full bg-blue-50 text-[#1A56DB] px-2 py-0.5 text-[10.5px] font-bold">
                                  {note.diagnostics.length} diagnostic{note.diagnostics.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <DiagnosisPicker
                              items={note.diagnostics || []}
                              onChange={setField('diagnostics')}
                            />
                          </div>

                          {/* Conduite à tenir */}
                          <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                                Conduite à tenir & recommandations
                              </label>
                              <SuggestionsTrigger
                                kind="plan"
                                value={note.conduite}
                                onChange={setField('conduite')}
                                open={suggConduiteOpen}
                                onOpenChange={setSuggConduiteOpen}
                                group={suggConduiteGroup}
                                onGroupChange={setSuggConduiteGroup}
                              />
                            </div>
                            <textarea
                              rows={4}
                              value={note.conduite || ''}
                              onChange={(e) => setField('conduite')(e.target.value)}
                              placeholder="Décision clinique, conduite à tenir, consignes données au patient..."
                              className="w-full resize-y min-h-[120px] max-h-[300px] rounded-xl border border-slate-200/90 bg-white p-3.5 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:border-[#1A56DB] focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs transition-all leading-relaxed"
                            />
                          </div>

                          {/* Suivi & rendez-vous de contrôle */}
                          <div className="pt-2 border-t border-slate-100">
                            <FollowUpBlock
                              date={note.followUpDate}
                              notes={note.followUpNotes}
                              onDate={setField('followUpDate')}
                              onNotes={setField('followUpNotes')}
                              reminder={note.followUpReminder}
                              onReminder={setField('followUpReminder')}
                            />
                          </div>
                        </div>
                      </StageSection>
                    </motion.div>
                  )}
                </AnimatePresence>
                  </div>

                  {/* ── COLUMN 2: 20px GUTTER (xl+) ── */}
                  <div className="hidden xl:block w-5" aria-hidden="true" />

                  {/* ── COLUMN 3: RIGHT QUICK-ACTIONS RAIL ── */}
                  <div className="col-span-1">
                    <ConsultationRail
                      note={note}
                      patient={patient}
                      acts={acts}
                      billingAmount={billingAmount}
                      visitLinked={visitLinked}
                      billToCaisse={billToCaisse}
                      onBillToggle={setBillToCaisse}
                      onAddActe={onAddActe}
                      isOrdonnanceDirty={isOrdonnanceDirty}
                      prescriptionRowErrors={prescriptionRowErrors}
                      setField={setField}
                      onDocumentsChange={(documents, documentDrafts) => setNote((n) => ({ ...n, documents, documentDrafts }))}
                      requestAddTreatment={requestAddTreatment}
                      handleGenerateOrdonnance={handleGenerateOrdonnance}
                      onFinalize={openFinalize}
                      activeSection={activeSection}
                      lightweight={lightweight}
                      prescribingGate={prescribingGate}
                      lightStage={lightStage}
                      initialOpenGroup={initialOpenGroup}
                      initialEditingIdx={initialEditingIdx}
                      initialActiveDoc={initialActiveDoc}
                      isCollapsed={rightRailCollapsed}
                      onToggleCollapse={() => setRightRailCollapsed(!rightRailCollapsed)}
                    />
                  </div>
                </div>
              )}

            </main>
          </div>

          {/* Mobile Drawer */}
          {contextOpen && (
            <div className="fixed inset-0 z-[110] lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setContextOpen(false)} />
              <div className="absolute inset-y-0 left-0 flex w-[320px] max-w-[85vw] flex-col bg-white shadow-xl">
                <div className="flex items-center justify-between p-3 border-b border-slate-100">
                  <span className="text-[13px] font-bold text-slate-900">Contexte patient</span>
                  <IconButton label="Fermer" onClick={() => setContextOpen(false)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
                <PatientContextSidebar
                  patient={patient}
                  patientId={patientId}
                  age={age}
                  meds={activeMeds}
                  medsState={medsQ.isLoading ? 'loading' : medsQ.isError ? 'error' : 'ok'}
                  vitalsRows={vitalsRows}
                  vitalsState={vitalsQ.isLoading ? 'loading' : vitalsQ.isError ? 'error' : 'ok'}
                  encounters={encountersQ.data || []}
                  encountersState={encountersQ.isLoading ? 'loading' : encountersQ.isError ? 'error' : 'ok'}
                  className="flex-1"
                />
              </div>
            </div>
          )}

          {/* Finalize & Discard Dialogs */}
          {showFinalize && (
            <FinalizeDialog
              note={note}
              patient={patient}
              blockers={blockers}
              allergyHits={allergyHits}
              warnings={warnings}
              submitting={busy}
              error={actionError}
              handoffText={visitLinked && billToCaisse ? `Le patient sera envoyé à la caisse (montant proposé : ${billingAmount.toLocaleString('fr-FR')} ${currency}).` : 'Consultation enregistrée au dossier, sans passage en caisse.'}
              onCancel={closeFinalize}
              onConfirm={finalize}
            />
          )}

          {showDiscard && (
            <DiscardDialog
              busy={busy}
              error={actionError}
              onCancel={closeDiscard}
              onConfirm={discard}
            />
          )}

          {showOrdonnanceModal && (
            <OrdonnancePreviewModal
              isOpen={showOrdonnanceModal}
              onClose={() => setShowOrdonnanceModal(false)}
              onEdit={() => {
                setShowOrdonnanceModal(false)
                setActiveSection(3)
              }}
              note={note}
              patient={patient}
              patientName={patientName}
              encounterId={draft?.encounterId || result?.encounter?.id || ''}
              header={header}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
