import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Check, Loader2, Pencil, Pill, RefreshCw } from 'lucide-react'
import Button from '../common/Button'
import { formatDoctorLabel } from '../../lib/professionalName'

const fmtDay = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

// Lightweight flow for "Renouvellement d'ordonnance": the last issued ordonnance, and three
// ways forward — renew it as is (straight to the final confirmation), edit the treatment
// first (only the Traitement block opens), or go back to the full 3-section form.
// `stage`: 'choose' until the doctor picks, 'edit' once the Traitement block is open.
export default function RenewalPanel({ ordonnance, loading, error, retrying = false, stage, gate, followUp = null, onRenew, onModify, onValidate, onFullForm, onRetry }) {
  const lines = (ordonnance?.lignes || []).filter((l) => String(l.medicament || '').trim())
  const doctor = ordonnance?.doctor?.nom_complet ? formatDoctorLabel(ordonnance.doctor.nom_complet) : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl border border-blue-200 bg-blue-50/40"
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><RefreshCw className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-slate-900">Renouvellement d'ordonnance</p>
          <p className="mt-0.5 text-[12.5px] text-slate-600">
            {loading ? 'Recherche de la dernière ordonnance…'
              : error ? 'Impossible de charger les ordonnances du patient.'
                : ordonnance ? `Dernière ordonnance du ${fmtDay(ordonnance.date_prescription || ordonnance.created_at)}${doctor ? ` · ${doctor}` : ''}`
                  : 'Aucune ordonnance émise pour ce patient.'}
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : error ? (
          // A failed load is NOT "no ordonnance": say so, and never offer to renew or type a
          // treatment as if the patient had none.
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3">
            <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Les ordonnances du patient n'ont pas pu être chargées (problème de connexion ou serveur). Ce n'est pas une absence d'ordonnance.
            </p>
            <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Réessayer
            </Button>
          </div>
        ) : lines.length > 0 ? (
          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {lines.map((l, i) => (
              <li key={l.id || i} className="flex items-baseline gap-3 px-3 py-2">
                <span className="w-4 flex-shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-300">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-slate-800">{l.medicament}</p>
                  <p className="text-[12.5px] text-slate-500">{[l.posologie, l.duree].filter(Boolean).join(' · ') || 'Posologie non précisée'}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-[13px] text-slate-500">
            <Pill className="h-4 w-4 text-slate-400" /> Rien à reconduire : saisissez le traitement ou passez au formulaire complet.
          </p>
        )}
        {/* When to renew next (+ secretariat reminder): not shown while the ordonnances failed to load. */}
        {!loading && !error && followUp}
        {gate}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 px-4 py-3">
        <Button variant="link" onClick={onFullForm} className="!text-[12.5px] !text-slate-600">
          Passer au formulaire complet <ArrowRight className="ml-0.5 inline h-3.5 w-3.5" />
        </Button>
        <AnimatePresence mode="wait" initial={false}>
          {error && stage === 'choose' ? null : stage === 'choose' ? (
            <motion.div key="choose" className="flex flex-wrap gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <Button variant="secondary" size="sm" onClick={onModify} disabled={loading}>
                <Pencil className="h-3.5 w-3.5" /> {lines.length ? 'Modifier avant de valider' : 'Saisir le traitement'}
              </Button>
              {lines.length > 0 && (
                <Button variant="primary" size="sm" onClick={onRenew}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reconduire à l'identique
                </Button>
              )}
            </motion.div>
          ) : (
            <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <Button variant="primary" size="sm" onClick={onValidate}>
                <Check className="h-3.5 w-3.5" /> Valider le renouvellement
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
