import { memo, useMemo, useState } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { AgendaCalendarAppointmentInput } from './useAgenda'
import {
  DEFAULT_END_TIME,
  DEFAULT_SLOT_MINUTES,
  DEFAULT_START_TIME,
  formatMinutes,
  generateSlots,
  parseTimeToMinutes,
  slotSpan,
} from './useAgenda'

import { isToday as isDateToday } from 'date-fns'

interface WeeklyAgendaProps {
  selectedDate: Date
  appointments: AgendaCalendarAppointmentInput[]
  startTime?: string
  endTime?: string
  slotMinutes?: number
  onDayClick?: (date: Date) => void
  onSelectAppointment?: (id: string) => void
}

const statusConfig: Record<string, {
  card: string
  cardHover: string
  border: string
  text: string
}> = {
  CONFIRME: {
    card: 'bg-emerald-100',
    cardHover: 'hover:bg-emerald-200',
    border: 'border-emerald-300',
    text: 'text-emerald-900',
  },
  A_CONFIRMER: {
    card: 'bg-amber-100',
    cardHover: 'hover:bg-amber-200',
    border: 'border-amber-300',
    text: 'text-amber-900',
  },
  PLANIFIE: {
    card: 'bg-amber-100',
    cardHover: 'hover:bg-amber-200',
    border: 'border-amber-300',
    text: 'text-amber-900',
  },
  ANNULE: {
    card: 'bg-red-100',
    cardHover: 'hover:bg-red-200',
    border: 'border-red-300',
    text: 'text-red-900',
  },
  ARRIVE: {
    card: 'bg-blue-100',
    cardHover: 'hover:bg-blue-200',
    border: 'border-blue-300',
    text: 'text-blue-900',
  },
  TERMINE: {
    card: 'bg-slate-100',
    cardHover: 'hover:bg-slate-200',
    border: 'border-slate-300',
    text: 'text-slate-700',
  },
}

const fallbackStatus = {
  card: 'bg-slate-100',
  cardHover: 'hover:bg-slate-200',
  border: 'border-slate-300',
  text: 'text-slate-800',
}

function WeeklyAgenda({
  selectedDate,
  appointments,
  startTime = DEFAULT_START_TIME,
  endTime = DEFAULT_END_TIME,
  slotMinutes: step = DEFAULT_SLOT_MINUTES,
  onDayClick,
  onSelectAppointment,
}: WeeklyAgendaProps) {
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null)

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  )

  const gridStart = parseTimeToMinutes(startTime) ?? 8 * 60
  const gridEnd = parseTimeToMinutes(endTime) ?? 18 * 60

  const slotMinutes = useMemo(
    () => generateSlots(gridStart, gridEnd, step),
    [gridStart, gridEnd, step]
  )

  // Keyed by the grid step each appointment STARTS IN (an off-grid 09:10 lands in 09:00), with
  // the number of steps its duration covers so the cell can draw it that tall.
  const appointmentsBySlot = useMemo(() => {
    const map = new Map<string, PlacedAppointment[]>()

    appointments.forEach((appointment) => {
      const minutes = parseTimeToMinutes(appointment.time)
      if (minutes === null || minutes < gridStart || minutes > gridEnd) return
      const duration = appointment.durationMinutes ?? step
      const { slot, span } = slotSpan(minutes, duration, gridStart, gridEnd, step)
      const key = `${appointment.date}-${formatMinutes(slot)}`
      const bucket = map.get(key) ?? []
      bucket.push({ ...appointment, span, endLabel: formatMinutes(minutes + duration) })
      map.set(key, bucket)
    })

    map.forEach((bucket) => {
      bucket.sort((left, right) => left.patientName.localeCompare(right.patientName))
    })

    return map
  }, [appointments, gridStart, gridEnd, step])

  return (
    <section className="w-full overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="w-full grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
        <div className="border-b border-r border-slate-200 bg-slate-50" />

        {weekDays.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd')
          const dayCount = appointments.filter((appointment) => appointment.date === dayKey).length
          const isToday = isDateToday(day)

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onDayClick?.(day)}
              onMouseEnter={() => setHoveredDayKey(dayKey)}
              onMouseLeave={() => setHoveredDayKey(null)}
              className={cn(
                'border-b border-r border-slate-200 px-3 py-3 text-left transition-colors duration-150 hover:bg-gray-50',
                hoveredDayKey === dayKey && 'bg-blue-50/40',
                isToday && 'bg-blue-50/30 border-l-blue-500'
              )}
            >
              <p className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.18em]",
                isToday ? "text-blue-600" : "text-slate-400"
              )}>
                {format(day, 'EEE', { locale: fr })}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className={cn(
                  "text-base font-bold",
                  isToday ? "text-blue-700" : "text-slate-900"
                )}>{format(day, 'd')}</span>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                  {dayCount} RDV
                </span>
              </div>
            </button>
          )
        })}

        {slotMinutes.map((minutes) => {
          const timeLabel = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

          return (
            <WeekRow
              key={timeLabel}
              timeLabel={timeLabel}
              weekDays={weekDays}
              hoveredDayKey={hoveredDayKey}
              appointmentsBySlot={appointmentsBySlot}
              onDayClick={onDayClick}
              onSelectAppointment={onSelectAppointment}
              setHoveredDayKey={setHoveredDayKey}
            />
          )
        })}
      </div>
    </section>
  )
}

type PlacedAppointment = AgendaCalendarAppointmentInput & { span: number; endLabel: string }

interface WeekRowProps {
  timeLabel: string
  weekDays: Date[]
  hoveredDayKey: string | null
  appointmentsBySlot: Map<string, PlacedAppointment[]>
  onDayClick?: (date: Date) => void
  onSelectAppointment?: (id: string) => void
  setHoveredDayKey: (value: string | null) => void
}

function WeekRow({
  timeLabel,
  weekDays,
  hoveredDayKey,
  appointmentsBySlot,
  onDayClick,
  onSelectAppointment,
  setHoveredDayKey,
}: WeekRowProps) {
  const isHour = timeLabel.endsWith(':00')

  return (
    <>
      <div className={cn(
        "flex h-10 items-start justify-end border-r border-slate-200 bg-gray-50 px-2 pt-2 text-sm font-semibold text-gray-700",
        isHour ? "border-b border-b-slate-200" : "border-b border-b-slate-200"
      )}>
        {timeLabel}
      </div>

      {weekDays.map((day) => {
        const dayKey = format(day, 'yyyy-MM-dd')
        const slotKey = `${dayKey}-${timeLabel}`
        const slotAppointments = appointmentsBySlot.get(slotKey) ?? []
        const isToday = isDateToday(day)

        return (
          <div
            key={slotKey}
            onMouseEnter={() => setHoveredDayKey(dayKey)}
            onMouseLeave={() => setHoveredDayKey(null)}
            className={cn(
              'relative h-10 border-r border-slate-200 px-1 py-0.5 transition-colors duration-150',
              isHour ? "border-b border-b-slate-200" : "border-b border-b-slate-200",
              hoveredDayKey === dayKey ? 'bg-blue-50/30' : 'bg-gray-50',
              isToday && 'bg-blue-50/10'
            )}
          >
            {slotAppointments.length > 0 && (() => {
              const appt = slotAppointments[0]
              const cfg = statusConfig[appt.status] ?? fallbackStatus
              const cleanName = appt.patientName
                .replace(/^(Dossier\s*#?\d+\s*-\s*|#\d+\s*-\s*)/i, '')
                .trim()
              const isLong = appt.span > 1

              return (
                <button
                  type="button"
                  data-rdv-id={appt.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onSelectAppointment) {
                      onSelectAppointment(appt.id)
                    } else {
                      onDayClick?.(day)
                    }
                  }}
                  // Anchored in its start cell and drawn over the cells its duration covers
                  // (40px per step, minus the cell's vertical padding).
                  style={{ height: `${appt.span * 40 - 4}px` }}
                  className={cn(
                    'absolute inset-x-1 top-0.5 z-10 rounded border px-2 py-1.5 text-left transition-all duration-150 cursor-pointer flex flex-col shadow-sm hover:shadow-md overflow-hidden',
                    isLong ? 'justify-start' : 'justify-center',
                    cfg.card,
                    cfg.cardHover,
                    cfg.border,
                    appt.leaving && 'agenda-leaving',
                    appt.justConfirmed && 'agenda-confirmed',
                  )}
                >
                  {appt.leaving && (
                    <span className="agenda-pop absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
                      <X size={10} strokeWidth={3.5} />
                    </span>
                  )}
                  {appt.justConfirmed && (
                    <span className="agenda-check-pop absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm">
                      <Check size={10} strokeWidth={3.5} />
                    </span>
                  )}
                  <span className={cn(
                    'truncate text-[11.5px] font-bold leading-tight',
                    cfg.text
                  )}>
                    {cleanName}
                  </span>
                  {isLong && (
                    <span className={cn('truncate text-[10.5px] font-medium tabular-nums opacity-75', cfg.text)}>
                      {appt.time} – {appt.endLabel}
                    </span>
                  )}
                  {slotAppointments.length > 1 && (
                    <span className={cn('text-[10px] font-semibold opacity-75', cfg.text)}>
                      +{slotAppointments.length - 1} autre{slotAppointments.length > 2 ? 's' : ''}
                    </span>
                  )}
                </button>
              )
            })()}
          </div>
        )
      })}
    </>
  )
}

export default memo(WeeklyAgenda)
