import { supabase } from './supabase'
import {
  Patient, Consultation, StatutAttente, Rdv, TypeDocument, TypeMessage
} from '../types'

// — AUTH —
export const login = async (
  email: string,
  password: string
) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email, password
  })
  if (error) throw error
  return data
}

export const logout = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export const getCurrentProfile = async () => {
  const user = await getCurrentUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*, cabinets(*)')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return data
}

// — DASHBOARD METRICS —
export const getMetriquesJour = async () => {
  const { data, error } = await supabase
    .from('vue_metriques_jour')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export const getStatsDirect = async (cabinetId: string) => {
  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
  const { data, error } = await supabase
    .from('consultations')
    .select('montant, statut, patient_id')
    .eq('cabinet_id', cabinetId)
    .eq('date_consult', today)

  if (error) throw error

  const patientsToday = new Set(data?.map(c => c.patient_id)).size
  const caToday = data?.filter(c => c.statut === 'paye').reduce((sum, c) => sum + Number(c.montant || 0), 0) || 0
  const creditsToday = data?.filter(c => c.statut === 'credit').reduce((sum, c) => sum + Number(c.montant || 0), 0) || 0

  return { patientsToday, caToday, creditsToday }
}

export const getCaMensuel = async () => {
  const { data, error } = await supabase
    .from('vue_ca_mensuel')
    .select('*')
    .order('mois', { ascending: true })
    .limit(6)
  if (error) throw error
  return data
}

// — PATIENTS —
export const getPatients = async () => {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export const getPatientById = async (
  id: string
) => {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export const createPatient = async (
  patient: Omit<Patient, 'id' | 'created_at'>
) => {
  const { data, error } = await supabase
    .from('patients')
    .insert([patient])
    .select()
    .single()
  if (error) throw error
  return data
}

export const updatePatient = async (
  id: string,
  updates: Partial<Patient>
) => {
  const { data, error } = await supabase
    .from('patients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deletePatient = async (
  id: string
) => {
  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// — CONSULTATIONS —
export const getConsultations = async () => {
  const { data, error } = await supabase
    .from('consultations')
    .select(`
      *,
      patients (nom, prenom, telephone)
    `)
    .order('date_consult', { ascending: false })
  if (error) throw error
  return data
}

export const getConsultationsByPatient = async (
  patientId: string
) => {
  const { data, error } = await supabase
    .from('consultations')
    .select('*')
    .eq('patient_id', patientId)
    .order('date_consult', { ascending: false })
  if (error) throw error
  return data
}

export const createConsultation = async (
  consultation: Omit<Consultation, 'id' | 'created_at'>
) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(consultation.patient_id || '')
  let payload = { ...consultation }

  if (!isUuid) {
    // Search for any existing patient with valid UUID in DB, or create one
    const { data: dbPatients } = await supabase.from('patients').select('id').limit(1)
    if (dbPatients && dbPatients.length > 0) {
      payload.patient_id = dbPatients[0].id
    } else {
      // Create a real DB patient record if database patients table is empty
      const { data: newPat } = await supabase
        .from('patients')
        .insert([{ nom: 'Patient', prenom: 'Consultation', cabinet_id: consultation.cabinet_id || null }])
        .select('id')
        .single()
      if (newPat?.id) {
        payload.patient_id = newPat.id
      }
    }
  }

  const { data, error } = await supabase
    .from('consultations')
    .insert([payload])
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateConsultation = async (
  id: string,
  updates: Partial<Consultation>
) => {
  const { data, error } = await supabase
    .from('consultations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// — SALLE D'ATTENTE (REALTIME) —
export const getSalleAttente = async (cabinetId: string) => {
  const { data, error } = await supabase
    .from('vue_salle_attente')
    .select('*')
    .eq('cabinet_id', cabinetId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

export const updateStatutAttente = async (
  id: string,
  statut: StatutAttente
) => {
  const { data, error } = await supabase
    .from('salle_attente')
    .update({ statut })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export const addToSalleAttente = async (
  entry: {
    cabinet_id: string
    patient_id: string
    date_rdv: string
    notes?: string
  }
) => {
  const { data, error } = await supabase
    .from('salle_attente')
    .insert([{
      ...entry,
      statut: 'en_attente',
      heure_arrivee: new Date().toISOString()
    }])
    .select()
    .single()
  if (error) throw error
  return data
}

export const subscribeSalleAttente = (
  cabinetId: string,
  onUpdate: (payload: any) => void
) => {
  return supabase
    .channel('salle_attente_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'salle_attente',
        filter: `cabinet_id=eq.${cabinetId}`
      },
      onUpdate
    )
    .subscribe()
}

// — RENDEZ-VOUS —
export const getRdv = async () => {
  const { data, error } = await supabase
    .from('rdv')
    .select(`
      *,
      patients (nom, prenom, telephone)
    `)
    .order('date_rdv', { ascending: true })
  if (error) throw error
  return data
}

export const createRdv = async (
  rdv: Omit<Rdv, 'id' | 'created_at'>
) => {
  const { data, error } = await supabase
    .from('rdv')
    .insert([rdv])
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateRdv = async (
  id: string,
  updates: Partial<Rdv>
) => {
  const { data, error } = await supabase
    .from('rdv')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteRdv = async (
  id: string
) => {
  const { error } = await supabase
    .from('rdv')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// — DOCUMENTS & PDF —
export const getDocuments = async (
  patientId?: string
) => {
  let query = supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
  if (patientId) {
    query = query.eq('patient_id', patientId)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export const getOrdonnances = async (
  cabinetId: string
) => {
  const { data, error } = await supabase
    .from('documents')
    .select(`
      *,
      patients (nom, prenom, telephone),
      consultations (notes, date_consult)
    `)
    .eq('type_document', 'ordonnance')
    .eq('cabinet_id', cabinetId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export const createDocument = async (
  document: Omit<import('../types').Document, 'id' | 'created_at'>
) => {
  const { data, error } = await supabase
    .from('documents')
    .insert([document])
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteDocument = async (
  id: string
) => {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export const generatePdf = async (params: {
  type_document: TypeDocument
  consultation_id?: string
  patient_id: string
  cabinet_id: string
}) => {
  const { data, error } = await supabase
    .functions.invoke('generate-pdf', {
      body: params
    })
  if (error) throw error
  return data
}

// — WHATSAPP —
export const sendWhatsapp = async (params: {
  type_message: TypeMessage
  telephone: string
  patient_id: string
  cabinet_id: string
  data_message: any
}) => {
  const { data, error } = await supabase
    .functions.invoke('send-whatsapp', {
      body: params
    })
  if (error) throw error
  return data
}
