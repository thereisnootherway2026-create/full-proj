import { VITAL_KEYS, VITAL_TYPES, vitalProblem } from './encounterService'
import { validateBloodPressure, validateVital } from './vitals/validateVital'

// Every Constantes value checked with validateVital, plus whether an unusual
// ('warn') value has been confirmed by the doctor. Blood pressure is one pair.
// Returns { [key]: { level, message, suggestion?, confirmed } } with key
// 'bloodPressure' for the pair and the note keys for the others.
export function reviewVitals(vitals, confirmedMap = {}, ageYears = null) {
  const ctx = { ageYears }
  const out = {}
  const sys = String(vitals.bloodPressureSystolic ?? '').trim()
  const dia = String(vitals.bloodPressureDiastolic ?? '').trim()
  const bp = validateBloodPressure(sys, dia, ctx)
  out.bloodPressure = { ...bp, confirmed: bp.level === 'warn' && confirmedMap.bloodPressure === `${sys}/${dia}` }
  for (const key of VITAL_KEYS) {
    if (key === 'bloodPressureSystolic' || key === 'bloodPressureDiastolic') continue
    const value = String(vitals[key] ?? '').trim()
    const r = validateVital(VITAL_TYPES[key], value, ctx)
    out[key] = { ...r, confirmed: r.level === 'warn' && confirmedMap[key] === value }
  }
  return out
}

// The single source of truth for "how far along is this consultation".
// The stepper badges, stage cards, sidebar circles, the X/N counter, the
// readiness line and the finalize dialog's blockers ALL read this one object,
// so they cannot disagree.
//
// Two different questions, answered together:
//  - sections: which of the three sections have content (drives X/N).
//  - blockers: what prevents finishing at all (the server only requires a
//    motif and valid vitals, so an unfilled optional section never blocks).
// `status` folds them into one value the UI renders verbatim:
//    'blocked'  -> something prevents finishing        ("Pour terminer : …")
//    'partial'  -> can finish, but sections are empty   ("Peut être terminée · à compléter : …")
//    'complete' -> can finish AND every section filled  ("Prête à être terminée")
// 'complete' is only reachable when filledCount === total (see below), so
// "Prête à être terminée" can never show next to 2/3.
const filled = (s) => String(s ?? '').trim() !== ''
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`
const SECTION_LABELS = { subjectif: 'Motif & symptômes', objectif: 'Examen clinique', plan: 'Évaluation & conduite' }

// A treatment row counts (and is saved) only when it names a medicament.
// Fully blank rows are placeholders: they never count as filled and are dropped
// on finish (finalizeNote). A row with a dosage/duration but no medicament would
// be dropped along with data the doctor typed, so it blocks finishing instead.
const namedTreatments = (note) => note.traitements.filter((r) => filled(r.medicament))
const halfFilledTreatment = (note) => note.traitements.some((r) => !filled(r.medicament) && (filled(r.posologie) || filled(r.duree)))

export function computeProgress(note, { ready = true, ageYears = null } = {}) {
  const v = note.vitals
  const treatments = namedTreatments(note)
  const has = {
    subjectif: filled(note.motif) || filled(note.histoire) || filled(note.depuis) || filled(note.evolution),
    objectif: VITAL_KEYS.some((k) => filled(v[k])) || filled(note.examen),
    plan: Boolean(note.diagnostics.length || filled(note.conduite) || treatments.length || note.examens.length || note.followUpDate || filled(note.followUpNotes) || note.documents.length),
  }

  const otherVitals = VITAL_KEYS.filter((k) => k !== 'bloodPressureSystolic' && k !== 'bloodPressureDiastolic')
  const measures = [filled(v.bloodPressureSystolic) || filled(v.bloodPressureDiastolic), ...otherVitals.map((k) => filled(v[k]))].filter(Boolean).length
  const subjCount = [note.motif, note.histoire, note.depuis, note.evolution].filter(filled).length
  const planParts = [
    note.diagnostics.length && plural(note.diagnostics.length, 'diagnostic', 'diagnostics'),
    treatments.length && plural(treatments.length, 'médicament', 'médicaments'),
    note.examens.length && plural(note.examens.length, 'examen', 'examens'),
  ].filter(Boolean)
  const details = {
    subjectif: has.subjectif ? `${subjCount}/4 champs` : '',
    objectif: [measures && `${measures}/${otherVitals.length + 1} constantes`, filled(note.examen) && 'examen'].filter(Boolean).join(' · '),
    plan: planParts.join(' · '),
  }
  const sections = ['subjectif', 'objectif', 'plan'].map((id) => ({ id, label: SECTION_LABELS[id], filled: has[id], detail: details[id] }))

  const blockers = []
  if (!filled(note.motif)) blockers.push('motif de consultation')
  // Impossible values (incl. an incomplete pair or systolique <= diastolique)
  // block finishing; unusual values block it until the doctor confirms them.
  const review = reviewVitals(v, note.vitalsConfirmed || {}, ageYears)
  const vitalErrors = VITAL_KEYS.some((k) => vitalProblem(k, v[k])) || review.bloodPressure.level === 'error'
  const unconfirmed = Object.values(review).some((r) => r.level === 'warn' && !r.confirmed)
  if (vitalErrors) blockers.push('constantes vitales valides')
  else if (unconfirmed) blockers.push('confirmation des constantes inhabituelles')
  if (halfFilledTreatment(note)) blockers.push('médicament d\'une ligne de traitement')
  if (!ready) blockers.push('chargement du brouillon')

  const filledCount = sections.filter((s) => s.filled).length
  const missing = sections.filter((s) => !s.filled).map((s) => s.label)
  const status = blockers.length ? 'blocked' : filledCount < sections.length ? 'partial' : 'complete'
  return { has, sections, filledCount, total: sections.length, blockers, missing, canFinish: blockers.length === 0, status, vitalsReview: review }
}

// Whether the dossier page should show the live-consultation UI (timer, "+ Acte",
// active ring). 'in_progress' alone is not enough (it can be a leftover from the
// URL): a real consultation must exist, i.e. the sheet is open or an open draft
// is on the server. A finished consultation therefore never keeps it alive.
export function isConsultationLive({ status, sheetOpen = false, hasOpenDraft = false, fetchingDraft = false }) {
  return status === 'in_progress' && (sheetOpen || hasOpenDraft || fetchingDraft)
}
