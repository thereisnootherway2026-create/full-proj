import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2, Plus, Settings2, Trash2 } from 'lucide-react'
import Modal from '../common/Modal'
import Button from '../common/Button'
import IconButton from '../common/IconButton'
import { useAppContext } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { createOrdonnance, emitOrdonnance } from '../../lib/api'
import { MedicamentField, PosologieField, PresetChips, allergyMatch, allergyTokens } from '../consultation/PlanBlocks'
import { DUREE_PRESETS } from '../../data/medicationSuggestions'
import { readMedicationUsage, recordMedicationUse, usageScope } from '../../lib/medicationUsage'
import { formatDoctorLabel, stripDoctorTitle } from '../../lib/professionalName'
import { buildLetterhead, clinicToday, letterheadGaps } from '../../lib/letterhead'

const isImageDataUrl = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v)
const inputCls = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300'
const newRow = () => ({ id: crypto.randomUUID?.() || String(Math.random()), nom: '', posologie: '', duree: '' })
const blankForm = (doctorId) => ({ doctorId, date: clinicToday(), medicaments: [newRow()], instructions: '', signe: true })

// The letterhead exactly as it will be printed. Read-only: it is configured once in
// Paramètres → Profil & Cabinet, never retyped per ordonnance.
function LetterheadPreview({ header, onEdit }) {
  const gaps = letterheadGaps(header)
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60">
      <div className="flex items-start gap-4 px-4 py-3.5">
        {isImageDataUrl(header.logo) && <img src={header.logo} alt="" className="h-12 w-auto max-w-[88px] shrink-0 object-contain" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold uppercase tracking-wide text-slate-900">{header.medecin ? formatDoctorLabel(header.medecin) : 'Médecin prescripteur'}</p>
          <p className="text-[12.5px] text-slate-600">{header.specialite}</p>
        </div>
        <div className="hidden min-w-0 max-w-[45%] text-right text-[12px] leading-snug text-slate-600 sm:block">
          {header.adresse && <p className="truncate">{header.adresse}</p>}
          {header.telephone && <p className="font-semibold">Tél : {header.telephone}</p>}
          {header.ville && <p>{header.ville}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2">
        {gaps.length > 0
          ? <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> À compléter : {gaps.join(', ')}</p>
          : <p className="text-[12px] text-slate-500">En-tête issu de vos paramètres</p>}
        <Button variant="link" onClick={onEdit} className="!text-[12.5px]"><Settings2 className="mr-1 inline h-3.5 w-3.5" />Modifier dans Paramètres</Button>
      </div>
    </div>
  )
}

// Creation-only: opened from a patient's dossier, so the patient is already known (no picker).
// Secretaries can save a draft; only a doctor/admin can also emit it (the legal, signed document).
// Keep it mounted and drive it with `open`, so Modal can animate both the opening and the closing.
function OrdonnanceFormModal({ open, onClose, onSuccess, patient, patientId, encounterId }) {
  const { notify, profile, user, cabinet, doctors, canonicalRole } = useAppContext()
  const navigate = useNavigate()
  const isDoctor = canonicalRole === 'doctor'
  const canEmit = isDoctor || canonicalRole === 'admin'
  const scope = usageScope(profile?.clinic_id || profile?.cabinet_id, profile?.id)
  const usage = useMemo(() => readMedicationUsage(scope), [scope])
  const tokens = useMemo(() => allergyTokens(patient?.allergies), [patient?.allergies])

  const [form, setForm] = useState(() => blankForm(''))
  const [pending, setPending] = useState(null) // 'draft' | 'emit' | null
  const [error, setError] = useState(null)
  const [pickedSpecialite, setPickedSpecialite] = useState(null)

  // Reset before paint on every opening, so the entering animation never shows the last form.
  useLayoutEffect(() => {
    if (!open) return
    setForm(blankForm(isDoctor ? profile?.id || '' : ''))
    setError(null)
    setPending(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const prescriber = isDoctor ? profile : doctors?.find((d) => d.id === form.doctorId)

  // A secretary prescribing for a colleague: that doctor's own specialty (the doctors list
  // doesn't carry it). Tolerant: an older database without the column just uses the default.
  useEffect(() => {
    setPickedSpecialite(null)
    if (isDoctor || !form.doctorId) return undefined
    let live = true
    supabase.from('profiles').select('specialite').eq('id', form.doctorId).maybeSingle()
      .then(({ data }) => { if (live) setPickedSpecialite(data?.specialite || null) })
    return () => { live = false }
  }, [isDoctor, form.doctorId])

  const header = buildLetterhead({ doctor: pickedSpecialite ? { ...prescriber, specialite: pickedSpecialite } : prescriber, user, cabinet })

  const setMed = (id, key, value) => setForm((c) => ({ ...c, medicaments: c.medicaments.map((m) => (m.id === id ? { ...m, [key]: value } : m)) }))
  const pickMedication = (id, med) => {
    recordMedicationUse(scope, med.nom)
    setForm((c) => ({ ...c, medicaments: c.medicaments.map((m) => (m.id === id ? { ...m, nom: med.nom, duree: m.duree.trim() || med.duree } : m)) }))
  }
  const addMed = () => setForm((c) => ({ ...c, medicaments: [...c.medicaments, newRow()] }))
  const removeMed = (id) => setForm((c) => ({ ...c, medicaments: c.medicaments.length > 1 ? c.medicaments.filter((m) => m.id !== id) : [newRow()] }))

  const goToSettings = () => { onClose(); navigate('/parametres') }

  const submit = async (emit) => {
    setError(null)
    if (!form.doctorId) { setError('Sélectionnez le médecin prescripteur.'); return }
    const incomplete = form.medicaments.findIndex((m) => !m.nom.trim() && (m.posologie.trim() || m.duree.trim()))
    if (incomplete >= 0) { setError(`Ligne ${incomplete + 1} : le nom du médicament est manquant.`); return }
    const lignes = form.medicaments.filter((m) => m.nom.trim()).map(({ nom, posologie, duree }) => ({ medicament: nom.trim(), posologie: posologie.trim(), duree: duree.trim() }))
    if (!lignes.length) { setError('Ajoutez au moins un médicament.'); return }
    if (!form.date) { setError('La date de prescription est requise.'); return }

    setPending(emit ? 'emit' : 'draft')
    try {
      const id = await createOrdonnance({
        patientId,
        doctorId: form.doctorId,
        encounterId: encounterId ?? null,
        datePrescription: form.date,
        // Snapshot of the letterhead at prescription time: a later change in Paramètres
        // must not alter an ordonnance that was already issued.
        entete: {
          nomMedecin: header.medecin,
          specialite: header.specialite,
          adresse: header.adresse,
          telephone: header.telephone,
          ville: header.ville,
          signe: form.signe,
        },
        instructions: form.instructions.trim(),
        lignes,
      })
      if (emit) await emitOrdonnance(id)
      notify({ title: emit ? 'Ordonnance émise' : 'Brouillon enregistré', description: emit ? 'L’ordonnance est signée et prête à imprimer.' : 'Vous pourrez l’émettre depuis le dossier.', tone: 'success' })
      onSuccess?.()
      onClose()
    } catch (err) {
      console.error('Ordonnance submit error:', err)
      setError(err.message || "Erreur lors de l'enregistrement de l'ordonnance.")
    } finally {
      setPending(null)
    }
  }

  const surname = stripDoctorTitle(header.medecin).split(' ').pop()
  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={!!pending}>Annuler</Button>
      <Button variant="secondary" onClick={() => submit(false)} disabled={!!pending}>
        {pending === 'draft' ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</> : 'Enregistrer en brouillon'}
      </Button>
      {canEmit && (
        <Button variant="accent" onClick={() => submit(true)} disabled={!!pending}>
          {pending === 'emit' ? <><Loader2 className="h-4 w-4 animate-spin" /> Émission…</> : "Émettre l'ordonnance"}
        </Button>
      )}
    </div>
  )

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title="Nouvelle ordonnance"
      description={patient ? `Pour ${`${patient.prenom || ''} ${patient.nom || ''}`.trim()}` : undefined} width="max-w-3xl" footer={footer}>
      <div className="space-y-5 py-1">
        <LetterheadPreview header={header} onEdit={goToSettings} />

        <div className={`grid gap-4 ${isDoctor ? 'sm:grid-cols-[220px]' : 'sm:grid-cols-2'}`}>
          {!isDoctor && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">Médecin prescripteur *</span>
              <select value={form.doctorId} onChange={(e) => setForm((c) => ({ ...c, doctorId: e.target.value }))} className={inputCls}>
                <option value="">— Sélectionner —</option>
                {(doctors || []).map((d) => <option key={d.id} value={d.id}>{formatDoctorLabel(d.nom_complet)}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Date de prescription</span>
            <input type="date" value={form.date} max={clinicToday()} onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))} className={inputCls} />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-slate-800">Médicaments <span className="font-serif italic text-slate-400">Rx</span></span>
            <span className="text-[12px] text-slate-400">{form.medicaments.filter((m) => m.nom.trim()).length} / 30</span>
          </div>
          <div className="space-y-2.5">
            {form.medicaments.map((med, index) => {
              const hit = allergyMatch(med.nom, tokens)
              return (
                <div key={med.id}>
                  <div className="flex items-start gap-2">
                    <span className="w-5 shrink-0 pt-2.5 text-center text-[12px] font-bold text-slate-400">{index + 1}.</span>
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[2fr_2fr_1fr]">
                      <MedicamentField value={med.nom} onChange={(v) => setMed(med.id, 'nom', v)} onPick={(m) => pickMedication(med.id, m)} usage={usage} />
                      <PosologieField value={med.posologie} onChange={(v) => setMed(med.id, 'posologie', v)} />
                      <div>
                        <input value={med.duree} onChange={(e) => setMed(med.id, 'duree', e.target.value)} placeholder="Durée" aria-label={`Durée ${index + 1}`} className={inputCls} />
                        {!med.duree.trim() && med.nom.trim() && <PresetChips options={DUREE_PRESETS.slice(0, 4)} onPick={(v) => setMed(med.id, 'duree', v)} />}
                      </div>
                    </div>
                    <IconButton size="lg" label={`Retirer le médicament ${index + 1}`} className="hover:!text-red-600" onClick={() => removeMed(med.id)}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                  {hit && <p role="alert" className="ml-7 mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Allergie déclarée : « {hit} ». Vérifiez avant de prescrire.</p>}
                </div>
              )
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={addMed} disabled={form.medicaments.length >= 30} className="ml-5 mt-2 !text-blue-600 hover:!bg-blue-50">
            <Plus className="h-4 w-4" /> Ajouter un médicament
          </Button>
        </div>

        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-700">Instructions supplémentaires <span className="font-normal text-slate-400">(facultatif)</span></span>
          <textarea value={form.instructions} maxLength={1000} onChange={(e) => setForm((c) => ({ ...c, instructions: e.target.value }))} rows={2}
            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="À prendre au milieu du repas, etc." />
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
          <input type="checkbox" checked={form.signe} onChange={(e) => setForm((c) => ({ ...c, signe: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
          <span className="text-[13.5px] font-medium text-slate-700">Apposer la signature imprimée du médecin</span>
          {form.signe && surname && <span className="ml-auto font-[cursive] text-[17px] text-slate-800">{formatDoctorLabel(surname)}</span>}
        </label>

        {error && <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</p>}
      </div>
    </Modal>
  )
}

export default OrdonnanceFormModal
