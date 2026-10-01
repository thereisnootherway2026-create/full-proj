import { useState } from 'react'
import { Pill, Image as ImageIcon, FileCheck2, Activity, Info, ArrowRight, ChevronRight, Printer, Copy, Send, XCircle, FilePlus } from 'lucide-react'
import Button from '../common/Button'
import { StatutBadge } from '../facturation/ui'
import { dh } from '../facturation/format'
import { formatDoctorLabel } from '../../lib/professionalName'

// Dossier tabs backed by real data: ordonnances and examens come from the patient's completed
// consultations, factures from the billing (payments) data, scoped to this patient.

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
// Same currency formatting as the Facturation module and its facture modal.
const mad = (n) => dh(Number(n) || 0)
// A motif that's only punctuation/whitespace (stray "," left over from a removed suggestion tag,
// for example) carries no information — treat it the same as no motif at all.
const hasMotif = (m) => Boolean(m && /[a-zà-ÿ0-9]/i.test(m))

function Frame({ title, subtitle, children }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-bold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function Notice({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-slate-800">{title}</h3>
      <p className="max-w-md text-xs text-slate-500">{description}</p>
    </div>
  )
}

const ORDO_STATUT = {
  brouillon: { label: 'Brouillon', dot: 'bg-amber-400', text: 'text-amber-700' },
  emise: { label: 'Émise', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  annulee: { label: 'Annulée', dot: 'bg-slate-300', text: 'text-slate-400' },
}

// The Ordonnances tab: ONE list of every prescription for this patient, newest first —
// written here ("Rédigée") or in consultation ("Consultation": since migration
// 20260923050000 a completed consultation creates a real, issued ordonnance linked by
// encounter_id). `derived` are consultation prescriptions rebuilt from encounter notes;
// only those without a real ordonnance yet are shown (read-only), which covers the time
// before that migration is applied and nothing after.
export function OrdonnancesPanel({ ordonnances, derived = [], loading, canEmit, busyId, onEmit, onCancel, onDuplicate, onPrint, onNew, imported }) {
  const [showCancelled, setShowCancelled] = useState(false)

  const linkedEncounters = new Set(ordonnances.map((o) => o.encounter_id).filter(Boolean))
  const entries = [
    ...ordonnances.map((o) => ({ kind: 'real', key: o.id, date: o.date_prescription || o.created_at, ord: o })),
    ...derived
      .filter((d) => !linkedEncounters.has(String(d.id).replace(/^ord-/, '')))
      .map((d) => ({ kind: 'derived', key: d.id, date: d.date, ord: d })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const cancelledCount = entries.filter((e) => e.kind === 'real' && e.ord.statut === 'annulee').length
  const visible = showCancelled ? entries : entries.filter((e) => !(e.kind === 'real' && e.ord.statut === 'annulee'))
  const activeCount = entries.length - cancelledCount

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-slate-500">
          {loading ? 'Chargement…' : `${activeCount} ordonnance${activeCount > 1 ? 's' : ''}`}
          {cancelledCount > 0 && (
            <>
              <span className="mx-1.5 text-slate-300">·</span>
              <button type="button" onClick={() => setShowCancelled((v) => !v)} className="font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">
                {showCancelled ? 'Masquer les annulées' : `Voir les annulées (${cancelledCount})`}
              </button>
            </>
          )}
        </p>
        {onNew && (
          <Button variant="accentOutline" size="sm" onClick={onNew}>
            <FilePlus className="h-4 w-4" /> Nouvelle ordonnance
          </Button>
        )}
      </div>

      {loading ? null : visible.length === 0 ? (
        <Notice icon={Pill} title="Aucune ordonnance" description="Les ordonnances rédigées ici ou en consultation apparaîtront dans cette liste." />
      ) : (
        <div className="space-y-3">
          {visible.map((e) => (
            <OrdonnanceCard
              key={e.key}
              entry={e}
              canEmit={canEmit}
              busy={busyId === e.key}
              onEmit={onEmit}
              onCancel={onCancel}
              onDuplicate={onDuplicate}
              onPrint={onPrint}
            />
          ))}
        </div>
      )}

      {imported}
    </div>
  )
}

function OrdonnanceCard({ entry, canEmit, busy, onEmit, onCancel, onDuplicate, onPrint }) {
  const isReal = entry.kind === 'real'
  const ord = entry.ord
  const lines = isReal ? ord.lignes || [] : ord.lines || []
  const statut = isReal ? ORDO_STATUT[ord.statut] || ORDO_STATUT.brouillon : null
  const isCancelled = isReal && ord.statut === 'annulee'
  const isDraft = isReal && ord.statut === 'brouillon'
  const isEmitted = isReal && ord.statut === 'emise'
  const fromConsultation = isReal ? Boolean(ord.encounter_id) : true
  const doctor = isReal && ord.doctor?.nom_complet ? formatDoctorLabel(ord.doctor.nom_complet) : ''
  const motif = !isReal && hasMotif(ord.motif) ? ord.motif : ''

  return (
    <article className={`rounded-xl border bg-white px-5 py-3.5 shadow-sm ${isCancelled ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 pb-2.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h3 className={`text-[14px] font-semibold text-slate-900 ${isCancelled ? 'line-through decoration-slate-300' : ''}`}>
            {fmtDate(entry.date)}
          </h3>
          <span className="text-[12.5px] text-slate-500">
            {[fromConsultation ? 'Consultation' : 'Rédigée', doctor, motif && `Motif : ${motif}`].filter(Boolean).join(' · ')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {statut ? (
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${statut.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statut.dot}`} />
              {statut.label}
            </span>
          ) : (
            <span className="text-[12px] text-slate-400">Lecture seule</span>
          )}

          {isReal && (
            <>
              <span className="hidden h-3.5 w-px bg-slate-200 sm:inline-block" aria-hidden />
              <div className="flex items-center gap-0.5">
                {isEmitted && <Button size="xs" variant="ghost" onClick={() => onPrint(ord)}><Printer className="h-3.5 w-3.5" /> Imprimer</Button>}
                {isDraft && canEmit && <Button size="xs" variant="accentOutline" disabled={busy} onClick={() => onEmit(ord)}><Send className="h-3.5 w-3.5" /> Émettre</Button>}
                <Button size="xs" variant="ghost" disabled={busy} onClick={() => onDuplicate(ord)}><Copy className="h-3.5 w-3.5" /> Dupliquer</Button>
                {!isCancelled && canEmit && <Button size="xs" variant="ghost" className="!text-slate-500 hover:!bg-red-50 hover:!text-red-600" disabled={busy} onClick={() => onCancel(ord)}><XCircle className="h-3.5 w-3.5" /> Annuler</Button>}
              </div>
            </>
          )}
        </div>
      </div>

      <ol className="mt-3 space-y-2">
        {lines.map((line, i) => (
          <li key={line.id || i} className="flex gap-3">
            <span className="w-4 shrink-0 pt-px text-right text-[12px] font-semibold tabular-nums text-slate-300">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-slate-800">{line.medicament}</p>
              <p className="text-[12.5px] text-slate-500">{[line.posologie, line.duree].filter(Boolean).join(' · ') || 'Posologie non précisée'}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  )
}

// Imagerie has no storage yet (no table for images / reports). This is a feature gap, so the tab
// says so instead of showing a bare empty state. Imaging exams that were prescribed are listed under Examens.
export function ImagerieList({ extra }) {
  return (
    <Frame title="Imagerie" subtitle="Radiologie, échographies, IRM et scanners">
      {extra || (
        <Notice
          icon={ImageIcon}
          title="Pas encore disponible"
          description="Le stockage des images et comptes rendus d'imagerie n'est pas encore en place. Les examens d'imagerie prescrits en consultation figurent dans l'onglet Examens."
        />
      )}
    </Frame>
  )
}

const FACTURE_TONE = {
  payee: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500', amount: 'text-slate-900' },
  partielle: { icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-400', amount: 'text-slate-900' },
  en_attente: { icon: 'bg-slate-100 text-slate-500', bar: 'bg-blue-500', amount: 'text-slate-900' },
  en_retard: { icon: 'bg-red-50 text-red-600', bar: 'bg-red-500', amount: 'text-red-600' },
}
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// One facture = one quiet row: what, when, how much, and where it stands.
function FactureRow({ facture: f, onOpen }) {
  const reste = Math.max(0, f.montant - f.paye)
  const tone = FACTURE_TONE[f.statut] || FACTURE_TONE.en_attente
  const lignes = f.lignes?.length ? f.lignes : [{ libelle: 'Consultation' }]
  const actes = lignes.length > 1 ? `${lignes[0].libelle} +${lignes.length - 1}` : lignes[0].libelle
  const partial = f.paye > 0 && reste > 0
  return (
    <button type="button" onClick={() => onOpen(f)}
      className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-slate-300 hover:shadow-[0_6px_20px_-8px_rgba(15,23,42,0.15)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
        <FileCheck2 className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[13.5px] font-semibold tracking-tight text-slate-900">{f.numero}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{shortDate(f.dateEmission)} · {actes}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[16px] font-bold tabular-nums ${tone.amount}`}>{mad(f.montant)}</p>
        <div className="mt-1 flex justify-end">
          {reste > 0 && f.statut !== 'en_retard' && f.statut !== 'en_attente'
            ? <span className="text-[11.5px] font-semibold text-amber-600">Reste {mad(reste)}</span>
            : <StatutBadge statut={f.statut} />}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-slate-500" />
      {partial && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-slate-100" aria-hidden>
          <span className={`block h-full ${tone.bar}`} style={{ width: `${Math.round((f.paye / f.montant) * 100)}%` }} />
        </span>
      )}
    </button>
  )
}

export function FacturesList({ items, loading, error, extra, onOpenFacturation, onSelectFacture }) {
  const sorted = [...items].sort((a, b) => String(b.dateEmission || '').localeCompare(String(a.dateEmission || '')))
  const due = items.reduce((s, f) => s + Math.max(0, f.montant - f.paye), 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-slate-900">Factures</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            {loading || error ? 'Facturation de ce patient dans le cabinet'
              : `${items.length} facture${items.length > 1 ? 's' : ''}`}
            {!loading && !error && items.length > 0 && (
              due > 0
                ? <> · <span className="font-semibold text-amber-600">{mad(due)} à encaisser</span></>
                : <> · <span className="font-semibold text-emerald-600">tout est réglé</span></>
            )}
          </p>
        </div>
        {onOpenFacturation && (
          <Button variant="ghost" size="sm" onClick={onOpenFacturation} className="group !text-slate-500">
            Module Facturation <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        )}
      </div>
      {loading ? <Notice icon={Activity} title="Chargement…" description="Récupération des factures." />
        : error ? <Notice icon={Info} title="Factures indisponibles" description="Réessayez dans un instant." />
        : items.length === 0 && !extra ? <Notice icon={FileCheck2} title="Aucune facture" description="Les consultations facturées à ce patient apparaîtront ici." />
        : (
          <div className="space-y-2">
            {sorted.map((f) => <FactureRow key={f.id} facture={f} onOpen={(x) => onSelectFacture?.(x)} />)}
            {extra}
          </div>
        )}
    </div>
  )
}
