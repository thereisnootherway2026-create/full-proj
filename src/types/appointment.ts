export type AppointmentStatus =
  | 'PLANIFIE'
  | 'A_CONFIRMER'
  | 'CONFIRME'
  | 'ANNULE'
  | 'TERMINE'
  | 'ABSENT'
  | 'ARRIVE'

export type AppointmentType = 'Consultation' | 'Contrôle' | 'Urgence' | 'Autre'

export interface Appointment {
  id: string
  patientName: string
  phone: string
  patientId?: string
  age?: number
  date: string
  time: string
  duration: number
  type: AppointmentType
  status: AppointmentStatus
  notes?: string
  dossierNumber?: string
  createdAt: string
  updatedAt?: string
  confirmedAt?: string
  confirmedBy?: string
  cancellationReason?: string
  cancelledAt?: string
  cancelledBy?: string
}

export const CANCELLATION_REASONS: Record<string, string> = {
  patient_cancelled: 'Le patient a annulé',
  no_show: "Le patient ne s'est pas présenté",
  doctor_unavailable: 'Médecin indisponible',
  other: 'Autre raison',
}

export const STATUS_CONFIG: Record<
  AppointmentStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  PLANIFIE: {
    label: 'PLANIFIÉ',
    bg: 'bg-[#F3F4F6]',
    text: 'text-[#374151]',
    dot: 'bg-gray-400',
  },
  A_CONFIRMER: {
    label: 'À CONFIRMER',
    bg: 'bg-[#FEF3C7]',
    text: 'text-[#92400E]',
    dot: 'bg-amber-500',
  },
  CONFIRME: {
    label: 'CONFIRMÉ',
    bg: 'bg-[#D1FAE5]',
    text: 'text-[#065F46]',
    dot: 'bg-green-500',
  },
  ANNULE: {
    label: 'ANNULÉ',
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#991B1B]',
    dot: 'bg-red-500',
  },
  TERMINE: {
    label: 'TERMINÉ',
    bg: 'bg-[#E5E7EB]',
    text: 'text-[#374151]',
    dot: 'bg-gray-500',
  },
  ABSENT: {
    label: 'ABSENT',
    bg: 'bg-[#FFE4E6]',
    text: 'text-[#9F1239]',
    dot: 'bg-rose-500',
  },
  ARRIVE: {
    label: 'ARRIVÉ',
    bg: 'bg-[#DBEAFE]',
    text: 'text-[#1D4ED8]',
    dot: 'bg-blue-500',
  },
}
