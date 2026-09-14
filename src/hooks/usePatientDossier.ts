import { useQuery } from '@tanstack/react-query'
import { getPatientById, getPatientClinicalFields } from '../lib/api'
import {
  getPatientVitals,
  getPatientProblems,
  getPatientMedications,
  getPatientLabResults,
  getClinicalNotes,
  getPatientTimeline
} from '../lib/dossierApi'

export function usePatientDossier(patientId: string | undefined) {
  const enabled = !!patientId

  const patientQuery = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => getPatientById(patientId!),
    enabled,
  })

  const clinicalQuery = useQuery({
    queryKey: ['patient_clinical', patientId],
    queryFn: () => getPatientClinicalFields(patientId!),
    enabled,
  })

  const vitalsQuery = useQuery({
    queryKey: ['patient_vitals', patientId],
    queryFn: () => getPatientVitals(patientId!),
    enabled,
  })

  const problemsQuery = useQuery({
    queryKey: ['patient_problems', patientId],
    queryFn: () => getPatientProblems(patientId!),
    enabled,
  })

  const medicationsQuery = useQuery({
    queryKey: ['patient_medications', patientId],
    queryFn: () => getPatientMedications(patientId!),
    enabled,
  })

  const labResultsQuery = useQuery({
    queryKey: ['patient_lab_results', patientId],
    queryFn: () => getPatientLabResults(patientId!),
    enabled,
  })

  const clinicalNotesQuery = useQuery({
    queryKey: ['clinical_notes', patientId],
    queryFn: () => getClinicalNotes(patientId!),
    enabled,
  })

  const timelineQuery = useQuery({
    queryKey: ['patient_timeline', patientId],
    queryFn: () => getPatientTimeline(patientId!),
    enabled,
  })

  const isLoading =
    patientQuery.isLoading ||
    clinicalQuery.isLoading ||
    vitalsQuery.isLoading ||
    problemsQuery.isLoading ||
    medicationsQuery.isLoading ||
    labResultsQuery.isLoading ||
    clinicalNotesQuery.isLoading ||
    timelineQuery.isLoading

  const isError =
    patientQuery.isError ||
    clinicalQuery.isError ||
    vitalsQuery.isError ||
    problemsQuery.isError ||
    medicationsQuery.isError ||
    labResultsQuery.isError ||
    clinicalNotesQuery.isError ||
    timelineQuery.isError

  return {
    patient: patientQuery.data,
    clinical: clinicalQuery.data,
    vitals: vitalsQuery.data || [],
    problems: problemsQuery.data || [],
    medications: medicationsQuery.data || [],
    labResults: labResultsQuery.data || [],
    clinicalNotes: clinicalNotesQuery.data || [],
    timeline: timelineQuery.data || [],
    isLoading,
    isError,
  }
}
