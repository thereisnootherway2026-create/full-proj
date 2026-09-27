import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Check, Loader2, PanelLeft, Receipt, X } from 'lucide-react'
import { getPatientMedications, getPatientVitals } from '../../lib/dossierApi'
import { DEPUIS_OPTIONS, EVOLUTION_OPTIONS, listCompletedEncounters } from '../../lib/encounterService'
import { computeProgress, finalizeWarnings } from '../../lib/consultationProgress'
import { BillingPill, FieldLabel, NarrativeField } from './ConsultationFields'
import VitalsGrid from './VitalsGrid'
import SectionStepper from './SectionStepper'
import StageSection from './StageSection'
import Button from '../common/Button'
import Chip from '../common/Chip'
import IconButton from '../common/IconButton'
import { isAtBottom, pickActiveStep, scrollTargetFor } from './sectionScroll'
import { AddButton, BlockHeader, DiagnosisPicker, DocumentsBlock, ExamOrders, FollowUpBlock, Panel, PlanList, RenewalFollowUp, TreatmentEditor, allergyMatch, allergyTokens } from './PlanBlocks'
import PatientContextSidebar from './PatientContextSidebar'
import { DiscardDialog, DoneScreen, FinalizeDialog } from './ConsultationDialogs'
import { buildPatientContext, generateChecklist } from './ChecklistEngine'
import { resolveClinicalStatus, splitClinicalList } from '../../lib/clinical/clinicalStatus'
import { prescribingReadiness } from '../../lib/clinical/prescribingReadiness'
import PrescribingGate from '../clinical/PrescribingGate'
import RenewalPanel from './RenewalPanel'
import { useAppContext } from '../../context/AppContext'
import { getOrdonnancesForPatient } from '../../lib/api'
import { applyRenewal, lastActiveOrdonnance, motifFlow, prefillRenewalEdit } from '../../lib/consultationFlow'

const STEPS = [
  { id: 'subjectif', label: 'Motif & symptômes' },
  { id: 'objectif', label: 'Examen clinique' },
  { id: 'plan', label: 'Évaluation & conduite' },
]

const fmtDate = (d) => {
  if (!d) return ''
  const date = new Date(d)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return 'aujourd\'hui'
  if (days === 1) return 'hier'
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Only a boolean UI preference is stored locally; no patient data.
const CTX_KEY = 'mm-consult-context-collapsed'
const readCollapsed = () => { try { return localStorage.getItem(CTX_KEY) === '1' } catch { return false } }
const writeCollapsed = (v) => { try { localStorage.setItem(CTX_KEY, v ? '1' : '0') } catch { /* storage unavailable */ } }

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t) }, [intervalMs])
  return now
}

function SaveStatus({ draft }) {
  const now = useNow(10000)
  const { status, savedAt, isDirty, offline } = draft
  let tone = 'text-slate-500'
  let content = null
  if (status === 'loading') content = <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Ouverture…</>
  else if (status === 'conflict') {
    tone = 'text-red-600'
    content = <><AlertTriangle className="h-3.5 w-3.5" /> Modifiée dans une autre fenêtre <Button variant="link" className="ml-1" onClick={() => window.location.reload()}>Recharger</Button></>
  } else if (offline || status === 'error') {
    tone = 'text-slate-900'
    content = <><AlertTriangle className="h-3.5 w-3.5" /> Enregistrement en attente <Button variant="link" className="ml-1" onClick={draft.retry}>Réessayer</Button></>
  } else if (status === 'saving') content = <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…</>
  else if (isDirty) content = <>Modifications en cours…</>
  else if (savedAt) {
    tone = 'text-green-800'
    const secs = Math.max(0, Math.round((now - savedAt.getTime()) / 1000))
    content = <><Check className="h-3.5 w-3.5" /> {secs < 45 ? 'Enregistré il y a quelques secondes' : `Enregistré à ${savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}</>
  } else if (status === 'ready') content = <>Brouillon prêt</>
  return <div role="status" aria-live="polite" className={`flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium ${tone}`}>{content}</div>
}

// Quick optional helpers: small, quiet by default, tied to their field.
// One row of a ChipChoiceGroup: the label in the group's fixed first column, the options wrapping
// in the second — so every row's chips start at the same x and a wrap never slides under the label.
function ChipChoice({ label, options, value, onChange }) {
  return (
    <>
      <span className="pt-[3px] text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <Chip key={o} role="radio" selected={value === o} onClick={() => onChange(value === o ? '' : o)}>{o}</Chip>
        ))}
      </div>
    </>
  )
}

// Small overline naming what a column of a section holds.
function ColumnTitle({ children }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{children}</p>
}

function ChipChoiceGroup({ children }) {
  return (
    // Sits straight on the card under its field — no extra box around it.
    <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-5 gap-y-3 px-1">
      {children}
    </div>
  )
}

export default function ConsultationSheet({
  open, onClose, patient, age, patientId, note, setNote, draft, acts = [], billingAmount = 0, visitLinked = false,
  onAddActe, onCompleted, onDiscarded, onOpenContext, patientConsultations, startInReview = false,
}) {
  const [mode, setMode] = useState('note')
  const [activeStep, setActiveStep] = useState('subjectif')
  const [showFinalize, setShowFinalize] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [result, setResult] = useState(null)
  const [contextOpen, setContextOpen] = useState(false)
  const [ctxCollapsed, setCtxCollapsed] = useState(readCollapsed)
  const [gateMissing, setGateMissing] = useState(null)
  // What the prescribing gate unlocks once completed: a new row, the renewal, or the edit view.
  const [gateNext, setGateNext] = useState('add')
  // Lightweight flow (lib/consultationFlow): 'choose' until the doctor picks renew/modify,
  // 'edit' once only the Traitement block is open. forceFull = "Passer au formulaire complet".
  const [lightStage, setLightStage] = useState('choose')
  const [forceFull, setForceFull] = useState(false)
  const scrollRef = useRef(null)
  const scrollAnim = useRef(null)
  const spyPausedUntil = useRef(0)
  const reduceMotion = useReducedMotion()
  const inFlight = useRef(false)
  const refs = { subjectif: useRef(null), objectif: useRef(null), plan: useRef(null) }

  useEffect(() => {
    if (open) { setMode('note'); setActionError(null); setResult(null); setShowFinalize(startInReview); setShowDiscard(false); setLightStage('choose'); setForceFull(false) }
  }, [open, startInReview])

  const { profile } = useAppContext()
  const cabinetId = profile?.cabinet_id
  const flow = forceFull ? 'full' : motifFlow(note.motif)
  const lightweight = flow === 'lightweight'
  // Leaving the lightweight flow (motif changed) starts it over next time.
  useEffect(() => { if (!lightweight) setLightStage('choose') }, [lightweight])
  // The follow-up task's title follows the flow (renewal vs control). Kept in the note so the
  // server trigger reads it at completion; saved with the draft like any other field.
  const followUpKind = lightweight ? 'renouvellement' : 'controle'
  useEffect(() => {
    if (open) setNote((n) => (n.followUpKind === followUpKind ? n : { ...n, followUpKind }))
  }, [open, followUpKind, setNote])
  // Same query key as the dossier's Ordonnances tab, so the cache is shared.
  const ordonnancesQ = useQuery({
    queryKey: ['patient-real-ordonnances', cabinetId, patientId],
    queryFn: () => getOrdonnancesForPatient(cabinetId, patientId),
    enabled: open && lightweight && Boolean(cabinetId && patientId),
  })
  const lastOrdonnance = useMemo(() => lastActiveOrdonnance(ordonnancesQ.data), [ordonnancesQ.data])

  const vitalsQ = useQuery({ queryKey: ['consult-ctx-vitals', patientId], queryFn: () => getPatientVitals(patientId), enabled: open && Boolean(patientId) })
  const medsQ = useQuery({ queryKey: ['consult-ctx-meds', patientId], queryFn: () => getPatientMedications(patientId), enabled: open && Boolean(patientId) })
  const encountersQ = useQuery({ queryKey: ['encounters', patientId], queryFn: () => listCompletedEncounters(patientId), enabled: open && Boolean(patientId) })
  const vitalsRows = useMemo(() => {
    const rows = Array.isArray(vitalsQ.data) ? [...vitalsQ.data] : []
    rows.sort((a, b) => new Date(b.date_mesure) - new Date(a.date_mesure))
    return rows
  }, [vitalsQ.data])
  const lastVitals = vitalsRows[0] || null
  const activeMeds = useMemo(() => (Array.isArray(medsQ.data) ? medsQ.data.filter((m) => m.status === 'Actif') : []), [medsQ.data])

  const v = note.vitals
  const setField = (key) => (value) => setNote((n) => ({ ...n, [key]: value }))
  const setVital = (key) => (e) => setNote((n) => ({ ...n, vitals: { ...n.vitals, [key]: e.target.value } }))
  const applyLastVital = (key, value) => setNote((n) => ({ ...n, vitals: { ...n.vitals, [key]: String(value) } }))
  // "Confirmer" on an unusual value: remembered with the value it applies to.
  const confirmVital = (key) => setNote((n) => {
    const value = key === 'bloodPressure'
      ? `${String(n.vitals.bloodPressureSystolic).trim()}/${String(n.vitals.bloodPressureDiastolic).trim()}`
      : String(n.vitals[key]).trim()
    return { ...n, vitalsConfirmed: { ...n.vitalsConfirmed, [key]: value } }
  })

  const when = lastVitals ? fmtDate(lastVitals.date_mesure) : ''

  // One derivation feeds the stepper, stage cards, sidebar (X/N + readiness line)
  // and the finalize dialog's blockers (see lib/consultationProgress).
  // Flow-aware (lightweight = motif + traitement) and finished-aware: once completed, the draft
  // is closed (draft.ready = false), which must not read as "chargement du brouillon".
  const progress = computeProgress(note, { ready: draft.ready, ageYears: age, flow, done: mode === 'done' })
  const warnings = finalizeWarnings(note, { flow })
  const { has, blockers } = progress
  const tokens = allergyTokens(patient?.allergies)
  const allergyHits = note.traitements.map((r) => allergyMatch(r.medicament, tokens)).filter(Boolean)
  const patientName = `${patient?.prenom || ''} ${patient?.nom || ''}`.trim()

  // Safety checklist (ChecklistRules): today only the allergy rules can fire from
  // real data; an item disappears once its autoCompleteWhen is satisfied.
  const allergiesStatus = resolveClinicalStatus(patient?.allergies_status, patient?.allergies)
  const safetyItems = useMemo(() => {
    if (!patient) return []
    const alerts = allergiesStatus === 'listed' ? splitClinicalList(patient.allergies).map((a) => ({ type: 'allergy', label: a, detail: a })) : []
    const ctx = buildPatientContext({ age, gender: patient.sexe, allergiesStatus }, alerts, [])
    return generateChecklist(ctx).filter((item) => !item.isAllergy && !item.autoCompleteWhen({ allergiesStatus }, []))
  }, [patient, age, allergiesStatus])

  // Traitement > "Ajouter": prescribing needs age, sexe (and pregnancy status for
  // women of childbearing age). Missing items open a small inline prompt; the rest
  // of the consultation is never gated.
  const addTreatmentRow = () => setNote((n) => (n.traitements.length >= 30 ? n : { ...n, traitements: [...n.traitements, { medicament: '', posologie: '', duree: '' }] }))
  // Runs `action` now if prescribing is possible, else opens the gate and runs it on "Continuer".
  const withPrescribingGate = (next, action) => {
    const r = prescribingReadiness(patient, note)
    if (r.ready) { setGateMissing(null); action(); return }
    setGateNext(next)
    setGateMissing(r.missing)
  }
  const requestAddTreatment = () => withPrescribingGate('add', addTreatmentRow)

  // ---- lightweight flow: renouvellement d'ordonnance ----
  // "Reconduire à l'identique": the previous lines become this consultation's treatment, then
  // straight to the final confirmation (its recap shows them). Cancelling that dialog lands back
  // on the renewal panel (stage stays 'choose'). On completion the existing trigger issues the
  // new ordonnance (migration 20260923050000). applyRenewal is idempotent (resumed drafts).
  const doRenew = () => {
    setNote((n) => applyRenewal(n, lastOrdonnance))
    setActionError(null)
    setShowFinalize(true)
  }
  // "Modifier avant de valider": only the Traitement block opens, prefilled with the previous lines.
  const openRenewalEdit = () => {
    setNote((n) => prefillRenewalEdit(n, lastOrdonnance))
    setLightStage('edit')
    setTimeout(() => goTo('plan'), 80)
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

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (showFinalize && !busy) setShowFinalize(false)
      else if (showDiscard && !busy) setShowDiscard(false)
      else if (!showFinalize && !showDiscard) goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Tab click -> one Framer Motion scroll of the scroll box. While it runs, the
  // scroll-spy is suspended (otherwise it re-highlights every section the page
  // passes through), and any manual scroll input cancels it immediately.
  const measureSections = () => {
    const box = scrollRef.current
    if (!box) return null
    const boxTop = box.getBoundingClientRect().top
    const tops = STEPS.map((st) => ({ id: st.id, top: refs[st.id].current ? refs[st.id].current.getBoundingClientRect().top - boxTop : Infinity }))
    return { box, tops, maxScroll: box.scrollHeight - box.clientHeight }
  }
  const cancelNav = () => { scrollAnim.current?.stop(); scrollAnim.current = null; spyPausedUntil.current = 0 }
  useEffect(() => cancelNav, [])

  const goTo = (id) => {
    const m = measureSections()
    const target = m?.tops.find((t) => t.id === id)
    if (!m || !target || target.top === Infinity) return
    cancelNav()
    setActiveStep(id)
    const to = scrollTargetFor(target.top, m.box.scrollTop, m.maxScroll)
    const dist = Math.abs(to - m.box.scrollTop)
    if (dist < 1) return
    if (reduceMotion) { m.box.scrollTop = to; spyPausedUntil.current = performance.now() + 150; return }
    const duration = Math.min(0.6, 0.25 + dist / 4000)
    // Safety net: even if the animation never reports completion, the spy resumes.
    spyPausedUntil.current = performance.now() + duration * 1000 + 400
    scrollAnim.current = animate(m.box.scrollTop, to, {
      duration, ease: [0.32, 0.72, 0, 1],
      onUpdate: (y) => { m.box.scrollTop = y },
      onComplete: () => { scrollAnim.current = null; spyPausedUntil.current = performance.now() + 150 },
    })
  }
  const onScroll = () => {
    if (performance.now() < spyPausedUntil.current) return
    const m = measureSections()
    if (!m) return
    const id = pickActiveStep(m.tops, { atBottom: isAtBottom(m.box.scrollTop, m.maxScroll) })
    if (id) setActiveStep(id)
  }

  const finalize = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setActionError(null)
    try {
      const res = await draft.complete({ billingAmount: visitLinked ? billingAmount : null, billingType: 'cash' })
      setResult(res); setShowFinalize(false); setMode('done')
    } catch (e) {
      setActionError(e?.message || 'Impossible de terminer la consultation.')
    } finally { setBusy(false); inFlight.current = false }
  }

  const discard = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setActionError(null)
    try { await draft.discard(); setShowDiscard(false); onDiscarded?.() } catch (e) { setActionError(e?.message || 'Impossible d\'abandonner le brouillon.') } finally { setBusy(false); inFlight.current = false }
  }

  const loading = draft.status === 'loading' || draft.status === 'idle'
  const openError = draft.status === 'open_error'
  const toggleCtx = () => setCtxCollapsed((c) => { writeCollapsed(!c); return !c })
  const sidebar = (cls, { collapsible }) => (
    <PatientContextSidebar className={cls} patient={patient} patientId={patientId} age={age} meds={activeMeds} safetyItems={safetyItems}
      medsState={medsQ.isLoading ? 'loading' : medsQ.isError ? 'error' : 'ok'}
      vitalsRows={vitalsRows} vitalsState={vitalsQ.isLoading ? 'loading' : vitalsQ.isError ? 'error' : 'ok'}
      encounters={encountersQ.data || []} encountersState={encountersQ.isLoading ? 'loading' : encountersQ.isError ? 'error' : 'ok'}
      progress={progress} onSelectStep={goTo}
      collapsed={collapsible && ctxCollapsed} onToggleCollapsed={collapsible ? toggleCtx : undefined} />
  )
  const actesTotal = acts.reduce((s, a) => s + (Number(a.montant) || 0), 0)

  // Shown where the doctor is: in the renewal panel while choosing, else in the Traitement block.
  const prescribingGate = gateMissing && (
    <PrescribingGate patient={patient} patientId={patientId} missing={gateMissing}
      pregnancyStatus={note.pregnancyStatus} onPregnancy={setField('pregnancyStatus')}
      onContinue={onGateContinue} onCancel={() => setGateMissing(null)} />
  )
  const treatmentEditor = (
    <TreatmentEditor rows={note.traitements} onChange={setField('traitements')} allergies={patient?.allergies} ordonnance={note.ordonnance} onOrdonnance={setField('ordonnance')}
      onAdd={requestAddTreatment}
      gate={lightweight && lightStage === 'choose' ? null : prescribingGate} />
  )
  // Lightweight: Motif, then Traitement once "Modifier" was chosen. Full: the 3 sections.
  const visibleSteps = lightweight
    ? STEPS.filter((s) => s.id === 'subjectif' || (s.id === 'plan' && lightStage === 'edit')).map((s) => (s.id === 'plan' ? { ...s, label: 'Traitement' } : s))
    : STEPS

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="consultation-sheet"
          role="dialog" aria-modal="true" aria-label="Nouvelle consultation"
          // A plain fade + a single short upward slide — no scale. Scaling a fixed, full-viewport
          // element this heavy (header + live sidebar queries + the whole form) forces the browser
          // to composite a huge layer every frame, which is what made the previous version (opacity
          // + y + scale together) feel choppy. This is lighter to paint and reads as crisp instead.
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: 'opacity, transform' }}
          className="fixed inset-0 z-[100] flex flex-col bg-slate-50"
        >
      <header className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" onClick={goBack} aria-label="Retour au dossier">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Retour au dossier</span>
          </Button>
          <IconButton size="md" label="Contexte patient" onClick={() => setContextOpen(true)} className="lg:hidden"><PanelLeft className="h-4 w-4" /></IconButton>
          <p className="truncate text-[14px] font-bold text-slate-900">Nouvelle consultation · {patientName}</p>
        </div>
        {mode !== 'done' && (
          <div className="flex flex-shrink-0 items-center gap-3 sm:gap-4">
            <SaveStatus draft={draft} />
            {draft.ready && <Button variant="ghost" size="sm" className="!hidden md:!inline-flex hover:!text-red-600" onClick={() => { setActionError(null); setShowDiscard(true) }}>Abandonner</Button>}
            <Button variant="primary" size="sm" disabled={!draft.ready} onClick={() => { setActionError(null); setShowFinalize(true) }}>
              <span className="hidden sm:inline">Terminer la consultation</span><span className="sm:hidden">Terminer</span>
            </Button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebar(`hidden flex-shrink-0 border-r border-slate-200 transition-[width] duration-200 lg:flex ${ctxCollapsed ? 'w-[64px]' : 'w-[304px]'}`, { collapsible: true })}

        <div ref={scrollRef} onScroll={onScroll} onWheel={cancelNav} onTouchStart={cancelNav} onPointerDown={cancelNav} className="min-w-0 flex-1 overflow-y-auto">
          {openError ? (
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
              <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" />
              <p className="text-[15px] font-bold text-slate-900">
                {draft.error?.code === 'forbidden' ? 'Accès réservé au médecin praticien' : 'Consultation indisponible'}
              </p>
              <p className="mt-1.5 text-[13px] text-slate-600 leading-relaxed">
                {draft.error?.code === 'forbidden'
                  ? 'La conduite et la saisie de la consultation clinique sont strictement réservées au médecin. En tant que secrétariat, vous pouvez consulter le dossier administratif et les documents depuis le dossier patient.'
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
            <DoneScreen note={note} patientName={patientName} result={result} onContinue={() => onCompleted?.(result)} />
          ) : loading && !draft.ready ? (
            <div className="flex h-full items-center justify-center gap-2 text-[14px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de la consultation…</div>
          ) : (
            <div className="mx-auto max-w-[1160px] px-5 pb-24 lg:px-8">
              <SectionStepper steps={visibleSteps} activeId={activeStep} filled={has} onSelect={goTo} />

              <div className="space-y-6">
                <StageSection id="subjectif" index={1} title="Motif & symptômes" hint="Pourquoi le patient consulte aujourd'hui"
                  filled={has.subjectif} active={activeStep === 'subjectif'} refEl={refs.subjectif}>
                  {/* Read top to bottom, the way the doctor asks: why → what/since when → how it evolves */}
                  <NarrativeField emphasis size="line" required label="Motif de consultation" value={note.motif} onChange={setField('motif')} autoFocus suggestKind="motif" quickPicks={6}
                    patientConsultations={patientConsultations} placeholder="Motif principal de la consultation…" />
                  {/* Lightweight motif (lib/consultationFlow): renew the last ordonnance without the full form. */}
                  <AnimatePresence initial={false}>
                    {lightweight && (
                      <RenewalPanel key="renewal" ordonnance={lastOrdonnance} loading={ordonnancesQ.isLoading} error={ordonnancesQ.isError}
                        retrying={ordonnancesQ.isFetching} onRetry={() => ordonnancesQ.refetch()}
                        followUp={(
                          <RenewalFollowUp date={note.followUpDate} onDate={setField('followUpDate')}
                            reminder={note.followUpReminder} onReminder={setField('followUpReminder')} />
                        )}
                        stage={lightStage}
                        gate={lightStage === 'choose' ? prescribingGate : null}
                        onRenew={() => withPrescribingGate('renew', doRenew)}
                        onModify={() => withPrescribingGate('modify', openRenewalEdit)}
                        onValidate={() => { setActionError(null); setShowFinalize(true) }}
                        onFullForm={() => { setForceFull(true); setGateMissing(null) }} />
                    )}
                  </AnimatePresence>
                  <div>
                    <NarrativeField size="lg" label="Symptômes / histoire actuelle" value={note.histoire} onChange={setField('histoire')} suggestKind="histoire"
                      patientConsultations={patientConsultations} placeholder="Début, évolution, intensité, facteurs aggravants ou soulageants, traitements déjà essayés..." />
                    <ChipChoiceGroup>
                      <ChipChoice label="Depuis" options={DEPUIS_OPTIONS} value={note.depuis} onChange={setField('depuis')} />
                      <ChipChoice label="Évolution" options={EVOLUTION_OPTIONS} value={note.evolution} onChange={setField('evolution')} />
                    </ChipChoiceGroup>
                  </div>
                </StageSection>

                {/* Hidden (not cleared) in the lightweight flow: anything typed comes back with the full form. */}
                {!lightweight && (
                  <StageSection id="objectif" index={2} title="Examen clinique" hint="Constantes et observations"
                    filled={has.objectif} active={activeStep === 'objectif'} refEl={refs.objectif}>
                    <div>
                      <FieldLabel hint="Mesures d'aujourd'hui">Constantes</FieldLabel>
                      <VitalsGrid vitals={v} setVital={setVital} applyLast={applyLastVital} lastVitals={lastVitals} when={when} age={age}
                        review={progress.vitalsReview} onConfirm={confirmVital} />
                    </div>
                    <NarrativeField size="sm" label="Examen clinique" value={note.examen} onChange={setField('examen')} suggestKind="examen"
                      patientConsultations={patientConsultations} placeholder="Observations et éléments pertinents de l'examen clinique..." />
                  </StageSection>
                )}

                {lightweight ? (
                  lightStage === 'edit' && (
                    <StageSection id="plan" index={2} title="Traitement" hint="Ajustez le traitement à renouveler, puis validez"
                      filled={has.plan} active={activeStep === 'plan'} refEl={refs.plan}>
                      <PlanList>{treatmentEditor}</PlanList>
                    </StageSection>
                  )
                ) : (
                <StageSection id="plan" index={3} title="Évaluation & conduite" hint="Diagnostic, traitement et suite"
                  filled={has.plan} active={activeStep === 'plan'} refEl={refs.plan}>
                  {/* Left: the clinical decision. Right: what it produces for the patient, as one list. */}
                  <div className="grid items-start gap-x-8 gap-y-6 xl:grid-cols-2">
                    <div className="space-y-5">
                      <ColumnTitle>Décision</ColumnTitle>
                      <DiagnosisPicker items={note.diagnostics} onChange={setField('diagnostics')} />
                      <NarrativeField size="sm" label="Conduite à tenir" value={note.conduite} onChange={setField('conduite')} suggestKind="plan"
                        patientConsultations={patientConsultations} placeholder="Décision clinique, recommandations, surveillance..." />
                      <FollowUpBlock date={note.followUpDate} notes={note.followUpNotes} onDate={setField('followUpDate')} onNotes={setField('followUpNotes')}
                        reminder={note.followUpReminder} onReminder={setField('followUpReminder')} />
                    </div>
                    <div className="space-y-5">
                      <ColumnTitle>Prescriptions & actes</ColumnTitle>
                      <PlanList>
                        {treatmentEditor}
                        <ExamOrders items={note.examens} onChange={setField('examens')} patient={patient}
                          renseignements={[note.motif.trim(), note.diagnostics.join(', ')].filter(Boolean).join(' — ')} />
                        <DocumentsBlock note={note} patient={patient}
                          onChange={(documents, documentDrafts) => setNote((n) => ({ ...n, documents, documentDrafts }))} />
                        {(acts.length > 0 || onAddActe) && (
                          <Panel>
                            <BlockHeader icon={Receipt} title="Actes de la séance" count={acts.length}
                              action={<span className="flex items-center gap-2"><BillingPill />{onAddActe && <AddButton onClick={onAddActe}>Ajouter</AddButton>}</span>} />
                            {acts.length > 0 && (
                              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                                {acts.map((a) => <li key={a.id} className="flex justify-between px-3 py-2 text-[13.5px]"><span>{a.name}</span><span className="font-semibold">{Number(a.montant || 0).toLocaleString('fr-FR')} MAD</span></li>)}
                                <li className="flex justify-between bg-slate-50 px-3 py-2 text-[13px] font-bold"><span>Total</span><span>{actesTotal.toLocaleString('fr-FR')} MAD</span></li>
                              </ul>
                            )}
                          </Panel>
                        )}
                      </PlanList>
                    </div>
                  </div>
                </StageSection>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {contextOpen && (
        <div className="fixed inset-0 z-[110] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setContextOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col bg-white shadow-xl">
            <IconButton label="Fermer le contexte" onClick={() => setContextOpen(false)} className="absolute right-2 top-2"><X className="h-4 w-4" /></IconButton>
            {sidebar('flex-1 pt-10', { collapsible: false })}
          </div>
        </div>
      )}

      {showFinalize && (
        <FinalizeDialog note={note} blockers={blockers} allergyHits={allergyHits} warnings={warnings} submitting={busy} error={actionError}
          handoffText={visitLinked ? `Le patient sera envoyé à la caisse (montant proposé : ${billingAmount.toLocaleString('fr-FR')} MAD).` : 'Consultation non liée à une visite : enregistrée au dossier, sans passage en caisse.'}
          onCancel={() => setShowFinalize(false)} onConfirm={finalize} />
      )}
      {showDiscard && <DiscardDialog busy={busy} error={actionError} onCancel={() => setShowDiscard(false)} onConfirm={discard} />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
