// Three-state clinical lists (allergies, antécédents, traitements).
//
// 'unknown' = never verified  -> must read as "à vérifier", NEVER as "aucune"
// 'none'    = verified empty  -> "Aucune allergie connue" (+ date of verification)
// 'listed'  = verified list   -> show the items
//
// The status comes from patients.*_status (migration 20260924190000) via
// mm_get_patient_clinical. Before that migration is applied the RPC returns no
// status at all; the status is then derived from the text with the same rule as
// the migration's backfill: real content -> 'listed', anything else -> 'unknown'.
// Nothing in this file can ever produce 'none' from missing data.

export type ClinicalStatus = 'unknown' | 'none' | 'listed'
export type ClinicalKind = 'allergies' | 'antecedents' | 'medications'

const STATUSES: readonly ClinicalStatus[] = ['unknown', 'none', 'listed']

// Legacy "none" words typed into the free text. Same list as the SQL helper
// mm__clinical_text_listed(): such text is not a list, and not a verified 'none'.
const NONE_MARKERS = new Set([
  'aucune', 'aucun', 'aucunes', 'aucuns', 'néant', 'neant', 'rien', 'ras', 'r.a.s', 'r.a.s.',
  'non', '-', '--', '/', '0', 'nr', 'n/a',
])

export function isNoneMarker(text: string | null | undefined): boolean {
  return NONE_MARKERS.has(String(text ?? '').trim().toLowerCase())
}

export function hasListedText(text: string | null | undefined): boolean {
  const t = String(text ?? '').trim()
  return t !== '' && !isNoneMarker(t)
}

export function normalizeStatus(raw: unknown): ClinicalStatus | null {
  return typeof raw === 'string' && (STATUSES as readonly string[]).includes(raw) ? (raw as ClinicalStatus) : null
}

// One item per line / comma / semicolon, trimmed, none-markers dropped.
export function splitClinicalList(text: string | null | undefined): string[] {
  return String(text ?? '')
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '' && !isNoneMarker(s))
}

type Items = string | readonly string[] | null | undefined

const itemsOf = (items: Items): string[] => (Array.isArray(items)
  ? (items as readonly string[]).map((s) => String(s).trim()).filter((s) => s !== '' && !isNoneMarker(s))
  : splitClinicalList(items as string | null | undefined))

// The state to DISPLAY, from the stored status and the actual data.
//  - missing/invalid status: derived from data ('listed' or 'unknown', never 'none');
//  - 'listed' without any item: 'unknown' (a list we cannot show is not verified);
//  - 'none' while items exist: 'listed' (never hide data behind "aucune").
export function resolveClinicalStatus(status: unknown, items: Items): ClinicalStatus {
  const list = itemsOf(items)
  const s = normalizeStatus(status)
  if (s === null) return list.length > 0 ? 'listed' : 'unknown'
  if (s === 'listed') return list.length > 0 ? 'listed' : 'unknown'
  if (s === 'none') return list.length > 0 ? 'listed' : 'none'
  return 'unknown'
}

const LABELS: Record<ClinicalKind, { title: string, unknown: string, none: string }> = {
  allergies: { title: 'Allergies', unknown: 'Non renseignées, à vérifier', none: 'Aucune allergie connue' },
  antecedents: { title: 'Antécédents', unknown: 'Non renseignés, à vérifier', none: 'Aucun antécédent connu' },
  medications: { title: 'Traitements', unknown: 'Non renseignés, à vérifier', none: 'Aucun traitement en cours' },
}

export function clinicalTitle(kind: ClinicalKind): string {
  return LABELS[kind].title
}

export function formatVerifiedDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export interface ClinicalDisplay {
  state: ClinicalStatus
  title: string
  // Text for the unknown / none states; null when the list itself is shown.
  label: string | null
  items: string[]
  // "vérifié le 24/09/2026" for a verified 'none', else null.
  verifiedLabel: string | null
  tone: 'warning' | 'neutral' | 'danger' | 'info'
}

export function clinicalDisplay(
  kind: ClinicalKind,
  status: unknown,
  items: Items,
  verifiedAt?: string | Date | null,
): ClinicalDisplay {
  const state = resolveClinicalStatus(status, items)
  const list = itemsOf(items)
  const l = LABELS[kind]
  if (state === 'listed') {
    return { state, title: l.title, label: null, items: list, verifiedLabel: null, tone: kind === 'allergies' ? 'danger' : 'info' }
  }
  if (state === 'none') {
    const date = formatVerifiedDate(verifiedAt)
    return { state, title: l.title, label: l.none, items: [], verifiedLabel: date ? `vérifié le ${date}` : null, tone: 'neutral' }
  }
  return { state, title: l.title, label: l.unknown, items: [], verifiedLabel: null, tone: 'warning' }
}

// The statuses of one patient, from whatever mm_get_patient_clinical returned
// (with or without the status columns) and the active treatments list.
export interface PatientClinicalLike {
  allergies?: string | null
  antecedents?: string | null
  allergies_status?: string | null
  antecedents_status?: string | null
  medications_status?: string | null
  clinical_verified_at?: string | null
}

export function patientClinicalStates(patient: PatientClinicalLike | null | undefined, activeMedicationNames: readonly string[] = []) {
  return {
    allergies: resolveClinicalStatus(patient?.allergies_status, patient?.allergies),
    antecedents: resolveClinicalStatus(patient?.antecedents_status, patient?.antecedents),
    medications: resolveClinicalStatus(patient?.medications_status, activeMedicationNames),
  }
}
