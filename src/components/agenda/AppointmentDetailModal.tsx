import React, { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Phone, ExternalLink, Loader2 } from 'lucide-react'
import { format, parse } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Appointment, AppointmentStatus } from '../../types/appointment'
import { cn } from '../../lib/utils'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../../context/AppContext'

interface AppointmentDetailModalProps {
  appointment: Appointment | null
  isOpen: boolean
  onClose: () => void
  onUpdateStatus?: (appointment: Appointment, status: AppointmentStatus, metadata?: any) => Promise<void>
  onEditTime?: (appointment: Appointment) => void
}

const STATUS_BADGE_CONFIG: Record<string, string> = {
  CONFIRME: 'bg-green-100 text-green-700',
  A_CONFIRMER: 'bg-amber-100 text-amber-700',
  PLANIFIE: 'bg-amber-100 text-amber-700',
  ANNULE: 'bg-red-100 text-red-700',
  ABSENT: 'bg-rose-100 text-rose-700',
  ARRIVE: 'bg-blue-100 text-blue-700',
  TERMINE: 'bg-gray-100 text-gray-700',
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRME: 'Confirmé',
  A_CONFIRMER: 'À confirmer',
  PLANIFIE: 'À confirmer',
  ANNULE: 'Annulé',
  ABSENT: 'Absent',
  ARRIVE: 'Arrivé',
  TERMINE: 'Terminé',
}

const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  appointment,
  isOpen,
  onClose,
  onUpdateStatus,
  onEditTime,
}) => {
  const [loadingAction, setLoadingAction] = useState<AppointmentStatus | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('patient_cancelled')
  const modalRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { can, notify } = useAppContext()
  
  // Button hover/pressed state
  const [modifierHeureHovered, setModifierHeureHovered] = useState(false)
  const [modifierHeurePressed, setModifierHeurePressed] = useState(false)
  const [annulerRdvHovered, setAnnulerRdvHovered] = useState(false)
  const [annulerRdvPressed, setAnnulerRdvPressed] = useState(false)
  const [confirmerRdvHovered, setConfirmerRdvHovered] = useState(false)
  const [confirmerRdvPressed, setConfirmerRdvPressed] = useState(false)
  const [retourHovered, setRetourHovered] = useState(false)
  const [retourPressed, setRetourPressed] = useState(false)
  const [confirmerAnnulationHovered, setConfirmerAnnulationHovered] = useState(false)
  const [confirmerAnnulationPressed, setConfirmerAnnulationPressed] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()

      // Focus Trap logic
      if (event.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus()
            event.preventDefault()
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus()
            event.preventDefault()
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'

    // Focus the modal content initially to trap focus effectively
    if (modalRef.current) {
      modalRef.current.focus()
    }
    
    // Reset state when opened
    if (isOpen) {
      setShowCancelConfirm(false)
      setCancelReason('patient_cancelled')
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen || !appointment) return null

  const appointmentDateStr = `${appointment.date} ${appointment.time}`
  const appointmentStart = parse(appointmentDateStr, 'yyyy-MM-dd HH:mm', new Date())
  const appointmentEnd = new Date(appointmentStart.getTime() + (appointment.duration || 15) * 60000)
  const now = new Date()

  const isPast = appointmentEnd < now
  const isOngoing = appointmentStart <= now && now < appointmentEnd

  const handleStatusChange = async (target: AppointmentStatus, metadata?: any) => {
    if (!onUpdateStatus) return

    setLoadingAction(target)
    try {
      await onUpdateStatus(appointment, target, metadata)
      onClose()
    } catch (error: any) {
      // Full error (message, code) stays in the console for diagnostics;
      // the toast shows a concise, action-specific message so a genuine
      // failure is never silently invisible to the user (this previously
      // only logged to console with no user-facing feedback at all).
      console.error('Failed to update status:', error)
      const fallback = target === 'CONFIRME'
        ? "Impossible de confirmer ce rendez-vous."
        : target === 'ANNULE'
          ? "Impossible d'annuler ce rendez-vous."
          : "Impossible de mettre à jour ce rendez-vous."
      notify?.({ title: 'Erreur', description: error?.message || fallback, tone: 'error' })
    } finally {
      setLoadingAction(null)
    }
  }



  const isLoadingAny = loadingAction !== null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => !isLoadingAny && onClose()} />

      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative w-full max-w-lg outline-none rounded-xl border border-gray-200 bg-white shadow-2xl animate-in fade-in zoom-in duration-200 p-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-slate-700",
              STATUS_BADGE_CONFIG[appointment.status]?.replace('bg-', 'bg-').replace('100', '10') || 'bg-slate-100'
            )}>
              {appointment.patientName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">
                {appointment.patientName}
              </h3>
              {appointment.patientId && (
                <button 
                  onClick={() => {
                    onClose()
                    navigate(`/patients/${appointment.patientId}`)
                  }}
                  className="group flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Dossier #{appointment.dossierNumber || appointment.patientId.slice(0, 6).toUpperCase()}
                  <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              {appointment.phone ? (
                <a 
                  href={`tel:${appointment.phone}`}
                  className="text-sm font-semibold text-gray-500 hover:text-blue-600 mt-0.5 flex items-center gap-1.5 transition-colors"
                >
                  <Phone size={16} className="text-blue-500" /> {appointment.phone}
                </a>
              ) : (
                <p className="text-sm font-medium text-slate-400 mt-0.5">Aucun téléphone</p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isLoadingAny}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              DATE
            </div>
            <p className="text-base font-bold text-slate-900">
              {format(new Date(appointment.date), 'dd MMMM yyyy', { locale: fr })}
            </p>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              HEURE
            </div>
            <p className="text-base font-bold text-slate-900">{appointment.time}</p>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              TYPE
            </div>
            <p className="text-base font-bold text-slate-900">{appointment.type}</p>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              STATUT
            </div>
            <div className="mt-1">
              <span className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border shadow-sm",
                STATUS_BADGE_CONFIG[appointment.status] || 'bg-gray-100 text-gray-700',
                STATUS_BADGE_CONFIG[appointment.status]?.replace('text-', 'border-').replace('700', '200')
              )}>
                {STATUS_LABELS[appointment.status] || appointment.status}
              </span>
            </div>
          </div>

          {appointment.notes && (
            <div className="col-span-2 mt-2 pt-4 border-t border-slate-50">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                MOTIF
              </div>
              <p className="text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 italic leading-relaxed">
                "{appointment.notes}"
              </p>
            </div>
          )}
        </div>


        {/* Actions */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          {showCancelConfirm ? (
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-200">
              <p className="text-sm font-bold text-slate-800 mb-2">Motif d&apos;annulation :</p>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={isLoadingAny}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
              >
                <option value="patient_cancelled">Le patient a annulé</option>
                <option value="no_show">Le patient ne s&apos;est pas présenté</option>
                <option value="doctor_unavailable">Médecin indisponible</option>
                <option value="other">Autre raison</option>
              </select>
              
              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={isLoadingAny}
                  style={{
                    backgroundColor: retourHovered ? '#F9FAFB' : '#FFFFFF',
                    color: '#374151',
                    border: `2px solid ${retourHovered ? '#D1D5DB' : '#E5E7EB'}`,
                    padding: '0.625rem 1rem',
                    minHeight: '44px',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    whiteSpace: 'nowrap',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    width: 'auto',
                    flex: 1,
                    transform: retourPressed ? 'translateY(-1px) scale(0.98)' : retourHovered ? 'translateY(-2px)' : 'translateY(0)',
                    boxShadow: retourHovered ? '0 6px 16px -4px rgba(148, 163, 184, 0.15)' : 'none',
                    opacity: isLoadingAny ? 0.5 : 1,
                    cursor: isLoadingAny ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.375rem'
                  }}
                  onMouseEnter={() => setRetourHovered(true)}
                  onMouseLeave={() => { setRetourHovered(false); setRetourPressed(false); }}
                  onMouseDown={() => setRetourPressed(true)}
                  onMouseUp={() => setRetourPressed(false)}
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('ANNULE', { reason: cancelReason })}
                  disabled={isLoadingAny}
                  style={{
                    backgroundColor: confirmerAnnulationHovered ? '#DC2626' : '#DC2626',
                    color: '#FFFFFF',
                    border: `2px solid ${confirmerAnnulationHovered ? '#991B1B' : '#FCA5A5'}`,
                    padding: '0.625rem 1rem',
                    minHeight: '44px',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    whiteSpace: 'nowrap',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    width: 'auto',
                    flex: 1,
                    transform: confirmerAnnulationPressed ? 'translateY(-1px) scale(0.98)' : confirmerAnnulationHovered ? 'translateY(-2px)' : 'translateY(0)',
                    boxShadow: confirmerAnnulationHovered ? '0 6px 16px -4px rgba(220, 38, 38, 0.15)' : 'none',
                    opacity: isLoadingAny ? 0.5 : 1,
                    cursor: isLoadingAny ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.375rem'
                  }}
                  onMouseEnter={() => setConfirmerAnnulationHovered(true)}
                  onMouseLeave={() => { setConfirmerAnnulationHovered(false); setConfirmerAnnulationPressed(false); }}
                  onMouseDown={() => setConfirmerAnnulationPressed(true)}
                  onMouseUp={() => setConfirmerAnnulationPressed(false)}
                >
                  {loadingAction === 'ANNULE' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirmer l&apos;annulation
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              {can('appointments.update') && (
              <button
                type="button"
                onClick={() => onEditTime?.(appointment)}
                disabled={isLoadingAny || isOngoing || isPast}
                title={isPast ? "Impossible de modifier un RDV passé" : isOngoing ? "Impossible de modifier un RDV en cours" : ""}
                style={{
                  backgroundColor: modifierHeureHovered ? '#F9FAFB' : '#FFFFFF',
                  color: '#374151',
                  border: `2px solid ${modifierHeureHovered ? '#D1D5DB' : '#E5E7EB'}`,
                  padding: '0.625rem 1rem',
                  minHeight: '44px',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  whiteSpace: 'nowrap',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  width: 'auto',
                  flex: 1,
                  transform: modifierHeurePressed ? 'translateY(-1px) scale(0.98)' : modifierHeureHovered ? 'translateY(-2px)' : 'translateY(0)',
                  boxShadow: modifierHeureHovered ? '0 6px 16px -4px rgba(148, 163, 184, 0.15)' : 'none',
                  opacity: (isLoadingAny || isOngoing || isPast) ? 0.5 : 1,
                  cursor: (isLoadingAny || isOngoing || isPast) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.375rem'
                }}
                onMouseEnter={() => setModifierHeureHovered(true)}
                onMouseLeave={() => { setModifierHeureHovered(false); setModifierHeurePressed(false); }}
                onMouseDown={() => setModifierHeurePressed(true)}
                onMouseUp={() => setModifierHeurePressed(false)}
              >
                Modifier l&apos;heure
              </button>
              )}

              {can('appointments.cancel') && (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                disabled={isLoadingAny || appointment.status === 'ANNULE' || isOngoing || isPast}
                title={isPast || isOngoing ? "Impossible d'annuler un RDV en cours ou passé" : ""}
                style={{
                  backgroundColor: annulerRdvHovered ? '#FEF2F2' : '#FFFFFF',
                  color: '#DC2626',
                  border: `2px solid ${annulerRdvHovered ? '#FCA5A5' : '#FECACA'}`,
                  padding: '0.625rem 1rem',
                  minHeight: '44px',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  whiteSpace: 'nowrap',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  width: 'auto',
                  flex: 1,
                  transform: annulerRdvPressed ? 'translateY(-1px) scale(0.98)' : annulerRdvHovered ? 'translateY(-2px)' : 'translateY(0)',
                  boxShadow: annulerRdvHovered ? '0 6px 16px -4px rgba(220, 38, 38, 0.15)' : 'none',
                  opacity: (isLoadingAny || appointment.status === 'ANNULE' || isOngoing || isPast) ? 0.5 : 1,
                  cursor: (isLoadingAny || appointment.status === 'ANNULE' || isOngoing || isPast) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.375rem'
                }}
                onMouseEnter={() => setAnnulerRdvHovered(true)}
                onMouseLeave={() => { setAnnulerRdvHovered(false); setAnnulerRdvPressed(false); }}
                onMouseDown={() => setAnnulerRdvPressed(true)}
                onMouseUp={() => setAnnulerRdvPressed(false)}
              >
                Annuler le RDV
              </button>
              )}

              {can('appointments.confirm') && (appointment.status === 'PLANIFIE' || appointment.status === 'A_CONFIRMER') && (
                <button
                  type="button"
                  onClick={() => handleStatusChange('CONFIRME')}
                  disabled={isLoadingAny || isPast}
                  title={isPast ? "Impossible de confirmer un RDV passé" : ""}
                  style={{
                    backgroundColor: confirmerRdvHovered ? '#2563EB' : '#3B82F6',
                    color: '#FFFFFF',
                    border: `2px solid ${confirmerRdvHovered ? '#1E40AF' : '#60A5FA'}`,
                    padding: '0.625rem 1rem',
                    minHeight: '44px',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    whiteSpace: 'nowrap',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    width: 'auto',
                    flex: 1,
                    transform: confirmerRdvPressed ? 'translateY(-1px) scale(0.98)' : confirmerRdvHovered ? 'translateY(-2px)' : 'translateY(0)',
                    boxShadow: confirmerRdvHovered ? '0 6px 16px -4px rgba(37, 99, 235, 0.15)' : 'none',
                    opacity: (isLoadingAny || isPast) ? 0.5 : 1,
                    cursor: (isLoadingAny || isPast) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.375rem'
                  }}
                  onMouseEnter={() => setConfirmerRdvHovered(true)}
                  onMouseLeave={() => { setConfirmerRdvHovered(false); setConfirmerRdvPressed(false); }}
                  onMouseDown={() => setConfirmerRdvPressed(true)}
                  onMouseUp={() => setConfirmerRdvPressed(false)}
                >
                  {loadingAction === 'CONFIRME' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirmer le RDV
                </button>
              )}

            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default AppointmentDetailModal
