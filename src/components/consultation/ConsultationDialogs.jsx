import { Check, Loader2, Printer } from 'lucide-react'
import Button from '../common/Button'
import { printDocument, useDocumentHeader } from './DocumentComposer'

function Overlay({ children, onClose, label }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">{children}</div>
    </div>
  )
}

const Row = ({ label, children }) => (
  <div className="grid grid-cols-[92px_1fr] gap-2 py-2 text-[13.5px]">
    <span className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
    <span className="min-w-0 whitespace-pre-wrap break-words text-slate-800">{children || <span className="text-slate-400">Non renseigné</span>}</span>
  </div>
)

const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

export function FinalizeDialog({ note, blockers, allergyHits, handoffText, submitting, error, onCancel, onConfirm }) {
  const treatments = note.traitements.filter((r) => r.medicament.trim())
  const follow = [note.followUpDate && fmtDay(note.followUpDate), note.followUpNotes.trim()].filter(Boolean).join(' · ')
  return (
    <Overlay onClose={submitting ? undefined : onCancel} label="Terminer la consultation">
      <h2 className="text-[17px] font-bold text-slate-900">Terminer la consultation ?</h2>
      <div className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
        <Row label="Motif">{note.motif.trim()}</Row>
        <Row label="Diagnostic">{note.diagnostics.join(' ; ')}</Row>
        <Row label="Traitement">{treatments.map((r) => [r.medicament, r.posologie, r.duree].filter(Boolean).join(' · ')).join('\n')}</Row>
        <Row label="Suivi">{follow}</Row>
      </div>
      {blockers.length > 0 && <p role="alert" className="mt-3 rounded-lg bg-slate-100 p-3 text-[13px] text-slate-800">À compléter : {blockers.join(', ')}.</p>}
      {allergyHits.length > 0 && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-[13px] font-semibold text-red-700">Ordonnance à vérifier : allergie déclarée ({[...new Set(allergyHits)].join(', ')}).</p>}
      {handoffText && <p className="mt-3 text-[12.5px] text-slate-500">{handoffText}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>Annuler</Button>
        <Button variant="success" onClick={onConfirm} disabled={blockers.length > 0 || submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Confirmer et terminer
        </Button>
      </div>
    </Overlay>
  )
}

export function DiscardDialog({ busy, error, onCancel, onConfirm }) {
  return (
    <Overlay onClose={busy ? undefined : onCancel} label="Abandonner la consultation">
      <h2 className="text-[17px] font-bold text-slate-900">Abandonner cette consultation ?</h2>
      <p className="mt-2 text-[13.5px] text-slate-600">Le brouillon en cours (motif, examen, diagnostic, traitement…) sera supprimé. Cette action est définitive. Pour simplement quitter et reprendre plus tard, utilisez « Retour au dossier ».</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Continuer la consultation</Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Abandonner
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
  const header = useDocumentHeader()
  const treatments = note.traitements.filter((r) => r.medicament.trim())
  const follow = [note.followUpDate && fmtDay(note.followUpDate), note.followUpNotes.trim()].filter(Boolean).join(' · ')
  const items = [
    ['Diagnostic', note.diagnostics.join(' ; ')],
    ['Traitement', treatments.map((r) => [r.medicament, r.posologie, r.duree].filter(Boolean).join(' · ')).join('\n')],
    ['Ordonnance', note.ordonnance && treatments.length ? `${treatments.length} médicament(s)` : ''],
    ['Examens', note.examens.join(' · ')],
    ['Suivi', follow],
  ]
  const printable = note.documents.filter((d) => note.documentDrafts?.[d]?.body?.trim())
  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white"><Check className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">Consultation terminée</h1>
          <p className="text-[13px] text-slate-500">{patientName}</p>
        </div>
      </div>
      <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
        {items.map(([label, text]) => <Row key={label} label={label}>{text || <span className="text-slate-300">—</span>}</Row>)}
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
        <Button variant="success" onClick={onContinue}>
          {result?.handoff === 'none' ? 'Retour au dossier' : 'Retour au tableau de bord'}
        </Button>
      </div>
    </div>
  )
}
