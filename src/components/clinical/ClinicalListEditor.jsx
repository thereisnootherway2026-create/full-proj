import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ClipboardList,
  Loader2,
  Pencil,
  Pill,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'
import { setPatientClinical } from '../../lib/api'
import { addPatientMedication } from '../../lib/dossierApi'
import { clinicalDisplay, resolveClinicalStatus } from '../../lib/clinical/clinicalStatus'
import Button from '../common/Button'

// Frequent allergy suggestions for 1-click clinical entry
const ALLERGY_SUGGESTIONS = [
  'Pénicilline',
  'Amoxicilline',
  'AINS / Aspirine',
  'Sulfamides',
  'Latex',
  'Produits iodés',
  'Arachide',
  'Céphalosporines',
]

// Common medical antecedents & categories
const ANTECEDENT_COMMON = [
  'HTA',
  'Diabète type 2',
  'Asthme',
  'Dyslipidémie',
  'Cardiopathie',
  'Tabagisme actif',
  'RGO',
]

const ANTECEDENT_CATEGORIES = ['Médicaux', 'Chirurgicaux', 'Familiaux']

const ICONS = {
  allergies: AlertTriangle,
  antecedents: ClipboardList,
  medications: Pill,
}

const PLACEHOLDERS = {
  allergies: 'Une allergie par ligne (ex. Pénicilline : urticaire)…',
  antecedents: 'Antécédents du patient (ex. HTA traitée, appendicectomie en 2012)…',
}

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all'

export default function ClinicalListEditor({
  kind,
  patientId,
  cabinetId,
  status,
  text = '',
  verifiedAt,
  meds = [],
  isOpen,
  onToggleOpen,
  className = '',
}) {
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()
  const textRef = useRef(null)

  const isControlled = isOpen !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isControlled ? isOpen : internalOpen

  const handleToggleOpen = (next) => {
    if (isControlled) {
      onToggleOpen?.(next)
    } else {
      setInternalOpen(next)
    }
  }

  const medNames = meds.map((m) => m.medication_name).filter(Boolean)
  const current = resolveClinicalStatus(status, kind === 'medications' ? medNames : text)

  const [choice, setChoice] = useState(current)
  const [draft, setDraft] = useState(text || '')
  const [medName, setMedName] = useState('')
  const [medPosology, setMedPosology] = useState('')
  const [state, setState] = useState('idle') // idle | saving | saved | error
  const [error, setError] = useState(null)

  // Reset local state when opened or when external data updates
  useEffect(() => {
    if (!open) return
    setChoice(current)
    setDraft(text || '')
    setError(null)
    if (state !== 'saving') setState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, status])

  // Fade "Enregistré" indicator back to idle
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
    setState('saving')
    setError(null)
    try {
      await fn()
      await refresh()
      setState('saved')
      if (close) handleToggleOpen(false)
    } catch (e) {
      setState('error')
      setError(e?.message || 'Enregistrement impossible.')
    }
  }

  const save = () => run(() => {
    if (kind === 'allergies') {
      return setPatientClinical(patientId, {
        allergiesStatus: choice,
        allergies: choice === 'listed' ? draft.trim() : null,
      })
    }
    if (kind === 'antecedents') {
      return setPatientClinical(patientId, {
        antecedentsStatus: choice,
        antecedents: choice === 'listed' ? draft.trim() : null,
      })
    }
    return setPatientClinical(patientId, { medicationsStatus: choice })
  })

  const addMedication = () => {
    if (!medName.trim() || !cabinetId) return
    run(async () => {
      await addPatientMedication(patientId, cabinetId, { medication_name: medName.trim(), posology: medPosology.trim() })
      await setPatientClinical(patientId, { medicationsStatus: 'listed' })
      setMedName('')
      setMedPosology('')
    }, { close: false })
  }

  const toggleAllergySuggestion = (item) => {
    setDraft((prev) => {
      const lines = prev.split('\n').map((l) => l.trim()).filter(Boolean)
      const exists = lines.some((l) => l.toLowerCase() === item.toLowerCase())
      if (exists) {
        return lines.filter((l) => l.toLowerCase() !== item.toLowerCase()).join('\n')
      }
      return lines.length > 0 ? `${lines.join('\n')}\n${item}` : item
    })
    textRef.current?.focus()
  }

  const appendAntecedent = (item) => {
    setDraft((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return item
      if (trimmed.toLowerCase().includes(item.toLowerCase())) return trimmed
      return `${trimmed}\n${item}`
    })
    textRef.current?.focus()
  }

  const insertCategory = (label) => {
    setDraft((d) => `${d.trim() ? `${d.replace(/\s+$/, '')}\n` : ''}${label} : `)
    textRef.current?.focus()
  }

  const listedNeedsText = choice === 'listed' && kind !== 'medications' && !draft.trim()
  const noneBlocked = kind === 'medications' && choice === 'none' && medNames.length > 0
  const canSave = state !== 'saving' && !listedNeedsText && !noneBlocked

  const d = clinicalDisplay(kind, status, kind === 'medications' ? medNames : text, verifiedAt)
  const Icon = d.state === 'unknown' ? AlertCircle : d.state === 'none' ? ShieldCheck : ICONS[kind]

  // Card tone and styling based on state
  let cardCls = 'border-slate-200 bg-white hover:border-slate-300'
  let headerIconColor = 'text-slate-700'
  let headerTitleColor = 'text-slate-800'
  let badgeCls = 'bg-slate-100 text-slate-700 border-slate-200/80'
  let badgeLabel = ''

  if (d.state === 'unknown') {
    cardCls = 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/70'
    headerIconColor = 'text-amber-600'
    headerTitleColor = 'text-amber-900'
    badgeCls = 'bg-amber-100/90 text-amber-800 border-amber-300/60'
    badgeLabel = 'À vérifier'
  } else if (d.state === 'none') {
    cardCls = 'border-slate-200 bg-white hover:border-slate-300'
    headerIconColor = 'text-emerald-600'
    headerTitleColor = 'text-slate-800'
    badgeCls = 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
    badgeLabel = 'Aucun(e) connu(e)'
  } else if (d.state === 'listed') {
    if (kind === 'allergies') {
      cardCls = 'border-red-200 bg-red-50/40 hover:bg-red-50/70'
      headerIconColor = 'text-red-600'
      headerTitleColor = 'text-red-900'
      badgeCls = 'bg-red-100 text-red-800 border-red-200'
      badgeLabel = `${d.items.length} signalée${d.items.length > 1 ? 's' : ''}`
    } else {
      cardCls = 'border-slate-200 bg-white hover:border-slate-300'
      headerIconColor = 'text-blue-600'
      headerTitleColor = 'text-slate-800'
      badgeCls = 'bg-blue-50 text-blue-700 border-blue-200'
      badgeLabel = kind === 'medications'
        ? `${meds.length} en cours`
        : `${d.items.length} renseigné${d.items.length > 1 ? 's' : ''}`
    }
  }

  // Active edit state border
  if (open) {
    cardCls = 'border-blue-400 ring-2 ring-blue-100/80 bg-white shadow-sm'
  }

  const activeAllergyLines = draft.split('\n').map((l) => l.trim().toLowerCase())

  return (
    <div className={`rounded-xl border transition-all duration-200 ${cardCls} ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={`h-4 w-4 flex-shrink-0 ${headerIconColor}`} />
          <span className={`text-[11px] font-bold uppercase tracking-wider ${headerTitleColor}`}>
            {d.title}
          </span>
          {badgeLabel && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold border ${badgeCls}`}>
              {badgeLabel}
            </span>
          )}
        </div>

        {!open ? (
          <button
            type="button"
            onClick={() => handleToggleOpen(true)}
            aria-label={`Modifier ${d.title.toLowerCase()}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            {state === 'saved' ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-emerald-700">Enregistré</span>
              </>
            ) : (
              <>
                <Pencil className="h-3 w-3" />
                <span>Modifier</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleToggleOpen(false)}
            aria-label="Fermer l'édition"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Read View (when collapsed) */}
      {!open && (
        <div className="px-3 pb-2.5 pt-0">
          {d.state === 'listed' ? (
            kind === 'medications' ? (
              <ul className="space-y-1">
                {meds.map((m) => (
                  <li key={m.id} className="text-[12.5px] text-slate-800">
                    <span className="font-semibold text-slate-900">{m.medication_name}</span>
                    {m.posology ? <span className="text-slate-500 text-[11.5px]"> · {m.posology}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className={`space-y-1 ${kind === 'allergies' ? 'text-red-900 font-semibold' : 'text-slate-700'}`}>
                {d.items.map((item, i) => (
                  <li key={`${item}-${i}`} className="flex items-start gap-1.5 text-[12.5px] break-words">
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${kind === 'allergies' ? 'bg-red-500' : 'bg-slate-400'}`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )
          ) : d.state === 'none' ? (
            <p className="text-[12px] text-slate-500">
              {d.label}
              {d.verifiedLabel && <span className="ml-1 text-[11px] text-slate-400">· {d.verifiedLabel}</span>}
            </p>
          ) : (
            <p className="text-[12px] font-medium text-amber-800/90">
              {d.label}
            </p>
          )}
        </div>
      )}

      {/* Edit View (expanded seamlessly within the same card) */}
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
            <div className="border-t border-slate-100 px-3 pb-3 pt-2.5 space-y-3">
              {/* Segmented Control */}
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-[11.5px]" role="radiogroup" aria-label={`Statut ${d.title}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === 'none'}
                  onClick={() => setChoice('none')}
                  className={`rounded-md py-1.5 font-medium transition-all ${
                    choice === 'none'
                      ? 'bg-white text-emerald-800 font-semibold shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  Aucun connu
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === 'listed'}
                  onClick={() => setChoice('listed')}
                  className={`rounded-md py-1.5 font-medium transition-all ${
                    choice === 'listed'
                      ? 'bg-white text-blue-700 font-semibold shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  Renseigner
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === 'unknown'}
                  onClick={() => setChoice('unknown')}
                  className={`rounded-md py-1.5 font-medium transition-all ${
                    choice === 'unknown'
                      ? 'bg-white text-amber-800 font-semibold shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  À vérifier
                </button>
              </div>

              {/* Dynamic Content: Choice = 'none' */}
              {choice === 'none' && (
                <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/60 p-2.5 flex items-start gap-2 text-[12px] text-emerald-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Absence confirmée</p>
                    <p className="text-emerald-700 text-[11.5px] mt-0.5 leading-relaxed">
                      {kind === 'allergies' && "Le patient confirme n'avoir aucune allergie médicamenteuse ou alimentaire connue."}
                      {kind === 'antecedents' && "Le patient confirme n'avoir aucun antécédent médical ou chirurgical notable."}
                      {kind === 'medications' && "Le patient confirme ne suivre aucun traitement régulier en cours."}
                    </p>
                  </div>
                </div>
              )}

              {/* Dynamic Content: Choice = 'unknown' */}
              {choice === 'unknown' && (
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 p-2.5 flex items-start gap-2 text-[12px] text-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Statut à vérifier</p>
                    <p className="text-amber-700 text-[11.5px] mt-0.5 leading-relaxed">
                      Conserver le rappel d'interrogatoire clinique pour les prochaines consultations.
                    </p>
                  </div>
                </div>
              )}

              {/* Dynamic Content: Choice = 'listed' */}
              {choice === 'listed' && (
                <div className="space-y-2">
                  {/* Allergies quick chips */}
                  {kind === 'allergies' && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500">Suggestions fréquentes :</p>
                      <div className="flex flex-wrap gap-1">
                        {ALLERGY_SUGGESTIONS.map((item) => {
                          const isActive = activeAllergyLines.includes(item.toLowerCase())
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => toggleAllergySuggestion(item)}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all ${
                                isActive
                                  ? 'bg-blue-50 text-blue-700 border border-blue-300 ring-1 ring-blue-300 font-semibold'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200/70 hover:bg-slate-200 hover:text-slate-800'
                              }`}
                            >
                              {isActive ? <Check className="h-2.5 w-2.5 text-blue-600" /> : <Plus className="h-2.5 w-2.5 text-slate-400" />}
                              {item}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Antecedents category + common chips */}
                  {kind === 'antecedents' && (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] font-medium text-slate-500 mr-1">Rubriques :</span>
                        {ANTECEDENT_CATEGORIES.map((label) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => insertCategory(label)}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200/70 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5 text-slate-400" /> {label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[11px] font-medium text-slate-500 mr-1">Fréquents :</span>
                        {ANTECEDENT_COMMON.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => appendAntecedent(item)}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200/70 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5 text-slate-400" /> {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Free text area for allergies and antecedents */}
                  {kind !== 'medications' && (
                    <div>
                      <textarea
                        ref={textRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={kind === 'antecedents' ? 4 : 3}
                        maxLength={kind === 'allergies' ? 4000 : 8000}
                        placeholder={PLACEHOLDERS[kind]}
                        aria-label={kind === 'allergies' ? 'Allergies' : 'Antécédents'}
                        className={`${inputCls} resize-y text-[12.5px]`}
                        autoFocus
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        {kind === 'allergies'
                          ? 'Une allergie par ligne. Précisez la réaction si connue.'
                          : 'Saisie libre ou structurée par catégories.'}
                      </p>
                    </div>
                  )}

                  {/* Medications list & add input */}
                  {kind === 'medications' && (
                    <div className="space-y-2">
                      {meds.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-slate-500">Traitements enregistrés :</p>
                          <ul className="space-y-1 rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-[12.5px]">
                            {meds.map((m) => (
                              <li key={m.id} className="text-slate-800">
                                <span className="font-semibold text-slate-900">{m.medication_name}</span>
                                {m.posology ? <span className="text-slate-500 text-[11.5px]"> · {m.posology}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="space-y-1.5 pt-1">
                        <input
                          value={medName}
                          onChange={(e) => setMedName(e.target.value)}
                          placeholder="Nom du médicament (ex: Doliprane 1000mg)"
                          aria-label="Nom du médicament"
                          className={inputCls}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addMedication()
                            }
                          }}
                          autoFocus
                        />
                        <input
                          value={medPosology}
                          onChange={(e) => setMedPosology(e.target.value)}
                          placeholder="Posologie (ex: 1 cp matin et soir si besoin)"
                          aria-label="Posologie"
                          className={inputCls}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addMedication()
                            }
                          }}
                        />
                        <Button
                          variant="secondary"
                          size="xs"
                          disabled={!medName.trim() || state === 'saving' || !cabinetId}
                          onClick={addMedication}
                          className="w-full justify-center"
                        >
                          <Plus className="h-3.5 w-3.5" /> Ajouter à la liste
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {noneBlocked && (
                <p className="text-[11.5px] text-amber-700 bg-amber-50 rounded-md p-2 border border-amber-200">
                  Des traitements actifs sont enregistrés au dossier : ils restent affichés.
                </p>
              )}

              {error && (
                <p role="alert" className="text-[12px] font-medium text-red-600 bg-red-50 p-2 rounded-md border border-red-200">
                  {error}
                </p>
              )}

              {/* Action Buttons Footer */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => handleToggleOpen(false)}
                  disabled={state === 'saving'}
                >
                  {kind === 'medications' && choice === 'listed' ? 'Fermer' : 'Annuler'}
                </Button>

                {!(kind === 'medications' && choice === 'listed') && (
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={save}
                    disabled={!canSave}
                  >
                    {state === 'saving' ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
                      </>
                    ) : (
                      'Enregistrer'
                    )}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
