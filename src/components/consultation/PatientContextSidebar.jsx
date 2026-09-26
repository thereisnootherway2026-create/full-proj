import { useState } from 'react'
import { Activity, AlertCircle, AlertTriangle, Check, ChevronDown, ChevronsLeft, ChevronsRight, History, Pill } from 'lucide-react'
import { normalizeNote } from '../../lib/encounterService'
import { resolveClinicalStatus, splitClinicalList } from '../../lib/clinical/clinicalStatus'
import { computeIMC } from '../../lib/vitals/validateVital'
import { useAppContext } from '../../context/AppContext'
import IconButton from '../common/IconButton'
import Avatar from '../common/Avatar'
import ClinicalListEditor from '../clinical/ClinicalListEditor'
import ClinicalStatusBadge from '../clinical/ClinicalStatusBadge'
import AgeSexeLine from '../clinical/AgeSexeLine'

const fmtDate = (d, withYear = false) => (d
  ? new Date(d).toLocaleDateString('fr-FR', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' })
  : '')

function Sparkline({ values }) {
  if (values.length < 2) return null
  const w = 72
  const h = 22
  const pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / (values.length - 1), h - pad - ((v - min) / span) * (h - 2 * pad)])
  const last = pts[pts.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="flex-shrink-0 text-slate-400">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" className="fill-slate-800" />
    </svg>
  )
}

// A section that has real data: solid dark icon + label, count, expandable in
// place. Sections differ by icon and label only (no per-card colour); the
// muted EmptyRow below is the "non renseigné" counterpart.
function Section({ icon: Icon, title, badge, summary, open, onToggle, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50">
        <Icon className="h-4 w-4 flex-shrink-0 text-slate-800" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="text-[12.5px] font-bold text-slate-800">{title}</span>
            {badge != null && badge > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">{badge}</span>}
          </span>
          {!open && summary && <span className="mt-0.5 block truncate text-[12px] text-slate-500">{summary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-slate-100 px-3 pb-3 pt-2.5">{children}</div>}
    </section>
  )
}

// A section with nothing to show: a quiet, non-interactive row.
function EmptyRow({ icon: Icon, title, text }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-slate-200 px-3 py-2">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" />
      <p className="min-w-0 truncate text-[12px] text-slate-400"><span className="font-semibold text-slate-500">{title}</span> · {text}</p>
    </div>
  )
}

const Muted = ({ children }) => <p className="text-[13px] text-slate-400">{children}</p>

function TrendRow({ label, value, unit, series }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11.5px] text-slate-400">{label}</p>
        <p className="text-[14px] font-bold text-slate-900">{value}{unit && <span className="ml-0.5 text-[11.5px] font-medium text-slate-400">{unit}</span>}</p>
      </div>
      <Sparkline values={series} />
    </div>
  )
}

function PriorItem({ enc }) {
  const [open, setOpen] = useState(false)
  const n = normalizeNote(enc.note)
  const dx = n.diagnostics.join(' ; ')
  const rx = n.traitements.filter((r) => r.medicament.trim()).map((r) => r.medicament).join(', ')
  return (
    <li className="rounded-md border border-slate-100 bg-slate-50/60">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full px-2.5 py-2 text-left">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[11.5px] font-semibold text-slate-500">{fmtDate(enc.completed_at || enc.started_at, true)}</span>
          <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
        <span className={`mt-0.5 block text-[13px] font-semibold text-slate-800 ${open ? '' : 'line-clamp-2'}`}>{n.motif || 'Consultation'}</span>
        {!open && dx && <span className="mt-0.5 block truncate text-[12px] text-slate-500">{dx}</span>}
      </button>
      {open && (
        <dl className="space-y-1.5 px-2.5 pb-2.5 text-[12.5px] text-slate-600">
          {dx && <div><dt className="font-semibold text-slate-500">Diagnostic</dt><dd>{dx}</dd></div>}
          {n.conduite.trim() && <div><dt className="font-semibold text-slate-500">Conduite</dt><dd className="whitespace-pre-wrap">{n.conduite}</dd></div>}
          {rx && <div><dt className="font-semibold text-slate-500">Traitement</dt><dd>{rx}</dd></div>}
          {(n.followUpDate || n.followUpNotes.trim()) && (
            <div><dt className="font-semibold text-slate-500">Suivi</dt><dd>{[n.followUpDate && fmtDate(`${n.followUpDate}T12:00:00`, true), n.followUpNotes.trim()].filter(Boolean).join(' · ')}</dd></div>
          )}
        </dl>
      )}
    </li>
  )
}

// Patient context during the consultation. Allergies, antécédents and traitements
// are edited in place (ClinicalListEditor: three explicit states, saved through
// mm_set_patient_clinical); age / sexe can be added inline. Historical data
// (constantes, previous consultations) stays read-only. Nothing opens a modal.
// Priority order: allergies, clinical lists, blocks with data, then a quiet
// "Non renseigné" group of empty rows.
export default function PatientContextSidebar({
  patient, patientId, age, meds, medsState, vitalsRows = [], vitalsState, encounters = [], encountersState,
  collapsed = false, onToggleCollapsed, progress = null, onSelectStep, safetyItems = [], className = '',
}) {
  const { canonicalRole, can } = useAppContext()
  const clinical = canonicalRole === 'doctor' || canonicalRole === 'admin'
  const canEditIdentity = clinical || Boolean(can?.('patients.update'))
  const [open, setOpen] = useState({})
  const allergiesListed = clinical && resolveClinicalStatus(patient?.allergies_status, patient?.allergies) === 'listed'
  const allergiesText = splitClinicalList(patient?.allergies).join(', ')
  const initials = `${patient?.prenom?.[0] || ''}${patient?.nom?.[0] || ''}`.toUpperCase()
  const name = `${patient?.prenom || ''} ${patient?.nom || ''}`.trim()
  const pid = patientId || patient?.id

  const last = vitalsRows[0] || null
  const chrono = [...vitalsRows].reverse().slice(-6)
  const num = (x) => { const v = parseFloat(String(x).replace(',', '.')); return Number.isFinite(v) ? v : null }
  const series = (fn) => chrono.map(fn).filter((v) => v != null)
  const sys = (row) => num(String(row.blood_pressure || '').split('/')[0])
  const bmi = last ? computeIMC(last.weight, last.height) : null

  // Every data-bearing block starts open; the doctor collapses what they don't need.
  const isOpen = (k) => (k in open ? open[k] : true)
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !isOpen(k) }))

  if (collapsed) {
    return (
      <aside aria-label="Contexte patient (réduit)" className={`flex flex-col items-center gap-3 bg-white py-4 ${className}`}>
        <IconButton label="Afficher le contexte patient" onClick={onToggleCollapsed}><ChevronsRight className="h-4 w-4" /></IconButton>
        <Avatar seed={patient?.id || name} initials={initials} size="sm" title={name}>
          {allergiesListed && <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 ring-2 ring-white" title={`Allergies : ${allergiesText}`}><AlertTriangle className="h-2.5 w-2.5 text-white" /></span>}
        </Avatar>
      </aside>
    )
  }

  const loading = (state) => state === 'loading'
  const errored = (state) => state === 'error'
  const blocks = []
  const empties = []

  // Constantes
  if (last) {
    blocks.push(
      <Section key="constantes" icon={Activity}title="Dernières constantes"
        summary={`${fmtDate(last.date_mesure, true)}${last.blood_pressure ? ` · TA ${last.blood_pressure}` : ''}`}
        open={isOpen('constantes')} onToggle={() => toggle('constantes')}>
        <div className="space-y-2.5">
          <p className="text-[11.5px] font-medium text-slate-400">Mesure du {fmtDate(last.date_mesure, true)}{chrono.length > 1 ? ` · tendance sur ${chrono.length} mesures` : ''}</p>
          <TrendRow label="Tension" value={last.blood_pressure} unit="mmHg" series={series(sys)} />
          <TrendRow label="Fréquence cardiaque" value={last.heart_rate} unit="bpm" series={series((r) => num(r.heart_rate))} />
          <TrendRow label="Température" value={last.temperature} unit="°C" series={series((r) => num(r.temperature))} />
          <TrendRow label="SpO₂" value={last.spo2} unit="%" series={series((r) => num(r.spo2))} />
          <TrendRow label="Poids" value={last.weight} unit="kg" series={series((r) => num(r.weight))} />
          <TrendRow label="Glycémie" value={last.blood_sugar} unit="g/L" series={series((r) => num(r.blood_sugar))} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-slate-600">
            {last.height != null && <span>Taille <b className="text-slate-800">{last.height}</b> cm</span>}
            {bmi != null && <span>IMC <b className="text-slate-800">{String(bmi).replace('.', ',')}</b></span>}
            {last.fr != null && <span>FR <b className="text-slate-800">{last.fr}</b>/min</span>}
            {last.douleur_eva != null && <span>EVA <b className="text-slate-800">{last.douleur_eva}</b>/10</span>}
          </div>
        </div>
      </Section>,
    )
  } else empties.push(<EmptyRow key="constantes" icon={Activity} title="Constantes" text={loading(vitalsState) ? 'chargement…' : errored(vitalsState) ? 'indisponible' : 'aucune mesure enregistrée'} />)

  // Consultations précédentes
  if (encounters.length > 0) {
    blocks.push(
      <Section key="historique" icon={History}title="Consultations précédentes" badge={encounters.length}
        summary={normalizeNote(encounters[0].note).motif || 'Consultation'} open={isOpen('historique')} onToggle={() => toggle('historique')}>
        <ul className="space-y-1.5">{encounters.slice(0, 5).map((e) => <PriorItem key={e.id} enc={e} />)}</ul>
      </Section>,
    )
  } else empties.push(<EmptyRow key="historique" icon={History} title="Consultations" text={loading(encountersState) ? 'chargement…' : errored(encountersState) ? 'indisponible' : 'aucune enregistrée'} />)

  return (
    <aside aria-label="Contexte patient" className={`flex flex-col bg-white ${className}`}>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <Avatar seed={patient?.id || name} initials={initials} size="md" />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-[14.5px] font-bold text-slate-900">{name}</p>
            <AgeSexeLine patient={patient} patientId={pid} canEdit={canEditIdentity} className="text-[12.5px] text-slate-500" linkClassName="text-[12.5px]" />
          </div>
          {onToggleCollapsed && (
            <IconButton label="Réduire le contexte patient" onClick={onToggleCollapsed} className="!hidden lg:!inline-flex"><ChevronsLeft className="h-4 w-4" /></IconButton>
          )}
        </div>

        {clinical ? (
          <>
            <ClinicalListEditor kind="allergies" patientId={pid} cabinetId={patient?.cabinet_id}
              status={patient?.allergies_status} text={patient?.allergies || ''} verifiedAt={patient?.clinical_verified_at} />
            <ClinicalListEditor kind="antecedents" patientId={pid} cabinetId={patient?.cabinet_id}
              status={patient?.antecedents_status} text={patient?.antecedents || ''} verifiedAt={patient?.clinical_verified_at} />
            {loading(medsState) || errored(medsState) ? (
              <EmptyRow icon={Pill} title="Traitements" text={loading(medsState) ? 'chargement…' : 'indisponible'} />
            ) : (
              <ClinicalListEditor kind="medications" patientId={pid} cabinetId={patient?.cabinet_id}
                status={patient?.medications_status} meds={meds} verifiedAt={patient?.clinical_verified_at} />
            )}
          </>
        ) : (
          <>
            <ClinicalStatusBadge kind="allergies" restricted variant="block" />
            <ClinicalStatusBadge kind="antecedents" restricted variant="block" />
            <ClinicalStatusBadge kind="medications" restricted variant="block" />
          </>
        )}

        {blocks}

        {empties.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {blocks.length > 0 && <p className="px-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-300">Non renseigné</p>}
            {empties}
          </div>
        )}
      </div>

      {progress && (
        <div className="border-t border-slate-100 px-3 py-2.5">
          <p className="mb-1.5 flex items-center justify-between px-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
            <span>Consultation en cours</span>
            <span className="font-semibold normal-case tracking-normal text-slate-400">{progress.filledCount}/{progress.total}</span>
          </p>
          <ul className="space-y-0.5">
            {progress.sections.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onSelectStep?.(s.id)} className="flex w-full items-start gap-2 rounded-md px-1 py-1 text-left hover:bg-slate-50">
                  {s.filled
                    ? <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white"><Check className="h-2.5 w-2.5" /></span>
                    : <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-slate-300" />}
                  <span className="min-w-0">
                    <span className={`block text-[12px] font-semibold ${s.filled ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
                    {s.detail && <span className="block truncate text-[11.5px] text-slate-500">{s.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {safetyItems.length > 0 && (
            <ul className="mt-1.5 space-y-0.5" aria-label="À vérifier">
              {safetyItems.map((item) => (
                <li key={item.id} className="flex items-start gap-2 rounded-md px-1 py-1" title={item.description}>
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-amber-900">{item.title}</span>
                    <span className="block text-[11.5px] text-slate-500">{item.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p data-status={progress.status} className="mt-2 border-t border-slate-100 px-1 pt-2 text-[11.5px] text-slate-500">
            {progress.status === 'blocked' && <><span className="font-semibold text-slate-700">Pour terminer :</span> {progress.blockers.join(', ')}</>}
            {progress.status === 'partial' && <><span className="font-semibold text-slate-700">Peut être terminée</span> · à compléter : {progress.missing.join(', ')}</>}
            {progress.status === 'complete' && <span className="font-semibold text-green-800">Prête à être terminée</span>}
          </p>
        </div>
      )}
    </aside>
  )
}
