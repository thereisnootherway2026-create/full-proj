import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Camera, Check, ImageUp, Lock, RotateCcw, ScanLine, X } from 'lucide-react'
import Button from '../common/Button'
import IconButton from '../common/IconButton'
import { scanIdentity } from '../../lib/idScan/identityScan'
import { cn } from '../../lib/utils'

// Identity scan (CIN / passport), read on this device: the photo is analysed in the browser, never
// uploaded or stored, and nothing reaches the form until the user has reviewed it here.
// onApply receives only the fields the user kept, keyed like the patient form ({ prenom, nom, cin,
// date_naissance, sexe, adresse }).

const DOC_LABEL = { cin: "Carte nationale d'identité", passeport: 'Passeport', inconnu: 'Document' }

const FIELDS = [
  { key: 'prenom', formKey: 'prenom', label: 'Prénom', kind: 'text' },
  { key: 'nom', formKey: 'nom', label: 'Nom', kind: 'text' },
  { key: 'cin', formKey: 'cin', label: 'CIN', kind: 'text', upper: true },
  { key: 'dateNaissance', formKey: 'date_naissance', label: 'Date de naissance', kind: 'date' },
  { key: 'sexe', formKey: 'sexe', label: 'Sexe', kind: 'sex' },
  { key: 'adresse', formKey: 'adresse', label: 'Adresse', kind: 'text' },
]

const CONFIDENCE = {
  high: { label: 'Lu et contrôlé', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: Check },
  medium: { label: 'À vérifier', cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: null },
  low: { label: 'Incertain', cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: AlertTriangle },
}

const inputCls = 'h-[40px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400'

export default function IdentityScanDialog({ onApply, onClose }) {
  const titleId = useId()
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)
  const [phase, setPhase] = useState('choose') // choose | reading | review | error
  const [progress, setProgress] = useState({ stage: '', progress: 0 })
  const [preview, setPreview] = useState('')
  const [result, setResult] = useState(null)
  const [values, setValues] = useState({}) // key -> edited value
  const [kept, setKept] = useState({}) // key -> boolean
  const [error, setError] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && phase !== 'reading') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, phase])

  const reset = () => { setPhase('choose'); setResult(null); setValues({}); setKept({}); setError(''); setPreview('') }

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choisissez une image (photo ou capture du document).'); setPhase('error'); return }
    setPreview(URL.createObjectURL(file))
    setProgress({ stage: 'Préparation de l’image…', progress: 0 })
    setPhase('reading')
    try {
      const scan = await scanIdentity(file, { onProgress: setProgress })
      const found = FIELDS.filter((f) => scan.fields[f.key]?.value)
      if (found.length === 0) {
        setError('Aucune information n’a pu être lue. Posez le document à plat, bien éclairé, sans reflet, et cadrez-le en entier.')
        setPhase('error')
        return
      }
      setResult(scan)
      setValues(Object.fromEntries(found.map((f) => [f.key, scan.fields[f.key].value])))
      setKept(Object.fromEntries(found.map((f) => [f.key, true])))
      setPhase('review')
    } catch (e) {
      setError(e?.message?.includes('fetch') || e?.message?.includes('network')
        ? 'Le moteur de lecture n’a pas pu être chargé. Vérifiez la connexion internet (première utilisation) puis réessayez.'
        : 'La lecture du document a échoué. Réessayez avec une photo plus nette.')
      setPhase('error')
    }
  }

  const apply = () => {
    const out = {}
    FIELDS.forEach((f) => {
      const v = String(values[f.key] ?? '').trim()
      if (kept[f.key] && v) out[f.formKey] = f.upper ? v.toUpperCase() : v
    })
    onApply(out)
  }

  const expired = result?.expiry && new Date(`${result.expiry}T00:00:00`) < new Date()
  const keptCount = FIELDS.filter((f) => kept[f.key] && String(values[f.key] ?? '').trim()).length

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => phase !== 'reading' && onClose()} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[21px] bg-white shadow-[0_12px_48px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600"><ScanLine className="h-[18px] w-[18px]" /></div>
            <div>
              <h2 id={titleId} className="text-base font-semibold text-slate-900">Scanner une pièce d'identité</h2>
              <p className="text-[12px] text-slate-500">CIN ou passeport</p>
            </div>
          </div>
          <IconButton size="md" look="soft" label="Fermer" onClick={onClose} disabled={phase === 'reading'}><X className="h-4 w-4" /></IconButton>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

          <AnimatePresence mode="wait" initial={false}>
            {phase === 'choose' && (
              <motion.div key="choose" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => cameraRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40">
                    <Camera className="h-6 w-6 text-blue-600" />
                    <span className="text-sm font-semibold text-slate-900">Prendre une photo</span>
                    <span className="text-xs text-slate-500">Utilise la caméra de l'appareil</span>
                  </button>
                  <button type="button" onClick={() => uploadRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40">
                    <ImageUp className="h-6 w-6 text-blue-600" />
                    <span className="text-sm font-semibold text-slate-900">Importer une image</span>
                    <span className="text-xs text-slate-500">Photo ou capture existante</span>
                  </button>
                </div>
                <ul className="space-y-1 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <li>• Posez le document à plat, bien éclairé, sans reflet.</li>
                  <li>• Cadrez-le en entier, <strong>zone de lecture en bas incluse</strong> (lignes de « &lt;&lt;&lt; »).</li>
                  <li>• Pour une CIN, la face avec l'état civil (et le verso si possible).</li>
                </ul>
                <p className="flex items-start gap-2 text-xs text-slate-500">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  Le document est analysé sur cet appareil. L'image n'est ni envoyée ni enregistrée.
                </p>
              </motion.div>
            )}

            {phase === 'reading' && (
              <motion.div key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {preview && <img src={preview} alt="Document en cours de lecture" className="max-h-56 w-full rounded-xl border border-slate-200 object-contain bg-slate-50" />}
                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${Math.max(6, Math.round((progress.progress || 0) * 100))}%` }} />
                  </div>
                  <p className="mt-2 text-center text-sm font-medium text-slate-600" aria-live="polite">{progress.stage}</p>
                </div>
              </motion.div>
            )}

            {phase === 'error' && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 py-4 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600"><AlertTriangle className="h-5 w-5" /></div>
                <p className="mx-auto max-w-sm text-sm text-slate-600">{error}</p>
                <Button variant="secondary" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" />Réessayer</Button>
              </motion.div>
            )}

            {phase === 'review' && result && (
              <motion.div key="review" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{DOC_LABEL[result.docType]}</span>
                  {result.hasMrz
                    ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Zone de lecture détectée</span>
                    : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Texte imprimé uniquement</span>}
                </div>
                {expired && (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Ce document semble expiré.
                  </p>
                )}
                <p className="text-xs text-slate-500">Vérifiez chaque information, corrigez-la au besoin, décochez celles à ne pas reprendre.</p>

                <div className="space-y-2.5">
                  {FIELDS.filter((f) => f.key in values).map((f) => {
                    const meta = CONFIDENCE[result.fields[f.key]?.confidence] || CONFIDENCE.medium
                    const MetaIcon = meta.icon
                    const on = kept[f.key]
                    return (
                      <div key={f.key} className={cn('rounded-xl border p-3 transition-colors', on ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60')}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <label className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                            <input type="checkbox" checked={Boolean(on)} onChange={(e) => setKept((k) => ({ ...k, [f.key]: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                            {f.label}
                          </label>
                          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', meta.cls)}>
                            {MetaIcon && <MetaIcon className="h-3 w-3" />}{meta.label}
                          </span>
                        </div>
                        {f.kind === 'sex' ? (
                          <div className="flex gap-2">
                            {[['homme', 'Homme'], ['femme', 'Femme']].map(([v, l]) => (
                              <button key={v} type="button" disabled={!on} onClick={() => setValues((s) => ({ ...s, sexe: v }))}
                                className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50', values.sexe === v ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300')}>
                                {l}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <input className={inputCls} type={f.kind === 'date' ? 'date' : 'text'} disabled={!on} value={values[f.key] ?? ''}
                            onChange={(e) => setValues((s) => ({ ...s, [f.key]: f.upper ? e.target.value.toUpperCase() : e.target.value }))} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 p-5">
          {phase === 'review' ? (
            <>
              <Button variant="secondary" onClick={reset}><RotateCcw className="h-4 w-4" />Rescanner</Button>
              <Button variant="primary" onClick={apply} disabled={keptCount === 0}>Utiliser ces informations{keptCount ? ` (${keptCount})` : ''}</Button>
            </>
          ) : (
            <>
              <span />
              <Button variant="secondary" onClick={onClose} disabled={phase === 'reading'}>Annuler</Button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
