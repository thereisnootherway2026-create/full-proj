import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ClipboardList, X } from 'lucide-react'
import { FieldLabel } from './ConsultationFields'
import SuggestionChips from './SuggestionChips'
import Button from '../common/Button'
import IconButton from '../common/IconButton'
import { filterSuggestions, foldKey, groupSuggestions } from '../../lib/acteSuggestions'

// One modal for "add an item to the consultation". The chrome (backdrop,
// header badge, dark primary button, dark focus ring, Framer Motion enter/exit)
// is fixed; only the title, icon and fields differ per item type, so a style
// change happens here once. Add a type by adding an entry to ITEM_TYPES.
//
// `suggestionsField` names the field that shows the suggestion dropdown: it
// opens as soon as the field is focused (top N most used), narrows as the doctor
// types, and picking one merges its `values` into the form (e.g. name + amount).
//
// field kinds: 'text' | 'textarea' | 'amount' (right-aligned number + trailing unit)
export const ITEM_TYPES = {
  acte: {
    title: 'Ajouter un acte',
    suggestionsField: 'name',
    icon: ClipboardList,
    fields: [
      { key: 'name', label: 'Nom de l\'acte', kind: 'text', required: true, placeholder: 'Ex : Consultation, Injection…' },
      { key: 'description', label: 'Description', kind: 'textarea', placeholder: 'Détails sur l\'acte effectué…' },
      { key: 'montant', label: 'Montant', kind: 'amount', unit: 'MAD', placeholder: '0' },
    ],
  },
}

const CONTROL = 'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all'

// Text input with an optional suggestion dropdown directly below it. The
// dropdown belongs to the field: it opens on focus/click/typing, stays open
// while focus is inside the field or the dropdown, and Escape closes only it.
function TextField({ field, value, onChange, autoFocus, onEnter, suggestions, onPick }) {
  const id = useId()
  // Starts open when the field takes focus on mount, so the doctor sees the
  // suggestions before typing anything.
  const [open, setOpen] = useState(Boolean(autoFocus && suggestions))
  const shown = suggestions ? filterSuggestions(suggestions, value) : []
  const typed = value.trim() !== ''
  const selected = shown.find((s) => s.label.toLowerCase() === value.trim().toLowerCase())
  const groups = groupSuggestions(shown, typed)
  return (
    <div>
      <FieldLabel required={field.required}><label htmlFor={id}>{field.label}</label></FieldLabel>
      <div className="relative" onFocus={() => setOpen(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
        <input id={id} value={value} placeholder={field.placeholder} autoFocus={autoFocus} autoComplete="off" className={`${CONTROL} h-10`}
          role={suggestions ? 'combobox' : undefined} aria-expanded={suggestions ? open && shown.length > 0 : undefined} aria-autocomplete={suggestions ? 'list' : undefined}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }} onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open && shown.length > 0) { e.stopPropagation(); setOpen(false) } else if (e.key === 'Enter') onEnter()
          }} />
        <AnimatePresence>
          {open && shown.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl space-y-3 divide-y divide-slate-100 scrollbar-thin"
            >
              {groups.map((g, i) => (
                <div key={g.key} className={i ? 'pt-2.5' : ''}>
                  <SuggestionChips
                    label={g.label}
                    items={g.items}
                    groupKey={g.key}
                    selectedKey={selected?.key}
                    onPick={(it) => { onPick(it); setOpen(false) }}
                  />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Field({ field, value, onChange, autoFocus, onEnter, suggestions, onPick }) {
  const id = useId()
  const label = <FieldLabel required={field.required}><label htmlFor={id}>{field.label}</label></FieldLabel>
  if (field.kind === 'textarea') {
    return (
      <div>
        {label}
        <textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={`${CONTROL} resize-none py-2.5`} />
      </div>
    )
  }
  if (field.kind === 'amount') {
    // Same unit treatment as the vitals cards: small, medium-weight, muted, trailing.
    return (
      <div>
        {label}
        <div className="flex items-baseline gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 transition-all focus-within:border-blue-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10">
          <input id={id} type="number" inputMode="decimal" min="0" step="1" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder}
            onKeyDown={(e) => { if (e.key === 'Enter') onEnter() }}
            className="h-10 w-full min-w-0 bg-transparent text-right text-[15px] font-semibold tabular-nums text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300" />
          {field.unit && <span className="shrink-0 text-[11px] font-medium text-slate-400">{field.unit}</span>}
        </div>
      </div>
    )
  }
  return <TextField field={field} value={value} onChange={onChange} autoFocus={autoFocus} onEnter={onEnter} suggestions={suggestions} onPick={onPick} />
}

export default function AddItemModal({ type, subtitle, values, onChange, onSave, onClose, suggestions = [] }) {
  const cfg = ITEM_TYPES[type]
  const titleId = useId()
  const Icon = cfg.icon
  const canSave = cfg.fields.every((f) => !f.required || String(values[f.key] ?? '').trim() !== '')
  const save = () => { if (canSave) onSave() }

  // Typing the exact name of a catalogue acte (instead of tapping its chip) still brings its standard
  // price, as long as the Montant has not been filled in yet.
  const withCataloguePrice = (field, v) => {
    const next = { ...values, [field.key]: v }
    if (cfg.suggestionsField !== field.key || String(values.montant ?? '').trim() !== '') return next
    const hit = suggestions.find((s) => s.source === 'catalogue' && s.values.montant && foldKey(s.label) === foldKey(v))
    return hit ? { ...next, montant: hit.values.montant } : next
  }

  // Bubble phase on purpose: a field's dropdown handles Escape first (React's
  // root handler runs before this) and stops it, so Escape closes the dropdown
  // before it closes the modal, and never reaches the consultation sheet.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div role="dialog" aria-modal="true" aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-xl overflow-hidden rounded-[21px] bg-white shadow-[0_12px_48px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Icon className="h-[18px] w-[18px]" /></div>
            <div>
              <h2 id={titleId} className="text-base font-semibold text-slate-900">{cfg.title}</h2>
              {subtitle && <p className="text-[12px] text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <IconButton size="md" look="soft" label="Fermer" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </div>
        <div className="space-y-4 p-5">
          {cfg.fields.map((f, i) => (
            <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => onChange(withCataloguePrice(f, v))} autoFocus={i === 0} onEnter={save}
              suggestions={cfg.suggestionsField === f.key ? suggestions : null} onPick={(it) => onChange({ ...values, ...it.values })} />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 p-5">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>Enregistrer</Button>
        </div>
      </motion.div>
    </div>
  )
}
