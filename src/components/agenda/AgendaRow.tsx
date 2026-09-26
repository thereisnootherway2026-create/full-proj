import { memo } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { parseTimeToMinutes, type AgendaAppointmentItem } from './useAgenda'

interface AgendaRowProps {
  item: AgendaAppointmentItem
  onSelectAppointment?: (id: string) => void
}

function AgendaRow({ item, onSelectAppointment }: AgendaRowProps) {
  // Helper to strip dossier prefix if present
  const displayName = item.patientName.replace(/^(Dossier\s*#?\d+\s*-\s*|#\d+\s*-\s*)/i, '').trim()

  // accent: the card's left bar; card: tinted fill + border so it stands off the grey row; avatar: tinted initials; pill: the status chip.
  const statusConfig: Record<string, { accent: string; card: string; avatar: string; pill: string; label: string; dotColor: string }> = {
    CONFIRME: {
      accent: 'bg-blue-500',
      card: 'bg-blue-50 border-blue-200 group-hover:border-blue-300',
      avatar: 'bg-blue-100 text-blue-700',
      pill: 'bg-white text-blue-700 ring-blue-200',
      label: 'Confirmé',
      dotColor: 'bg-blue-500',
    },
    A_CONFIRMER: {
      accent: 'bg-amber-400',
      card: 'bg-amber-50 border-amber-200 group-hover:border-amber-300',
      avatar: 'bg-amber-100 text-amber-700',
      pill: 'bg-white text-amber-700 ring-amber-200',
      label: 'À confirmer',
      dotColor: 'bg-amber-500',
    },
    PLANIFIE: {
      accent: 'bg-amber-400',
      card: 'bg-amber-50 border-amber-200 group-hover:border-amber-300',
      avatar: 'bg-amber-100 text-amber-700',
      pill: 'bg-white text-amber-700 ring-amber-200',
      label: 'À confirmer',
      dotColor: 'bg-amber-500',
    },
    ANNULE: {
      accent: 'bg-rose-500',
      card: 'bg-rose-50 border-rose-200 group-hover:border-rose-300',
      avatar: 'bg-rose-100 text-rose-700',
      pill: 'bg-white text-rose-700 ring-rose-200',
      label: 'Annulé',
      dotColor: 'bg-rose-500',
    },
    ARRIVE: {
      accent: 'bg-emerald-500',
      card: 'bg-emerald-50 border-emerald-200 group-hover:border-emerald-300',
      avatar: 'bg-emerald-100 text-emerald-700',
      pill: 'bg-white text-emerald-700 ring-emerald-200',
      label: 'Arrivé',
      dotColor: 'bg-emerald-500',
    },
    TERMINE: {
      accent: 'bg-slate-400',
      card: 'bg-slate-50 border-slate-200 group-hover:border-slate-300',
      avatar: 'bg-slate-100 text-slate-600',
      pill: 'bg-white text-slate-600 ring-slate-200',
      label: 'Terminé',
      dotColor: 'bg-slate-400',
    },
    ABSENT: {
      accent: 'bg-slate-400',
      card: 'bg-slate-50 border-slate-200 group-hover:border-slate-300',
      avatar: 'bg-slate-100 text-slate-600',
      pill: 'bg-white text-slate-600 ring-slate-200',
      label: 'Absent',
      dotColor: 'bg-slate-400',
    },
  }

  const config = statusConfig[item.status] || statusConfig.PLANIFIE
  const span = Math.max(1, item.spanSlots || 1)
  const isLong = span > 1
  const initials = displayName.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
  const startMin = parseTimeToMinutes(item.startLabel)
  const endMin = parseTimeToMinutes(item.endLabel)
  const durationMin = startMin !== null && endMin !== null && endMin > startMin ? endMin - startMin : null

  return (
    <button
      type="button"
      onClick={() => onSelectAppointment?.(item.id)}
      // One grid step = one 40px row (h-10) + the 4px gap between rows (parent's space-y-1), so a
      // longer appointment covers exactly the rows its duration spans.
      style={isLong ? { height: `${span * 40 + (span - 1) * 4}px` } : undefined}
      className={cn(
        'group grid w-full grid-cols-[70px_24px_1fr] px-4 text-left transition-colors duration-150 hover:bg-gray-100 bg-gray-50 border-b border-gray-200',
        isLong ? 'items-start py-1' : 'h-10 items-center'
      )}
    >
      <div
        className={cn(
          'pr-3 text-right text-sm font-semibold tabular-nums text-gray-700',
          isLong && 'pt-2',
          item.overlapIndex > 0 && 'text-transparent',
          item.isPast && 'text-gray-400',
          item.isNow && item.overlapIndex === 0 && 'text-blue-600'
        )}
      >
        {item.startLabel || item.time}
      </div>

      <div className={cn('flex justify-center', isLong && 'pt-2.5')}>
        {/* Turns red with the card while a just-cancelled appointment fades out */}
        <span className={cn('h-3 w-3 rounded-full transition-colors duration-150', item.leaving ? 'bg-rose-500' : config.dotColor)} />
      </div>

      <div
        className={cn('flex', isLong ? 'h-full items-stretch' : 'items-center')}
        style={{
          marginTop: item.overlapIndex > 0 ? `${item.overlapIndex * 3}px` : undefined,
        }}
      >
        <div
          data-rdv-id={item.id}
          className={cn(
            'relative flex flex-1 justify-between gap-3 overflow-hidden rounded-xl border pl-4 pr-3 shadow-sm transition-shadow duration-150 group-hover:shadow-md',
            config.card,
            isLong ? 'items-start py-2.5' : 'h-8 items-center',
            item.isPast && 'opacity-70',
            item.leaving && 'agenda-leaving',
            item.justConfirmed && 'agenda-confirmed'
          )}
        >
          {/* Status accent bar */}
          <span className={cn('absolute inset-y-0 left-0 w-1', config.accent)} />

          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'flex flex-shrink-0 items-center justify-center rounded-full font-bold',
                isLong ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[10px]',
                item.leaving
                  ? 'agenda-pop bg-rose-500 text-white'
                  : item.justConfirmed ? 'agenda-pop bg-blue-500 text-white' : config.avatar
              )}
            >
              {/* Initials become a ✕ / ✓ for the length of the cancel / confirm animation */}
              {item.leaving
                ? <X size={isLong ? 16 : 13} strokeWidth={3} />
                : item.justConfirmed ? <Check size={isLong ? 16 : 13} strokeWidth={3} /> : initials}
            </span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm font-bold text-slate-900">{displayName}</span>
                {!isLong && (
                  <span className="flex-shrink-0 text-xs font-medium tabular-nums text-slate-400">
                    {item.startLabel} – {item.endLabel}
                  </span>
                )}
              </span>
              {isLong && (
                <span className="mt-0.5 block text-xs font-medium tabular-nums text-slate-500">
                  {item.startLabel} – {item.endLabel}
                  {durationMin !== null && <span className="text-slate-400"> · {durationMin} min</span>}
                </span>
              )}
            </span>
          </span>

          <span
            className={cn(
              'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
              config.pill,
              item.justConfirmed && 'agenda-pop'
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', config.dotColor)} />
            {config.label}
          </span>
        </div>
      </div>
    </button>
  )
}

export default memo(AgendaRow)
