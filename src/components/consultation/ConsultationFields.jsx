import { useState } from 'react'
import { Banknote, Plus } from 'lucide-react'
import { MedicalTextarea } from '../FocusMode'
import SuggestionsTrigger from './SuggestionsTrigger'
import SmartMotifInput from './SmartMotifInput'
import SelectedSuggestions from './SelectedSuggestions'
import { SUGGESTIONS_BY_KIND } from '../../data/clinicalSuggestions'
import { findSelected, insertPhrase, removePhrase, toText } from '../../lib/suggestionText'
import Button from '../common/Button'
import Chip from '../common/Chip'

export function FieldLabel({ children, required, hint, action, emphasis = false }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className={emphasis ? 'text-[15px] font-bold tracking-tight text-slate-900' : 'text-[13px] font-semibold text-slate-800'}>
        {children}{required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
      </span>
      <span className="flex items-center gap-3">
        {hint && <span className="text-[11px] font-medium text-slate-400">{hint}</span>}
        {action}
      </span>
    </div>
  )
}

export function BillingPill({ children = 'Facturé à la caisse' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
      <Banknote className="h-3 w-3" /> {children}
    </span>
  )
}

const DARK_FOCUS = '[&_.medical-textarea]:caret-slate-900 focus-within:border-slate-900'
const SIZES = {
  sm: `${DARK_FOCUS} [&_.medical-textarea]:min-h-[80px] [&_.medical-textarea]:max-h-[320px] [&_.medical-textarea]:[field-sizing:content]`,
  md: `${DARK_FOCUS} [&_.medical-textarea]:min-h-[90px] [&_.medical-textarea]:max-h-[340px] [&_.medical-textarea]:[field-sizing:content]`,
  lg: `${DARK_FOCUS} [&_.medical-textarea]:min-h-[110px] [&_.medical-textarea]:max-h-[360px] [&_.medical-textarea]:[field-sizing:content]`,
  line: `${DARK_FOCUS} medical-textarea--line [&_.medical-textarea]:min-h-[52px] [&_.medical-textarea]:max-h-[180px] [&_.medical-textarea]:[field-sizing:content]`,
}

function QuickPicks({ cfg, count, onPick }) {
  const items = cfg.data[0].items.slice(0, count).map(toText)
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {items.map((text) => (
        <Chip key={text} size="sm" onClick={() => onPick(text)}>
          <Plus className="h-3 w-3 text-slate-400" /> {text}
        </Chip>
      ))}
    </div>
  )
}

export function NarrativeField({
  label, required, hint, value, onChange, placeholder, autoFocus, patientConsultations,
  size = 'md', emphasis = false, suggestKind, quickPicks = 0,
}) {
  const cfg = suggestKind ? SUGGESTIONS_BY_KIND[suggestKind] : null
  const [panelOpen, setPanelOpen] = useState(false)
  const [group, setGroup] = useState(cfg ? cfg.data[0].group : null)
  const selected = cfg ? findSelected(cfg.data, value) : []
  return (
    <div>
      <FieldLabel required={required} hint={hint} emphasis={emphasis}
        action={suggestKind && suggestKind !== 'motif' ? <SuggestionsTrigger kind={suggestKind} value={value} onChange={onChange} open={panelOpen} onOpenChange={setPanelOpen} group={group} onGroupChange={setGroup} /> : null}>
        {label}
      </FieldLabel>
      {suggestKind === 'motif' ? (
        <SmartMotifInput
          value={value || ''}
          onChange={onChange}
          placeholder={placeholder || 'Motif principal de la consultation (ex: Renouvellement, Fièvre, Toux…)'}
          autoFocus={autoFocus}
        />
      ) : (
        <>
          <div className={`rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.02)] ${emphasis ? 'ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-slate-900 focus-within:border-slate-900' : 'focus-within:border-slate-900'}`}>
            <MedicalTextarea className={SIZES[size] || SIZES.md} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} patientConsultations={patientConsultations} />
          </div>
          {cfg && quickPicks > 0 && !String(value || '').trim() && (
            <QuickPicks cfg={cfg} count={quickPicks} onPick={(text) => onChange(insertPhrase(value || '', text, cfg.joiner))} />
          )}
          {cfg && <SelectedSuggestions items={selected} onOpen={(s) => { setGroup(s.group); setPanelOpen(true) }} onRemove={(s) => onChange(removePhrase(value, s.text, cfg.joiner))} />}
        </>
      )}
    </div>
  )
}

const toNum = (x) => {
  const n = parseFloat(String(x ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function Trend({ current, previous }) {
  const cur = toNum(current)
  const prev = toNum(previous)
  if (cur == null || prev == null) return null
  const d = Math.round((cur - prev) * 10) / 10
  const arrow = d > 0 ? '↑' : d < 0 ? '↓' : '→'
  const text = d === 0 ? 'stable' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`
  return <span data-trend={arrow} title="Variation depuis la mesure précédente" className="shrink-0 font-semibold text-slate-500">{arrow} {text}</span>
}

function LastValue({ last, onUse, current, previous }) {
  if (!last) return null
  return (
    <p className="flex min-h-[16px] items-baseline justify-between gap-2 text-[11px] text-slate-400">
      <span className="min-w-0 truncate">
        Dernière : <span className="font-medium text-slate-500">{last.text}</span>{last.when ? ` · ${last.when}` : ''}
        {onUse && <Button variant="link" className="ml-1.5 !text-[11px] text-slate-500 hover:!text-blue-700" onClick={onUse}>Utiliser</Button>}
      </span>
      <Trend current={current} previous={previous} />
    </p>
  )
}

const BOX = {
  missing: 'border-dashed border-slate-200/90 bg-slate-50/50',
  ok: 'border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]',
  abnormal: 'border-red-200 border-l-[3px] border-l-red-500 bg-red-50/70',
  problem: 'border-red-400 bg-red-50/80',
  unusual: 'border-amber-300 bg-amber-50/80',
  readonly: 'border-slate-200 bg-slate-50/80',
}

const INPUT = 'w-full min-w-0 bg-transparent text-[22px] font-bold leading-[1.1] tracking-tight outline-none placeholder:text-[14px] placeholder:font-medium placeholder:text-slate-300'
const VALUE_TONE = { abnormal: 'text-red-700', ok: 'text-slate-900', missing: 'text-slate-900', problem: 'text-red-800', unusual: 'text-amber-900' }

function FlagTag({ flag }) {
  if (!flag) return null
  return (
    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-800 ring-1 ring-red-200/70">
      {flag.level === 'high' ? '↑' : '↓'} {flag.label}
    </span>
  )
}

function ReportedTag({ text }) {
  if (!text) return null
  return <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">Reportée · {text}</span>
}

function CheckMessage({ check, onConfirm, onApplySuggestion }) {
  const fmt = (n) => String(n).replace('.', ',')
  if (check.level === 'warn' && check.confirmed) {
    return <p className="mt-0.5 min-h-[16px] text-[11px] font-medium text-slate-500">Valeur inhabituelle confirmée</p>
  }
  return (
    <div role={check.level === 'error' ? 'alert' : 'status'} className={`mt-0.5 min-h-[16px] text-[11px] font-medium leading-snug ${check.level === 'error' ? 'text-red-700' : 'text-amber-800'}`}>
      <p>{check.message}</p>
      {(check.suggestion !== undefined || check.level === 'warn') && (
        <span className="mt-0.5 flex flex-wrap gap-x-2">
          {check.suggestion !== undefined && onApplySuggestion && (
            <Button variant="link" className="!text-[11px] !text-blue-700" onClick={() => onApplySuggestion(String(check.suggestion))}>Corriger en {fmt(check.suggestion)}</Button>
          )}
          {check.level === 'warn' && onConfirm && (
            <Button variant="link" className="!text-[11px] !text-amber-900" onClick={onConfirm}>Confirmer</Button>
          )}
        </span>
      )}
    </div>
  )
}

const statusOf = ({ shown, check, filled, flag }) => {
  if (shown && check?.level === 'error') return 'problem'
  if (shown && check?.level === 'warn' && !check.confirmed) return 'unusual'
  if (!filled) return 'missing'
  return flag ? 'abnormal' : 'ok'
}

export function VitalField({ label, unit, value, onChange, placeholder, last, onUseLast, flag, reported, previous, check, onConfirm, onApplySuggestion, lastHint }) {
  const filled = String(value ?? '').trim() !== ''
  const [touched, setTouched] = useState(filled)
  const shown = touched && check && check.level !== 'ok'
  const settled = !shown || (check.level === 'warn' && check.confirmed)
  const status = statusOf({ shown, check, filled, flag })
  return (
    <div className={`group rounded-2xl border px-3.5 pb-2 pt-2.5 transition-all duration-150 hover:border-slate-300 focus-within:border-slate-400 focus-within:shadow-[0_2px_12px_-4px_rgba(15,23,42,0.1)] ${BOX[status]}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${status === 'missing' ? 'text-slate-500' : 'text-slate-500'}`}>{label}</span>
        <span className="flex flex-wrap items-center gap-1">
          {filled && <ReportedTag text={reported} />}
          {settled && <FlagTag flag={flag} />}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <input type="text" inputMode="decimal" value={value} onChange={onChange} onBlur={() => setTouched(true)} placeholder={placeholder} aria-label={label}
          aria-invalid={shown && check.level === 'error'} className={`${INPUT} ${VALUE_TONE[status]}`} />
        {unit && <span className="shrink-0 text-[11.5px] font-medium text-slate-400">{unit}</span>}
      </div>
      {shown
        ? <CheckMessage check={check} onConfirm={onConfirm} onApplySuggestion={onApplySuggestion} />
        : lastHint
          ? <p className="min-h-[16px] text-[11px] text-slate-400">{lastHint}</p>
          : <LastValue last={last} onUse={last ? onUseLast : null} current={value} previous={previous} />}
    </div>
  )
}

export function ComputedField({ label, value, unit, hint }) {
  const has = value != null && value !== ''
  return (
    <div className={`group rounded-2xl border px-3.5 pb-2 pt-2.5 transition-all duration-150 hover:border-slate-300 ${BOX.readonly}`} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">Calculé</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-[22px] font-bold leading-[1.1] tracking-tight ${has ? 'text-slate-900' : 'text-slate-300'}`}>{has ? String(value).replace('.', ',') : '—'}</span>
        {unit && <span className="shrink-0 text-[11.5px] font-medium text-slate-400">{unit}</span>}
      </div>
      <p className="min-h-[16px] text-[11px] text-slate-400">{hint}</p>
    </div>
  )
}

export function BloodPressureField({ systolic, diastolic, onSystolicChange, onDiastolicChange, last, onUseLast, flag, reported, previousSystolic, check, onConfirm }) {
  const filled = (v) => String(v ?? '').trim() !== ''
  const any = filled(systolic) || filled(diastolic)
  const [touched, setTouched] = useState(filled(systolic) && filled(diastolic))
  const shown = touched && check && check.level !== 'ok'
  const settled = !shown || (check.level === 'warn' && check.confirmed)
  const status = statusOf({ shown, check, filled: any, flag })
  const blur = (e) => {
    if (e.relatedTarget && e.currentTarget.parentElement?.contains(e.relatedTarget)) return
    setTouched(true)
  }
  return (
    <div className={`group rounded-2xl border px-3.5 pb-2 pt-2.5 transition-all duration-150 hover:border-slate-300 focus-within:border-slate-400 focus-within:shadow-[0_2px_12px_-4px_rgba(15,23,42,0.1)] ${BOX[status]}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${status === 'missing' ? 'text-slate-500' : 'text-slate-500'}`}>Tension artérielle</span>
        <span className="flex flex-wrap items-center gap-1">
          {any && <ReportedTag text={reported} />}
          {settled && <FlagTag flag={flag} />}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <input type="text" inputMode="numeric" value={systolic} onChange={onSystolicChange} onBlur={blur} placeholder="120" aria-label="Tension systolique"
          aria-invalid={shown && check.level === 'error'} className={`${INPUT} ${VALUE_TONE[status]}`} />
        <span className="text-xl font-light text-slate-300">/</span>
        <input type="text" inputMode="numeric" value={diastolic} onChange={onDiastolicChange} onBlur={blur} placeholder="80" aria-label="Tension diastolique"
          aria-invalid={shown && check.level === 'error'} className={`${INPUT} ${VALUE_TONE[status]}`} />
        <span className="shrink-0 text-[11.5px] font-medium text-slate-400">mmHg</span>
      </div>
      {shown
        ? <CheckMessage check={check} onConfirm={onConfirm} />
        : <LastValue last={last} onUse={last ? onUseLast : null} current={systolic} previous={previousSystolic} />}
    </div>
  )
}
