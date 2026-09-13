import { CHECKLIST_RULES } from './ChecklistRules.js'

/**
 * Build a structured patient context from the available consultation data.
 * In production, clinicalHistory comes from the patient's medical record.
 * During the mock phase, defaults are provided.
 *
 * @param {Object} patient - Demographics (age, gender)
 * @param {Array} alerts - Medical alerts array (allergy, chronic)
 * @param {Array} currentMedications - Active medications list
 * @param {Object} clinicalHistory - Lab/vitals history from patient record
 * @returns {Object} patientContext
 */
export function buildPatientContext(patient, alerts, currentMedications, clinicalHistory = {}) {
  const alertsArr = Array.isArray(alerts) ? alerts : []
  const medsArr = Array.isArray(currentMedications) ? currentMedications : []

  const hasCondition = (keyword) =>
    alertsArr.some(
      (a) =>
        a.detail?.toLowerCase().includes(keyword.toLowerCase()) ||
        a.label?.toLowerCase().includes(keyword.toLowerCase())
    )

  const hasMedication = (name) =>
    medsArr.some((m) => m.name?.toLowerCase().includes(name.toLowerCase()))

  return {
    // ── Demographics
    age: patient?.age ?? null,
    gender: patient?.gender ?? null,

    // ── Conditions (derived from alert array)
    hasHypertension:
      hasCondition('hta') ||
      hasCondition('hypertension') ||
      hasCondition('tensio'),
    hasDiabetes: hasCondition('diab'),
    allergies: alertsArr.filter((a) => a.type === 'allergy'),
    chronicConditions: alertsArr.filter((a) => a.type === 'chronic'),

    // ── Medications
    hasMedication,
    medicationsNeedingRefill: medsArr.filter((m) => m.refill === true),

    // ── Clinical history (from patient record — defaults for mock)
    lastBPMonthsAgo: clinicalHistory.lastBPMonthsAgo ?? 0,
    lastBPValue: clinicalHistory.lastBPValue ?? null,
    lastHbA1cMonthsAgo: clinicalHistory.lastHbA1cMonthsAgo ?? 0,
    lastHbA1cValue: clinicalHistory.lastHbA1cValue ?? null,
    lastCreatinineMonthsAgo: clinicalHistory.lastCreatinineMonthsAgo ?? 0,
    lastCreatinineValue: clinicalHistory.lastCreatinineValue ?? null,
    lastLipidProfileMonthsAgo: clinicalHistory.lastLipidProfileMonthsAgo ?? 0,
    lastConsultationMonthsAgo: clinicalHistory.lastConsultationMonthsAgo ?? 0,
    isSmoker: clinicalHistory.isSmoker ?? false,
    packYears: clinicalHistory.packYears ?? null,
    bmiValue: clinicalHistory.bmiValue ?? null,
    pendingVaccinations: clinicalHistory.pendingVaccinations ?? [],
  }
}

/**
 * Run all clinical rules against the patient context and return
 * the list of generated checklist items.
 *
 * @param {Object} patientContext - output of buildPatientContext
 * @returns {ChecklistItem[]}
 */
export function generateChecklist(patientContext) {
  if (!patientContext) return []
  return CHECKLIST_RULES
    .filter((rule) => {
      try {
        return rule.test(patientContext)
      } catch {
        return false
      }
    })
    .map((rule) => rule.generate(patientContext))
}
