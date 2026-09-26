import { motion, useReducedMotion } from 'framer-motion'
import { ShieldAlert } from 'lucide-react'
import AgeSexeForm from './AgeSexeForm'

// Small blocking prompt shown in the Traitement block when "Ajouter" is clicked
// and prescribingReadiness() reports missing items. It asks for exactly those
// items, then `onContinue` adds the treatment row. Nothing else in the
// consultation is gated.
const TITLES = { age: 'l\'âge', sexe: 'le sexe', grossesse: 'la grossesse / l\'allaitement' }

export default function PrescribingGate({ patient, patientId, missing, pregnancyStatus, onPregnancy, onContinue, onCancel }) {
  const reduceMotion = useReducedMotion()
  const fields = missing.filter((m) => m === 'age' || m === 'sexe')
  const list = missing.map((m) => TITLES[m])
  const sentence = list.length > 1 ? `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}` : list[0]

  return (
    <motion.div
      role="dialog" aria-modal="false" aria-label="Avant de prescrire"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
      className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3"
    >
      <p className="mb-2.5 flex items-start gap-2 text-[13px] text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <span><span className="font-bold">Avant de prescrire</span>, précisez {sentence}.</span>
      </p>
      <AgeSexeForm patient={patient} patientId={patientId} fields={fields} askPregnancy
        pregnancyStatus={pregnancyStatus} onPregnancy={onPregnancy}
        onDone={onContinue} onCancel={onCancel} submitLabel="Continuer" />
    </motion.div>
  )
}
