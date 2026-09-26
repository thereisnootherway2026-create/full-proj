import { AlertCircle, AlertTriangle, ClipboardList, Lock, Pill, ShieldCheck } from 'lucide-react'
import { clinicalDisplay } from '../../lib/clinical/clinicalStatus'

// The one way allergies / antécédents / traitements are displayed.
//   unknown -> amber  "Non renseignées, à vérifier"   (never "aucune")
//   none    -> neutral "Aucune allergie connue" + "vérifié le …"
//   listed  -> the list (allergies in the warning red)
// `restricted` (a role without clinical access): the chip renders nothing, the
// block says "Réservé au médecin". `variant`:
//   chip   -> compact pill (dossier identification bar)
//   block  -> labelled box (patient info panel, consultation sidebar)
const ICONS = { allergies: AlertTriangle, antecedents: ClipboardList, medications: Pill }

const CHIP = {
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-slate-50 text-slate-700 border-slate-200',
}

const BLOCK = {
  warning: 'border-amber-200 bg-amber-50/70',
  neutral: 'border-slate-200 bg-white',
  danger: 'border-red-200 bg-red-50',
  info: 'border-slate-200 bg-white',
}

const TITLE_TONE = { warning: 'text-amber-800', neutral: 'text-slate-600', danger: 'text-red-700', info: 'text-slate-700' }

export default function ClinicalStatusBadge({ kind, status, items, verifiedAt, variant = 'chip', restricted = false, className = '' }) {
  if (restricted) {
    if (variant === 'chip') return null
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[12.5px] text-slate-400 ${className}`}>
        <Lock className="h-3.5 w-3.5 flex-shrink-0" />
        <span><span className="font-semibold text-slate-500">{clinicalDisplay(kind, null, null).title}</span> · Réservé au médecin</span>
      </div>
    )
  }

  const d = clinicalDisplay(kind, status, items, verifiedAt)
  const Icon = d.state === 'unknown' ? AlertCircle : d.state === 'none' ? ShieldCheck : ICONS[kind]

  if (variant === 'chip') {
    const text = d.state === 'listed'
      ? d.items.join(', ')
      : `${kind === 'allergies' && d.state === 'unknown' ? 'Allergies non renseignées, à vérifier' : d.label}${d.verifiedLabel ? ` · ${d.verifiedLabel}` : ''}`
    return (
      <span data-clinical-state={d.state} title={text}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12.5px] font-semibold ${CHIP[d.tone]} ${className}`}>
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="max-w-[220px] truncate">{text}</span>
      </span>
    )
  }

  return (
    <div data-clinical-state={d.state} role={d.state === 'listed' && kind === 'allergies' ? 'alert' : undefined}
      className={`rounded-lg border px-3 py-2.5 ${BLOCK[d.tone]} ${className}`}>
      <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${TITLE_TONE[d.tone]}`}>
        <Icon className="h-3.5 w-3.5 flex-shrink-0" /> {d.title}
      </p>
      {d.state === 'listed' ? (
        <ul className={`mt-1 space-y-0.5 text-[13px] ${kind === 'allergies' ? 'font-semibold text-red-900' : 'text-slate-700'}`}>
          {d.items.map((item, i) => <li key={`${item}-${i}`} className="break-words">{item}</li>)}
        </ul>
      ) : (
        <p className={`mt-0.5 text-[13px] ${d.state === 'unknown' ? 'font-semibold text-amber-900' : 'text-slate-600'}`}>
          {d.label}
          {d.verifiedLabel && <span className="ml-1 text-[11.5px] font-normal text-slate-400">· {d.verifiedLabel}</span>}
        </p>
      )}
    </div>
  )
}
