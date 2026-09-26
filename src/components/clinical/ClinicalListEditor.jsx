import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Loader2, Pencil, Plus } from 'lucide-react'
import { setPatientClinical } from '../../lib/api'
import { addPatientMedication } from '../../lib/dossierApi'
import { resolveClinicalStatus } from '../../lib/clinical/clinicalStatus'
import ClinicalStatusBadge from './ClinicalStatusBadge'
import Button from '../common/Button'
import Chip from '../common/Chip'

// Inline, in-place editing of one clinical list from the consultation sidebar.
// Three explicit choices, never an implicit "empty = none":
//   "Aucun connu" -> 'none'   "Renseigner" -> 'listed'   "À vérifier plus tard" -> 'unknown'
// Saves go through mm_set_patient_clinical (doctor/admin, audited). Treatments are
// rows of patient_medications; their list status is saved the same way.
const CHOICES = [
  { value: 'none', label: 'Aucun connu' },
  { value: 'listed', label: 'Renseigner' },
  { value: 'unknown', label: 'À vérifier plus tard' },
]

// Quick category chips for antécédents: each inserts a labelled line into the
// existing free-text field (storage format unchanged: plain text).
const ANTECEDENT_CATEGORIES = ['Médicaux', 'Chirurgicaux', 'Familiaux', 'Gynéco-obstétricaux', 'Toxiques (tabac/alcool)']

const PLACEHOLDERS = {
  allergies: 'Une allergie par ligne (ex. Pénicilline : urticaire)',
  antecedents: 'Antécédents du patient…',
}

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-900'

export default function ClinicalListEditor({ kind, patientId, cabinetId, status, text = '', verifiedAt, meds = [], className = '' }) {
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()
  const textRef = useRef(null)
  const medNames = meds.map((m) => m.medication_name).filter(Boolean)
  const current = resolveClinicalStatus(status, kind === 'medications' ? medNames : text)

  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState(current)
  const [draft, setDraft] = useState(text || '')
  const [medName, setMedName] = useState('')
  const [medPosology, setMedPosology] = useState('')
  const [state, setState] = useState('idle') // idle | saving | saved | error
  const [error, setError] = useState(null)

  // Opening the editor starts from what is stored now.
  useEffect(() => {
    if (!open) return
    setChoice(current)
    setDraft(text || '')
    setError(null)
    if (state !== 'saving') setState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // "Enregistré" fades back to idle, like the page autosave indicator.
  useEffect(() => {
    if (state !== 'saved') return undefined
    const t = setTimeout(() => setState('idle'), 2500)
    return () => clearTimeout(t)
  }, [state])

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['patient', patientId] }),
    kind === 'medications' ? queryClient.invalidateQueries({ queryKey: ['consult-ctx-meds', patientId] }) : null,
  ])

  const run = async (fn, { close = true } = {}) => {
    setState('saving'); setError(null)
    try {
      await fn()
      await refresh()
      setState('saved')
      if (close) setOpen(false)
    } catch (e) {
      setState('error')
      setError(e?.message || 'Enregistrement impossible.')
    }
  }

  const save = () => run(() => {
    if (kind === 'allergies') return setPatientClinical(patientId, { allergiesStatus: choice, allergies: choice === 'listed' ? draft : null })
    if (kind === 'antecedents') return setPatientClinical(patientId, { antecedentsStatus: choice, antecedents: choice === 'listed' ? draft : null })
    return setPatientClinical(patientId, { medicationsStatus: choice })
  })

  const addMedication = () => {
    if (!medName.trim() || !cabinetId) return
    run(async () => {
      await addPatientMedication(patientId, cabinetId, { medication_name: medName, posology: medPosology })
      await setPatientClinical(patientId, { medicationsStatus: 'listed' })
      setMedName(''); setMedPosology('')
    }, { close: false })
  }

  const insertCategory = (label) => {
    setDraft((d) => `${d.trim() ? `${d.replace(/\s+$/, '')}\n` : ''}${label} : `)
    textRef.current?.focus()
  }

  const listedNeedsText = choice === 'listed' && kind !== 'medications' && !draft.trim()
  const noneBlocked = kind === 'medications' && choice === 'none' && medNames.length > 0
  const canSave = state !== 'saving' && !listedNeedsText && !noneBlocked

  return (
    <div className={className}>
      <div className="relative">
        <ClinicalStatusBadge kind={kind} status={status} items={kind === 'medications' ? medNames : text} verifiedAt={verifiedAt} variant="block" />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          aria-label={open ? 'Fermer la saisie' : 'Modifier'}
          className="absolute right-1.5 top-1.5 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold text-slate-500 hover:bg-white/80 hover:text-slate-900">
          {state === 'saved' && !open ? <><Check className="h-3.5 w-3.5 text-green-700" /><span className="text-green-800">Enregistré</span></> : <><Pencil className="h-3 w-3" /> {open ? 'Fermer' : 'Modifier'}</>}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="editor"
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Statut">
                {CHOICES.map((c) => (
                  <Chip key={c.value} role="radio" selected={choice === c.value} onClick={() => setChoice(c.value)}>{c.label}</Chip>
                ))}
              </div>

              {choice === 'listed' && kind === 'antecedents' && (
                <div className="flex flex-wrap gap-1.5">
                  {ANTECEDENT_CATEGORIES.map((label) => (
                    <Chip key={label} onClick={() => insertCategory(label)}><Plus className="h-3 w-3 text-slate-400" /> {label}</Chip>
                  ))}
                </div>
              )}

              {choice === 'listed' && kind !== 'medications' && (
                <textarea ref={textRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={kind === 'allergies' ? 4000 : 8000}
                  placeholder={PLACEHOLDERS[kind]} aria-label={kind === 'allergies' ? 'Allergies' : 'Antécédents'} className={`${inputCls} resize-y`} autoFocus />
              )}

              {choice === 'listed' && kind === 'medications' && (
                <div className="space-y-1.5">
                  {medNames.length > 0 && (
                    <ul className="space-y-0.5 text-[12.5px] text-slate-700">
                      {meds.map((m) => <li key={m.id}><span className="font-semibold">{m.medication_name}</span>{m.posology ? ` · ${m.posology}` : ''}</li>)}
                    </ul>
                  )}
                  <input value={medName} onChange={(e) => setMedName(e.target.value)} placeholder="Médicament" aria-label="Médicament" className={inputCls}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMedication() } }} autoFocus />
                  <input value={medPosology} onChange={(e) => setMedPosology(e.target.value)} placeholder="Posologie (facultatif)" aria-label="Posologie" className={inputCls}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMedication() } }} />
                  <Button variant="secondary" size="sm" disabled={!medName.trim() || state === 'saving' || !cabinetId} onClick={addMedication}>
                    <Plus className="h-3.5 w-3.5" /> Ajouter le traitement
                  </Button>
                </div>
              )}

              {noneBlocked && <p className="text-[11.5px] text-slate-500">Des traitements actifs sont enregistrés : ils restent affichés.</p>}
              {error && <p role="alert" className="text-[12px] font-medium text-red-600">{error}</p>}

              {!(choice === 'listed' && kind === 'medications') && (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={state === 'saving'}>Annuler</Button>
                  <Button variant="primary" size="sm" onClick={save} disabled={!canSave}>
                    {state === 'saving' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…</> : 'Enregistrer'}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
