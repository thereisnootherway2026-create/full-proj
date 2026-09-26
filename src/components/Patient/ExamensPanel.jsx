import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CheckCircle2, Eye, FileUp, FlaskConical, Loader2, Paperclip, Plus, Printer, ScanLine, Activity, X } from 'lucide-react'
import Button from '../common/Button'
import IconButton from '../common/IconButton'
import Chip from '../common/Chip'
import { useAppContext } from '../../context/AppContext'
import {
  EXAM_CATEGORY, EXAM_FILE_ACCEPT, attachExamResult, cancelExam, createExams, groupExams, isMissingTable,
  listPatientExams, openExamResult, reviewExam, validateExamFile,
} from '../../lib/examService'
import { printExamRequest, useDocumentHeader } from '../consultation/DocumentComposer'

const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const inputCls = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300'

const STATUS_PILL = {
  demande: 'bg-slate-100 text-slate-600',
  resultat: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  revu: 'bg-emerald-50 text-emerald-700',
  annule: 'bg-slate-50 text-slate-400 line-through',
}
const STATUS_TEXT = { demande: 'En attente', resultat: 'À revoir', revu: 'Revu', annule: 'Annulé' }
const CATEGORY_ICON = { biologie: FlaskConical, imagerie: ScanLine, autre: Activity }
const FILTERS = [['all', 'Tous'], ['demande', 'En attente'], ['resultat', 'À revoir'], ['revu', 'Revus']]

// Attach a result: a file (PDF / photo of the report) and/or a short comment.
function ResultDialog({ exam, onClose, onSaved }) {
  const [file, setFile] = useState(null)
  const [comment, setComment] = useState(exam.result_comment || '')
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const save = useMutation({
    mutationFn: () => attachExamResult(exam, { file, comment }),
    onSuccess: (row) => onSaved(row),
    onError: (e) => setError(e.message),
  })
  const pick = (f) => {
    if (!f) return
    const problem = validateExamFile(f)
    setError(problem)
    setFile(problem ? null : f)
  }
  const canSave = (file || comment.trim()) && !save.isPending

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ajouter le résultat">
      <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={save.isPending ? undefined : onClose} />
      <motion.div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-slate-900">Résultat</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{exam.label}</p>
          </div>
          <IconButton label="Fermer" onClick={onClose} disabled={save.isPending}><X className="h-4 w-4" /></IconButton>
        </div>
        <div className="space-y-4 px-5 py-4">
          <button type="button" onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]) }}
            className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
            {file ? <Paperclip className="h-5 w-5 text-emerald-600" /> : <FileUp className="h-5 w-5 text-slate-400" />}
            <span className="max-w-full truncate text-[13px] font-medium text-slate-700">{file ? file.name : 'Déposer ou choisir le compte rendu'}</span>
            <span className="text-[11.5px] text-slate-400">{file ? `${(file.size / 1024 / 1024).toFixed(1)} Mo` : 'PDF, JPG, PNG · 10 Mo max'}</span>
          </button>
          <input ref={inputRef} type="file" accept={EXAM_FILE_ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          {exam.result_file_name && !file && <p className="text-[12px] text-slate-500">Fichier actuel : {exam.result_file_name} (conservé si vous n'en choisissez pas d'autre)</p>}
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Commentaire <span className="font-normal text-slate-400">(facultatif)</span></span>
            <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex. CRP 12 mg/L, NFS normale…"
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </label>
          {error && <p role="alert" className="text-[12.5px] font-medium text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Annuler</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function ExamRow({ exam, canManage, onAttach, onView, onReview, onCancel, busy }) {
  const Icon = CATEGORY_ICON[exam.category] || FlaskConical
  const done = exam.status === 'revu'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${exam.status === 'resultat' ? 'bg-amber-50 text-amber-600' : done ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] font-medium ${exam.status === 'annule' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{exam.label}</p>
        <p className="mt-0.5 truncate text-[12px] text-slate-500">
          {EXAM_CATEGORY[exam.category]}
          {exam.result_at && <> · résultat du {fmtDay(exam.result_at)}</>}
          {exam.result_comment && <> · <span className="text-slate-600">{exam.result_comment}</span></>}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${STATUS_PILL[exam.status]}`}>{STATUS_TEXT[exam.status]}</span>
      <div className="flex shrink-0 items-center gap-1">
        {exam.result_file_path && <Button size="xs" variant="ghost" onClick={() => onView(exam)}><Eye className="h-3.5 w-3.5" /> Voir</Button>}
        {exam.status === 'demande' && <Button size="xs" variant="ghost" className="!text-blue-600 hover:!bg-blue-50" onClick={() => onAttach(exam)}><FileUp className="h-3.5 w-3.5" /> Résultat</Button>}
        {exam.status === 'resultat' && canManage && (
          <Button size="xs" variant="success" disabled={busy} onClick={() => onReview(exam)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Marquer revu
          </Button>
        )}
        {(exam.status === 'resultat' || exam.status === 'revu') && <IconButton size="sm" label="Remplacer le résultat" onClick={() => onAttach(exam)}><FileUp className="h-3.5 w-3.5" /></IconButton>}
        {exam.status === 'demande' && canManage && <IconButton size="sm" label={`Annuler ${exam.label}`} className="hover:!text-red-600" disabled={busy} onClick={() => onCancel(exam)}><X className="h-3.5 w-3.5" /></IconButton>}
      </div>
    </li>
  )
}

// Examens tab: every exam prescribed to the patient, its state, and its result.
// `fallback` (exams read from the consultation notes) is shown read-only until the
// exam_orders migration is applied. `motifs`: encounterId -> motif, for the printed request.
export default function ExamensPanel({ patient, patientId, fallback = [], motifs = {}, extra }) {
  const { canonicalRole, notify } = useAppContext()
  const canManage = canonicalRole === 'doctor' || canonicalRole === 'admin'
  const header = useDocumentHeader()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [attaching, setAttaching] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  const q = useQuery({ queryKey: ['patient-exams', patientId], queryFn: () => listPatientExams(patientId), enabled: Boolean(patientId), retry: (n, e) => !isMissingTable(e) && n < 2 })
  const legacy = q.isError && isMissingTable(q.error)
  const exams = q.data || []
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['patient-exams', patientId] })
    queryClient.invalidateQueries({ queryKey: ['exams-to-review'] })
  }

  const counts = useMemo(() => ({
    demande: exams.filter((e) => e.status === 'demande').length,
    resultat: exams.filter((e) => e.status === 'resultat').length,
    revu: exams.filter((e) => e.status === 'revu').length,
  }), [exams])
  const groups = useMemo(() => groupExams(filter === 'all' ? exams : exams.filter((e) => e.status === filter)), [exams, filter])

  const run = async (exam, fn, success) => {
    setBusyId(exam.id)
    try { await fn(); notify({ title: success, tone: 'success' }); refresh() } catch (e) { notify({ title: 'Action impossible', description: e.message, tone: 'error' }) } finally { setBusyId(null) }
  }
  const view = (exam) => openExamResult(exam).catch((e) => notify({ title: 'Résultat indisponible', description: e.message, tone: 'error' }))
  const review = (exam) => run(exam, () => reviewExam(exam.id), 'Résultat marqué comme revu')
  const cancel = (exam) => { if (window.confirm(`Annuler l'examen « ${exam.label} » ?`)) run(exam, () => cancelExam(exam.id), 'Examen annulé') }
  const add = async () => {
    const labels = newLabel.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean)
    if (!labels.length) return
    try { await createExams(patientId, labels); setNewLabel(''); setAdding(false); notify({ title: labels.length > 1 ? 'Examens ajoutés' : 'Examen ajouté', tone: 'success' }); refresh() } catch (e) { notify({ title: 'Ajout impossible', description: e.message, tone: 'error' }) }
  }
  const printGroup = (g) => printExamRequest({
    header, patient,
    exams: g.exams.filter((e) => e.status !== 'annule'),
    renseignements: g.encounterId ? motifs[g.encounterId] || '' : '',
    date: String(g.date).slice(0, 10),
  })

  const subtitle = legacy || q.isLoading ? 'Examens complémentaires prescrits en consultation'
    : exams.length === 0 ? 'Aucun examen prescrit'
      : [counts.demande && `${counts.demande} en attente`, counts.resultat && `${counts.resultat} à revoir`, counts.revu && `${counts.revu} revu${counts.revu > 1 ? 's' : ''}`].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-slate-900">Examens</h2>
          <p className={`mt-0.5 text-[13px] ${counts.resultat ? 'font-medium text-amber-700' : 'text-slate-500'}`}>{subtitle}</p>
        </div>
        {canManage && !legacy && !adding && <Button variant="ghost" size="sm" className="!text-blue-600 hover:!bg-blue-50" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Ajouter un examen</Button>}
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <input autoFocus className={inputCls} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex. NFS ; CRP ; Radiographie thoracique (séparés par ;)"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } if (e.key === 'Escape') setAdding(false) }} />
              <Button variant="primary" size="sm" className="h-10" onClick={add} disabled={!newLabel.trim()}>Ajouter</Button>
              <IconButton size="lg" label="Annuler" onClick={() => { setAdding(false); setNewLabel('') }}><X className="h-4 w-4" /></IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!legacy && exams.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer les examens">
          {FILTERS.map(([key, label]) => {
            const n = key === 'all' ? exams.length : counts[key]
            return <Chip key={key} role="tab" size="md" selected={filter === key} onClick={() => setFilter(key)}>{label}{n ? <span className="opacity-70"> {n}</span> : null}</Chip>
          })}
        </div>
      )}

      {q.isLoading ? (
        <p className="py-8 text-center text-[13px] text-slate-400">Chargement…</p>
      ) : legacy ? (
        <LegacyList groups={fallback} />
      ) : q.isError ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-[13px] text-slate-500">Examens indisponibles. Réessayez dans un instant.</p>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <FlaskConical className="mb-2 h-6 w-6 text-slate-300" />
          <p className="text-[13.5px] font-semibold text-slate-700">{filter === 'all' ? 'Aucun examen' : 'Rien ici'}</p>
          <p className="mt-0.5 text-[12.5px] text-slate-500">{filter === 'all' ? 'Les examens prescrits en consultation apparaîtront ici.' : 'Aucun examen avec ce statut.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.key} className="rounded-2xl border border-slate-200/80 bg-white px-4">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                <p className="min-w-0 truncate text-[13px] text-slate-500">
                  <span className="font-semibold text-slate-800">{fmtDay(g.date)}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {g.encounterId ? (motifs[g.encounterId] || 'Consultation') : 'Ajouté au dossier'}
                </p>
                {g.exams.some((e) => e.status !== 'annule') && (
                  <Button size="xs" variant="ghost" className="shrink-0 !text-slate-500" onClick={() => printGroup(g)}><Printer className="h-3.5 w-3.5" /> Demande</Button>
                )}
              </header>
              <ul className="divide-y divide-slate-100">
                {g.exams.map((e) => (
                  <ExamRow key={e.id} exam={e} canManage={canManage} busy={busyId === e.id}
                    onAttach={setAttaching} onView={view} onReview={review} onCancel={cancel} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {extra}

      <AnimatePresence>
        {attaching && (
          <ResultDialog exam={attaching} onClose={() => setAttaching(null)}
            onSaved={() => { setAttaching(null); notify({ title: 'Résultat enregistré', description: canManage ? 'Pensez à le marquer comme revu.' : 'Le médecin sera prévenu.', tone: 'success' }); refresh() }} />
        )}
      </AnimatePresence>
    </div>
  )
}

// Before the migration: the exams read from consultation notes, read-only.
function LegacyList({ groups }) {
  if (!groups.length) return <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-[13px] text-slate-500">Les examens prescrits en consultation apparaîtront ici.</p>
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.id} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
          <p className="text-[13px] text-slate-500"><span className="font-semibold text-slate-800">{fmtDay(g.date)}</span>{g.motif && <><span className="mx-1.5 text-slate-300">·</span>{g.motif}</>}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">{g.items.map((x, i) => <li key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12.5px] text-slate-700">{x}</li>)}</ul>
        </section>
      ))}
      <p className="text-[12px] text-slate-400">Suivi des résultats disponible après la mise à jour de la base de données.</p>
    </div>
  )
}
