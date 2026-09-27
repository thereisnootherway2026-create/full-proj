import { useMemo, useState } from 'react'
import { AlertTriangle, FileText, FlaskConical, Pill, Plus, Printer, Search, Sparkles, X } from 'lucide-react'
import { DIAGNOSTICS, PLANS } from '../../data/clinicalSuggestions'
import { DUREE_PRESETS, MEDICATIONS, POSOLOGIE_PRESETS } from '../../data/medicationSuggestions'
import { DOCUMENT_OPTIONS } from '../../lib/medicalDocuments'
import DocumentComposer, { printDocument, printExamRequest, useDocumentHeader } from './DocumentComposer'
import { readMedicationUsage, recordMedicationUse, usageScope } from '../../lib/medicationUsage'
import { useAppContext } from '../../context/AppContext'
import { FieldLabel } from './ConsultationFields'
import Button from '../common/Button'
import Chip, { Tag } from '../common/Chip'
import IconButton from '../common/IconButton'

const clinicToday = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
const inputCls = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300'
const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// ---- allergy check (name-based, accent-insensitive) ----
export function allergyTokens(allergies) {
  return fold(allergies).split(/[,;/\n]+/).map((t) => t.trim()).filter((t) => t.length >= 3 && t !== 'aucune')
}
export function allergyMatch(name, tokens) {
  const n = fold(name).trim()
  if (n.length < 3) return null
  return tokens.find((t) => n.includes(t) || t.includes(n)) || null
}

// One add button for every block of the plan list: the same quiet blue text action on the
// right of each row header, so the rows read as one list rather than four differently-weighted
// boxes. (`variant` is kept for callers; all variants now look the same.)
export function AddButton({ children, onClick, disabled }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled}
      className="!text-blue-600 hover:!bg-blue-50 hover:!text-blue-700">
      <Plus className="h-4 w-4" /> {children}
    </Button>
  )
}

// The plan list: one bordered surface whose rows (Panel) are separated by hairlines.
export function PlanList({ children }) {
  return <div className="divide-y divide-slate-100 overflow-visible rounded-xl border border-slate-200 bg-white">{children}</div>
}

// One row of the plan list (no box of its own — PlanList draws the frame).
export function Panel({ children }) {
  return <div className="px-4 py-3.5">{children}</div>
}

// Row header: icon, title, how many items it holds, and its action on the right.
export function BlockHeader({ icon: Icon, title, count = 0, action }) {
  return (
    <div className="flex min-h-[36px] items-center gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold text-slate-900">
        <span className="truncate">{title}</span>
        {count > 0 && <span className="rounded-full bg-blue-50 px-1.5 py-px text-[11px] font-bold text-blue-700">{count}</span>}
      </span>
      {action}
    </div>
  )
}

const ALL_DIAGNOSES = DIAGNOSTICS.flatMap((g) => g.items).map((i) => (i.code ? `${i.text} (${i.code})` : i.text))

// Diagnoses: search the existing library or type free text; several allowed.
export function DiagnosisPicker({ items, onChange }) {
  const [text, setText] = useState('')
  const q = fold(text.trim())
  const matches = useMemo(() => (q.length < 2 ? [] : [...new Set(ALL_DIAGNOSES)].filter((d) => fold(d).includes(q) && !items.includes(d)).slice(0, 8)), [q, items])
  const add = (label) => {
    const t = label.trim()
    if (!t || items.some((x) => x.toLowerCase() === t.toLowerCase()) || items.length >= 30) return
    onChange([...items, t]); setText('')
  }
  return (
    <div>
      <FieldLabel hint="Plusieurs possibles">Diagnostic / hypothèses</FieldLabel>
      {items.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{items.map((d) => <Tag key={d} label={d} onRemove={() => onChange(items.filter((x) => x !== d))}>{d}</Tag>)}</div>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input className={`${inputCls} pl-9`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Rechercher ou saisir un diagnostic"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text) } }} placeholder="Rechercher ou saisir un diagnostic…" />
        {(matches.length > 0 || q.length >= 2) && (
          <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {matches.map((m) => (
              <li key={m}><button type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)} className="block w-full px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50">{m}</button></li>
            ))}
            <li><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(text)} className="block w-full px-3 py-2 text-left text-[13px] font-semibold text-slate-600 hover:bg-slate-50">Ajouter « {text.trim()} »</button></li>
          </ul>
        )}
      </div>
    </div>
  )
}

// Ranks MEDICATIONS by how the query matches (name first, then category), local usage count,
// then alphabetically. Empty query -> the device's most-prescribed, then the rest alphabetically.
function rankMedications(query, usage) {
  const q = fold(query.trim())
  const counted = new Map(usage.map((u) => [fold(u.label), u.count]))
  const scored = MEDICATIONS
    .map((m) => {
      const name = fold(m.nom)
      const rank = !q ? 0 : name.startsWith(q) ? 0 : name.includes(q) ? 1 : fold(m.categorie).includes(q) ? 2 : -1
      return rank < 0 ? null : { ...m, rank, count: counted.get(name) || 0 }
    })
    .filter(Boolean)
  return scored.sort((a, b) => a.rank - b.rank || b.count - a.count || a.nom.localeCompare(b.nom, 'fr'))
}

// Bold the part of `text` that matches `query` (accent/case-insensitive), same convention as the
// "Motif" suggestions in the appointment form.
function Highlight({ text, query }) {
  const q = fold(query)
  const i = q ? fold(text).indexOf(q) : -1
  if (i < 0) return text
  return <>{text.slice(0, i)}<strong className="font-bold text-slate-900">{text.slice(i, i + query.trim().length)}</strong>{text.slice(i + query.trim().length)}</>
}

// Médicament field with suggestions built in: the device's most-prescribed while empty, filtered
// matches while typing. An overlaid dropdown (like DiagnosisPicker above) rather than a footer that
// grows the box, since this field sits in a tight row next to Posologie/Durée — growing it would
// misalign the row. Picking a match fills the name and, if still empty, the posologie and durée for
// that same row; free typing anything else still works.
export function MedicamentField({ value, onChange, onPick, usage }) {
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => rankMedications(value, usage).slice(0, 6), [value, usage])
  const showList = open && matches.length > 0 && !matches.some((m) => fold(m.nom) === fold(value.trim()))

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Médicament"
        aria-label="Médicament"
      />
      {showList && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((m) => (
            <li key={m.nom}>
              <button type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(m)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50">
                <span className="min-w-0 truncate"><Highlight text={m.nom} query={value} /></span>
                <span className="shrink-0 text-[11px] font-medium text-slate-400">{m.categorie}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Posologie suggestions: the picked médicament's usual dosage first (never applied automatically —
// only offered), then the generic presets, filtered by what's typed. Same overlaid-dropdown pattern
// as Médicament, so picking one is always a deliberate choice, never a silent autofill.
function rankPosologie(query, medDefault) {
  const q = fold(query.trim())
  const pool = [...new Set([medDefault, ...POSOLOGIE_PRESETS].filter(Boolean))]
  return pool.filter((p) => !q || fold(p).includes(q))
}

export function PosologieField({ value, onChange, medDefault }) {
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => rankPosologie(value, medDefault), [value, medDefault])
  const showList = open && matches.length > 0 && !matches.some((p) => fold(p) === fold(value.trim()))

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Posologie"
        aria-label="Posologie"
      />
      {showList && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((p) => (
            <li key={p}>
              <button type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(p)}
                className="block w-full px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50">
                <Highlight text={p} query={value} />
                {p === medDefault && <span className="ml-1.5 text-[11px] font-medium text-slate-400">· usuel</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Small quick-pick chips for durée: shown only while that field is still empty, e.g. a free-typed
// drug the list above doesn't know. Disappears the moment the field has a value.
export function PresetChips({ options, onPick }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {options.map((o) => <Chip key={o} size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(o)}>{o}</Chip>)}
    </div>
  )
}

// Treatments (high frequency): framed panel, strong label, primary add button.
// No empty rows by default; a row appears on demand.
// `onAdd` (optional) replaces the plain "add a row" so the caller can check that
// prescribing is possible first; `gate` is the inline prompt it shows meanwhile.
export function TreatmentEditor({ rows, onChange, allergies, ordonnance, onOrdonnance, onAdd, gate = null }) {
  const { profile } = useAppContext()
  const scope = usageScope(profile?.clinic_id || profile?.cabinet_id, profile?.id)
  const usage = useMemo(() => readMedicationUsage(scope), [scope])
  const tokens = allergyTokens(allergies)
  const setRow = (i, key, value) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  const pickMedication = (i, med) => {
    recordMedicationUse(scope, med.nom)
    // Only the name is applied. Posologie stays the doctor's own call — its usual dosage is offered
    // as a suggestion (PosologieField), never filled in silently. Durée keeps auto-filling: it's a
    // duration, not a dosage, so getting it wrong carries far less risk.
    onChange(rows.map((r, idx) => (idx === i ? { ...r, medicament: med.nom, duree: r.duree.trim() || med.duree } : r)))
  }
  return (
    <Panel>
      <BlockHeader icon={Pill} title="Traitement" count={rows.filter((r) => r.medicament.trim()).length}
        action={<AddButton onClick={onAdd || (() => onChange([...rows, { medicament: '', posologie: '', duree: '' }]))} disabled={rows.length >= 30}>Ajouter</AddButton>} />
      {gate}
      <div className={`space-y-2.5 ${rows.length ? 'mt-3' : ''}`}>
        {rows.map((r, i) => {
          const hit = allergyMatch(r.medicament, tokens)
          return (
            <div key={i}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-start">
                <MedicamentField value={r.medicament} onChange={(v) => setRow(i, 'medicament', v)} onPick={(m) => pickMedication(i, m)} usage={usage} />
                <PosologieField value={r.posologie} onChange={(v) => setRow(i, 'posologie', v)} medDefault={MEDICATIONS.find((m) => fold(m.nom) === fold(r.medicament))?.posologie} />
                <div>
                  <input className={inputCls} value={r.duree} onChange={(e) => setRow(i, 'duree', e.target.value)} placeholder="Durée" aria-label={`Durée ${i + 1}`} />
                  {!r.duree.trim() && r.medicament.trim() && <PresetChips options={DUREE_PRESETS.slice(0, 4)} onPick={(v) => setRow(i, 'duree', v)} />}
                </div>
                <IconButton size="lg" label={`Retirer le traitement ${i + 1}`} className="hover:!text-red-600" onClick={() => onChange(rows.filter((_, idx) => idx !== i))}><X className="h-4 w-4" /></IconButton>
              </div>
              {hit && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Allergie déclarée : « {hit} ». Vérifiez avant de prescrire.</p>}
            </div>
          )
        })}
      </div>
      {rows.some((r) => r.medicament.trim()) && (
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-600">
          <input type="checkbox" checked={ordonnance} onChange={(e) => onOrdonnance(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
          Remettre une ordonnance
        </label>
      )}
    </Panel>
  )
}

const QUICK_EXAMS = (PLANS.find((g) => g.group === 'Examens complémentaires')?.items || []).map((t) => t.replace(/\.$/, ''))

// Exams (sometimes): standard weight, hidden behind "+ Ajouter un examen" until needed.
export function ExamOrders({ items, onChange, patient, renseignements = '' }) {
  const [open, setOpen] = useState(items.length > 0)
  const [text, setText] = useState('')
  const header = useDocumentHeader()
  const printRequest = () => printExamRequest({ header, patient, exams: items.map((label) => ({ label })), renseignements })
  const add = (label) => {
    const t = label.trim()
    if (!t || items.some((x) => x.toLowerCase() === t.toLowerCase()) || items.length >= 30) return
    onChange([...items, t])
  }
  const submit = () => { add(text); setText('') }
  return (
    <Panel>
      <BlockHeader icon={FlaskConical} title="Examens complémentaires" count={items.length}
        action={(
          <span className="flex items-center gap-1">
            {items.length > 0 && patient && (
              <Button variant="ghost" size="sm" onClick={printRequest} className="!text-slate-600" title="Demande d'examens à remettre au patient">
                <Printer className="h-4 w-4" /> Imprimer la demande
              </Button>
            )}
            {!open && <AddButton onClick={() => setOpen(true)}>Ajouter</AddButton>}
          </span>
        )} />
      {items.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{items.map((x) => <Tag key={x} label={x} onRemove={() => onChange(items.filter((y) => y !== x))}>{x}</Tag>)}</div>}
      {open && (
        <div className="mt-3">
          <div className="flex gap-2">
            <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} placeholder="Ex. NFS, radiographie… (Entrée pour valider)" aria-label="Ajouter un examen" autoFocus={items.length === 0} />
            <Button variant="primary" size="sm" className="h-10" onClick={submit}>Ajouter</Button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {QUICK_EXAMS.filter((q) => !items.includes(q)).slice(0, 10).map((q) => (
              <Chip key={q} icon={Plus} size="md" onClick={() => add(q)}>{q}</Chip>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

// Documents to hand over. Each one is a real document (text + parameters in
// note.documentDrafts), written in the DocumentComposer — never just a label.
// `onChange(documents, documentDrafts)` updates both together.
export function DocumentsBlock({ note, patient, onChange }) {
  const [composing, setComposing] = useState(null)
  const header = useDocumentHeader()
  const items = note.documents
  const drafts = note.documentDrafts || {}
  const save = (type, draft) => {
    onChange(items.includes(type) ? items : [...items, type], { ...drafts, [type]: draft })
    setComposing(null)
  }
  const remove = (type) => {
    const { [type]: _gone, ...rest } = drafts
    onChange(items.filter((x) => x !== type), rest)
    setComposing(null)
  }
  const missing = DOCUMENT_OPTIONS.filter((d) => !items.includes(d))
  return (
    <Panel>
      <BlockHeader icon={FileText} title="Documents à remettre" count={items.length}
        action={(
          <Button variant="ghost" size="sm" onClick={() => setComposing(missing[0] || items[0])}
            className="!text-blue-600 hover:!bg-blue-50 hover:!text-blue-700">
            <Sparkles className="h-4 w-4" /> Générer
          </Button>
        )} />
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((d) => {
            const body = drafts[d]?.body?.trim()
            return (
              <li key={d} className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setComposing(d)} className="min-w-0 flex-1 text-left">
                  <span className="block text-[13.5px] font-semibold text-slate-800">{d}</span>
                  <span className={`block truncate text-[12px] ${body ? 'text-slate-500' : 'font-medium text-amber-700'}`}>
                    {body ? body.replace(/\s+/g, ' ') : 'Pas encore rédigé — cliquer pour générer'}
                  </span>
                </button>
                {body && <IconButton label={`Imprimer ${d}`} onClick={() => printDocument(d, drafts[d], header)}><Printer className="h-4 w-4" /></IconButton>}
                <IconButton label={`Retirer ${d}`} className="hover:!text-red-600" onClick={() => remove(d)}><X className="h-4 w-4" /></IconButton>
              </li>
            )
          })}
        </ul>
      )}
      {missing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {missing.map((d) => <Chip key={d} icon={Plus} size="md" onClick={() => setComposing(d)}>{d}</Chip>)}
        </div>
      )}
      {composing && (
        <DocumentComposer initialType={composing} note={note} patient={patient}
          onSave={save} onRemove={remove} onClose={() => setComposing(null)} />
      )}
    </Panel>
  )
}

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const QUICK_FOLLOW = [['1 semaine', 7], ['2 semaines', 14], ['1 mois', 30], ['3 mois', 90]]

// Shown once a follow-up date is set: completing the consultation then creates a task for the
// secretariat (server trigger, migration 20260927000000). Checked by default.
export function FollowUpReminderToggle({ date, checked, onChange, kind = 'controle' }) {
  if (!date) return null
  return (
    <label className="mt-2 flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 accent-slate-900" />
      <span>
        Créer un rappel de suivi pour le secrétariat
        <span className="block text-[11.5px] font-normal text-slate-500">
          {kind === 'renouvellement' ? 'Tâche « Renouveler l\'ordonnance »' : 'Tâche « Planifier le contrôle »'} au {new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
        </span>
      </span>
    </label>
  )
}

export function FollowUpBlock({ date, notes, onDate, onNotes, reminder = true, onReminder }) {
  const today = clinicToday()
  return (
    <div>
      <FieldLabel>Suivi</FieldLabel>
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700" htmlFor="followup-date">Prochain contrôle</label>
          <input id="followup-date" type="date" min={today} value={date} onChange={(e) => onDate(e.target.value)} className={inputCls} />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {QUICK_FOLLOW.map(([label, days]) => (
              <Chip key={label} selected={date === addDays(today, days)} onClick={() => onDate(addDays(today, days))}>{label}</Chip>
            ))}
          </div>
          {onReminder && <FollowUpReminderToggle date={date} checked={reminder} onChange={onReminder} />}
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700" htmlFor="followup-notes">Consignes / suivi</label>
          <textarea id="followup-notes" rows={3} value={notes} onChange={(e) => onNotes(e.target.value)} placeholder="Ex. revoir si la fièvre persiste, résultats à apporter…"
            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
      </div>
    </div>
  )
}

const QUICK_RENEWAL = [['1 mois', 30], ['3 mois', 90], ['6 mois', 180]]

// Lightweight flow (renewal): when the treatment should be renewed next — the same note fields
// as "Prochain contrôle" (followUpDate / followUpReminder), titled as a renewal on the task.
export function RenewalFollowUp({ date, onDate, reminder = true, onReminder }) {
  const today = clinicToday()
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] font-semibold text-slate-700" htmlFor="renewal-date">Prochain renouvellement</label>
        <div className="flex flex-wrap gap-1">
          {QUICK_RENEWAL.map(([label, days]) => (
            <Chip key={label} selected={date === addDays(today, days)} onClick={() => onDate(date === addDays(today, days) ? '' : addDays(today, days))}>{label}</Chip>
          ))}
        </div>
        <input id="renewal-date" type="date" min={today} value={date} onChange={(e) => onDate(e.target.value)} className={`${inputCls} !h-8 !w-auto`} />
      </div>
      <FollowUpReminderToggle date={date} checked={reminder} onChange={onReminder} kind="renouvellement" />
    </div>
  )
}
