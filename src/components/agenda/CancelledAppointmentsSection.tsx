import React, { useState } from 'react'
import { CalendarX, ChevronDown, ChevronUp, RotateCcw, Eye, Phone, Clock, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Appointment, CANCELLATION_REASONS } from '../../types/appointment'
import Button from '../common/Button'

interface CancelledAppointmentsSectionProps {
  appointments: Appointment[]
  // Cancelled appointments whose slot has since been booked by another appointment.
  takenSlotIds?: Set<string>
  onSelectAppointment: (id: string) => void
  onReschedule?: (appointment: Appointment) => void
  onOpenDrawer?: () => void
}

const CancelledAppointmentsSection: React.FC<CancelledAppointmentsSectionProps> = ({
  appointments,
  takenSlotIds,
  onSelectAppointment,
  onReschedule,
  onOpenDrawer,
}) => {
  const [isExpanded, setIsExpanded] = useState(true)

  if (appointments.length === 0) return null
  const takenCount = appointments.filter((a) => takenSlotIds?.has(a.id)).length

  return (
    <div className="rounded-[22px] border border-rose-200/80 bg-white shadow-xs overflow-hidden transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-rose-50/70 to-white border-b border-rose-100">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 shadow-xs">
            <CalendarX size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 leading-tight">
                Rendez-vous annulés
              </h3>
              <span className="inline-flex items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-xs font-black text-white">
                {appointments.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {takenCount === 0
                ? 'Ces créneaux sont toujours libres dans l’agenda.'
                : `${takenCount} créneau${takenCount > 1 ? 'x' : ''} déjà repris par un autre rendez-vous.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenDrawer && appointments.length > 3 && (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="text-xs font-bold text-rose-700 hover:text-rose-900 bg-rose-100/60 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition"
            >
              Voir la liste complète
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition"
          >
            {isExpanded ? (
              <>
                <span>Masquer</span>
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                <span>Afficher ({appointments.length})</span>
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body: Card Grid */}
      {isExpanded && (
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {appointments.map((appt) => {
              const initials = (appt.patientName || 'P')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              const reasonLabel = appt.cancellationReason
                ? CANCELLATION_REASONS[appt.cancellationReason] || appt.cancellationReason
                : 'Annulé'

              return (
                <div
                  key={appt.id}
                  className="rounded-xl border border-rose-100 bg-rose-50/20 hover:bg-rose-50/40 p-4 transition-all duration-150 flex flex-col justify-between space-y-3"
                >
                  {/* Top info */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700 font-black text-xs">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">
                            {appt.patientName}
                          </p>
                          {appt.phone && appt.phone !== '-' && (
                            <a
                              href={`tel:${appt.phone}`}
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                            >
                              <Phone size={10} />
                              {appt.phone}
                            </a>
                          )}
                        </div>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700 flex-shrink-0">
                        Annulé
                      </span>
                    </div>

                    {/* Time & Reason */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600 font-semibold bg-white/70 px-2 py-1 rounded-md border border-slate-100">
                        <Clock size={12} className="text-slate-400" />
                        <span>
                          {format(new Date(appt.date), 'dd/MM/yyyy')} à {appt.time} ({appt.duration} min)
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-rose-800 bg-rose-100/50 px-2 py-1 rounded-md border border-rose-100 text-[11px]">
                        <AlertCircle size={11} className="text-rose-500 flex-shrink-0" />
                        <span className="truncate">Motif : {reasonLabel}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-100/60">
                    <Button variant="secondary" size="xs" onClick={() => onSelectAppointment(appt.id)}>
                      <Eye size={12} />
                      Détails
                    </Button>
                    {onReschedule && (
                      <Button variant="accent" size="xs" onClick={() => onReschedule(appt)}>
                        <RotateCcw size={12} />
                        Reprogrammer
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default CancelledAppointmentsSection
