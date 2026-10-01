import { memo, useState, useEffect } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { normalizeNote } from '../../lib/encounterService'
import { resolveClinicalStatus, splitClinicalList } from '../../lib/clinical/clinicalStatus'
import { computeIMC } from '../../lib/vitals/validateVital'
import { useAppContext } from '../../context/AppContext'
import ClinicalListEditor from '../clinical/ClinicalListEditor'
import Button from '../common/Button'

const formatConsultDate = (d) => {
  if (!d) return ''
  const date = new Date(d)
  const isCurrentYear = date.getFullYear() === new Date().getFullYear()
  return isCurrentYear
    ? date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const fmtDate = (d, withYear = false) => (d
  ? new Date(d).toLocaleDateString('fr-FR', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' })
  : '')

function PriorConsultationDrawer({ enc, patientName, onClose }) {
  const n = normalizeNote(enc?.note)
  const v = n.vitals || {}
  const treatments = (n.traitements || []).filter((r) => r.medicament?.trim())

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const filledVitals = [
    (v.bloodPressureSystolic || v.bloodPressureDiastolic) && { label: 'TA', val: `${v.bloodPressureSystolic || '—'}/${v.bloodPressureDiastolic || '—'} mmHg` },
    v.heartRate && { label: 'FC', val: `${v.heartRate} bpm` },
    v.temperature && { label: 'T°', val: `${v.temperature} °C` },
    v.oxygenSaturation && { label: 'SpO₂', val: `${v.oxygenSaturation} %` },
    v.respiratoryRate && { label: 'FR', val: `${v.respiratoryRate} /min` },
    v.weight && { label: 'Poids', val: `${v.weight} kg` },
    v.height && { label: 'Taille', val: `${v.height} cm` },
    v.bloodSugar && { label: 'Glycémie', val: `${v.bloodSugar} g/L` },
    (v.painScore !== undefined && v.painScore !== '' && v.painScore !== null) && { label: 'Douleur', val: `${v.painScore}/10` },
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="dialog" aria-modal="true" aria-label="Détail de la consultation">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full z-10 border-l border-slate-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-5 px-2 rounded-full bg-blue-100 text-blue-700 text-[10.5px] font-bold uppercase tracking-wider flex items-center">
                Consultation antérieure
              </span>
              {Boolean(n.ordonnance && treatments.length > 0) && (
                <span className="h-5 px-2 rounded-full bg-emerald-100 text-emerald-700 text-[10.5px] font-bold flex items-center gap-1">
                  📄 Ordonnance
                </span>
              )}
            </div>
            <h2 className="text-[16px] font-bold text-slate-900 mt-1">
              {formatConsultDate(enc.completed_at || enc.started_at)} — {n.motif || 'Consultation'}
            </h2>
            <p className="text-[12px] text-slate-500">
              Dossier de <span className="capitalize font-semibold text-slate-700">{patientName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Fermer le volet"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body (Read-only sections) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-[13px]">
          {/* Section 1: Motif & symptômes */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[11px]">1</span>
              <h3 className="font-bold text-slate-800 text-[13.5px]">Motif & symptômes</h3>
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Motif principal</span>
              <p className="font-semibold text-slate-900">{n.motif || '—'}</p>
            </div>
            {(n.depuis || n.evolution) && (
              <div className="flex gap-2 pt-1">
                {n.depuis && (
                  <span className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 font-medium">
                    Depuis {n.depuis.toLowerCase()}
                  </span>
                )}
                {n.evolution && (
                  <span className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 font-medium">
                    {n.evolution}
                  </span>
                )}
              </div>
            )}
            {n.histoire?.trim() && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Histoire / observations</span>
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{n.histoire.trim()}</p>
              </div>
            )}
          </div>

          {/* Section 2: Examen clinique */}
          {(filledVitals.length > 0 || n.examen?.trim()) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[11px]">2</span>
                <h3 className="font-bold text-slate-800 text-[13.5px]">Examen clinique</h3>
              </div>
              {filledVitals.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {filledVitals.map((item) => (
                    <div key={item.label} className="rounded bg-white border border-slate-200 px-2.5 py-1 text-[12px]">
                      <span className="text-slate-400 font-semibold">{item.label}&nbsp;: </span>
                      <span className="font-bold text-slate-900">{item.val}</span>
                    </div>
                  ))}
                </div>
              )}
              {n.examen?.trim() && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Observations d'examen</span>
                  <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{n.examen.trim()}</p>
                </div>
              )}
            </div>
          )}

          {/* Section 3: Évaluation & conduite */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[11px]">3</span>
              <h3 className="font-bold text-slate-800 text-[13.5px]">Évaluation & conduite</h3>
            </div>
            {n.diagnostics?.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Diagnostic(s)</span>
                <div className="flex flex-wrap gap-1.5">
                  {n.diagnostics.map((d) => (
                    <span key={d} className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11.5px] font-semibold text-blue-900">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {n.conduite?.trim() && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Conduite à tenir</span>
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{n.conduite.trim()}</p>
              </div>
            )}
            {treatments.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Traitements prescrits</span>
                <ul className="space-y-1.5">
                  {treatments.map((t, idx) => (
                    <li key={idx} className="rounded-lg bg-white border border-slate-200 p-2 leading-tight">
                      <span className="font-bold text-slate-900">{t.medicament}</span>
                      {(t.posologie || t.duree) && (
                        <span className="text-slate-500 block text-[11.5px] mt-0.5">
                          {[t.posologie, t.duree].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {n.examens?.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Examens prescrits</span>
                <p className="text-slate-800">{n.examens.join(', ')}</p>
              </div>
            )}
            {n.followUpDate && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Prochain contrôle</span>
                <p className="text-slate-900 font-semibold">
                  {new Date(`${n.followUpDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {n.followUpNotes && (
                  <p className="text-slate-500 text-[11.5px] mt-0.5">{n.followUpNotes}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end bg-slate-50/70">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  )
}

export default memo(function PatientContextSidebar({
  patient,
  patientId,
  age,
  meds = [],
  medsState,
  vitalsRows = [],
  vitalsState,
  encounters = [],
  encountersState,
  className = '',
}) {
  const { canonicalRole } = useAppContext()
  const clinical = canonicalRole === 'doctor' || canonicalRole === 'admin'

  const [alertsOpen, setAlertsOpen] = useState(true)
  const [encountersOpen, setEncountersOpen] = useState(true)
  const [vitalsOpen, setVitalsOpen] = useState(false)
  const [editingSection, setEditingSection] = useState(null)
  const [selectedEncounter, setSelectedEncounter] = useState(null)

  // Doctor session confirmation state for Allergies, Antecedents, Medications
  const [sessionConfirmed, setSessionConfirmed] = useState({
    allergies: false,
    antecedents: false,
    medications: false,
  })

  const confirmRow = (key) => {
    setSessionConfirmed((prev) => ({ ...prev, [key]: true }))
  }

  const confirmAll = () => {
    setSessionConfirmed({
      allergies: true,
      antecedents: true,
      medications: true,
    })
  }

  const unconfirmedCount = ['allergies', 'antecedents', 'medications'].filter((k) => !sessionConfirmed[k]).length
  const isProfileVerified = unconfirmedCount === 0

  const pid = patientId || patient?.id
  const name = `${patient?.prenom || ''} ${patient?.nom || ''}`.trim() || 'Patient'
  const initials = `${patient?.prenom?.[0] || ''}${patient?.nom?.[0] || ''}`.toUpperCase() || 'P'
  const ageDisplay = age ? `${age} ans` : (patient?.age ? `${patient.age} ans` : '')
  const sexeDisplay = patient?.sexe === 'F' ? 'Femme' : patient?.sexe === 'M' ? 'Homme' : (patient?.sexe || '')
  const identityLine = [ageDisplay, sexeDisplay].filter(Boolean).join(' · ')

  // Allergies status
  const allergiesStatus = resolveClinicalStatus(patient?.allergies_status, patient?.allergies)
  const allergiesConfirmed = allergiesStatus !== 'not_specified'
  const allergiesText = allergiesStatus === 'listed'
    ? (splitClinicalList(patient?.allergies).join(', ') || patient?.allergies)
    : allergiesStatus === 'none'
      ? 'Aucune allergie connue'
      : 'Non renseigné'

  // Antecedents status
  const antecedentsStatus = resolveClinicalStatus(patient?.antecedents_status, patient?.antecedents)
  const antecedentsConfirmed = antecedentsStatus !== 'not_specified'
  const antecedentsText = antecedentsStatus === 'listed'
    ? (splitClinicalList(patient?.antecedents).join(', ') || patient?.antecedents)
    : antecedentsStatus === 'none'
      ? 'Aucun antécédent particulier'
      : 'Non renseigné'

  // Medications status
  const medNames = meds.map((m) => m.medication_name).filter(Boolean)
  const medicationsStatus = resolveClinicalStatus(patient?.medications_status, medNames)
  const medicationsConfirmed = medicationsStatus !== 'not_specified'
  const medicationsText = medicationsStatus === 'listed'
    ? (medNames.join(', ') || 'Traitements en cours')
    : medicationsStatus === 'none'
      ? 'Aucun traitement régulier'
      : 'Non renseigné'

  // Last known vitals
  const lastVitals = vitalsRows[0] || null
  const bmi = lastVitals ? computeIMC(lastVitals.weight, lastVitals.height) : null

  const toggleEditing = (kind) => {
    setEditingSection((prev) => (prev === kind ? null : kind))
  }

  return (
    <aside aria-label="Contexte patient" className={`flex flex-col bg-white border-r border-slate-200/90 ${className}`}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {/* 1. PATIENT CARD */}
        <div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-3.5">
              {/* Circular initials avatar (lavender) */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[#7C3AED] font-bold text-[16px] shadow-2xs">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[16px] font-bold text-slate-900 tracking-tight leading-snug capitalize">
                  {name}
                </h3>
                {identityLine && (
                  <p className="text-[12.5px] font-medium text-slate-500 mt-0.5">
                    {identityLine}
                  </p>
                )}
              </div>
            </div>
          </div>
          {/* Tiny gray caption under the card */}
          <p className="mt-1 text-center text-[10.5px] text-slate-400">
            Données fictives · démonstration
          </p>
        </div>

        {/* 2. CONDENSED "À VÉRIFIER" BLOCK / "PROFIL VÉRIFIÉ" BLOCK */}
        <div
          className={`rounded-2xl border p-3.5 shadow-xs transition-colors ${
            isProfileVerified
              ? 'border-slate-200/90 bg-slate-50/80'
              : 'border-amber-200/90 bg-[#FEFCE8]'
          }`}
        >
          <div
            className={`flex items-center justify-between pb-2 border-b ${
              isProfileVerified ? 'border-slate-200/70' : 'border-amber-200/70'
            }`}
          >
            {isProfileVerified ? (
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-slate-700 tracking-wide">
                <Check className="h-4 w-4 text-emerald-600 stroke-[2.5]" />
                Profil vérifié ✓
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                À vérifier avant de prescrire ({unconfirmedCount})
              </span>
            )}

            <div className="flex items-center gap-1.5">
              {!isProfileVerified && (
                <button
                  type="button"
                  onClick={confirmAll}
                  className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline px-1 py-0.5 rounded transition-colors"
                  title="Confirmer tout pour cette consultation"
                >
                  Tout confirmer
                </button>
              )}
              <button
                type="button"
                onClick={() => setAlertsOpen(!alertsOpen)}
                className={`p-0.5 rounded transition-colors ${
                  isProfileVerified ? 'text-slate-400 hover:text-slate-600' : 'text-amber-700 hover:text-amber-900'
                }`}
                aria-label={alertsOpen ? 'Replier alertes' : 'Déplier alertes'}
              >
                {alertsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {alertsOpen && (
            <div className={`divide-y pt-1 ${isProfileVerified ? 'divide-slate-200/60' : 'divide-amber-200/60'}`}>
              {/* ROW 1: ALLERGIES */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => toggleEditing('allergies')}
                  className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors flex items-center justify-between gap-3 ${
                    editingSection === 'allergies'
                      ? 'bg-amber-100/70 font-medium'
                      : isProfileVerified ? 'hover:bg-slate-100/70' : 'hover:bg-amber-100/40'
                  }`}
                  title="Cliquer pour vérifier ou modifier les allergies"
                >
                  <span className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Allergies
                  </span>
                  <span className={`flex-1 truncate text-[12px] font-medium ${allergiesConfirmed ? 'text-slate-800' : 'text-slate-500 italic'}`}>
                    {allergiesText}
                  </span>
                  {sessionConfirmed.allergies && (
                    <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5] shrink-0" />
                  )}
                </button>

                {clinical && editingSection === 'allergies' && (
                  <div className="mt-2 pt-2 border-t border-slate-200/70">
                    <ClinicalListEditor
                      kind="allergies"
                      patientId={pid}
                      cabinetId={patient?.cabinet_id}
                      status={patient?.allergies_status}
                      text={patient?.allergies || ''}
                      verifiedAt={patient?.clinical_verified_at}
                      isOpen={true}
                      onToggleOpen={(open) => {
                        if (!open) {
                          setEditingSection(null)
                          confirmRow('allergies')
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              {/* ROW 2: ANTÉCÉDENTS */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => toggleEditing('antecedents')}
                  className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors flex items-center justify-between gap-3 ${
                    editingSection === 'antecedents'
                      ? 'bg-amber-100/70 font-medium'
                      : isProfileVerified ? 'hover:bg-slate-100/70' : 'hover:bg-amber-100/40'
                  }`}
                  title="Cliquer pour vérifier ou modifier les antécédents"
                >
                  <span className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Antécédents
                  </span>
                  <span className={`flex-1 truncate text-[12px] font-medium ${antecedentsConfirmed ? 'text-slate-800' : 'text-slate-500 italic'}`}>
                    {antecedentsText}
                  </span>
                  {sessionConfirmed.antecedents && (
                    <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5] shrink-0" />
                  )}
                </button>

                {clinical && editingSection === 'antecedents' && (
                  <div className="mt-2 pt-2 border-t border-slate-200/70">
                    <ClinicalListEditor
                      kind="antecedents"
                      patientId={pid}
                      cabinetId={patient?.cabinet_id}
                      status={patient?.antecedents_status}
                      text={patient?.antecedents || ''}
                      verifiedAt={patient?.clinical_verified_at}
                      isOpen={true}
                      onToggleOpen={(open) => {
                        if (!open) {
                          setEditingSection(null)
                          confirmRow('antecedents')
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              {/* ROW 3: TRAITEMENTS */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => toggleEditing('medications')}
                  className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors flex items-center justify-between gap-3 ${
                    editingSection === 'medications'
                      ? 'bg-amber-100/70 font-medium'
                      : isProfileVerified ? 'hover:bg-slate-100/70' : 'hover:bg-amber-100/40'
                  }`}
                  title="Cliquer pour vérifier ou modifier les traitements en cours"
                >
                  <span className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Traitements
                  </span>
                  <span className={`flex-1 truncate text-[12px] font-medium ${medicationsConfirmed ? 'text-slate-800' : 'text-slate-500 italic'}`}>
                    {medicationsText}
                  </span>
                  {sessionConfirmed.medications && (
                    <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5] shrink-0" />
                  )}
                </button>

                {clinical && editingSection === 'medications' && (
                  <div className="mt-2 pt-2 border-t border-slate-200/70">
                    <ClinicalListEditor
                      kind="medications"
                      patientId={pid}
                      cabinetId={patient?.cabinet_id}
                      status={patient?.medications_status}
                      meds={meds}
                      verifiedAt={patient?.clinical_verified_at}
                      isOpen={true}
                      onToggleOpen={(open) => {
                        if (!open) {
                          setEditingSection(null)
                          confirmRow('medications')
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. CONSULTATIONS PRÉCÉDENTES LIST (One line per entry, max-height 200px, 4px scrollbar, drawer on click) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-700">
              Consultations précédentes
            </span>
            <button
              type="button"
              onClick={() => setEncountersOpen(!encountersOpen)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
              aria-label={encountersOpen ? 'Replier Consultations précédentes' : 'Déplier Consultations précédentes'}
            >
              {encountersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {encountersOpen && (
            <div className="mt-2">
              {encounters.length > 0 ? (
                <div className="max-h-[200px] overflow-y-auto pr-1 space-y-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300">
                  {encounters.map((e) => {
                    const n = normalizeNote(e.note)
                    const dateStr = formatConsultDate(e.completed_at || e.started_at)
                    const motifStr = n.motif || 'Consultation'
                    const hasOrdo = Boolean(n.ordonnance && n.traitements?.some((t) => t.medicament?.trim()))

                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedEncounter(e)}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-between gap-1.5 group text-[12px] border border-transparent hover:border-slate-200"
                        title="Ouvrir cette consultation en lecture seule"
                      >
                        <span className="truncate text-slate-700 group-hover:text-blue-700 font-medium">
                          <span className="font-semibold text-slate-800">{dateStr}</span>
                          <span className="text-slate-400 mx-1.5">—</span>
                          <span>{motifStr}</span>
                        </span>
                        {hasOrdo && (
                          <span className="inline-flex items-center text-[11px] shrink-0" title="Ordonnance délivrée">
                            📄
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-slate-400 italic py-1">
                  {encountersState === 'loading' ? 'Chargement de l\'historique…' : 'Aucune consultation antérieure enregistrée.'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 4. CONSTANTES SNAPSHOT */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-700">
              Constantes snapshot
            </span>
            <button
              type="button"
              onClick={() => setVitalsOpen(!vitalsOpen)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
              aria-label={vitalsOpen ? 'Replier Constantes snapshot' : 'Déplier Constantes snapshot'}
            >
              {vitalsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {vitalsOpen && (
            <div className="mt-2">
              {lastVitals ? (
                <div className="space-y-2 text-[12px] bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                  <p className="text-[11px] font-medium text-slate-400">
                    Mesure du {fmtDate(lastVitals.date_mesure, true)}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-slate-700">
                    {lastVitals.blood_pressure && (
                      <div><span className="text-slate-400">TA :</span> <b className="text-slate-900">{lastVitals.blood_pressure}</b> mmHg</div>
                    )}
                    {lastVitals.heart_rate && (
                      <div><span className="text-slate-400">FC :</span> <b className="text-slate-900">{lastVitals.heart_rate}</b> bpm</div>
                    )}
                    {lastVitals.temperature && (
                      <div><span className="text-slate-400">T° :</span> <b className="text-slate-900">{lastVitals.temperature}</b> °C</div>
                    )}
                    {lastVitals.spo2 && (
                      <div><span className="text-slate-400">SpO₂ :</span> <b className="text-slate-900">{lastVitals.spo2}</b> %</div>
                    )}
                    {lastVitals.weight && (
                      <div><span className="text-slate-400">Poids :</span> <b className="text-slate-900">{lastVitals.weight}</b> kg</div>
                    )}
                    {bmi && (
                      <div><span className="text-slate-400">IMC :</span> <b className="text-slate-900">{bmi}</b></div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-slate-400 italic py-1">
                  {vitalsState === 'loading' ? 'Chargement des constantes…' : 'Aucune constante enregistrée précédemment.'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Read-Only Right-Side Consultation Drawer */}
      {selectedEncounter && (
        <PriorConsultationDrawer
          enc={selectedEncounter}
          patientName={name}
          onClose={() => setSelectedEncounter(null)}
        />
      )}
    </aside>
  )
})
