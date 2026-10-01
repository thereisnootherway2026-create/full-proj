import { memo } from 'react'
import StatusChip from '../common/StatusChip'

export default memo(function StageSection({
  id,
  index,
  title,
  isExpanded = true,
  status = 'a_completer', // 'valide' | 'en_cours' | 'a_completer'
  isValidated = false,
  onValidateAndContinue,
  validateButtonLabel = 'Valider et continuer →',
  footerClassName = '',
  children,
}) {
  if (!isExpanded) {
    return null
  }

  const effectiveStatus = isValidated ? 'valide' : status
  const cleanTitle = title.replace(/^\d+\s*·\s*/, '')

  // ── EXPANDED SECTION CONTAINER (Clean, modern clinical sheet) ──
  return (
    <section
      id={id}
      className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs transition-all duration-200"
    >
      {/* Header: "{index} · {cleanTitle}" + chip EN COURS/VALIDÉ/À COMPLÉTER */}
      <header className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <h2 className="text-[16px] font-bold text-slate-900 leading-none tracking-tight">
            {index} · {cleanTitle}
          </h2>

          <StatusChip state={effectiveStatus} />
        </div>
      </header>

      {/* Body */}
      <div className="space-y-5 pt-4">
        {children}

        {/* Bottom "Valider et continuer →" Action (Sticky Card Footer) */}
        {onValidateAndContinue && (
          <div className={`sticky bottom-0 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 px-5 sm:px-6 py-3 border-t border-slate-100 bg-white/95 backdrop-blur-xs flex items-center justify-between rounded-b-2xl ${footerClassName}`}>
            <span className="text-[11.5px] text-slate-400 hidden sm:inline-flex items-center gap-1 font-medium">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-mono">Ctrl</kbd>
              <span>+</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-mono">Entrée</kbd>
              <span className="ml-1 text-slate-400">pour continuer</span>
            </span>
            <button
              type="button"
              onClick={onValidateAndContinue}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1A56DB] hover:bg-blue-700 text-white px-4 py-2 text-[13px] font-medium shadow-xs transition-colors ml-auto"
            >
              <span>{validateButtonLabel}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  )
})
