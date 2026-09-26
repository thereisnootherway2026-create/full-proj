import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, CalendarX, RotateCcw, Eye, Search, Phone } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Appointment, CANCELLATION_REASONS } from '../../types/appointment'
import { cn } from '../../lib/utils'
import Button from '../common/Button'

interface CancelledAppointmentsDrawerProps {
  isOpen: boolean
  onClose: () => void
  appointments: Appointment[]
  // Cancelled appointments whose slot has since been booked by another appointment.
  takenSlotIds?: Set<string>
  onSelectAppointment: (id: string) => void
  onReschedule?: (appointment: Appointment) => void
  periodLabel: string
}

const CancelledAppointmentsDrawer: React.FC<CancelledAppointmentsDrawerProps> = ({
  isOpen,
  onClose,
  appointments,
  takenSlotIds,
  onSelectAppointment,
  onReschedule,
  periodLabel,
}) => {
  const [search, setSearch] = useState('')
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!isOpen) return undefined
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const filteredAppointments = useMemo(() => {
    if (!search.trim()) return appointments
    const q = search.toLowerCase()
    return appointments.filter((appt) => {
      const name = (appt.patientName || '').toLowerCase()
      const phone = (appt.phone || '').toLowerCase()
      const reasonKey = appt.cancellationReason || ''
      const reasonLabel = (CANCELLATION_REASONS[reasonKey] || reasonKey).toLowerCase()
      return name.includes(q) || phone.includes(q) || reasonLabel.includes(q)
    })
  }, [appointments, search])

  return createPortal(
    <AnimatePresence>
      {isOpen && (
    <motion.div key="cancelled-drawer" className="fixed inset-0 z-[110] flex justify-end">
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        onClick={onClose}
      />

      {/* Drawer content: springs in from the right, slides back out on close */}
      <motion.div
        className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col z-10"
        initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
        animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 shadow-xs">
              <CalendarX size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 leading-tight">
                  Rendez-vous annulés
                </h2>
                <span className="inline-flex items-center justify-center rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-black text-white">
                  {appointments.length}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                {periodLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search bar */}
        {appointments.length > 0 && (
          <div className="px-6 pt-4 bg-white">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un patient ou motif..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-100 transition"
              />
            </div>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <CalendarX size={28} />
              </div>
              <p className="text-base font-bold text-slate-700">Aucun rendez-vous annulé</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Tous les créneaux programmés pour cette période sont actifs.
              </p>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Aucun résultat correspondant à &quot;{search}&quot;
            </div>
          ) : (
            filteredAppointments.map((appt, index) => {
              const initials = (appt.patientName || 'P')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              const reasonLabel = appt.cancellationReason
                ? CANCELLATION_REASONS[appt.cancellationReason] || appt.cancellationReason
                : 'Non spécifié'

              return (
                <motion.div
                  key={appt.id}
                  // Cards cascade in just behind the panel (first 8 staggered, the rest together).
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: 0.1 + Math.min(index, 8) * 0.045 }}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-shadow duration-150 hover:shadow-md"
                >
                  {/* Who / when */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold text-xs">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900 text-[15px] leading-snug">
                          {appt.patientName}
                        </p>
                        {appt.phone && appt.phone !== '-' ? (
                          <a
                            href={`tel:${appt.phone}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600"
                          >
                            <Phone size={11} />
                            {appt.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">Pas de numéro</span>
                        )}
                      </div>
                    </div>

                    {/* Struck-through slot: reads as "cancelled" without another badge */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-lg font-black leading-none text-slate-400 line-through decoration-rose-400 decoration-2">
                        {appt.time}
                      </p>
                      <p className="mt-1 text-xs font-medium capitalize text-slate-500">
                        {format(new Date(appt.date), 'EEE d MMM', { locale: fr })} · {appt.duration} min
                      </p>
                    </div>
                  </div>

                  {/* Reason, one quiet line */}
                  <p className="mt-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{reasonLabel}</span>
                    {appt.cancelledAt && (
                      <> · annulé le {format(new Date(appt.cancelledAt), "d MMM 'à' HH:mm", { locale: fr })}</>
                    )}
                  </p>

                  {/* Slot status + actions */}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-semibold',
                      takenSlotIds?.has(appt.id) ? 'text-amber-600' : 'text-emerald-600'
                    )}>
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        takenSlotIds?.has(appt.id) ? 'bg-amber-500' : 'bg-emerald-500'
                      )} />
                      {takenSlotIds?.has(appt.id) ? 'Créneau repris' : 'Créneau libre'}
                    </span>
                    <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => onSelectAppointment(appt.id)}>
                      <Eye size={14} />
                      Détails
                    </Button>
                    {onReschedule && (
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => {
                          onClose()
                          onReschedule(appt)
                        }}
                      >
                        <RotateCcw size={14} />
                        Reprogrammer
                      </Button>
                    )}
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <p className="text-xs text-slate-500 font-medium">
            Reprogrammer propose le créneau d&apos;origine quand il est encore à venir.
          </p>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default CancelledAppointmentsDrawer
