import { Fragment } from 'react'
import { Check, ChevronRight, Clock3 } from 'lucide-react'

export function badgeClass(state, onDark = false) {
  if (state === 'complete') return 'bg-emerald-600 text-white'
  if (state === 'active') return onDark ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
  return 'bg-slate-100 text-slate-500'
}

export function stepState(active, filled) {
  return filled ? 'complete' : active ? 'active' : 'pending'
}

function formatVisitDate(date) {
  const d = date ? new Date(date) : new Date()
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SectionStepper({ steps, activeId, filled = {}, onSelect, visitDate }) {
  const formattedDate = formatVisitDate(visitDate)

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)]"
        role="tablist"
        aria-label="Étapes de la consultation"
      >
        {steps.map((s, i) => {
          const state = stepState(activeId === s.id, filled[s.id])
          const active = state === 'active'
          const isComplete = state === 'complete'
          const subtitle = s.hint || (i === 0 ? 'Raison de la visite' : i === 1 ? 'Constantes et observations' : 'Diagnostic, traitement et suivi')

          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(s.id)}
              className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all duration-150 ${
                active
                  ? 'bg-blue-50/80 border border-blue-200/80 shadow-2xs'
                  : isComplete
                    ? 'border border-transparent hover:bg-emerald-50/50'
                    : 'border border-transparent hover:bg-slate-50'
              }`}
            >
              {/* Step number badge */}
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold transition-all ${
                  active
                    ? 'bg-[#1A56DB] text-white shadow-xs'
                    : isComplete
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/80'
                }`}
              >
                {isComplete && !active ? <Check className="h-4 w-4 stroke-[2.5]" /> : i + 1}
              </span>

              {/* Step label & subtitle */}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] font-bold leading-tight ${
                  active
                    ? 'text-[#1A56DB]'
                    : isComplete
                      ? 'text-slate-900'
                      : 'text-slate-700 group-hover:text-slate-900'
                }`}>
                  {s.label}
                </p>
                <p className={`truncate text-[11.5px] mt-0.5 leading-tight ${
                  active
                    ? 'text-blue-700/80 font-medium'
                    : isComplete
                      ? 'text-emerald-700 font-medium'
                      : 'text-slate-600'
                }`}>
                  {subtitle}
                </p>
              </div>

              {/* Active indicator dot/bar */}
              {active && (
                <span className="hidden sm:block absolute right-3 h-2 w-2 rounded-full bg-[#1A56DB]" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
