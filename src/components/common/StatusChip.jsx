import { memo } from 'react'

/**
 * Shared StatusChip component (PATCH Round 10).
 * Used across section headers, rail badges, and pills.
 *
 * States:
 * - 'en-cours' / 'en_cours': bg-blue-50 text-blue-700 border border-blue-200/80
 * - 'a-completer' / 'a_completer' / 'à-compléter': bg-amber-50 text-amber-700 border border-amber-200/80
 * - 'valide' / 'validé': bg-green-50 text-green-700 border border-green-200/80
 *
 * All: text-[11px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5, NOT italic.
 */
const CONFIGS = {
  'en-cours': {
    label: 'EN COURS',
    className: 'bg-blue-50 text-blue-700 border-blue-200/80',
  },
  'en_cours': {
    label: 'EN COURS',
    className: 'bg-blue-50 text-blue-700 border-blue-200/80',
  },
  'a-completer': {
    label: 'À COMPLÉTER',
    className: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  'a_completer': {
    label: 'À COMPLÉTER',
    className: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  'à-compléter': {
    label: 'À COMPLÉTER',
    className: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  'valide': {
    label: 'VALIDÉ',
    className: 'bg-green-50 text-green-700 border-green-200/80',
  },
  'validé': {
    label: 'VALIDÉ',
    className: 'bg-green-50 text-green-700 border-green-200/80',
  },
}

export default memo(function StatusChip({ state, label, className = '' }) {
  const norm = String(state || '').toLowerCase().trim()
  const cfg = CONFIGS[norm] || CONFIGS['a-completer']
  const text = label || cfg.label

  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5 border not-italic select-none ${cfg.className} ${className}`}
    >
      {text}
    </span>
  )
})
