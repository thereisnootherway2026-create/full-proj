import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { badgeClass, stepState } from './SectionStepper'

// One surface per section: a white card, its heading as a plain line inside it (no band, no
// coloured top border — the sticky stepper above already carries the step colours). The section
// being worked on gets a thin blue outline; the number badge keeps the stepper's state scheme
// (pending grey / active / complete green).
export default function StageSection({ id, index, title, hint, filled, active, refEl, children }) {
  const state = stepState(active, filled)
  return (
    <motion.section
      id={id}
      ref={refEl}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: (index - 1) * 0.05 }}
      className={`rounded-2xl border bg-white shadow-sm transition-[border-color,box-shadow] duration-300 ${
        active ? 'border-blue-300 shadow-md ring-4 ring-blue-50' : 'border-slate-200'
      }`}
    >
      <header className="flex items-center gap-2.5 px-6 pt-5">
        <span data-state={state} className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${badgeClass(state)}`}>
          {state === 'complete' ? <Check className="h-3 w-3" /> : index}
        </span>
        <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
        {hint && <span className="hidden truncate text-[12.5px] text-slate-400 md:inline">· {hint}</span>}
        <AnimatePresence>
          {filled && (
            <motion.span key="filled" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="ml-auto flex-shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">Renseigné</motion.span>
          )}
        </AnimatePresence>
      </header>
      <div className="space-y-6 px-6 pb-6 pt-4">{children}</div>
    </motion.section>
  )
}
