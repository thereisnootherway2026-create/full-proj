import { useState, useMemo, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react'
import { PRIORITY } from './ChecklistTypes.js'
import { generateChecklist } from './ChecklistEngine.js'

// ─── Priority visual config ───────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  [PRIORITY.CRITICAL]: {
    dot: 'bg-red-500',
    badge: 'text-red-700',
    label: 'Critique',
  },
  [PRIORITY.IMPORTANT]: {
    dot: 'bg-amber-500',
    badge: 'text-amber-600',
    label: 'Important',
  },
  [PRIORITY.REMINDER]: {
    dot: 'bg-blue-500',
    badge: 'text-blue-600',
    label: 'Rappel',
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Animated progress bar shown in the card header.
 */
function ChecklistProgress({ completed, total }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-semibold text-gray-500 whitespace-nowrap tabular-nums">
        {completed} / {total}
      </span>
      <div
        className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden"
        aria-label={`${pct}% complété`}
      >
        <motion.div
          className="h-full rounded-full bg-emerald-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

/**
 * Non-dismissible allergy banner — always rendered first, no checkbox.
 */
function AllergyBanner({ item }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5 bg-red-50/70 border-b border-red-100">
      <div className="mt-0.5 w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-red-800 leading-snug">{item.title}</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex-shrink-0 uppercase tracking-wide">
            Toujours visible
          </span>
        </div>
        <p className="text-xs text-red-700/80 mt-0.5 leading-relaxed font-medium">
          {item.description}
        </p>
      </div>
    </div>
  )
}

/**
 * Individual checklist item row with checkbox, priority indicator,
 * content, and optional navigation action badge.
 */
function ChecklistItemRow({ item, checked, autoCompleted, onToggle, onNavigate }) {
  const cfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG[PRIORITY.REMINDER]

  return (
    <motion.div
      layout
      className={`flex items-start gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors ${
        checked ? 'opacity-55' : ''
      }`}
    >
      {/* Custom checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => {
          if (!autoCompleted) onToggle()
        }}
        className={`mt-0.5 w-5 h-5 rounded-[5px] border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-1 ${
          checked
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        } ${autoCompleted ? 'cursor-default' : 'cursor-pointer'}`}
        title={autoCompleted ? 'Complété automatiquement' : checked ? 'Décocher' : 'Marquer comme fait'}
      >
        <AnimatePresence>
          {checked && (
            <motion.svg
              key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              viewBox="0 0 10 8"
              className="w-3 h-3"
              fill="none"
            >
              <path
                d="M1 4l2.5 2.5L9 1"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </button>

      {/* Priority dot */}
      <div
        className={`mt-2.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ${
          checked ? 'opacity-40' : ''
        }`}
        title={cfg.label}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          {/* Title */}
          <p
            className={`text-sm font-semibold leading-snug ${
              checked ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-900'
            }`}
          >
            {item.title}
          </p>

          {/* Action badge */}
          {item.actionLabel && (
            <button
              type="button"
              onClick={() => onNavigate?.(item.actionTarget)}
              className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
              title={`Aller à : ${item.actionLabel}`}
            >
              {item.actionLabel}
              <ArrowRight className="w-3 h-3 opacity-60" />
            </button>
          )}
        </div>

        {/* Description */}
        <p
          className={`text-xs mt-0.5 leading-relaxed ${
            checked ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {item.description}
        </p>

        {/* Auto-complete indicator */}
        {autoCompleted && (
          <div className="mt-1.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">
              Complété automatiquement
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/**
 * Shown when the engine generates no items for this patient.
 */
function ChecklistEmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">Checklist intelligente</h3>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Préparée automatiquement à partir du dossier médical
          </p>
        </div>
      </div>
      <div className="px-5 py-6 text-center space-y-1">
        <p className="text-sm font-semibold text-gray-600">
          ✅ Aucun point particulier détecté.
        </p>
        <p className="text-xs text-gray-400 font-medium">
          Le dossier est à jour. Bonne consultation.
        </p>
      </div>
    </div>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────

/**
 * ConsultationChecklist
 *
 * Renders a smart, auto-generated clinical checklist for the active
 * consultation. Items are derived from the patient context via the
 * rule engine. Supports auto-completion (when formData changes) and
 * manual completion (checkbox interaction). Provides scroll-navigation
 * deep links to relevant consultation sections.
 *
 * @param {Object}   patientContext   - output of buildPatientContext()
 * @param {Object}   formData         - current SOAP form state
 * @param {Array}    medications      - current prescription list
 * @param {Function} onNavigate       - called with ACTION_TARGET value on badge click
 */
export default function ConsultationChecklist({
  patientContext,
  formData,
  medications,
  onNavigate,
}) {
  const [manuallyChecked, setManuallyChecked] = useState(new Set())
  const [collapsed, setCollapsed] = useState(false)

  // Generate items from engine (stable — rebuilds only when patientContext changes)
  const items = useMemo(
    () => generateChecklist(patientContext),
    [patientContext]
  )

  // Split into allergy banners vs regular checkable items
  const allergyItems = useMemo(() => items.filter((i) => i.isAllergy), [items])
  const checkableItems = useMemo(() => items.filter((i) => !i.isAllergy), [items])

  // Compute auto-completion status for each checkable item
  const autoCompletedIds = useMemo(() => {
    const ids = new Set()
    for (const item of checkableItems) {
      try {
        if (item.autoCompleteWhen(formData, medications)) {
          ids.add(item.id)
        }
      } catch {
        // guard against rule errors
      }
    }
    return ids
  }, [checkableItems, formData, medications])

  // Final checked set = auto-completed ∪ manually checked
  const checkedIds = useMemo(() => {
    const ids = new Set(manuallyChecked)
    for (const id of autoCompletedIds) ids.add(id)
    return ids
  }, [autoCompletedIds, manuallyChecked])

  const total = checkableItems.length
  const completed = checkableItems.filter((i) => checkedIds.has(i.id)).length

  const handleToggle = useCallback((id) => {
    // Don't allow toggling auto-completed items (they reflect real data)
    if (autoCompletedIds.has(id)) return
    setManuallyChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [autoCompletedIds])

  // Nothing to show
  if (items.length === 0) return <ChecklistEmptyState />

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors focus:outline-none"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">Checklist intelligente</h3>
              {allergyItems.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Alertes critiques" />
              )}
            </div>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Préparée automatiquement à partir du dossier médical
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {total === 0 ? (
            <span className="text-xs font-medium text-gray-400">
              Aucune action recommandée
            </span>
          ) : (
            <ChecklistProgress completed={completed} total={total} />
          )}
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* ── Items ─────────────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="checklist-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {/* Allergy banners first — always on top */}
            {allergyItems.map((item) => (
              <AllergyBanner key={item.id} item={item} />
            ))}

            {/* Regular checkable items */}
            {checkableItems.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                checked={checkedIds.has(item.id)}
                autoCompleted={autoCompletedIds.has(item.id)}
                onToggle={() => handleToggle(item.id)}
                onNavigate={onNavigate}
              />
            ))}

            {/* Completion footer */}
            {total > 0 && completed === total && (
              <div className="flex items-center gap-2 px-5 py-3 bg-emerald-50/60 border-t border-emerald-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-xs font-semibold text-emerald-700">
                  Toutes les actions ont été réalisées. Bonne consultation.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
