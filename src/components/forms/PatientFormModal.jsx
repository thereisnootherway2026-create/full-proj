import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../common/Modal'
import { useAppContext } from '../../context/AppContext'
import { useCabinetId } from '../../hooks/useCabinetId'
import { createPatient, updatePatient as apiUpdatePatient, getPatientClinicalFields } from '../../lib/api'

const initialForm = {
  prenom: '',
  nom: '',
  sexe: '',
  date_naissance: '',
  telephone: '',
  email: '',
  adresse: '',
  ville: '',
  groupe_sanguin: '',
  allergies: '',
  antecedents: '',
  mutuelle: '',
}

const GROUPE_SANGUIN_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

function PatientFormModal({ open, onClose, patient, onSuccess }) {
  const { notify, cabinetId: ctxCabinetId, canonicalRole } = useAppContext()
  const { cabinetId: hookCabinetId, loading: cabinetLoading } = useCabinetId()
  // Use whichever source resolves first
  const cabinetId = ctxCabinetId || hookCabinetId
  // Clinical-adjacent fields are doctor/admin only — enforced server-side
  // (mm_get_patient_clinical / protect_patient_clinical_fields trigger),
  // this just keeps the shared form from showing a secretary fields she
  // can neither read nor write.
  const canSeeClinical = canonicalRole === 'doctor' || canonicalRole === 'admin'

  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (patient) {
      setForm({
        prenom: patient.prenom || '',
        nom: patient.nom || '',
        sexe: patient.sexe || '',
        date_naissance: patient.date_naissance || '',
        telephone: patient.telephone || '',
        email: patient.email || '',
        adresse: patient.adresse || '',
        ville: patient.ville || '',
        groupe_sanguin: '',
        allergies: '',
        antecedents: '',
        mutuelle: patient.mutuelle || '',
      })
      if (canSeeClinical && patient.id) {
        getPatientClinicalFields(patient.id)
          .then((clinical) => {
            if (!clinical) return
            setForm((current) => ({
              ...current,
              groupe_sanguin: clinical.groupe_sanguin || '',
              allergies: clinical.allergies || '',
              antecedents: clinical.antecedents || '',
            }))
          })
          .catch(() => {})
      }
    } else {
      setForm(initialForm)
    }
    setError(null)
  }, [patient, open, canSeeClinical])

  const title = patient ? 'Modifier le patient' : 'Nouveau patient'

  const handleChange = (key, value) => setForm((c) => ({ ...c, [key]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)

    if (!form.prenom.trim()) { setError('Le prénom est requis.'); return }
    if (!form.nom.trim()) { setError('Le nom est requis.'); return }

    if (cabinetLoading) {
      setError('Chargement du profil en cours, veuillez réessayer dans un instant.')
      return
    }
    if (!cabinetId) {
      setError("Cabinet introuvable sur ce compte. Contactez un administrateur.")
      return
    }

    setLoading(true)
    try {
      const payload = {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        sexe: form.sexe || null,
        date_naissance: form.date_naissance || null,
        telephone: form.telephone.trim() || null,
        email: form.email.trim() || null,
        adresse: form.adresse.trim() || null,
        ville: form.ville.trim() || null,
        groupe_sanguin: form.groupe_sanguin || null,
        allergies: form.allergies.trim() || null,
        antecedents: form.antecedents.trim() || null,
        mutuelle: form.mutuelle.trim() || null,
      }

      if (patient) {
        await apiUpdatePatient(patient.id, payload)
      } else {
        await createPatient({ ...payload, cabinet_id: cabinetId })
      }
      notify({ title: 'Succès', description: patient ? 'Patient modifié.' : 'Patient créé.' })
      onSuccess?.()
      onClose()
    } catch (err) {
      console.error('PatientForm submit error:', err)
      setError(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300 text-base text-slate-800'
  const labelClass = 'mb-2 block text-base font-medium text-slate-700'

  return (
    <Modal open={open} onClose={onClose} title={title} description="Complétez les informations du dossier patient." width="max-w-3xl">
      <form className="space-y-6" onSubmit={handleSubmit}>

        {/* ── SECTION 1 — IDENTITÉ ── */}
        <fieldset>
          <legend className="mb-4 text-base font-semibold uppercase tracking-widest text-blue-700/80">Identité</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Prénom <span className="text-rose-500">*</span></span>
              <input type="text" value={form.prenom} onChange={(e) => handleChange('prenom', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Nom <span className="text-rose-500">*</span></span>
              <input type="text" value={form.nom} onChange={(e) => handleChange('nom', e.target.value)} className={inputClass} />
            </label>

            {/* Sexe — radio */}
            <div className="block">
              <span className={labelClass}>Sexe</span>
              <div className="flex gap-4 pt-1">
                {[['homme', 'Homme'], ['femme', 'Femme']].map(([val, lbl]) => (
                  <label key={val} className="inline-flex cursor-pointer items-center gap-2 text-base text-slate-700">
                    <input
                      type="radio"
                      name="sexe"
                      value={val}
                      checked={form.sexe === val}
                      onChange={(e) => handleChange('sexe', e.target.value)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className={labelClass}>Date de naissance</span>
              <input type="date" value={form.date_naissance} onChange={(e) => handleChange('date_naissance', e.target.value)} className={inputClass} />
            </label>
            {/* Section Contact below */}
          </div>
        </fieldset>

        {/* ── SECTION 2 — CONTACT ── */}
        <fieldset>
          <legend className="mb-4 text-base font-semibold uppercase tracking-widest text-blue-700/80">Contact</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Téléphone</span>
              <input type="text" value={form.telephone} onChange={(e) => handleChange('telephone', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Email</span>
              <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Adresse</span>
              <input type="text" value={form.adresse} onChange={(e) => handleChange('adresse', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Ville</span>
              <input type="text" value={form.ville} onChange={(e) => handleChange('ville', e.target.value)} className={inputClass} />
            </label>
          </div>
        </fieldset>

        {/* ── SECTION 3 — MÉDICAL ── */}
        <fieldset>
          <legend className="mb-4 text-base font-semibold uppercase tracking-widest text-blue-700/80">Médical</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {canSeeClinical && (
              <label className="block">
                <span className={labelClass}>Groupe sanguin</span>
                <select value={form.groupe_sanguin} onChange={(e) => handleChange('groupe_sanguin', e.target.value)} className={inputClass}>
                  <option value="">— Sélectionner —</option>
                  {GROUPE_SANGUIN_OPTIONS.map((gs) => (
                    <option key={gs} value={gs}>{gs}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className={labelClass}>Mutuelle / Assurance</span>
              <input type="text" value={form.mutuelle} onChange={(e) => handleChange('mutuelle', e.target.value)} className={inputClass} />
            </label>
            {canSeeClinical && (
              <>
                <label className="block md:col-span-2">
                  <span className={labelClass}>Allergies</span>
                  <textarea rows={2} value={form.allergies} onChange={(e) => handleChange('allergies', e.target.value)} className={inputClass + ' resize-none'} />
                </label>
                <label className="block md:col-span-2">
                  <span className={labelClass}>Antécédents médicaux</span>
                  <textarea rows={2} value={form.antecedents} onChange={(e) => handleChange('antecedents', e.target.value)} className={inputClass + ' resize-none'} />
                </label>
              </>
            )}
          </div>
        </fieldset>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            ⚠️ {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="interactive rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-medium text-slate-700">Annuler</button>
          <button type="submit" disabled={loading || cabinetLoading} className="interactive inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-base font-medium text-white disabled:opacity-70">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...</> : cabinetLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</> : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default PatientFormModal
