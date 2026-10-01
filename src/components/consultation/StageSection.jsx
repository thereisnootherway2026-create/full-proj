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

  // ── EXPANDED SECTION CARD (3px blue left accent, 16px padding, 20px status chip) ──
  return (
    <section
      id={id}
      className="group relative rounded-2xl border border-slate-200/90 border-l-[3px] border-l-[#2563EB] bg-white p-5 shadow-xs transition-all duration-200"
    >
      {/* Header: "{index} · {cleanTitle}" + chip EN COURS/VALIDÉ/À COMPLÉTER on ONE line; subtitle hidden when expanded */}
      <header className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <h2 className="text-[16px] font-bold text-slate-900 leading-none tracking-tight">
            {index} · {cleanTitle}
          </h2>

          <StatusChip state={effectiveStatus} />
        </div>
      </header>

      {/* Body: 20px gap (space-y-5) */}
      <div className="space-y-5 pt-4">
        {children}

        {/* Bottom "Valider et continuer →" Action (Sticky Card Footer) */}
        {onValidateAndContinue && (
          <div className={`sticky bottom-0 -mx-5 -mb-5 px-5 py-3 border-t border-slate-100 bg-white/95 backdrop-blur-xs flex justify-end rounded-b-2xl ${footerClassName}`}>
            <button
              type="button"
              onClick={onValidateAndContinue}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white px-4 py-2 text-[13px] font-medium shadow-xs transition-colors"
            >
              <span>{validateButtonLabel}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  )
})
