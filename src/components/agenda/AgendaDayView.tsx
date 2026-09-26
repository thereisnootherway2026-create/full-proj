import { memo, useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'
import AgendaRow from './AgendaRow'
import FreeSlotRow from './FreeSlotRow'
import TimeIndicator from './TimeIndicator'
import { useAgenda, type AgendaAppointmentInput } from './useAgenda'

export interface AgendaDayViewProps {
  date: Date
  appointments: AgendaAppointmentInput[]
  onSelectAppointment?: (id: string) => void
  onCreateAt?: (time: string) => void
  startTime?: string
  endTime?: string
  slotMinutes?: number
  className?: string
}

function AgendaDayView({
  date,
  appointments,
  onSelectAppointment,
  onCreateAt,
  startTime,
  endTime,
  slotMinutes,
  className,
}: AgendaDayViewProps) {
  const { items, appointmentCount } = useAgenda({
    date,
    appointments,
    startTime,
    endTime,
    slotMinutes,
  })

  const timeIndicatorRef = useRef<HTMLDivElement | null>(null)
  const scrolledDayRef = useRef<string | null>(null)

  // Bring "Maintenant" into view once when a day is opened — not on every items change, which
  // also fires after each confirm/cancel and on the minute tick and yanked the user back to now.
  useEffect(() => {
    if (!timeIndicatorRef.current) return
    const dayKey = date.toDateString()
    if (scrolledDayRef.current === dayKey) return
    scrolledDayRef.current = dayKey

    requestAnimationFrame(() => {
      timeIndicatorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }, [items, date])

  return (
    <section
      className={cn(
        'relative w-full rounded-[22px] border border-slate-200 bg-white py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]',
        className
      )}
    >
      <div className="pointer-events-none absolute bottom-3 left-[calc(1rem+84px)] top-3 w-[2px] bg-gray-300" />

      <div className="relative px-0.5">
        {appointmentCount === 0 && (
          <div className="px-4 pb-2 pt-1 text-center text-sm text-gray-400">
            Aucun rendez-vous aujourd&apos;hui
          </div>
        )}

        <div className="space-y-1">
          {items.map((item) => {
            if (item.type === 'time-indicator') {
              return (
                <div key={item.key} ref={timeIndicatorRef}>
                  <TimeIndicator label={item.label} />
                </div>
              )
            }

            if (item.type === 'free') {
              return <FreeSlotRow key={item.key} item={item} onCreateAt={onCreateAt} />
            }

            return (
              <AgendaRow
                key={item.key}
                item={item}
                onSelectAppointment={onSelectAppointment}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default memo(AgendaDayView)
