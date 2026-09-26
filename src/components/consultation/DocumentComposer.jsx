import { useEffect, useState } from 'react'
import { Check, FileText, Loader2, Printer, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import {
  CERTIFICAT_KINDS, DOCUMENT_TYPES, SORTIES, arretFin, buildExamRequestBody, clinicToday, defaultDraft, examCategory, fmtLongDate,
  generateDocumentBody, improveDocumentWithAI, normalizeDocumentDraft, patientFullName,
} from '../../lib/medicalDocuments'
import { printMedicalDocument } from '../Patient/MedicalDocumentPrint'
import { buildLetterhead } from '../../lib/letterhead'
import Button from '../common/Button'
import Chip from '../common/Chip'
import IconButton from '../common/IconButton'

const inputCls = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300'
const JOURS_PRESETS = [1, 2, 3, 5, 7, 15]
const CONFRERES = ['Cardiologue', 'Pneumologue', 'Gastro-entérologue', 'Dermatologue', 'ORL', 'Rhumatologue', 'Endocrinologue', 'Neurologue']

// Letterhead of the printed documents: the doctor running the consultation + the cabinet.
export function useDocumentHeader() {
  const { profile, user, cabinet } = useAppContext()
  return { ...buildLetterhead({ doctor: profile, user, cabinet }), signe: true }
}

// The lab / radiology request for `exams` ({ label, category? }), on the letterhead.
export function printExamRequest({ header, patient, exams, renseignements, date }) {
  const withCategory = exams.map((e) => ({ ...e, category: e.category || examCategory(e.label) }))
  printMedicalDocument({
    ...header,
    title: "Demande d'examens",
    body: buildExamRequestBody({ patient, exams: withCategory, renseignements }),
    date: fmtLongDate(date || clinicToday()),
  })
}

export function printDocument(type, draft, header) {
  const d = normalizeDocumentDraft(draft)
  printMedicalDocument({ ...header, title: type, body: d.body, date: fmtLongDate(d.date || clinicToday()) })
}

const Label = ({ children, htmlFor }) => <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-semibold text-slate-700">{children}</label>

// Writes the consultation's documents: prefilled from the note, adjustable, optionally rewritten
// by the AI, then saved into the note (documents + documentDrafts) and/or printed.
export default function DocumentComposer({ initialType, note, patient, onSave, onRemove, onClose }) {
  const header = useDocumentHeader()
  const [type, setType] = useState(initialType || DOCUMENT_TYPES[0].id)
  const [draft, setDraft] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState(null)
  const saved = note.documents.includes(type)

  const build = (t, d) => ({ ...d, body: generateDocumentBody(t, { note, patient, doctorName: header.medecin, draft: d }), edited: false })

  // Opening a type: its saved draft if there is one, else a fresh one generated from the note.
  useEffect(() => {
    const existing = note.documentDrafts?.[type]
    setDraft(existing?.body ? normalizeDocumentDraft(existing) : build(type, defaultDraft(type, note)))
    setAiError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !aiBusy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, aiBusy])

  if (!draft) return null

  // A parameter change regenerates the text, unless the doctor already rewrote it by hand.
  const setParam = (key, value) => setDraft((d) => {
    const next = { ...d, [key]: value }
    return d.edited ? next : build(type, next)
  })
  const regenerate = () => { setDraft((d) => build(type, d)); setAiError(null) }
  const improve = async () => {
    setAiBusy(true); setAiError(null)
    try {
      const body = await improveDocumentWithAI(type, draft.body, patient)
      if (body) setDraft((d) => ({ ...d, body, edited: true }))
    } catch (e) {
      console.warn('AI document rewrite failed:', e)
      setAiError('La rédaction IA est indisponible pour le moment. Le texte généré reste utilisable.')
    } finally {
      setAiBusy(false)
    }
  }
  const save = () => onSave(type, normalizeDocumentDraft(draft))
  const saveAndPrint = () => { save(); printDocument(type, draft, header) }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Générer un document">
      <div className="absolute inset-0 bg-black/40" onClick={aiBusy ? undefined : onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[17px] font-bold text-slate-900">Générer un document</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Pré-rempli à partir de la consultation de {patientFullName(patient)}. Relisez avant d'imprimer.</p>
          </div>
          <IconButton label="Fermer" onClick={onClose} disabled={aiBusy}><X className="h-4 w-4" /></IconButton>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3" role="tablist">
          {DOCUMENT_TYPES.map((t) => (
            <Chip key={t.id} role="tab" size="md" selected={type === t.id} disabled={aiBusy} onClick={() => setType(t.id)}>
              {note.documents.includes(t.id) && <Check className="h-3 w-3" />}{t.id}
            </Chip>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-[12.5px] text-slate-500">{DOCUMENT_TYPES.find((t) => t.id === type)?.desc}</p>

          {type === 'Certificat médical' && (
            <div>
              <Label>Type de certificat</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type de certificat">
                {CERTIFICAT_KINDS.map(([k, label]) => <Chip key={k} role="radio" size="md" selected={draft.kind === k} onClick={() => setParam('kind', k)}>{label}</Chip>)}
              </div>
            </div>
          )}

          {(type === 'Arrêt de travail' || (type === 'Certificat médical' && draft.kind === 'scolaire')) && (
            <div className="grid gap-3 sm:grid-cols-[160px_180px_1fr]">
              <div>
                <Label htmlFor="doc-jours">Durée (jours)</Label>
                <input id="doc-jours" type="number" min={1} max={365} value={draft.jours} className={inputCls}
                  onChange={(e) => setParam('jours', Math.min(365, Math.max(1, Number(e.target.value) || 1)))} />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {JOURS_PRESETS.map((n) => <Chip key={n} selected={draft.jours === n} onClick={() => setParam('jours', n)}>{n} j</Chip>)}
                </div>
              </div>
              {type === 'Arrêt de travail' && (
                <>
                  <div>
                    <Label htmlFor="doc-debut">À partir du</Label>
                    <input id="doc-debut" type="date" value={draft.debut} className={inputCls} onChange={(e) => setParam('debut', e.target.value)} />
                    <p className="mt-1.5 text-[12px] text-slate-500">Jusqu'au <b className="text-slate-700">{fmtLongDate(arretFin(draft))}</b> inclus</p>
                  </div>
                  <div>
                    <Label>Sorties</Label>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sorties">
                      {SORTIES.map(([k, label]) => <Chip key={k} role="radio" size="md" selected={draft.sorties === k} onClick={() => setParam('sorties', k)}>{label}</Chip>)}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {type === 'Courrier au confrère' && (
            <div>
              <Label htmlFor="doc-dest">Destinataire</Label>
              <input id="doc-dest" className={inputCls} value={draft.destinataire} placeholder="Ex. Dr Alaoui, cardiologue — ou laisser vide"
                onChange={(e) => setParam('destinataire', e.target.value)} />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {CONFRERES.map((s) => (
                  <Chip key={s} selected={draft.destinataire === s} onClick={() => setParam('destinataire', draft.destinataire === s ? '' : s)}>{s}</Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="doc-body">Texte du document</Label>
              <div className="flex items-center gap-1">
                {draft.edited && (
                  <Button variant="ghost" size="sm" onClick={regenerate} disabled={aiBusy} title="Remplace le texte par celui généré depuis la consultation">
                    <RotateCcw className="h-3.5 w-3.5" /> Régénérer
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={improve} disabled={aiBusy || !draft.body.trim()}
                  className="!text-violet-700 hover:!bg-violet-50" title="Reformule le texte sans changer les faits. L'identité du patient n'est pas transmise.">
                  {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Améliorer avec l'IA
                </Button>
              </div>
            </div>
            <textarea id="doc-body" rows={14} value={draft.body} disabled={aiBusy}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value, edited: true }))}
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-[inherit] text-[13.5px] leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50" />
            {aiError && <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-red-600">{aiError}</p>}
            <p className="mt-1 text-[11.5px] text-slate-400">En-tête du cabinet, date et signature sont ajoutés à l'impression.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <div>
            {saved && (
              <Button variant="ghost" size="sm" className="!text-red-600 hover:!bg-red-50" disabled={aiBusy} onClick={() => onRemove(type)}>
                <Trash2 className="h-3.5 w-3.5" /> Retirer ce document
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={saveAndPrint} disabled={aiBusy || !draft.body.trim()}><Printer className="h-4 w-4" /> Enregistrer et imprimer</Button>
            <Button variant="primary" onClick={save} disabled={aiBusy || !draft.body.trim()}><FileText className="h-4 w-4" /> {saved ? 'Mettre à jour' : 'Ajouter au dossier'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
