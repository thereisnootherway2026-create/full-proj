import React, { useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, Plus } from 'lucide-react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { cn } from '../../lib/utils'

import AgendaDayView from '../../components/agenda/AgendaDayView'
import AppointmentDetailModal from '../../components/agenda/AppointmentDetailModal'
import AppointmentFormModal from '../../components/forms/AppointmentFormModal'
import { useAppContext } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { cancelAppointment, confirmAppointment, markAppointmentArrived } from '../../lib/appointmentService'
import WeeklyAgenda from '../../components/agenda/WeeklyAgenda'
import MonthlyAgenda from '../../components/agenda/MonthlyAgenda'

import type {
  AgendaAppointmentInput,
  AgendaCalendarAppointmentInput,
} from '../../components/agenda/useAgenda'
import type { Appointment, AppointmentStatus, AppointmentType } from '../../types/appointment'
import type { Rdv } from '../../types'

type DailyRdv = Pick<Rdv, 'id' | 'patient_id' | 'date_rdv' | 'status' | 'notes' | 'created_at'> & {
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
  clinicalContext?: string
  patientName?: string
  phone?: string
  type?: string
}

const WORKDAY_START = '08:00'
const WORKDAY_END = '18:00'
const SLOT_MINUTES = 15
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
    clinicalContext: current.clinicalContext || '',
    patientName: current.patientName || '',
    phone: current.phone || '',
    type: current.type || 'Consultation',
    ...overrides,
  })}`
}

const mapAppointmentStatus = (rdv: DailyRdv, meta: AppointmentMeta): AppointmentStatus => {
  if (rdv.status === 'annule') return 'ANNULE'
  if (rdv.status === 'absent') return 'ABSENT'
  if (rdv.status === 'arrive' || rdv.status === 'en_consultation') return 'ARRIVE'
  if (rdv.status === 'termine' || rdv.status === 'paye' || rdv.status === 'credit') return 'TERMINE'
  if (meta.confirmationState === 'CONFIRME' || meta.confirmedAt) return 'CONFIRME'
  return 'PLANIFIE'
}

const mapAgendaStatus = (rdv: DailyRdv): AgendaAppointmentStatus => {
  const meta = parseAppointmentMeta(rdv.notes)
  return mapAppointmentStatus(rdv, meta)
}

const mapRdvToAppointment = (rdv: DailyRdv): Appointment => {
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
    duration: SLOT_MINUTES,
    type: ((meta.type || 'Consultation') as AppointmentType),
    status: mapAppointmentStatus(rdv, meta),
    notes: meta.clinicalContext || '',
    dossierNumber: formatPatientNumber(rdv.patient_id).replace('#', ''),
    createdAt: rdv.created_at,
    confirmedAt: meta.confirmedAt || undefined,
    confirmedBy: meta.confirmedBy || undefined,
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
  const queryClient = useQueryClient()
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [isAnimating, setIsAnimating] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [draftSlot, setDraftSlot] = useState<{ date: string; time: string } | null>(null)
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null)
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null)

  const handleViewChange = (newView: 'day' | 'week' | 'month') => {
    setIsAnimating(true)
    setView(newView)
    setTimeout(() => setIsAnimating(false), 350)
  }

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
    queryKey: ['agenda-range', profile?.cabinet_id, view, rangeStartKey, rangeEndKey],
    enabled: Boolean(profile?.cabinet_id),
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
          patients (nom, prenom, telephone)
        `)
        .eq('cabinet_id', profile!.cabinet_id)
        .gte('date_rdv', `${rangeStartKey}T00:00:00`)
        .lte('date_rdv', `${rangeEndKey}T23:59:59`)
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
      .filter((rdv) => mapAgendaStatus(rdv) !== 'ANNULE')
      .map((rdv) => ({
        id: rdv.id,
        date: format(new Date(rdv.date_rdv), 'yyyy-MM-dd'),
        time: formatTimeFromIso(rdv.date_rdv),
        patientName: `${rdv.patients?.prenom || ''} ${rdv.patients?.nom || ''}`.trim() || parseAppointmentMeta(rdv.notes).patientName || 'Patient inconnu',
        patientNumber: formatPatientNumber(rdv.patient_id),
        status: mapAgendaStatus(rdv),
      }))
  }, [dailyRdvs])

  const dayAppointments = useMemo<AgendaAppointmentInput[]>(() => {
    return agendaAppointments
      .filter((appointment) => appointment.date === selectedDayKey)
      .map(({ date: _date, patientNumber: _patientNumber, ...appointment }) => ({
        ...appointment,
        patientNumber: '',
      }))
  }, [agendaAppointments, selectedDayKey])

  const stats = useMemo(() => {
    const confirmed = agendaAppointments.filter((a) => a.status === 'CONFIRME').length
    const pending = agendaAppointments.filter((a) => a.status === 'PLANIFIE' || a.status === 'A_CONFIRMER').length
    const cancelled = agendaAppointments.filter((a) => a.status === 'ANNULE').length
    return {
      total: agendaAppointments.length,
      confirmed,
      pending,
      cancelled
    }
  }, [agendaAppointments])

  const selectedAppointment = useMemo(() => {
    const match = dailyRdvs.find((rdv) => rdv.id === selectedAppointmentId)
    return match ? mapRdvToAppointment(match) : null
  }, [dailyRdvs, selectedAppointmentId])

  const editingAppointment = useMemo(() => {
    return dailyRdvs.find((rdv) => rdv.id === editingAppointmentId) ?? null
  }, [dailyRdvs, editingAppointmentId])

  const refreshDay = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['agenda-range', profile?.cabinet_id],
    })
  }

  const handleAppointmentStatusUpdate = async (appointment: Appointment, status: AppointmentStatus, metadata?: any) => {
    const rdv = dailyRdvs.find((item) => item.id === appointment.id)
    if (!rdv) return

    const queryKey = ['agenda-range', profile?.cabinet_id, view, rangeStartKey, rangeEndKey]
    const previousData = queryClient.getQueryData(queryKey)
    const statusUpdatedAt = new Date().toISOString()

    // OPTIMISTIC UPDATE
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
              phone: appointment.phone,
              patientName: appointment.patientName,
              type: appointment.type,
            })
          }
          return { ...item, status: status.toLowerCase(), notes: newNotes }
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
        }

        await cancelAppointment(appointment.id, metadata?.reason || null)

        if (metadata?.reason) {
          const { error: notesError } = await supabase
            .from('rdv')
            .update({ notes: newNotes })
            .eq('id', appointment.id)
          if (notesError) throw notesError
        }
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
      } else if (status === 'ARRIVE') {
        // Was a raw, ungated `rdv.update({status:'arrive'})` — any same-
        // clinic authenticated user could call this directly regardless of
        // role/permission. Now goes through a permission-checked RPC
        // (appointments.mark_arrived), matching every other status change
        // on this page.
        await markAppointmentArrived(appointment.id)
      }

      await refreshDay()
    } catch (error: any) {
      const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error))
      console.error('Status update error:', errorMsg)
      // ROLLBACK
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-inner">
                <CalendarIcon size={20} />
              </div>
              <h1 className={cn("text-lg font-black text-slate-900 leading-none", view !== 'day' && "capitalize")}>{periodLabel}</h1>
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
            <div className="flex flex-1 justify-end">
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
              startTime={WORKDAY_START}
              endTime={WORKDAY_END}
              slotMinutes={SLOT_MINUTES}
              onSelectAppointment={setSelectedAppointmentId}
              onCreateAt={can('appointments.create') ? (time) => setDraftSlot({ date: selectedDayKey, time }) : undefined}
            />
          )}

          {!error && view === 'week' && (
            <WeeklyAgenda
              selectedDate={selectedDate}
              appointments={agendaAppointments}
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
          open={Boolean(draftSlot) || Boolean(editingAppointment)}
          onClose={() => {
            setDraftSlot(null)
            setEditingAppointmentId(null)
          }}
          appointment={editingAppointment}
          initialDate={draftSlot?.date}
          initialTime={draftSlot?.time}
          onSuccess={refreshDay}
        />

        <AppointmentDetailModal
          isOpen={Boolean(selectedAppointment)}
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointmentId(null)}
          onEditTime={(appointment) => {
            setSelectedAppointmentId(null)
            setEditingAppointmentId(appointment.id)
          }}
          onUpdateStatus={handleAppointmentStatusUpdate}
        />
      </div>
    </div>
  )
}

export default AppointmentsPage
