export type Role = 'medecin' | 'secretaire'
export type StatutConsultation = 'paye' | 'credit' | 'annule'
export type StatutAttente = 'en_attente' | 'en_consultation' | 'termine' | 'annule'
export type TypeDocument = 'recu_consultation' | 'fiche_cnss' | 'ordonnance' | 'recu_paiement'
export type TypeMessage = 'rappel_rdv' | 'confirmation_paiement' | 'envoi_recu'

export interface Cabinet {
  id: string
  tenant_id: string
  nom: string
  adresse?: string
  ville?: string
  telephone?: string
  created_at: string
}

export interface Profile {
  id: string
  cabinet_id: string
  role: Role
  nom_complet?: string
  created_at: string
}

export interface Patient {
  id: string
  cabinet_id: string
  nom: string
  prenom: string
  cin?: string
  telephone?: string
  date_naissance?: string
  email?: string
  adresse?: string
  ville?: string
  sexe?: 'homme' | 'femme'
  groupe_sanguin?: string
  allergies?: string
  antecedents?: string
  mutuelle?: string
  medecin_referent?: string
  created_at: string
}

export interface Consultation {
  id: string
  cabinet_id: string
  patient_id: string
  montant: number
  statut: StatutConsultation
  date_consult: string
  notes?: string
  created_at: string
}

export interface SalleAttente {
  id: string
  cabinet_id: string
  statut: StatutAttente
  position: number
  heure_arrivee: string
  date_rdv: string
  notes?: string
  nom: string
  prenom: string
  telephone?: string
}

export interface Rdv {
  id: string
  cabinet_id: string
  patient_id: string
  date_rdv: string
  status: 'confirme' | 'arrive' | 'en_consultation' | 'termine' | 'paye' | 'credit' | 'absent' | 'annule'
  notes?: string
  rappel_envoye: boolean
  created_at: string
}

export interface Document {
  id: string
  cabinet_id: string
  patient_id?: string
  consultation_id?: string
  type_document: TypeDocument
  storage_path: string
  nom_fichier: string
  created_at: string
}

export interface MessageWhatsapp {
  id: string
  cabinet_id: string
  patient_id: string
  telephone: string
  type_message: TypeMessage
  contenu: string
  statut: 'en_attente' | 'envoye' | 'echec'
  whatsapp_id?: string
  created_at: string
  sent_at?: string
}

export interface VueCaMensuel {
  mois: string
  ca_paye: number
  ca_credit: number
  nb_consultations: number
}

export interface VueMetriquesJour {
  patients_aujourd_hui: number
  ca_aujourd_hui: number
  credits_aujourd_hui: number
}

// ─── Task Management ─────────────────────────────────────────────────────────

export type TaskType =
  | 'RESULT'
  | 'PRESCRIPTION'
  | 'FOLLOW_UP'
  | 'PHONE_CALL'
  | 'ADMIN'
  | 'REFERRAL'
  | 'OTHER'

export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

export type TaskStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'DONE'
  | 'ARCHIVED'

export type TaskDueDatePreset = 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'CUSTOM'

export type ReminderPreset = '1H' | 'TODAY' | 'TOMORROW' | 'CUSTOM'

export interface Task {
  id: string
  patientId?: string
  consultationId?: string
  patientName?: string

  title: string
  notes?: string

  type: TaskType
  priority: TaskPriority
  status: TaskStatus

  dueDate: string | Date
  assignedTo: string
  reminderAt?: string | Date

  createdBy: string
  createdAt: string | Date

  completedBy?: string
  completedAt?: string | Date
}

export interface NewTaskFormData {
  patientId: string
  patientName: string
  title: string
  notes: string
  type: TaskType
  priority: TaskPriority
  dueDatePreset: TaskDueDatePreset
  customDueDate: string
  assignedTo: string
  reminderEnabled: boolean
  reminderPreset: ReminderPreset
  customReminderDate: string
}

// ─── Patient Dossier Structured Data ───────────────────────────────────────

export interface PatientVitals {
  id: string
  patient_id: string
  cabinet_id: string
  consultation_id?: string
  date_mesure: string
  blood_pressure?: string
  heart_rate?: number
  temperature?: number
  spo2?: number
  weight?: number
  height?: number
  blood_sugar?: number
  notes?: string
  created_at: string
}

export interface PatientProblem {
  id: string
  patient_id: string
  cabinet_id: string
  name: string
  status: 'Actif' | 'Stable' | 'Résolu' | 'À surveiller'
  diagnosed_date?: string
  severity: 'normal' | 'warning' | 'critical'
  notes?: string
  created_at: string
}

export interface PatientMedication {
  id: string
  patient_id: string
  cabinet_id: string
  medication_name: string
  dosage?: string
  posology?: string
  status: 'Actif' | 'Arrêté' | 'Si besoin'
  observance: 'Excellente' | 'Bonne' | 'Variable' | 'Mauvaise'
  start_date?: string
  end_date?: string
  prescribed_by?: string
  notes?: string
  created_at: string
}

export interface PatientLabResult {
  id: string
  patient_id: string
  cabinet_id: string
  exam_name: string
  result_value?: number
  result_text?: string
  unit?: string
  norm_min?: number
  norm_max?: number
  status: 'normal' | 'slightly_high' | 'slightly_low' | 'critical'
  date_exam?: string
  notes?: string
  created_at: string
}

export interface ClinicalNote {
  id: string
  patient_id: string
  cabinet_id: string
  note_type: 'summary' | 'vigilance' | 'conclusion'
  content: string
  date_note: string
  is_active: boolean
  created_at: string
}
