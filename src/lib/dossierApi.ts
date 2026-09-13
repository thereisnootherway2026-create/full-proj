import { supabase } from './supabase'
import {
  PatientVitals,
  PatientProblem,
  PatientMedication,
  PatientLabResult,
  ClinicalNote,
  Consultation,
  Document
} from '../types'

export const getPatientVitals = async (patientId: string) => {
  const { data, error } = await supabase
    .from('patient_vitals')
    .select('*')
    .eq('patient_id', patientId)
    .order('date_mesure', { ascending: false })
  if (error) throw error
  return data
}

export const getPatientProblems = async (patientId: string) => {
  const { data, error } = await supabase
    .from('patient_problems')
    .select('*')
    .eq('patient_id', patientId)
    .order('diagnosed_date', { ascending: false })
  if (error) throw error
  return data
}

export const getPatientMedications = async (patientId: string) => {
  const { data, error } = await supabase
    .from('patient_medications')
    .select('*')
    .eq('patient_id', patientId)
    .order('start_date', { ascending: false })
  if (error) throw error
  return data
}

export const getPatientLabResults = async (patientId: string) => {
  const { data, error } = await supabase
    .from('patient_lab_results')
    .select('*')
    .eq('patient_id', patientId)
    .order('date_exam', { ascending: false })
  if (error) throw error
  return data
}

export const getClinicalNotes = async (patientId: string) => {
  const { data, error } = await supabase
    .from('clinical_notes')
    .select('*')
    .eq('patient_id', patientId)
    .order('date_note', { ascending: false })
  if (error) throw error
  return data
}

export const getPatientTimeline = async (patientId: string) => {
  const [consultationsRes, documentsRes, labResultsRes] = await Promise.all([
    supabase.from('consultations').select('*, patients(nom, prenom)').eq('patient_id', patientId).order('date_consult', { ascending: false }),
    supabase.from('documents').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
    supabase.from('patient_lab_results').select('*').eq('patient_id', patientId).order('date_exam', { ascending: false })
  ])
  
  if (consultationsRes.error) throw consultationsRes.error
  if (documentsRes.error) throw documentsRes.error
  if (labResultsRes.error) throw labResultsRes.error

  // Normalize into a common event format
  const timeline: any[] = []

  consultationsRes.data?.forEach(c => {
    timeline.push({
      id: `consult-${c.id}`,
      type: 'Consultation',
      title: 'Consultation',
      date: c.date_consult,
      time: '00:00', // Need time if added to consultation schema
      doctor: 'Cabinet', // Ideally join with profile
      summary: c.notes || 'Consultation terminée',
      details: c.notes || '',
      tag: c.statut,
      originalDate: new Date(c.date_consult)
    })
  })

  documentsRes.data?.forEach(d => {
    let type = 'Document'
    if (d.type_document === 'ordonnance') type = 'Prescription'
    if (d.type_document === 'fiche_cnss') type = 'Administratif'
    
    timeline.push({
      id: `doc-${d.id}`,
      type: type,
      title: d.nom_fichier || 'Document',
      date: new Date(d.created_at).toLocaleDateString('fr-CA'),
      time: new Date(d.created_at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }),
      doctor: 'Cabinet',
      summary: `Document généré: ${type}`,
      details: 'Lien: ' + d.storage_path,
      tag: 'Document',
      originalDate: new Date(d.created_at)
    })
  })

  labResultsRes.data?.forEach(l => {
    timeline.push({
      id: `lab-${l.id}`,
      type: 'Laboratoire',
      title: l.exam_name || 'Analyse',
      date: l.date_exam,
      time: '00:00',
      doctor: 'Cabinet',
      summary: l.result_text || (l.result_value ? `${l.result_value} ${l.unit || ''}`.trim() : 'Résultat disponible'),
      details: l.notes || '',
      tag: l.status,
      originalDate: new Date(l.date_exam)
    })
  })

  // Sort by original date descending
  timeline.sort((a, b) => b.originalDate.getTime() - a.originalDate.getTime())

  return timeline
}
