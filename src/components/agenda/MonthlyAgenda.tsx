import { memo, useMemo } from 'react'
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { cn } from '../../lib/utils'
import type { AgendaCalendarAppointmentInput } from './useAgenda'

import { isToday as isDateToday, isPast as isDatePast } from 'date-fns'

interface MonthlyAgendaProps {
  selectedDate: Date
  appointments: AgendaCalendarAppointmentInput[]
  onDayClick?: (date: Date) => void
}

const statusDot: Record<string, string> = {
  CONFIRME: 'bg-blue-500',
  A_CONFIRMER: 'bg-amber-500',
  PLANIFIE: 'bg-amber-500',
  ANNULE: 'bg-red-500',
  ARRIVE: 'bg-green-500',
}

function MonthlyAgenda({ selectedDate, appointments, onDayClick }: MonthlyAgendaProps) {
  const monthStart = startOfMonth(selectedDate)
  const monthEnd = endOfMonth(selectedDate)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarEnd, calendarStart]
  )

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, AgendaCalendarAppointmentInput[]>()

    appointments.forEach((appointment) => {
      const bucket = map.get(appointment.date) ?? []
      bucket.push(appointment)
      map.set(appointment.date, bucket)
    })

    map.forEach((bucket) => {
      bucket.sort((left, right) => left.time.localeCompare(right.time))
    })

    return map
  }, [appointments])

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((label) => (
          <div
            key={label}
            className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {calendarDays.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd')
          const dayAppointments = appointmentsByDay.get(dayKey) ?? []
          const isCurrentMonth = isSameMonth(day, selectedDate)
          const isToday = isDateToday(day)
          const isPast = isDatePast(day) && !isToday

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onDayClick?.(day)}
              className={cn(
                'min-h-[132px] border-b border-r border-slate-100 px-3 py-3 text-left transition-colors duration-150 hover:bg-slate-50',
                !isCurrentMonth && 'bg-slate-50/40 opacity-50',
                isPast && 'text-slate-400'
              )}
            >
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center text-base font-medium rounded-full',
                    isToday ? 'bg-blue-600 text-white font-bold' : 'text-slate-900',
                    !isCurrentMonth && 'text-slate-300'
                  )}
                >
                  {format(day, 'd')}
                </div>
                {dayAppointments.length > 0 && isCurrentMonth && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                    {dayAppointments.length} RDV
                  </span>
                )}
              </div>

              {dayAppointments.length > 0 && isCurrentMonth && (
                <div className="mt-3 space-y-1 overflow-hidden">
                  {dayAppointments.slice(0, 3).map((appointment) => (
                    <div
                      key={appointment.id}
                      data-rdv-id={appointment.id}
                      className={cn(
                        'relative flex items-center gap-1.5 overflow-hidden rounded-md bg-slate-50 px-1.5 py-0.5',
                        appointment.leaving && 'agenda-leaving',
                        appointment.justConfirmed && 'agenda-confirmed'
                      )}
                    >
                      <span className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        appointment.leaving ? 'bg-rose-500' : statusDot[appointment.status] || 'bg-slate-400'
                      )} />
                      <span className="truncate text-[10px] font-bold text-slate-700">
                        {appointment.patientName.split(' ').pop()}
                      </span>
                    </div>
                  ))}
                  {dayAppointments.length > 3 && (
                    <p className="pl-1 text-[10px] font-bold text-slate-400">
                      + {dayAppointments.length - 3} autres
                    </p>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default memo(MonthlyAgenda)
