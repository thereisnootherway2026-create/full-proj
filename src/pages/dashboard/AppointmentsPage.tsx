import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, Plus, CalendarX } from 'lucide-react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { cn } from '../../lib/utils'

import AgendaDayView from '../../components/agenda/AgendaDayView'
import AppointmentDetailModal from '../../components/agenda/AppointmentDetailModal'
import AppointmentFormModal from '../../components/forms/AppointmentFormModal'
import CancelledAppointmentsDrawer from '../../components/agenda/CancelledAppointmentsDrawer'
import { useAppContext } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { useAgendaConfig } from '../../lib/agendaConfig'
import { cancelAppointment, confirmAppointment, markAppointmentArrived } from '../../lib/appointmentService'
import WeeklyAgenda from '../../components/agenda/WeeklyAgenda'
import MonthlyAgenda from '../../components/agenda/MonthlyAgenda'

import type {
  AgendaAppointmentInput,
  AgendaAppointmentStatus,
  AgendaCalendarAppointmentInput,
} from '../../components/agenda/useAgenda'
import type { Appointment, AppointmentStatus, AppointmentType } from '../../types/appointment'
import type { Rdv } from '../../types'

type DailyRdv = Pick<Rdv, 'id' | 'patient_id' | 'date_rdv' | 'status' | 'notes' | 'created_at'> & {
  // Only selected once the agenda migration exists (see useAgendaConfig().schemaReady).
  duree_minutes?: number | null
  type_consultation_id?: string | null
  patients?: {
    nom?: string | null
    prenom?: string | null
    telephone?: string | null
    date_naissance?: string | null
  } | null
}

type AppointmentMeta = {
  confirmationState?: 'PLANIFIE' | 'CONFIRME'
  confirmedAt?: string | null
  confirmedBy?: string | null
  cancellationReason?: string
  cancelledAt?: string | null
  cancelledBy?: string | null
  clinicalContext?: string
  patientName?: string
  phone?: string
  type?: string
}

const META_PREFIX = '__AGENDA_META__'

const formatPatientNumber = (value?: string | null) =>
  `#${String(value || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'PAT'}`

const formatTimeFromIso = (value: string) => {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const calculateAge = (dateOfBirth?: string | null) => {
  if (!dateOfBirth) return undefined
  const birthDate = new Date(dateOfBirth)
  if (Number.isNaN(birthDate.getTime())) return undefined

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDelta = today.getMonth() - birthDate.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }
  return age
}

const parseAppointmentMeta = (notes?: string | null) => {
  if (!notes) {
    return {
      clinicalContext: '',
    } satisfies AppointmentMeta
  }

  if (!notes.startsWith(META_PREFIX)) {
    return {
      clinicalContext: notes,
    } satisfies AppointmentMeta
  }

  try {
    return JSON.parse(notes.slice(META_PREFIX.length)) as AppointmentMeta
  } catch {
    return {
      clinicalContext: '',
    } satisfies AppointmentMeta
  }
}

const buildAppointmentMeta = (
  notes: string | null | undefined,
  overrides: Partial<AppointmentMeta>
) => {
  const current = parseAppointmentMeta(notes)
  return `${META_PREFIX}${JSON.stringify({
    confirmationState: current.confirmationState || 'PLANIFIE',
    confirmedAt: current.confirmedAt || null,
    confirmedBy: current.confirmedBy || null,
    cancellationReason: current.cancellationReason || null,
    cancelledAt: current.cancelledAt || null,
    cancelledBy: current.cancelledBy || null,
    clinicalContext: current.clinicalContext || '',
    patientName: current.patientName || '',
    phone: current.phone || '',
    type: current.type || 'Consultation',
    ...overrides,
  })}`
}

const mapAppointmentStatus = (rdv: DailyRdv, meta: AppointmentMeta): AppointmentStatus => {
  const s = String(rdv.status || '').toLowerCase()
  if (s === 'annule' || s === 'cancelled') return 'ANNULE'
  if (s === 'absent' || s === 'no_show') return 'ABSENT'
  if (s === 'arrive' || s === 'en_consultation') return 'ARRIVE'
  if (s === 'termine' || s === 'paye' || s === 'credit' || s === 'completed') return 'TERMINE'
  // rdv.status 'confirme' is the DB's default "scheduled" state for every new RDV, not a real
  // confirmation — only the explicit confirm action (stored in the notes meta) counts.
  if (meta.confirmationState === 'CONFIRME' || meta.confirmedAt) return 'CONFIRME'
  return 'PLANIFIE'
}

// Length of the .agenda-leaving exit animation in index.css.
const AGENDA_LEAVE_MS = 900
// Length of the .agenda-confirmed animation in index.css.
const AGENDA_CONFIRM_MS = 1000

const mapAgendaStatus = (rdv: DailyRdv): AgendaAppointmentStatus => {
  const meta = parseAppointmentMeta(rdv.notes)
  return mapAppointmentStatus(rdv, meta)
}

// fallbackDuration: used until the appointment has a real duree_minutes (pre-migration rows
// were always shown as one grid step).
const mapRdvToAppointment = (rdv: DailyRdv, fallbackDuration: number): Appointment => {
  const meta = parseAppointmentMeta(rdv.notes)
  const patientName =
    `${rdv.patients?.prenom || ''} ${rdv.patients?.nom || ''}`.trim() ||
    meta.patientName ||
    'Patient inconnu'
  const rdvDate = new Date(rdv.date_rdv)
  const date = `${rdvDate.getFullYear()}-${String(rdvDate.getMonth() + 1).padStart(2, '0')}-${String(rdvDate.getDate()).padStart(2, '0')}`

  return {
    id: rdv.id,
    patientId: rdv.patient_id,
    patientName,
    phone: rdv.patients?.telephone || meta.phone || '-',
    age: calculateAge(rdv.patients?.date_naissance),
    date,
    time: formatTimeFromIso(rdv.date_rdv),
    duration: rdv.duree_minutes || fallbackDuration,
    type: ((meta.type || 'Consultation') as AppointmentType),
    status: mapAppointmentStatus(rdv, meta),
    notes: meta.clinicalContext || '',
    dossierNumber: formatPatientNumber(rdv.patient_id).replace('#', ''),
    createdAt: rdv.created_at,
    confirmedAt: meta.confirmedAt || undefined,
    confirmedBy: meta.confirmedBy || undefined,
    cancellationReason: meta.cancellationReason,
    cancelledAt: meta.cancelledAt || undefined,
    cancelledBy: meta.cancelledBy || undefined,
  }
}

/* ─── Dashboard-style Micro-interaction Buttons ─── */

function AgendaNavButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      className="flex items-center justify-center rounded-[0.625rem] font-semibold text-sm"
      style={{
        backgroundColor: hovered ? '#f8fafc' : '#ffffff',
        color: '#475569',
        border: `2px solid ${hovered ? '#cbd5e1' : '#e2e8f0'}`,
        padding: '0 0.625rem',
        minHeight: '44px',
        width: '44px',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: pressed ? 'translateY(-1px) scale(0.96)' : hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 6px 16px -4px rgba(148,163,184,0.2)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

function AgendaTodayButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  const [hovered, setHovered] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      className="flex items-center justify-center rounded-[0.625rem] font-bold text-sm"
      style={{
        backgroundColor: hovered ? '#f8fafc' : '#ffffff',
        color: '#475569',
        border: `2px solid ${hovered ? '#cbd5e1' : '#e2e8f0'}`,
        padding: '0.625rem 1.25rem',
        minHeight: '44px',
        whiteSpace: 'nowrap',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: pressed ? 'translateY(-1px) scale(0.98)' : hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 6px 16px -4px rgba(148,163,184,0.2)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

function AgendaPrimaryButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  const [hovered, setHovered] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      className="flex items-center gap-2 rounded-[0.625rem] font-bold text-sm text-white"
      style={{
        backgroundColor: pressed ? '#1d4ed8' : hovered ? '#1e40af' : '#2563eb',
        border: `2px solid ${hovered ? '#1e3a8a' : '#60a5fa'}`,
        padding: '0.625rem 1.375rem',
        minHeight: '44px',
        whiteSpace: 'nowrap',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: pressed ? 'translateY(-1px) scale(0.98)' : hovered ? 'translateY(-2px) scale(1.01)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 8px 20px -4px rgba(37,99,235,0.45)'
          : '0 4px 12px -2px rgba(37,99,235,0.25)',
      }}
    >
      {children}
    </button>
  )
}

const AppointmentsPage: React.FC = () => {
  const { profile, notify, can } = useAppContext()
  const agenda = useAgendaConfig(profile?.cabinet_id)
  const queryClient = useQueryClient()
  // Agenda opens on the week view; Jour / Mois are one click away.
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [isAnimating, setIsAnimating] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [draftSlot, setDraftSlot] = useState<{ date: string; time: string } | null>(null)
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null)
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null)
  const [showCancelledDrawer, setShowCancelledDrawer] = useState(false)
  const reopenCancelledDrawerRef = useRef(false)
  // Just-cancelled appointments still on screen for their exit animation, with the status they
  // had before cancelling. `cancelBump` replays the "N RDV annulés" bump when one lands there.
  const [leavingAppointments, setLeavingAppointments] = useState<Map<string, AgendaAppointmentStatus>>(new Map())
  const [cancelBump, setCancelBump] = useState(0)
  const failedCancelsRef = useRef(new Set<string>())
  // Just-confirmed appointments playing the confirmation animation.
  const [justConfirmedIds, setJustConfirmedIds] = useState<Set<string>>(new Set())
  const stopConfirmFlash = (id: string) => {
    setJustConfirmedIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }
  const stopLeaving = (id: string) => {
    setLeavingAppointments((current) => {
      if (!current.has(id)) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }

  const handleViewChange = (newView: 'day' | 'week' | 'month') => {
    setIsAnimating(true)
    setView(newView)
    setTimeout(() => setIsAnimating(false), 350)
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [patientForBooking, setPatientForBooking] = useState<any>(null)

  useEffect(() => {
    const patientFromState = (location.state as any)?.patient
    const patientIdFromParams = searchParams.get('patientId')

    if (patientFromState) {
      setPatientForBooking(patientFromState)
      setDraftSlot({
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '09:00',
      })
    } else if (patientIdFromParams) {
      (async () => {
        const { data } = await supabase.from('patients').select('*').eq('id', patientIdFromParams).single()
        if (data) {
          setPatientForBooking(data)
          setDraftSlot({
            date: format(new Date(), 'yyyy-MM-dd'),
            time: '09:00',
          })
        }
      })()
    }
  }, [location.state, searchParams])

  const visibleRange = useMemo(() => {
    if (view === 'week') {
      return {
        start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
        end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
      }
    }

    if (view === 'month') {
      return {
        start: startOfMonth(selectedDate),
        end: endOfMonth(selectedDate),
      }
    }

    return {
      start: startOfDay(selectedDate),
      end: endOfDay(selectedDate),
    }
  }, [selectedDate, view])

  const rangeStartKey = format(visibleRange.start, 'yyyy-MM-dd')
  const rangeEndKey = format(visibleRange.end, 'yyyy-MM-dd')
  const selectedDayKey = format(selectedDate, 'yyyy-MM-dd')

  const {
    data: dailyRdvsRaw = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['agenda-range', profile?.cabinet_id, view, rangeStartKey, rangeEndKey, agenda.schemaReady],
    enabled: Boolean(profile?.cabinet_id) && !agenda.isLoading,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('rdv')
        .select(`
          id,
          patient_id,
          date_rdv,
          status,
          notes,
          created_at,
          ${agenda.schemaReady ? 'duree_minutes, type_consultation_id,' : ''}
          patients (nom, prenom, telephone)
        `)
        .eq('cabinet_id', profile!.cabinet_id)
        .or(`and(date_rdv.gte.${rangeStartKey}T00:00:00,date_rdv.lte.${rangeEndKey}T23:59:59),and(appointment_day.gte.${rangeStartKey},appointment_day.lte.${rangeEndKey})`)
        .order('date_rdv', { ascending: true })

      if (queryError) {
        const errorMsg = queryError?.message || (typeof queryError === 'object' ? JSON.stringify(queryError) : String(queryError))
        console.error('Agenda query error:', errorMsg)
        return [] as DailyRdv[]
      }

      return (data || []) as DailyRdv[]
    },
  })

  // Use real data directly
  const dailyRdvs = dailyRdvsRaw || []

  const agendaAppointments = useMemo<AgendaCalendarAppointmentInput[]>(() => {
    return dailyRdvs
      .filter((rdv) => mapAgendaStatus(rdv) !== 'ANNULE' || leavingAppointments.has(rdv.id))
      .map((rdv) => ({
        id: rdv.id,
        date: format(new Date(rdv.date_rdv), 'yyyy-MM-dd'),
        time: formatTimeFromIso(rdv.date_rdv),
        patientName: `${rdv.patients?.prenom || ''} ${rdv.patients?.nom || ''}`.trim() || parseAppointmentMeta(rdv.notes).patientName || 'Patient inconnu',
        patientNumber: formatPatientNumber(rdv.patient_id),
        // A leaving block keeps its pre-cancel colours while it animates out.
        status: leavingAppointments.get(rdv.id) ?? mapAgendaStatus(rdv),
        durationMinutes: rdv.duree_minutes || agenda.settings.pasMinutes,
        leaving: leavingAppointments.has(rdv.id),
        justConfirmed: justConfirmedIds.has(rdv.id),
      }))
  }, [dailyRdvs, agenda.settings.pasMinutes, leavingAppointments, justConfirmedIds])

  const dayAppointments = useMemo<AgendaAppointmentInput[]>(() => {
    return agendaAppointments
      .filter((appointment) => appointment.date === selectedDayKey)
      .map(({ date: _date, patientNumber: _patientNumber, ...appointment }) => ({
        ...appointment,
        patientNumber: '',
      }))
  }, [agendaAppointments, selectedDayKey])

  const cancelledAppointments = useMemo(() => {
    // A leaving appointment joins the cancelled list once its exit animation is done.
    return dailyRdvs
      .filter((rdv) => mapAgendaStatus(rdv) === 'ANNULE' && !leavingAppointments.has(rdv.id))
      .map((rdv) => mapRdvToAppointment(rdv, agenda.settings.pasMinutes))
  }, [dailyRdvs, agenda.settings.pasMinutes, leavingAppointments])

  const currentPeriodCancelledAppointments = useMemo(() => {
    if (view === 'day') {
      return cancelledAppointments.filter((a) => a.date === selectedDayKey)
    }
    return cancelledAppointments
  }, [cancelledAppointments, view, selectedDayKey])

  // Cancelled appointments whose slot has since been booked by an active appointment — the
  // same half-open overlap rule as rdv_no_overlap_per_cabinet, checked on the loaded range.
  const takenSlotIds = useMemo(() => {
    const active = dailyRdvs
      .filter((rdv) => { const s = mapAgendaStatus(rdv); return s !== 'ANNULE' && s !== 'ABSENT' && s !== 'TERMINE' })
      .map((rdv) => {
        const start = new Date(rdv.date_rdv).getTime()
        return { start, end: start + (rdv.duree_minutes || agenda.settings.pasMinutes) * 60000 }
      })
    const taken = new Set<string>()
    for (const appt of currentPeriodCancelledAppointments) {
      const start = new Date(`${appt.date}T${appt.time}:00`).getTime()
      const end = start + appt.duration * 60000
      if (active.some((a) => a.start < end && a.end > start)) taken.add(appt.id)
    }
    return taken
  }, [dailyRdvs, currentPeriodCancelledAppointments, agenda.settings.pasMinutes])

  const stats = useMemo(() => {
    const confirmed = dailyRdvs.filter((a) => mapAgendaStatus(a) === 'CONFIRME').length
    const pending = dailyRdvs.filter((a) => mapAgendaStatus(a) === 'PLANIFIE' || mapAgendaStatus(a) === 'A_CONFIRMER').length
    const cancelled = dailyRdvs.filter((a) => mapAgendaStatus(a) === 'ANNULE').length
    return {
      total: dailyRdvs.length,
      confirmed,
      pending,
      cancelled,
    }
  }, [dailyRdvs])

  const selectedAppointment = useMemo(() => {
    const match = dailyRdvs.find((rdv) => rdv.id === selectedAppointmentId)
    return match ? mapRdvToAppointment(match, agenda.settings.pasMinutes) : null
  }, [dailyRdvs, selectedAppointmentId, agenda.settings.pasMinutes])

  const editingAppointment = useMemo(() => {
    return dailyRdvs.find((rdv) => rdv.id === editingAppointmentId) ?? null
  }, [dailyRdvs, editingAppointmentId])

  const refreshDay = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['agenda-range', profile?.cabinet_id],
    })
  }

  const handleReschedule = async (appointment: Appointment) => {
    let patient = null
    if (appointment.patientId) {
      const { data } = await supabase.from('patients').select('*').eq('id', appointment.patientId).single()
      if (data) patient = data
    }
    if (!patient) {
      const nameParts = (appointment.patientName || '').trim().split(' ')
      patient = {
        id: appointment.patientId,
        nom: nameParts.slice(1).join(' ') || nameParts[0] || 'Patient',
        prenom: nameParts.length > 1 ? nameParts[0] : '',
        telephone: appointment.phone && appointment.phone !== '-' ? appointment.phone : '',
      }
    }
    setPatientForBooking(patient)
    // Propose the cancelled slot itself while it is still ahead. Defaulting to "today 09:00"
    // collided with the patient's own appointment today (rdv_one_active_per_patient_per_day).
    const originalStart = new Date(`${appointment.date}T${appointment.time}:00`)
    setDraftSlot(originalStart > new Date()
      ? { date: appointment.date, time: appointment.time }
      : { date: format(new Date(), 'yyyy-MM-dd'), time: '09:00' })
  }

  const handleAppointmentStatusUpdate = async (appointment: Appointment, status: AppointmentStatus, metadata?: any) => {
    const rdv = dailyRdvs.find((item) => item.id === appointment.id)
    if (!rdv) return

    const queryKey = ['agenda-range', profile?.cabinet_id, view, rangeStartKey, rangeEndKey, agenda.schemaReady]
    const previousData = queryClient.getQueryData(queryKey)

    if (status === 'ANNULE') {
      // The block stays in its slot for its exit animation (rose pulse, strike, slow fade), then
      // moves to the cancelled list and the "RDV annulés" link bumps.
      const priorStatus = mapAgendaStatus(rdv)
      failedCancelsRef.current.delete(rdv.id)
      setLeavingAppointments((current) => new Map(current).set(rdv.id, priorStatus))
      window.setTimeout(() => {
        stopLeaving(rdv.id)
        if (!failedCancelsRef.current.delete(rdv.id)) setCancelBump((n) => n + 1)
      }, AGENDA_LEAVE_MS)
    }

    if (status === 'CONFIRME') {
      // The block turns "Confirmé" right away (optimistic); this plays the validation flash on it.
      setJustConfirmedIds((current) => new Set(current).add(rdv.id))
      window.setTimeout(() => stopConfirmFlash(rdv.id), AGENDA_CONFIRM_MS)
    }

    // OPTIMISTIC UPDATE: update exact cache key
    queryClient.setQueryData(queryKey, (old: DailyRdv[] | undefined) => {
      if (!old) return old
      return old.map((item) => {
        if (item.id === appointment.id) {
          let newNotes = item.notes
          if (status === 'CONFIRME') {
            const now = new Date().toISOString()
            newNotes = buildAppointmentMeta(item.notes, {
              confirmationState: 'CONFIRME',
              confirmedAt: now,
              confirmedBy: 'le secrétariat',
              phone: appointment.phone,
              patientName: appointment.patientName,
              type: appointment.type,
            })
          } else if (status === 'ANNULE' && metadata?.reason) {
            newNotes = buildAppointmentMeta(item.notes, {
              cancellationReason: metadata.reason,
              cancelledAt: new Date().toISOString(),
              cancelledBy: profile?.id,
              phone: appointment.phone,
              patientName: appointment.patientName,
              type: appointment.type,
            })
          }
          const dbStatus = status === 'ANNULE' ? 'cancelled' : status === 'CONFIRME' ? 'confirme' : status.toLowerCase()
          return { ...item, status: dbStatus, notes: newNotes }
        }
        return item
      })
    })

    try {
      if (status === 'ANNULE') {
        let newNotes = rdv.notes
        if (metadata?.reason) {
          newNotes = buildAppointmentMeta(rdv.notes, {
            cancellationReason: metadata.reason,
            cancelledAt: new Date().toISOString(),
            cancelledBy: profile?.id,
            phone: appointment.phone,
            patientName: appointment.patientName,
            type: appointment.type,
          })
          try {
            // Update metadata notes BEFORE status change so RLS restrictive policy on non-cancelled rows passes
            await supabase
              .from('rdv')
              .update({ notes: newNotes })
              .eq('id', appointment.id)
          } catch (e) {
            console.warn('Could not update metadata notes before cancelling:', e)
          }
        }

        await cancelAppointment(appointment.id, metadata?.reason || null)
        notify({
          title: 'Rendez-vous annulé',
          description: `Le créneau a été libéré et le rendez-vous de ${appointment.patientName} a été déplacé dans les rendez-vous annulés.`,
        })
      } else if (status === 'CONFIRME') {
        const now = new Date().toISOString()
        const newNotes = buildAppointmentMeta(rdv.notes, {
          confirmationState: 'CONFIRME',
          confirmedAt: now,
          confirmedBy: 'le secrétariat',
          phone: appointment.phone,
          patientName: appointment.patientName,
          type: appointment.type,
        })

        await confirmAppointment(appointment.id)

        const { error: notesError } = await supabase
          .from('rdv')
          .update({ notes: newNotes })
          .eq('id', appointment.id)
        if (notesError) throw notesError

        notify({
          title: 'Rendez-vous confirmé',
          description: `Le rendez-vous de ${appointment.patientName} est confirmé.`,
        })
      } else if (status === 'ARRIVE') {
        // Was a raw, ungated `rdv.update({status:'arrive'})` — any same-
        // clinic authenticated user could call this directly regardless of
        // role/permission. Now goes through a permission-checked RPC
        // (appointments.mark_arrived), matching every other status change
        // on this page.
        await markAppointmentArrived(appointment.id)
        notify({
          title: 'Patient arrivé',
          description: `${appointment.patientName} a été marqué comme arrivé.`,
        })
      }

      await refreshDay()
    } catch (error: any) {
      const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error))
      console.error('Status update error:', errorMsg)
      // ROLLBACK
      if (status === 'ANNULE') failedCancelsRef.current.add(appointment.id)
      stopLeaving(appointment.id)
      stopConfirmFlash(appointment.id)
      queryClient.setQueryData(queryKey, previousData)
      notify({
        title: 'Erreur',
        description: errorMsg,
        variant: 'destructive',
      })
    }
  }

  const handlePrev = () => {
    if (view === 'week') {
      setSelectedDate(subWeeks(selectedDate, 1))
      return
    }
    if (view === 'month') {
      setSelectedDate(subMonths(selectedDate, 1))
      return
    }
    setSelectedDate(subDays(selectedDate, 1))
  }

  const handleNext = () => {
    if (view === 'week') {
      setSelectedDate(addWeeks(selectedDate, 1))
      return
    }
    if (view === 'month') {
      setSelectedDate(addMonths(selectedDate, 1))
      return
    }
    setSelectedDate(addDays(selectedDate, 1))
  }

  const periodLabel = useMemo(() => {
    if (view === 'week') {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })
      return `Semaine du ${format(weekStart, 'd MMM', { locale: fr })} au ${format(weekEnd, 'd MMM yyyy', { locale: fr })}`
    }
    if (view === 'month') {
      return format(selectedDate, 'MMMM yyyy', { locale: fr })
    }
    const label = format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })
    return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
  }, [selectedDate, view])

  // Header: a short context line ("Semaine 39", "Aujourd'hui · jeudi", "2026") over a compact
  // one-line title ("21 – 27 sept. 2026", "24 septembre", "Septembre").
  const headerTitle = useMemo(() => {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    if (view === 'week') {
      const start = startOfWeek(selectedDate, { weekStartsOn: 1 })
      const end = endOfWeek(selectedDate, { weekStartsOn: 1 })
      const title = start.getFullYear() !== end.getFullYear()
        ? `${format(start, 'd MMM yyyy', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
        : start.getMonth() !== end.getMonth()
          ? `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
          : `${format(start, 'd')} – ${format(end, 'd MMM yyyy', { locale: fr })}`
      return { overline: `Semaine ${getISOWeek(selectedDate)}`, title }
    }
    if (view === 'month') {
      return { overline: format(selectedDate, 'yyyy'), title: cap(format(selectedDate, 'MMMM', { locale: fr })) }
    }
    const weekday = format(selectedDate, 'EEEE', { locale: fr })
    return {
      overline: isToday(selectedDate) ? `Aujourd'hui · ${weekday}` : weekday,
      title: format(selectedDate, 'd MMMM yyyy', { locale: fr }),
    }
  }, [selectedDate, view])

  if (!profile?.cabinet_id) {
    return (
      <div className="w-full px-6">
        <div className="mx-auto max-w-[1100px] rounded-[22px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-black text-slate-900">Agenda indisponible</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Aucun cabinet actif n&apos;est lié à ce compte.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-6 pb-10 pt-0 bg-slate-50">
      <div className="mx-auto max-w-full space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white px-6 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between">
            {/* Left: Date section */}
            <div className="flex flex-1 items-center gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                <CalendarIcon size={20} />
              </div>
              <div className="min-w-0">
                {/* Context line: which week / day / year */}
                <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  {headerTitle.overline}
                </span>
                <h1 className="mt-0.5 whitespace-nowrap text-xl font-black leading-tight tracking-tight text-slate-900">
                  {headerTitle.title}
                </h1>
                {currentPeriodCancelledAppointments.length > 0 && (
                  <button
                    // Re-mounted on each cancellation so the bump animation replays.
                    key={cancelBump}
                    type="button"
                    onClick={() => setShowCancelledDrawer(true)}
                    title="Voir les rendez-vous annulés pour cette période"
                    className={cn(
                      "-mx-1.5 mt-0.5 inline-flex w-fit items-center gap-1 rounded-md px-1.5 text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline underline-offset-2 transition-colors",
                      cancelBump > 0 && "cancelled-count-bump"
                    )}
                  >
                    <CalendarX size={13} />
                    {currentPeriodCancelledAppointments.length} RDV annulé{currentPeriodCancelledAppointments.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>

            {/* Center: View toggles & Date navigation */}
            <div className="flex items-center justify-center gap-8">
              {/* Segmented view toggle */}
              <div className="relative inline-flex rounded-xl bg-slate-100 p-1">
                <div 
                  className="absolute top-1 left-1 h-11 w-28 rounded-[0.625rem] bg-[#2563eb] shadow-[0_4px_14px_0_rgba(37,99,235,0.2)] transition-all duration-700"
                  style={{
                    border: '2px solid #60a5fa',
                    transform: `translateX(${view === 'day' ? 0 : view === 'week' ? 112 : 224}px) scaleX(${isAnimating ? 1.08 : 1})`,
                    transitionTimingFunction: 'cubic-bezier(0.25, 1.5, 0.5, 1)'
                  }}
                />
                {(['day', 'week', 'month'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleViewChange(option)}
                    className={cn(
                      "relative z-10 rounded-[0.625rem] px-5 py-2 text-sm font-bold transition-all duration-400 h-11 w-28 text-center",
                      view === option
                        ? 'text-white'
                        : 'text-slate-700 hover:text-slate-900'
                    )}
                    style={{
                      transitionTimingFunction: 'cubic-bezier(0.25, 1.5, 0.5, 1)'
                    }}
                  >
                    {option === 'day' ? 'Jour' : option === 'week' ? 'Semaine' : 'Mois'}
                  </button>
                ))}
              </div>

              {/* Date navigation */}
              <div className="flex items-center gap-2">
                <AgendaNavButton onClick={handlePrev} title="Précédent">
                  <ChevronLeft size={18} />
                </AgendaNavButton>
                <AgendaTodayButton onClick={() => setSelectedDate(new Date())}>
                  Aujourd&apos;hui
                </AgendaTodayButton>
                <AgendaNavButton onClick={handleNext} title="Suivant">
                  <ChevronRight size={18} />
                </AgendaNavButton>
              </div>
            </div>

            {/* Right: Action button */}
            <div className="flex flex-1 items-center justify-end gap-3">
              {can('appointments.create') && (
                <AgendaPrimaryButton onClick={() => setDraftSlot({ date: selectedDayKey, time: '09:00' })}>
                  <Plus size={18} />
                  Nouveau RDV
                </AgendaPrimaryButton>
              )}
            </div>
          </div>
        </div>

        <div className="animate-in fade-in duration-500">
          {error && (
            <div className="rounded-[22px] border border-rose-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm font-semibold text-rose-600">
                Impossible de charger l&apos;agenda pour cette période.
              </p>
            </div>
          )}

          {!error && view === 'day' && (
            <AgendaDayView
              date={selectedDate}
              appointments={dayAppointments}
              startTime={agenda.settings.heureDebut}
              endTime={agenda.settings.heureFin}
              slotMinutes={agenda.settings.pasMinutes}
              onSelectAppointment={setSelectedAppointmentId}
              onCreateAt={can('appointments.create') ? (time) => setDraftSlot({ date: selectedDayKey, time }) : undefined}
            />
          )}

          {!error && view === 'week' && (
            <WeeklyAgenda
              selectedDate={selectedDate}
              appointments={agendaAppointments}
              startTime={agenda.settings.heureDebut}
              endTime={agenda.settings.heureFin}
              slotMinutes={agenda.settings.pasMinutes}
              onSelectAppointment={setSelectedAppointmentId}
              onDayClick={(date) => {
                setSelectedDate(date)
                setView('day')
              }}
            />
          )}

          {!error && view === 'month' && (
            <MonthlyAgenda
              selectedDate={selectedDate}
              appointments={agendaAppointments}
              onDayClick={(date) => {
                setSelectedDate(date)
                setView('day')
              }}
            />
          )}
        </div>

        {isFetching && (
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Actualisation…
          </p>
        )}

        <AppointmentFormModal
          open={Boolean(draftSlot) || Boolean(editingAppointment) || Boolean(patientForBooking)}
          onClose={() => {
            setDraftSlot(null)
            setEditingAppointmentId(null)
            setPatientForBooking(null)
            if (searchParams.get('patientId')) {
              searchParams.delete('patientId')
              setSearchParams(searchParams, { replace: true })
            }
          }}
          appointment={editingAppointment}
          initialPatient={patientForBooking}
          initialDate={draftSlot?.date}
          initialTime={draftSlot?.time}
          onSuccess={() => {
            refreshDay()
            setPatientForBooking(null)
            if (searchParams.get('patientId')) {
              searchParams.delete('patientId')
              setSearchParams(searchParams, { replace: true })
            }
          }}
        />

        <CancelledAppointmentsDrawer
          isOpen={showCancelledDrawer}
          onClose={() => {
            reopenCancelledDrawerRef.current = false
            setShowCancelledDrawer(false)
          }}
          appointments={currentPeriodCancelledAppointments}
          takenSlotIds={takenSlotIds}
          onSelectAppointment={(id) => {
            reopenCancelledDrawerRef.current = true
            setShowCancelledDrawer(false)
            setSelectedAppointmentId(id)
          }}
          onReschedule={can('appointments.create') ? (appointment) => {
            reopenCancelledDrawerRef.current = false
            setShowCancelledDrawer(false)
            handleReschedule(appointment)
          } : undefined}
          periodLabel={periodLabel}
        />

        <AppointmentDetailModal
          isOpen={Boolean(selectedAppointment)}
          appointment={selectedAppointment}
          onClose={() => {
            setSelectedAppointmentId(null)
            if (reopenCancelledDrawerRef.current) {
              reopenCancelledDrawerRef.current = false
              setShowCancelledDrawer(true)
            }
          }}
          onEditTime={(appointment) => {
            reopenCancelledDrawerRef.current = false
            setSelectedAppointmentId(null)
            setEditingAppointmentId(appointment.id)
          }}
          onReschedule={can('appointments.create') ? (appointment) => {
            reopenCancelledDrawerRef.current = false
            setSelectedAppointmentId(null)
            handleReschedule(appointment)
          } : undefined}
          onUpdateStatus={async (appointment, status, metadata) => {
            reopenCancelledDrawerRef.current = false
            await handleAppointmentStatusUpdate(appointment, status, metadata)
          }}
        />
      </div>
    </div>
  )
}

export default AppointmentsPage
