import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { computeAge, formatAgeSexe } from '../../lib/clinical/age'
import AgeSexeForm from './AgeSexeForm'

// "42 ans · Femme" once known. While age or sexe is missing, a clickable
// "Ajouter âge / sexe" expands a compact inline form in place (no navigation).
// `canEdit` false (no patients.update): the known parts only, no link.
export default function AgeSexeLine({ patient, patientId, canEdit = true, className = '', formClassName = '', linkClassName = '' }) {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const text = formatAgeSexe(patient)
  const missing = [
    computeAge(patient?.date_naissance) === null && 'age',
    patient?.sexe !== 'homme' && patient?.sexe !== 'femme' && 'sexe',
  ].filter(Boolean)
  const linkLabel = missing.length === 2 ? 'Ajouter âge / sexe' : missing[0] === 'age' ? 'Ajouter l\'âge' : 'Ajouter le sexe'

  return (
    <div className={className}>
      <p className="flex flex-wrap items-center gap-x-1.5">
        {text && <span>{text}</span>}
        {missing.length > 0 && canEdit && !open && (
          <button type="button" onClick={() => setOpen(true)}
            className={`inline-flex items-center gap-0.5 font-semibold text-blue-600 hover:text-blue-700 hover:underline ${linkClassName}`}>
            {text && <span className="text-slate-300" aria-hidden="true">·</span>}<Plus className="h-3.5 w-3.5" /> {linkLabel}
          </button>
        )}
        {missing.length > 0 && !canEdit && !text && <span>Âge et sexe non renseignés</span>}
      </p>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="age-sexe-form"
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <AgeSexeForm patient={patient} patientId={patientId} fields={missing.length ? missing : ['age', 'sexe']}
              onDone={() => setOpen(false)} onCancel={() => setOpen(false)}
              className={`mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-left ${formClassName}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
