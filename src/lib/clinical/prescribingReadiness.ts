import { computeAge } from './age'

// What must be known before the doctor starts a prescription.
//  - 'age'      : no usable date of birth
//  - 'sexe'     : sex unknown
//  - 'grossesse': a woman of childbearing age (12-50, or age unknown) whose
//                 pregnancy / breastfeeding status is not set for THIS visit
// Nothing here gates the rest of the consultation: it is only evaluated when
// "Ajouter" is clicked under Traitement.

export type ReadinessItem = 'age' | 'sexe' | 'grossesse'
export type PregnancyStatus = 'non' | 'oui' | 'allaitement' | 'inconnu'

export const PREGNANCY_STATUSES: readonly PregnancyStatus[] = ['non', 'oui', 'allaitement', 'inconnu']
export const CHILDBEARING_AGE = { min: 12, max: 50 } as const

export interface ReadinessPatient {
  date_naissance?: string | null
  sexe?: string | null
}

export interface ReadinessConsultation {
  pregnancyStatus?: string | null
}

export function isPregnancyStatus(value: unknown): value is PregnancyStatus {
  return typeof value === 'string' && (PREGNANCY_STATUSES as readonly string[]).includes(value)
}

// Whether the pregnancy question applies to this patient.
export function pregnancyRelevant(patient: ReadinessPatient | null | undefined, today: Date = new Date()): boolean {
  if (patient?.sexe !== 'femme') return false
  const age = computeAge(patient.date_naissance, today)
  return age === null || (age >= CHILDBEARING_AGE.min && age <= CHILDBEARING_AGE.max)
}

export function prescribingReadiness(
  patient: ReadinessPatient | null | undefined,
  consultation: ReadinessConsultation | null | undefined,
  today: Date = new Date(),
): { ready: boolean, missing: ReadinessItem[] } {
  const missing: ReadinessItem[] = []
  if (computeAge(patient?.date_naissance, today) === null) missing.push('age')
  if (patient?.sexe !== 'homme' && patient?.sexe !== 'femme') missing.push('sexe')
  if (pregnancyRelevant(patient, today) && !isPregnancyStatus(consultation?.pregnancyStatus)) missing.push('grossesse')
  return { ready: missing.length === 0, missing }
}
