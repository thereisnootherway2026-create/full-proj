import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Check, Eye, Loader2, Printer } from 'lucide-react'
import Button from '../common/Button'
import { printDocument, useDocumentHeader } from './DocumentComposer'
import { finalizeConfirmLabel } from '../../lib/consultationProgress'
import OrdonnancePreviewModal from './OrdonnancePreviewModal'

function Overlay({ children, onClose, label, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} rounded-2xl bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] flex flex-col`}>
        {children}
      </div>
    </div>
  )
}

function calcIMC(weight, height) {
  const w = parseFloat(String(weight || '').replace(',', '.'))
  const h = parseFloat(String(height || '').replace(',', '.'))
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return null
  const m = h / 100
  return (w / (m * m)).toFixed(1).replace('.', ',')
}

const Row = ({ label, children }) => (
  <div className="grid grid-cols-[92px_1fr] gap-2 py-2 text-[13.5px]">
    <span className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
    <span className="min-w-0 whitespace-pre-wrap break-words text-slate-800">{children || <span className="text-slate-400">Non renseigné</span>}</span>
  </div>
)

// Follow-up line of the recaps, with the secretariat reminder when one will be (or was) created.
const followUpSummary = (note) => [
  note.followUpDate && fmtDay(note.followUpDate),
  note.followUpNotes?.trim(),
  note.followUpDate && note.followUpReminder && (note.followUpKind === 'renouvellement' ? "rappel secrétariat : renouveler l'ordonnance" : 'rappel secrétariat : planifier le contrôle'),
].filter(Boolean).join(' · ')

const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

// 3-column modal summary recap (one column per section)
export function FinalizeDialog({ note, blockers = [], allergyHits = [], warnings = [], handoffText, submitting, error, onCancel, onConfirm }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const needsAck = warnings.length > 0
  const treatments = (note.traitements || []).filter((r) => r.medicament?.trim())
  const v = note.vitals || {}
  const imcVal = calcIMC(v.weight, v.height)

  const filledVitals = [
    (v.bloodPressureSystolic || v.bloodPressureDiastolic) && { label: 'TA', val: `${v.bloodPressureSystolic || '—'}/${v.bloodPressureDiastolic || '—'} mmHg` },
    v.heartRate && { label: 'FC', val: `${v.heartRate} bpm` },
    v.temperature && { label: 'T°', val: `${v.temperature} °C` },
    v.oxygenSaturation && { label: 'SpO₂', val: `${v.oxygenSaturation} %` },
    v.respiratoryRate && { label: 'FR', val: `${v.respiratoryRate} /min` },
    v.weight && { label: 'Poids', val: `${v.weight} kg` },
    v.height && { label: 'Taille', val: `${v.height} cm` },
    imcVal && { label: 'IMC', val: `${imcVal} kg/m²` },
    v.bloodSugar && { label: 'Glycémie', val: `${v.bloodSugar} g/L` },
    (v.painScore !== undefined && v.painScore !== '' && v.painScore !== null) && { label: 'Douleur', val: `${v.painScore}/10` },
  ].filter(Boolean)

  const col1Empty = !note.motif?.trim() && !note.depuis && !note.evolution && !note.histoire?.trim()
  const col2Empty = filledVitals.length === 0 && !note.examen?.trim()
  const hasDiags = (note.diagnostics || []).filter(Boolean).length > 0
  const hasConduite = Boolean(note.conduite?.trim())
  const hasTreatments = treatments.length > 0
  const hasExamens = (note.examens || []).filter(Boolean).length > 0
  const hasDocs = (note.documents || []).filter(Boolean).length > 0
  const hasFollowUp = Boolean(note.followUpDate || note.followUpNotes?.trim())
  const col3Empty = !hasDiags && !hasConduite && !hasTreatments && !hasExamens && !hasDocs && !hasFollowUp

  return (
    <Overlay onClose={submitting ? undefined : onCancel} label="Finaliser la visite" maxWidth="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
        <div>
          <h2 className="text-[17px] font-bold text-slate-900">Récapitulatif de la consultation</h2>
          <p className="text-[12.5px] text-slate-500">Vérifiez les données avant la clôture définitive de la consultation.</p>
        </div>
      </div>

      {/* 3 Columns Content */}
      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-[13px]">
          {/* ── COL 1: MOTIF & SYMPTÔMES ── */}
          <div className="rounded-lg border border-[#E5E7EB] bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[11px]">1</span>
              <h3 className="font-bold text-slate-800 text-[13.5px]">Motif & symptômes</h3>
            </div>

            {col1Empty ? (
              <div className="flex h-28 items-center justify-center text-slate-400 text-lg font-medium select-none">—</div>
            ) : (
              <>
                {note.motif?.trim() && (
                  <div>
                    <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Motif principal</span>
                    <p className="font-semibold text-slate-900 leading-snug">{note.motif.trim()}</p>
                  </div>
                )}

                {(note.depuis || note.evolution) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {note.depuis && (
                      <span className="inline-flex rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Depuis {note.depuis.toLowerCase()}
                      </span>
                    )}
                    {note.evolution && (
                      <span className="inline-flex rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {note.evolution}
                      </span>
                    )}
                  </div>
                )}

                {note.histoire?.trim() && (
                  <div className={note.motif?.trim() || note.depuis || note.evolution ? "pt-2 border-t border-slate-200/70" : ""}>
                    <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Histoire actuelle</span>
                    <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                      {note.histoire.trim()}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── COL 2: EXAMEN CLINIQUE ── */}
          <div className="rounded-lg border border-[#E5E7EB] bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[11px]">2</span>
              <h3 className="font-bold text-slate-800 text-[13.5px]">Examen clinique</h3>
            </div>

            {col2Empty ? (
              <div className="flex h-28 items-center justify-center text-slate-400 text-lg font-medium select-none">—</div>
            ) : (
              <>
                {filledVitals.length > 0 && (
                  <div>
                    <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Constantes d'aujourd'hui</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {filledVitals.map((item) => (
                        <div key={item.label} className="rounded-md bg-white border border-slate-200 px-2 py-1 text-[11.5px]">
                          <span className="text-slate-400 font-semibold">{item.label}&nbsp;: </span>
                          <span className="font-bold text-slate-800">{item.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {note.examen?.trim() && (
                  <div className={filledVitals.length > 0 ? "pt-2 border-t border-slate-200/70" : ""}>
                    <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Observations notées</span>
                    <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                      {note.examen.trim()}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── COL 3: ÉVALUATION & CONDUITE ── */}
          <div className="rounded-lg border border-[#E5E7EB] bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[11px]">3</span>
              <h3 className="font-bold text-slate-800 text-[13.5px]">Évaluation & conduite</h3>
            </div>

            {col3Empty ? (
              <div className="flex h-28 items-center justify-center text-slate-400 text-lg font-medium select-none">—</div>
            ) : (
              <>
                {/* Diagnostics */}
                {hasDiags && (
                  <div>
                    <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Diagnostic(s)</span>
                    <div className="flex flex-wrap gap-1">
                      {note.diagnostics.map((d) => (
                        <span key={d} className="rounded-md bg-blue-50 border border-blue-200/70 px-2 py-0.5 text-[11.5px] font-semibold text-blue-900">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conduite */}
                {hasConduite && (
                  <div className={hasDiags ? "pt-2 border-t border-slate-200/70" : ""}>
                    <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Conduite à tenir</span>
                    <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {note.conduite.trim()}
                    </p>
                  </div>
                )}

                {/* Traitements & Ordonnance */}
                {hasTreatments && (
                  <div className={(hasDiags || hasConduite) ? "pt-2 border-t border-slate-200/70" : ""}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Prescriptions</span>
                      {note.ordonnance && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          <Check className="h-3 w-3 stroke-[3]" /> Ordonnance
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1 text-[12px] text-slate-800">
                      {treatments.map((t, idx) => (
                        <li key={idx} className="rounded bg-white border border-slate-200 p-1.5 leading-tight">
                          <span className="font-bold text-slate-900">{t.medicament}</span>
                          {(t.posologie || t.duree) && (
                            <span className="text-slate-500 block text-[11px] mt-0.5">
                              {[t.posologie, t.duree].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Examens & Documents */}
                {(hasExamens || hasDocs) && (
                  <div className={(hasDiags || hasConduite || hasTreatments) ? "pt-2 border-t border-slate-200/70 space-y-1.5 text-[11.5px]" : "space-y-1.5 text-[11.5px]"}>
                    {hasExamens && (
                      <div>
                        <span className="text-slate-400 font-semibold">Examens&nbsp;: </span>
                        <span className="text-slate-700 font-medium">{note.examens.join(', ')}</span>
                      </div>
                    )}
                    {hasDocs && (
                      <div>
                        <span className="text-slate-400 font-semibold">Documents&nbsp;: </span>
                        <span className="text-slate-700 font-medium">{note.documents.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Suivi */}
                {hasFollowUp && (
                  <div className={(hasDiags || hasConduite || hasTreatments || hasExamens || hasDocs) ? "pt-2 border-t border-slate-200/70 text-[11.5px]" : "text-[11.5px]"}>
                    <span className="text-slate-400 font-semibold">Contrôle&nbsp;: </span>
                    <span className="text-slate-800 font-medium">
                      {note.followUpDate ? new Date(`${note.followUpDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                    </span>
                    {note.followUpNotes && <span className="block text-slate-500 mt-0.5 text-[11px]">{note.followUpNotes}</span>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Alerts & Warnings */}
        {blockers.length > 0 && (
          <p role="alert" className="mt-3 rounded-lg bg-slate-100 p-3 text-[13px] text-slate-800">
            À compléter&nbsp;: {blockers.join(', ')}.
          </p>
        )}
        {allergyHits.length > 0 && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-[13px] font-semibold text-red-700 border border-red-200">
            Ordonnance à vérifier&nbsp;: allergie déclarée ({[...new Set(allergyHits)].join(', ')}).
          </p>
        )}
        {needsAck && blockers.length === 0 && (
          <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            {warnings.map((w) => (
              <p key={w.id} className="flex items-start gap-2 text-[13px] font-semibold text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" /> {w.message}
              </p>
            ))}
            <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-amber-900">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={submitting}
                className="h-4 w-4 rounded border-amber-300 accent-amber-600"
              />
              {finalizeConfirmLabel(warnings)}
            </label>
          </div>
        )}
        {handoffText && <p className="mt-3 text-[12px] text-slate-500">{handoffText}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-[13px] text-red-700 border border-red-200">{error}</p>}
      </div>

      {/* Footer buttons: [Revenir modifier] (secondary) & [Confirmer et terminer] (primary, blue) */}
      <div className="mt-4 flex justify-end gap-2.5 pt-3 border-t border-slate-100 flex-shrink-0">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Revenir modifier
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={blockers.length > 0 || submitting || (needsAck && !acknowledged)}
          className="!bg-[#2563EB] hover:!bg-blue-700"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Confirmer et finaliser
        </Button>
      </div>
    </Overlay>
  )
}

export function DiscardDialog({ busy, error, onCancel, onConfirm }) {
  return (
    <Overlay onClose={busy ? undefined : onCancel} label="Quitter sans enregistrer">
      <h2 className="text-[17px] font-bold text-slate-900">Quitter sans enregistrer&nbsp;?</h2>
      <p className="mt-2 text-[13.5px] text-slate-600 leading-relaxed">
        Les modifications seront perdues.
      </p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Rester
        </Button>
        <Button
          variant="danger"
          onClick={onConfirm}
          disabled={busy}
          className="!text-red-600 hover:!text-red-700 !bg-red-50 hover:!bg-red-100 !border-red-200"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Quitter sans enregistrer
        </Button>
      </div>
    </Overlay>
  )
}

const HANDOFF_TEXT = {
  billing: 'Le patient a été envoyé à la caisse (à encaisser).',
  completed: 'Aucun paiement requis : la visite est clôturée.',
  none: 'Consultation enregistrée au dossier du patient.',
}

export function DoneScreen({ note, patientName, result, onContinue }) {
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showOrdoPreview, setShowOrdoPreview] = useState(false)
  const header = useDocumentHeader()
  const treatments = note.traitements.filter((r) => r.medicament.trim())
  const follow = followUpSummary(note)
  const items = [
    ['Diagnostic', note.diagnostics.join(' ; ')],
    ['Traitement', treatments.map((r) => [r.medicament, r.posologie, r.duree].filter(Boolean).join(' · ')).join('\n')],
    ['Examens', note.examens.join(' · ')],
    ['Suivi', follow],
  ]
  const printable = note.documents.filter((d) => note.documentDrafts?.[d]?.body?.trim())

  const handleContinue = () => {
    if (result?.handoff === 'none') {
      onContinue?.()
      return
    }
    setIsTransitioning(true)
    setTimeout(() => {
      onContinue?.()
    }, 450)
  }

  if (isTransitioning) {
    return (
      <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-slate-50/95 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center text-center p-8 max-w-md mx-auto"
        >
          <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-xl shadow-blue-500/25">
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 22, delay: 0.05 }}
            >
              <Check className="h-10 w-10 stroke-[2.5]" />
            </motion.div>
            <div className="absolute inset-0 rounded-2xl animate-ping bg-blue-400 opacity-20 pointer-events-none" />
          </div>

          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="text-2xl font-bold tracking-tight text-slate-900"
          >
            Visite finalisée
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="mt-2 text-sm text-slate-600 font-medium"
          >
            {result?.handoff === 'billing'
              ? (patientName ? <>Patient <span className="capitalize">{patientName}</span> envoyé à la caisse</> : 'Patient envoyé à la caisse')
              : (patientName ? <>Visite de <span className="capitalize">{patientName}</span> clôturée</> : 'Visite clôturée sans reste à payer')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="mt-6 flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200/60 px-4 py-1.5 text-xs font-semibold text-blue-700 shadow-xs"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
            <span>Retour au tableau de bord...</span>
          </motion.div>

          <div className="mt-5 w-48 h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.45, ease: 'easeInOut' }}
            />
          </div>
        </motion.div>
      </div>
    )
  }

  const validatedDate = note.validated_at || result?.encounter?.completed_at || new Date().toISOString()
  const formattedValidatedAt = (() => {
    const d = new Date(validatedDate)
    const day = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return `Validée le ${day} à ${time}`
  })()

  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
          <Check className="h-6 w-6 stroke-[2.5]" />
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 leading-snug">Visite finalisée</h1>
          <p className="text-[13px] text-slate-500 font-medium capitalize">{patientName}</p>
          <span className="inline-flex items-center gap-1.5 mt-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
            <Check className="h-3 w-3 stroke-[3]" />
            <span>{formattedValidatedAt}</span>
          </span>
        </div>
      </div>
      <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
        {items.map(([label, text]) => <Row key={label} label={label}>{text || <span className="text-slate-300">—</span>}</Row>)}
        {note.ordonnance && treatments.length > 0 && (
          <Row label="Ordonnance">
            <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
              <span className="text-[13px] font-semibold text-slate-800">
                Ordonnance disponible ({treatments.length} médicament{treatments.length > 1 ? 's' : ''})
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOrdoPreview(true)}
                  className="!text-blue-600 hover:!bg-blue-50 !px-2.5 !py-1 text-[12px]"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Voir
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowOrdoPreview(true)
                    setTimeout(() => window.print(), 250)
                  }}
                  className="!text-slate-700 !px-2.5 !py-1 text-[12px]"
                >
                  <Printer className="h-3.5 w-3.5 mr-1" />
                  Réimprimer
                </Button>
              </div>
            </div>
          </Row>
        )}
        <Row label="Documents">
          {note.documents.length === 0 ? <span className="text-slate-300">—</span> : (
            <span className="flex flex-wrap gap-1.5">
              {note.documents.map((d) => (printable.includes(d)
                ? <Button key={d} variant="secondary" size="sm" onClick={() => printDocument(d, note.documentDrafts[d], header)}><Printer className="h-3.5 w-3.5" /> {d}</Button>
                : <span key={d} className="text-slate-800">{d}</span>))}
            </span>
          )}
        </Row>
      </div>
      <p className="mt-4 text-[13px] font-medium text-slate-600" role="status">{HANDOFF_TEXT[result?.handoff] || HANDOFF_TEXT.none}</p>
      <div className="mt-6 flex justify-end">
        <Button
          variant="primary"
          onClick={handleContinue}
          disabled={isTransitioning}
        >
          {isTransitioning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Redirection...</span>
            </>
          ) : (
            result?.handoff === 'none' ? 'Retour au dossier' : 'Retour au tableau'
          )}
        </Button>
      </div>

      {showOrdoPreview && (
        <OrdonnancePreviewModal
          isOpen={showOrdoPreview}
          onClose={() => setShowOrdoPreview(false)}
          note={note}
          patientName={patientName}
          encounterId={result?.encounter?.id || ''}
          header={header}
        />
      )}
    </div>
  )
}
