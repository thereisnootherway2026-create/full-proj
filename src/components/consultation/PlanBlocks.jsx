import { useMemo, useState, useRef, useEffect } from 'react'
import { AlertTriangle, Calendar, Check, ChevronDown, ChevronRight, ChevronUp, ClipboardList, FileText, FlaskConical, LayoutGrid, Mail, Pill, Plus, Printer, Receipt, Search, Sparkles, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DIAGNOSTICS, PLANS } from '../../data/clinicalSuggestions'
import { DUREE_PRESETS, MEDICATIONS, POSOLOGIE_PRESETS } from '../../data/medicationSuggestions'
import { searchExams, CLINICAL_EXAMS } from '../../data/examSuggestions'
import {
  CERTIFICAT_KINDS,
  DOCUMENT_OPTIONS,
  SORTIES,
  defaultDraft,
  generateDocumentBody,
  normalizeDocumentDraft,
} from '../../lib/medicalDocuments'
import DocumentComposer, { printDocument, printExamRequest, useDocumentHeader } from './DocumentComposer'
import { readMedicationUsage, recordMedicationUse, usageScope } from '../../lib/medicationUsage'
import { useAppContext } from '../../context/AppContext'
import { FieldLabel } from './ConsultationFields'
import Button from '../common/Button'
import Chip, { Tag } from '../common/Chip'
import IconButton from '../common/IconButton'

const clinicToday = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
const inputCls = 'h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all'
const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function HighlightMatch({ text, query }) {
  if (!query || !query.trim()) return <span>{text}</span>
  const q = fold(query)
  const normText = fold(text)
  const idx = normText.indexOf(q)
  if (idx === -1) return <span>{text}</span>
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + query.trim().length)
  const after = text.slice(idx + query.trim().length)
  return (
    <span>
      {before}
      <span className="font-semibold text-blue-600 bg-blue-50/80 rounded px-0.5">{match}</span>
      {after}
    </span>
  )
}

export function allergyTokens(allergies) {
  return fold(allergies).split(/[,;/\n]+/).map((t) => t.trim()).filter((t) => t.length >= 3 && t !== 'aucune')
}
export function allergyMatch(name, tokens) {
  const n = fold(name).trim()
  if (n.length < 3) return null
  return tokens.find((t) => n.includes(t) || t.includes(n)) || null
}

export function AddButton({ children, onClick, disabled }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled}
      className="!text-blue-600 hover:!bg-blue-50 hover:!text-blue-700 !px-3">
      <Plus className="h-4 w-4" /> {children}
    </Button>
  )
}

export function PlanList({ children }) {
  return <div className="space-y-3.5">{children}</div>
}

export function Panel({ children, className = '' }) {
  return (
    <div className={`group relative overflow-hidden rounded-lg border border-[#E5E7EB] bg-white transition-all ${className}`}>
      {children}
    </div>
  )
}

export function BlockHeader({ icon: Icon, title, count = 0, action }) {
  return (
    <div className="flex min-h-[40px] items-center gap-3 px-4 py-3 border-b border-slate-100">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB] ring-1 ring-blue-100/80">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[14px] font-bold tracking-tight text-slate-900">{title}</span>
        {count > 0 && <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-[10.5px] font-bold text-white">{count}</span>}
      </span>
      {action}
    </div>
  )
}

const ALL_DIAGNOSES = DIAGNOSTICS.flatMap((g) => g.items).map((i) => ({
  label: i.text,
  code: i.code || null,
  full: i.code ? `${i.text} (${i.code})` : i.text,
}))

export function DiagnosisPicker({ items, onChange }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const q = fold(text)

  const matches = useMemo(() => {
    if (q.length < 1) return []
    return ALL_DIAGNOSES.filter((d) => {
      const matchLabel = fold(d.label).includes(q)
      const matchCode = d.code && fold(d.code).includes(q)
      const notAlreadyPicked = !items.includes(d.full) && !items.includes(d.label)
      return (matchLabel || matchCode) && notAlreadyPicked
    }).slice(0, 8)
  }, [q, items])

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => { setSelectedIndex(0) }, [matches])

  const add = (label) => {
    const t = label.trim()
    if (!t || items.some((x) => x.toLowerCase() === t.toLowerCase()) || items.length >= 30) return
    onChange([...items, t])
    setText(''); setOpen(false); inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (!open || (!matches.length && !text.trim())) {
      if (e.key === 'Enter' && text.trim()) { e.preventDefault(); add(text) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const total = matches.length + (text.trim() ? 1 : 0)
      setSelectedIndex((prev) => (prev + 1) % total)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const total = matches.length + (text.trim() ? 1 : 0)
      setSelectedIndex((prev) => (prev - 1 + total) % total)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex < matches.length) add(matches[selectedIndex].full)
      else add(text)
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={boxRef}>
      <FieldLabel hint="Plusieurs acceptés">Diagnostic / hypothèses</FieldLabel>
      {items.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {items.map((d) => (
            <span key={d} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/70 px-3 py-1 text-[12.5px] font-medium text-blue-900 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
              <span className="leading-none">{d}</span>
              <button type="button" onClick={() => onChange(items.filter((x) => x !== d))}
                className="rounded-full p-0.5 text-blue-400 hover:bg-blue-200 hover:text-blue-800 transition-colors" title={`Retirer ${d}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input ref={inputRef} className={`${inputCls} pl-10 pr-9`} value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true) }}
          onFocus={() => { if (text.trim()) setOpen(true) }} onKeyDown={handleKeyDown}
          aria-label="Rechercher ou saisir un diagnostic"
          placeholder="Rechercher ou saisir un diagnostic (ex: Rhinopharyngite, HTA, Lombalgie…)" />
        {text && (
          <button type="button" onClick={() => { setText(''); setOpen(false); inputRef.current?.focus() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="Effacer">
            <X className="h-4 w-4" />
          </button>
        )}
        <AnimatePresence>
          {open && (matches.length > 0 || text.trim()) && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-slate-900/5">
              {matches.map((m, idx) => {
                const isSelected = idx === selectedIndex
                return (
                  <div key={m.full} onClick={() => add(m.full)} onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-left cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 text-blue-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                    }`}>
                    <span className="text-[13px] truncate"><HighlightMatch text={m.label} query={text} /></span>
                    {m.code && <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-mono font-medium text-slate-600">{m.code}</span>}
                  </div>
                )
              })}
              {text.trim() && (
                <div onClick={() => add(text)} onMouseEnter={() => setSelectedIndex(matches.length)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-left cursor-pointer border-t border-slate-100 transition-colors ${
                    selectedIndex === matches.length ? 'bg-blue-50 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-600'
                  }`}>
                  <span className="text-[12.5px]">Ajouter : <span className="font-semibold text-slate-800">« {text.trim()} »</span></span>
                  <Plus className="h-3.5 w-3.5 text-blue-500" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function rankMedications(query, usage) {
  const q = fold(query)
  const counted = new Map(usage.map((u) => [fold(u.label), u.count]))
  const scored = MEDICATIONS
    .map((m) => {
      const name = fold(m.nom)
      const molecule = fold(m.molecule || '')
      const rank = !q
        ? 0
        : name.startsWith(q)
        ? 0
        : molecule.startsWith(q)
        ? 1
        : name.includes(q)
        ? 2
        : molecule.includes(q)
        ? 3
        : fold(m.categorie).includes(q)
        ? 4
        : -1
      return rank < 0 ? null : { ...m, rank, count: counted.get(name) || 0 }
    })
    .filter(Boolean)
  return scored.sort((a, b) => a.rank - b.rank || b.count - a.count || a.nom.localeCompare(b.nom, 'fr'))
}

export function MedicamentField({
  value,
  onChange,
  onPick,
  usage,
  error,
  placeholder = 'Rechercher un médicament…',
  className = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all',
}) {
  const [open, setOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const listRef = useRef(null)
  const matches = useMemo(() => rankMedications(value, usage).slice(0, 8), [value, usage])
  const showList = open && matches.length > 0 && !matches.some((m) => fold(m.nom) === fold(value))

  useEffect(() => {
    setSelectedIdx(0)
  }, [matches])

  const handleKeyDown = (e) => {
    if (!showList) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((prev) => (prev + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((prev) => (prev - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter') {
      if (matches[selectedIdx]) {
        e.preventDefault()
        onPick(matches[selectedIdx])
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <input
        className={`${className} ${error ? '!border-amber-400 !bg-amber-50/20' : ''}`}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Médicament"
      />
      {showList && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-[260px] overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-slate-900/5"
        >
          {matches.map((m, idx) => {
            const isSelected = idx === selectedIdx
            return (
              <li key={`${m.nom}-${idx}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(m)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-[13px] transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-950 font-medium' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-900">
                      <HighlightMatch text={m.nom} query={value} />
                    </span>
                    {m.molecule && fold(m.molecule) !== fold(m.nom) && (
                      <span className="ml-1.5 text-[11.5px] text-slate-500">
                        (<HighlightMatch text={m.molecule} query={value} />)
                      </span>
                    )}
                    {m.dosage && (
                      <span className="ml-2 inline-block rounded bg-slate-100 px-1.5 py-0.2 text-[10.5px] font-semibold text-slate-600">
                        {m.dosage}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    {m.categorie}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function rankPosologie(query, medDefault) {
  const q = fold(query)
  const pool = [...new Set([medDefault, ...POSOLOGIE_PRESETS].filter(Boolean))]
  return pool.filter((p) => !q || fold(p).includes(q))
}

export function PosologieField({
  value,
  onChange,
  medDefault,
  error,
  placeholder = '1 cp × 3/j',
  className = 'h-9 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all',
}) {
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => rankPosologie(value, medDefault), [value, medDefault])
  const showList = open && matches.length > 0 && !matches.some((p) => fold(p) === fold(value))
  return (
    <div className="relative">
      <input
        className={`${className} ${error ? '!border-amber-400 !bg-amber-50/20' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        aria-label="Posologie"
      />
      {showList && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-52 w-full min-w-[200px] overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-slate-900/5">
          {matches.map((p) => (
            <li key={p}>
              <button type="button" role="option" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(p); setOpen(false) }}
                className="flex w-full items-center justify-between px-3 py-1.5 rounded-lg text-left text-[12.5px] text-slate-700 hover:bg-blue-50 transition-colors">
                <span><HighlightMatch text={p} query={value} /></span>
                {p === medDefault && <span className="text-[10px] text-blue-600 font-bold">usuel</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PresetChips({ options, onPick }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(o)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors">
          {o}
        </button>
      ))}
    </div>
  )
}

export function TreatmentEditor({
  rows = [],
  onChange,
  allergies,
  ordonnance,
  onOrdonnance,
  onGenerateOrdonnance,
  isOrdonnanceDirty = false,
  hasGeneratedOrdonnance = false,
  rowErrors = {},
  onAdd,
  gate = null,
  initialEditingIdx = null,
}) {
  const { profile } = useAppContext()
  const scope = usageScope(profile?.clinic_id || profile?.cabinet_id, profile?.id)
  const usage = useMemo(() => readMedicationUsage(scope), [scope])
  const tokens = allergyTokens(allergies)
  const [editingIdx, setEditingIdx] = useState(initialEditingIdx)

  const setRow = (i, key, value) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }

  const pickMedication = (i, med) => {
    recordMedicationUse(scope, med.nom)
    onChange(
      rows.map((r, idx) =>
        idx === i
          ? {
              ...r,
              medicament: med.nom,
              dosage: r.dosage?.trim() ? r.dosage : (med.dosage || ''),
              posologie: r.posologie?.trim() ? r.posologie : (med.posologie || ''),
              duree: r.duree?.trim() ? r.duree : (med.duree || ''),
            }
          : r
      )
    )
  }

  const addRow = () => {
    if (onAdd) {
      onAdd()
    } else {
      onChange([...rows, { medicament: '', dosage: '', posologie: '', duree: '', overrideAllergy: false }])
    }
    setEditingIdx(rows.length)
  }

  const moveRow = (fromIdx, direction) => {
    const toIdx = fromIdx + direction
    if (toIdx < 0 || toIdx >= rows.length) return
    const next = [...rows]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onChange(next)
    if (editingIdx === fromIdx) setEditingIdx(toIdx)
  }

  const removeRow = (i) => {
    onChange(rows.filter((_, idx) => idx !== i))
    if (editingIdx === i) setEditingIdx(null)
    else if (editingIdx > i) setEditingIdx(editingIdx - 1)
  }

  const hasCompleteLine = rows.some((r) => r.medicament?.trim())

  return (
    <div className="space-y-2.5">
      {gate}
      {rows.length === 0 ? (
        /* Empty: one dashed row acting as the button: "+ Prescrire un traitement". No other chrome. */
        <button
          type="button"
          onClick={addRow}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white hover:bg-blue-50/30 hover:border-blue-300 text-sm font-medium text-slate-500 hover:text-[#2563EB] transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Prescrire un traitement</span>
        </button>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const matchedMed = MEDICATIONS.find((m) => fold(m.nom) === fold(r.medicament))
            const hit = allergyMatch(r.medicament, tokens) || (matchedMed?.molecule ? allergyMatch(matchedMed.molecule, tokens) : null)
            const rowErr = rowErrors[i]
            const isEditing = editingIdx === i

            // Read-mode row: "Paracétamol 1 g · 1 cp × 3/j · 5 j" (truncate with title tooltip), hover reveals ✕ and ↑↓ (24px, gray-400)
            if (!isEditing) {
              const medPart = r.medicament ? `${r.medicament}${r.dosage ? ` ${r.dosage}` : ''}` : ''
              const lineSummary = [medPart, r.posologie, r.duree].filter(Boolean).join(' · ') || 'Ligne de traitement sans libellé'

              return (
                <div
                  key={i}
                  onClick={() => setEditingIdx(i)}
                  title={lineSummary}
                  className={`group/line flex h-10 items-center justify-between px-3 rounded-lg border bg-white hover:bg-slate-50/70 cursor-pointer transition-colors ${
                    hit
                      ? 'border-amber-400 bg-amber-50/20'
                      : rowErr
                      ? 'border-amber-300 bg-amber-50/10'
                      : 'border-gray-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600">
                      {i + 1}
                    </span>
                    <span className="text-[12.5px] font-medium text-slate-800 truncate">
                      {lineSummary}
                    </span>
                    {hit && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300 shrink-0">
                        ⚠ Allergie
                      </span>
                    )}
                  </div>

                  {/* Actions revealed on hover / subtle */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveRow(i, -1)
                      }}
                      aria-label="Monter la ligne"
                      title="Monter"
                      className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={i === rows.length - 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveRow(i, 1)
                      }}
                      aria-label="Descendre la ligne"
                      title="Descendre"
                      className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRow(i)
                      }}
                      aria-label="Supprimer la ligne"
                      title="Supprimer"
                      className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            }

            // Expanded Round-10 editor: full-width médicament + 3-col row; collapse on ✓
            return (
              <div
                key={i}
                id={`prescription-line-${i}`}
                className={`rounded-lg border p-3 flex flex-col gap-2 transition-all shadow-xs ${
                  hit
                    ? 'border-amber-400 bg-amber-50/30 ring-1 ring-amber-300'
                    : rowErr
                    ? 'border-amber-300 bg-amber-50/20'
                    : 'border-blue-300 bg-white ring-1 ring-blue-100'
                }`}
              >
                {/* Header row: index, title, ↑↓✕ icon buttons 24px + collapse ✓ */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-100 text-[11px] font-bold text-blue-700">
                    {i + 1}
                  </span>
                  <span className="text-[12px] font-semibold text-slate-800">
                    Ligne de traitement
                  </span>
                  {hit && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                      <AlertTriangle className="h-3 w-3 text-amber-700" />
                      ⚠ Allergie
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveRow(i, -1)}
                      aria-label="Monter la ligne"
                      title="Monter"
                      className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={i === rows.length - 1}
                      onClick={() => moveRow(i, 1)}
                      aria-label="Descendre la ligne"
                      title="Descendre"
                      className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      aria-label={`Retirer le traitement ${i + 1}`}
                      title="Supprimer la ligne"
                      className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIdx(null)}
                      aria-label="Valider la ligne"
                      title="Valider la ligne"
                      className="flex h-6 w-6 items-center justify-center rounded text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors ml-0.5"
                    >
                      <Check className="h-4 w-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>

                {/* Médicament typeahead full width */}
                <div>
                  <MedicamentField
                    value={r.medicament || ''}
                    onChange={(v) => setRow(i, 'medicament', v)}
                    onPick={(m) => pickMedication(i, m)}
                    usage={usage}
                    placeholder="Rechercher un médicament…"
                    error={Boolean(rowErr?.includes('médicament'))}
                  />
                </div>

                {/* One row of 3 equal inputs: Dosage, Posologie, Durée */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <input
                      className="h-9 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all"
                      value={r.dosage || ''}
                      onChange={(e) => setRow(i, 'dosage', e.target.value)}
                      placeholder="500 mg"
                      aria-label={`Dosage ligne ${i + 1}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <PosologieField
                      value={r.posologie || ''}
                      onChange={(v) => setRow(i, 'posologie', v)}
                      medDefault={MEDICATIONS.find((m) => fold(m.nom) === fold(r.medicament))?.posologie}
                      placeholder="1 cp × 3/j"
                      error={Boolean(rowErr?.includes('posologie'))}
                    />
                  </div>
                  <div className="min-w-0">
                    <input
                      className="h-9 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all"
                      value={r.duree || ''}
                      onChange={(e) => setRow(i, 'duree', e.target.value)}
                      placeholder="7 jours"
                      aria-label={`Durée ligne ${i + 1}`}
                    />
                  </div>
                </div>

                {hit && (
                  <div className="space-y-1.5 pt-0.5">
                    <p role="alert" className="flex items-center gap-1.5 rounded-lg bg-amber-100/70 px-2.5 py-1 text-[11px] font-semibold text-amber-900 border border-amber-300/80">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                      <span>Allergie déclarée : « {hit} ».</span>
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer rounded-lg bg-white border border-amber-300 px-2.5 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-50 transition-colors select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(r.overrideAllergy)}
                        onChange={(e) => setRow(i, 'overrideAllergy', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-600"
                      />
                      <span>Prescrire malgré l'allergie</span>
                    </label>
                  </div>
                )}

                {rowErr && (
                  <div role="alert" className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 border border-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                    <span>{rowErr}</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* [+ Ajouter une ligne] dashed-border full-width row */}
          <button
            type="button"
            onClick={addRow}
            className="w-full h-9 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white hover:bg-slate-50 hover:border-blue-400 text-sm font-medium text-slate-600 hover:text-[#2563EB] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter une ligne
          </button>

          {/* Group footer: [Générer l'ordonnance] full-width secondary button */}
          {hasCompleteLine && onGenerateOrdonnance && (
            <div className="flex flex-col gap-1.5 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={onGenerateOrdonnance}
                className="!w-full !font-semibold shadow-2xs justify-center"
              >
                <FileText className="h-4 w-4 mr-1.5 text-blue-600" />
                Générer l'ordonnance
              </Button>
              {isOrdonnanceDirty ? (
                <span className="inline-flex items-center justify-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                  ⚠ Ordonnance à régénérer
                </span>
              ) : hasGeneratedOrdonnance ? (
                <span className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <Check className="h-3 w-3 stroke-[3]" />
                  Ordonnance générée
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ExamOrders({ items = [], onChange, patient, renseignements = '' }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [activeCatalogTab, setActiveCatalogTab] = useState('biologie')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const header = useDocumentHeader()
  const printRequest = () => printExamRequest({ header, patient, exams: items.map((label) => ({ label })), renseignements })
  const suggestions = useMemo(() => {
    const q = text.trim()
    if (!q) return []
    return searchExams(q, 8).filter((s) => !items.includes(s.label))
  }, [text, items])

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => { setSelectedIndex(0) }, [suggestions])

  const add = (label) => {
    const t = label.trim()
    if (!t || items.some((x) => x.toLowerCase() === t.toLowerCase()) || items.length >= 30) return
    onChange([...items, t])
    setText('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (!open || (!suggestions.length && !text.trim())) {
      if (e.key === 'Enter' && text.trim()) { e.preventDefault(); add(text) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const total = suggestions.length + (text.trim() ? 1 : 0)
      setSelectedIndex((prev) => (prev + 1) % total)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const total = suggestions.length + (text.trim() ? 1 : 0)
      setSelectedIndex((prev) => (prev - 1 + total) % total)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex < suggestions.length) add(suggestions[selectedIndex].label)
      else add(text)
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  const toggleCatalogItem = (label) => {
    if (items.includes(label)) onChange(items.filter((x) => x !== label))
    else onChange([...items, label])
  }
  const catalogExams = useMemo(() => CLINICAL_EXAMS.filter((e) => e.categoryKey === activeCatalogTab), [activeCatalogTab])

  return (
    <div className="space-y-2">
      {/* Filled: rows of chips "NFS ✕", each 28px (h-7) */}
      {items.length > 0 && (
        <div className="space-y-1.5 pb-0.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Examens demandés ({items.length})
            </span>
            {patient && (
              <Button
                variant="ghost"
                size="xs"
                onClick={printRequest}
                className="!text-slate-600 hover:!bg-slate-100 !px-2 !h-6 text-[11px]"
                title="Demande d'examens à remettre au patient"
              >
                <Printer className="h-3 w-3 mr-1" /> Imprimer
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {items.map((x) => (
              <span
                key={x}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-blue-50 text-blue-900 border border-blue-200 text-[12px] font-medium shadow-2xs"
              >
                <span className="truncate max-w-[190px]">{x}</span>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((y) => y !== x))}
                  className="rounded-full p-0.5 text-blue-400 hover:bg-blue-200 hover:text-blue-800 transition-colors"
                  title={`Retirer ${x}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Single search input, placeholder "Ajouter un examen (NFS, ECG, Radio…)", small Catalogue ghost-icon button */}
      <div ref={boxRef} className="relative">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            className={`${inputCls} !h-10 pl-9 pr-9 text-[13px]`}
            value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true) }}
            onFocus={() => { if (text.trim()) setOpen(true) }}
            onKeyDown={handleKeyDown}
            placeholder="Ajouter un examen (NFS, ECG, Radio…)"
            aria-label="Ajouter un examen"
          />
          {text ? (
            <button
              type="button"
              onClick={() => { setText(''); setOpen(false); inputRef.current?.focus() }}
              className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 transition-colors"
              title="Effacer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowCatalog(!showCatalog)}
              className={`absolute right-2 p-1.5 rounded-md transition-colors ${
                showCatalog ? 'bg-blue-50 text-[#2563EB]' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title="Catalogue d'examens"
              aria-label="Catalogue d'examens"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {open && (suggestions.length > 0 || text.trim()) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-slate-900/5"
            >
              {suggestions.map((item, idx) => {
                const isSelected = idx === selectedIndex
                return (
                  <div
                    key={item.label}
                    onClick={() => add(item.label)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-left cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 text-blue-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="text-[13px] truncate"><HighlightMatch text={item.label} query={text} /></span>
                      {item.matchedReason && (
                        <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">{item.matchedReason}</span>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{item.category}</span>
                  </div>
                )
              })}
              {text.trim() && (
                <div
                  onClick={() => add(text)}
                  onMouseEnter={() => setSelectedIndex(suggestions.length)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-left cursor-pointer border-t border-slate-100 transition-colors ${
                    selectedIndex === suggestions.length ? 'bg-blue-50 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <span className="text-[12.5px]">Ajouter : <span className="font-semibold text-slate-800">« {text.trim()} »</span></span>
                  <Plus className="h-3.5 w-3.5 text-blue-500" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Catalog inline drawer/panel */}
      <AnimatePresence>
        {showCatalog && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('biologie')}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-colors ${
                    activeCatalogTab === 'biologie' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  Biologie
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('radiologie')}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-colors ${
                    activeCatalogTab === 'radiologie' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  Radiologie
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowCatalog(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
                title="Fermer le catalogue"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
              {catalogExams.map((item) => {
                const isSelected = items.includes(item.label)
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => toggleCatalogItem(item.label)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[12px] transition-all ${
                      isSelected
                        ? 'bg-blue-50 text-blue-900 font-semibold border border-blue-200/60'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/60'
                    }`}
                  >
                    <span className="truncate pr-2">{item.label}</span>
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const RAIL_DOCUMENTS = [
  { id: 'Certificat médical', label: 'Certificat médical', icon: FileText },
  { id: 'Arrêt de travail', label: 'Arrêt de travail', icon: Calendar },
  { id: 'Courrier au confrère', label: 'Courrier au confrère', icon: Mail },
  { id: 'Compte-rendu de consultation', label: 'Compte-rendu', icon: ClipboardList },
]

export function DocumentsBlock({ note, patient, onChange, initialActiveDoc = null }) {
  const header = useDocumentHeader()
  const items = note.documents || []
  const drafts = note.documentDrafts || {}
  const [activeDoc, setActiveDoc] = useState(initialActiveDoc)
  const [formDraft, setFormDraft] = useState(() => initialActiveDoc ? (drafts[initialActiveDoc] || defaultDraft(initialActiveDoc, note)) : {})

  const todayStr = useMemo(() => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), [])

  const handleToggleDoc = (docId) => {
    if (activeDoc === docId) {
      setActiveDoc(null)
    } else {
      setActiveDoc(docId)
      const existing = drafts[docId]
      if (existing) {
        setFormDraft(existing)
      } else {
        const d = defaultDraft(docId, note)
        setFormDraft(d)
      }
    }
  }

  const handleGenerate = (docId) => {
    const d = normalizeDocumentDraft(formDraft)
    const body = generateDocumentBody(docId, { note, patient, doctorName: header.medecin, draft: d })
    const updatedDraft = { ...d, body, generatedAt: todayStr }
    const nextItems = items.includes(docId) ? items : [...items, docId]
    const nextDrafts = { ...drafts, [docId]: updatedDraft }

    onChange(nextItems, nextDrafts)
    printDocument(docId, updatedDraft, header)
    setActiveDoc(null)
  }

  const handleRemove = (docId) => {
    const nextItems = items.filter((x) => x !== docId)
    const { [docId]: _gone, ...nextDrafts } = drafts
    onChange(nextItems, nextDrafts)
    if (activeDoc === docId) setActiveDoc(null)
  }

  return (
    <div className="space-y-1.5">
      {RAIL_DOCUMENTS.map((doc) => {
        const isGenerated = items.includes(doc.id)
        const currentDraft = drafts[doc.id]
        const isExpanded = activeDoc === doc.id
        const Icon = doc.icon
        const dateLabel = currentDraft?.generatedAt || todayStr

        return (
          <div key={doc.id} className="rounded-lg border border-gray-100 overflow-hidden bg-white transition-all">
            {/* Row: h-10, 16px line icon + label, hover bg-gray-50, ChevronRight */}
            <button
              type="button"
              onClick={() => handleToggleDoc(doc.id)}
              className="flex h-10 w-full items-center justify-between px-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                <span className="text-sm font-medium text-slate-700 truncate">{doc.label}</span>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {isGenerated ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                    Remis le {dateLabel}
                  </span>
                ) : (
                  <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                )}
              </div>
            </button>

            {/* Inline mini-form (2-3 fields max) */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden border-t border-gray-100 bg-slate-50/50 p-3 space-y-2.5 text-xs"
                >
                  {/* Fields based on document type */}
                  {doc.id === 'Certificat médical' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Type de certificat</label>
                        <select
                          className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-slate-800"
                          value={formDraft.kind || 'etat'}
                          onChange={(e) => setFormDraft({ ...formDraft, kind: e.target.value })}
                        >
                          {CERTIFICAT_KINDS.map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Mentions particulières</label>
                        <textarea
                          rows={2}
                          placeholder="Texte complémentaire ou remarques…"
                          className="w-full rounded-md border border-gray-200 bg-white p-2 text-xs text-slate-800 resize-none"
                          value={formDraft.body || ''}
                          onChange={(e) => setFormDraft({ ...formDraft, body: e.target.value, edited: true })}
                        />
                      </div>
                    </div>
                  )}

                  {doc.id === 'Arrêt de travail' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Durée (jours)</label>
                          <input
                            type="number"
                            min="1"
                            max="90"
                            className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-slate-800"
                            value={formDraft.jours || 3}
                            onChange={(e) => setFormDraft({ ...formDraft, jours: parseInt(e.target.value, 10) || 1 })}
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Sorties</label>
                          <select
                            className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-slate-800"
                            value={formDraft.sorties || 'autorisees'}
                            onChange={(e) => setFormDraft({ ...formDraft, sorties: e.target.value })}
                          >
                            {SORTIES.map(([k, label]) => (
                              <option key={k} value={k}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {doc.id === 'Courrier au confrère' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Confrère destinataire</label>
                        <input
                          type="text"
                          placeholder="Dr Martin, Cardiologue"
                          className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-slate-800"
                          value={formDraft.destinataire || ''}
                          onChange={(e) => setFormDraft({ ...formDraft, destinataire: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Motif d'adressage</label>
                        <textarea
                          rows={2}
                          placeholder="Avis spécialisé pour…"
                          className="w-full rounded-md border border-gray-200 bg-white p-2 text-xs text-slate-800 resize-none"
                          value={formDraft.body || ''}
                          onChange={(e) => setFormDraft({ ...formDraft, body: e.target.value, edited: true })}
                        />
                      </div>
                    </div>
                  )}

                  {doc.id === 'Compte-rendu de consultation' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Résumé & conclusions</label>
                        <textarea
                          rows={2}
                          placeholder="Résumé de la consultation…"
                          className="w-full rounded-md border border-gray-200 bg-white p-2 text-xs text-slate-800 resize-none"
                          value={formDraft.body || (note.motif ? `Consultation pour ${note.motif}. ${(note.diagnostics || []).join(', ')}` : '')}
                          onChange={(e) => setFormDraft({ ...formDraft, body: e.target.value, edited: true })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="xs"
                      className="!flex-1 !font-semibold justify-center !h-8 text-xs"
                      onClick={() => handleGenerate(doc.id)}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                      {isGenerated ? 'Mettre à jour & imprimer' : 'Générer'}
                    </Button>
                    {isGenerated && (
                      <button
                        type="button"
                        onClick={() => handleRemove(doc.id)}
                        className="h-8 px-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors"
                        title="Retirer ce document"
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const QUICK_FOLLOW = [['1 sem', 7], ['2 sem', 14], ['1 mois', 30], ['3 mois', 90]]

export function FollowUpReminderToggle({ date, checked, onChange, kind = 'controle' }) {
  if (!date) return null
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#E5E7EB] bg-slate-50/60 p-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 cursor-pointer" />
      <div>
        <span className="font-bold text-slate-800">Créer un rappel pour le secrétariat</span>
        <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
          {kind === 'renouvellement' ? 'Tâche « Renouveler l\'ordonnance »' : 'Tâche « Planifier le contrôle »'} prévue au {new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>
    </label>
  )
}

export function FollowUpBlock({ date, notes, onDate, onNotes, reminder = true, onReminder }) {
  const today = clinicToday()
  return (
    <Panel>
      <BlockHeader icon={Calendar} title="Suivi & rendez-vous de contrôle" />
      <div className="p-4">
        <div className="grid gap-3.5 sm:grid-cols-[220px_1fr]">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wider text-slate-500" htmlFor="followup-date">
              Prochain contrôle
            </label>
            <input id="followup-date" type="date" min={today} value={date || ''} onChange={(e) => onDate(e.target.value)} className={inputCls} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_FOLLOW.map(([label, days]) => (
                <button key={label} type="button" onClick={() => onDate(addDays(today, days))}
                  className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                    date === addDays(today, days)
                      ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                      : 'border-[#E5E7EB] bg-white text-slate-600 hover:border-blue-300 hover:bg-slate-50'
                  }`}>{label}</button>
              ))}
            </div>
            {onReminder && <FollowUpReminderToggle date={date} checked={reminder} onChange={onReminder} />}
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wider text-slate-500" htmlFor="followup-notes">
              Consignes / surveillance
            </label>
            <textarea id="followup-notes" rows={2} value={notes || ''} onChange={(e) => onNotes(e.target.value)}
              placeholder="Ex. Revoir en consultation si la fièvre persiste au-delà de 48h, résultats d'analyses à rapporter…"
              className="w-full resize-none rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" />
          </div>
        </div>
      </div>
    </Panel>
  )
}

const QUICK_RENEWAL = [['1 mois', 30], ['3 mois', 90], ['6 mois', 180]]

export function RenewalFollowUp({ date, onDate, reminder = true, onReminder }) {
  const today = clinicToday()
  return (
    <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Prochain renouvellement</label>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_RENEWAL.map(([label, days]) => (
            <Chip key={label} selected={date === addDays(today, days)}
              onClick={() => onDate(date === addDays(today, days) ? '' : addDays(today, days))}>{label}</Chip>
          ))}
        </div>
        <input id="renewal-date" type="date" min={today} value={date || ''} onChange={(e) => onDate(e.target.value)} className={`${inputCls} !h-9 !w-auto`} />
      </div>
      <FollowUpReminderToggle date={date} checked={reminder} onChange={onReminder} kind="renouvellement" />
    </div>
  )
}
