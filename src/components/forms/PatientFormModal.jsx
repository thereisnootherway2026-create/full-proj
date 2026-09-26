import { useEffect, useState } from 'react'
import { AlertCircle, Building2, CalendarDays, Check, ChevronRight, Droplets, Loader2, Mail, MapPin, Phone, ScanLine, ShieldCheck, UserRound } from 'lucide-react'
import Modal from '../common/Modal'
import IdentityScanDialog from './IdentityScanDialog'
import { useAppContext } from '../../context/AppContext'
import { useCabinetId } from '../../hooks/useCabinetId'
import { createPatient, updatePatient as apiUpdatePatient, getPatientClinicalFields } from '../../lib/api'

const initialForm = { prenom: '', nom: '', cin: '', sexe: '', date_naissance: '', telephone: '', email: '', adresse: '', ville: '', groupe_sanguin: '', allergies: '', antecedents: '', mutuelle: '' }
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

function Label({ children, required, hint }) {
  return <div className="mb-1.5 flex items-baseline justify-between gap-2"><span className="text-[13px] font-semibold text-slate-700">{children}{required && <span className="ml-1 text-rose-500">*</span>}</span>{hint && <span className="text-[11px] text-slate-400">{hint}</span>}</div>
}

function Section({ icon: Icon, tone, title, subtitle, children }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="mb-4 flex items-center gap-2.5"><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span><div><h3 className="text-sm font-bold text-slate-800">{title}</h3><p className="text-xs text-slate-500">{subtitle}</p></div></div>{children}</section>
}

function QuickSuggestions({ options, onSelect }) {
  return <div className="mt-2 flex flex-wrap gap-1.5">{options.map((option) => <button key={option} type="button" onClick={() => onSelect(option)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">{option}</button>)}</div>
}

function PatientFormModal({ open, onClose, patient, onSuccess }) {
  const { notify, cabinetId: contextCabinetId, canonicalRole } = useAppContext()
  const { cabinetId: hookCabinetId, loading: cabinetLoading } = useCabinetId()
  const cabinetId = contextCabinetId || hookCabinetId
  const canSeeClinical = canonicalRole === 'doctor' || canonicalRole === 'admin'
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [initialSnapshot, setInitialSnapshot] = useState(JSON.stringify(initialForm))
  const [showScan, setShowScan] = useState(false)

  useEffect(() => {
    if (patient) {
      setForm({ ...initialForm, prenom: patient.prenom || '', nom: patient.nom || '', cin: patient.cin || '', sexe: patient.sexe || '', date_naissance: patient.date_naissance || '', telephone: patient.telephone || '', email: patient.email || '', adresse: patient.adresse || '', ville: patient.ville || '', mutuelle: patient.mutuelle || '' })
      if (canSeeClinical && patient.id) getPatientClinicalFields(patient.id).then((clinical) => {
        if (clinical) setForm((current) => {
          const next = { ...current, groupe_sanguin: clinical.groupe_sanguin || '', allergies: clinical.allergies || '', antecedents: clinical.antecedents || '' }
          setInitialSnapshot(JSON.stringify(next))
          return next
        })
      }).catch(() => {})
    } else setForm(initialForm)
    setError(''); setFieldErrors({})
    setInitialSnapshot(JSON.stringify(patient ? { ...initialForm, prenom: patient.prenom || '', nom: patient.nom || '', cin: patient.cin || '', sexe: patient.sexe || '', date_naissance: patient.date_naissance || '', telephone: patient.telephone || '', email: patient.email || '', adresse: patient.adresse || '', ville: patient.ville || '', mutuelle: patient.mutuelle || '' } : initialForm))
  }, [patient, open, canSeeClinical])

  const value = (key, next) => { setForm((current) => ({ ...current, [key]: next })); setFieldErrors((current) => ({ ...current, [key]: null })); setError('') }
  const hasUnsavedChanges = JSON.stringify(form) !== initialSnapshot
  const input = (key) => `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 ${fieldErrors[key] ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'}`
  const invalid = (key) => fieldErrors[key] && <p className="mt-1.5 text-xs font-medium text-rose-600">{fieldErrors[key]}</p>

  const validate = () => {
    const errors = {}
    if (!form.prenom.trim()) errors.prenom = 'Le prénom est requis.'
    if (!form.nom.trim()) errors.nom = 'Le nom est requis.'
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Saisissez une adresse e-mail valide.'
    if (form.telephone.trim() && form.telephone.replace(/[^\d]/g, '').length < 8) errors.telephone = 'Saisissez un numéro de téléphone valide.'
    if (form.date_naissance && new Date(`${form.date_naissance}T00:00:00`) > new Date()) errors.date_naissance = 'La date ne peut pas être dans le futur.'
    setFieldErrors(errors); return !Object.keys(errors).length
  }

  const submit = async (event) => {
    event.preventDefault(); setError('')
    if (!validate()) return
    if (cabinetLoading) return setError('Chargement du profil en cours, veuillez réessayer dans un instant.')
    if (!cabinetId) return setError('Cabinet introuvable sur ce compte. Contactez un administrateur.')
    setLoading(true)
    const payload = { prenom: form.prenom.trim(), nom: form.nom.trim(), cin: form.cin.trim() || null, sexe: form.sexe || null, date_naissance: form.date_naissance || null, telephone: form.telephone.trim() || null, email: form.email.trim() || null, adresse: form.adresse.trim() || null, ville: form.ville.trim() || null, groupe_sanguin: form.groupe_sanguin || null, allergies: form.allergies.trim() || null, antecedents: form.antecedents.trim() || null, mutuelle: form.mutuelle.trim() || null }
    try {
      if (patient) await apiUpdatePatient(patient.id, payload); else await createPatient({ ...payload, cabinet_id: cabinetId })
      notify({ title: 'Dossier enregistré', description: patient ? 'Les informations du patient ont été mises à jour.' : 'Le nouveau dossier patient est prêt.' })
      onSuccess?.(); onClose()
    } catch (err) { console.error('PatientForm submit error:', err); setError(err.message || "Une erreur est survenue lors de l'enregistrement.") } finally { setLoading(false) }
  }

  const dismiss = () => {
    if (loading) return
    if (hasUnsavedChanges && !window.confirm('Des informations non enregistrées seront perdues. Fermer quand même ?')) return
    onClose()
  }

  // Fields confirmed on the review screen of the identity scan. Only what the user kept is applied.
  const applyScan = (detected) => {
    setForm((current) => ({ ...current, ...detected }))
    setShowScan(false)
    notify({ title: 'Document lu', description: 'Les informations confirmées ont été ajoutées au formulaire.' })
  }

  const title = patient ? 'Modifier le dossier patient' : 'Nouveau patient'
  return <>
  <Modal open={open} onClose={dismiss} title={title} description={patient ? 'Actualisez les informations administratives et médicales du dossier.' : 'Créez un dossier fiable en quelques informations essentielles.'} width="max-w-4xl">
    <form onSubmit={submit}>
      <div className="space-y-5">
        <Section icon={UserRound} tone="bg-blue-100 text-blue-700" title="Identité" subtitle="Pour retrouver le patient sans ambiguïté."><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label><Label required>Prénom</Label><input autoFocus autoComplete="given-name" value={form.prenom} onChange={(e) => value('prenom', e.target.value)} className={input('prenom')} placeholder="ex. Salma" />{invalid('prenom')}</label>
          <label><Label required>Nom</Label><input autoComplete="family-name" value={form.nom} onChange={(e) => value('nom', e.target.value)} className={input('nom')} placeholder="ex. El Mansouri" />{invalid('nom')}</label>
          <label><Label hint="Optionnel">CIN <button type="button" onClick={() => setShowScan(true)} className="ml-2 inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"><ScanLine className="h-3 w-3" />Scanner</button></Label><input id="patient-cin" value={form.cin} onChange={(e) => value('cin', e.target.value.toUpperCase())} className={input('cin')} placeholder="ex. AB123456" /></label>
          <label><Label>Date de naissance</Label><div className="relative"><CalendarDays className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input id="patient-date_naissance" type="date" value={form.date_naissance} onChange={(e) => value('date_naissance', e.target.value)} className={`${input('date_naissance')} pl-10`} /></div>{invalid('date_naissance')}</label>
        </div><div className="mt-4"><Label>Sexe</Label><div className="flex flex-wrap gap-2">{[['homme', 'Homme'], ['femme', 'Femme']].map(([sex, label]) => <button key={sex} type="button" onClick={() => value('sexe', form.sexe === sex ? '' : sex)} className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition ${form.sexe === sex ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>{form.sexe === sex && <Check className="mr-1.5 inline h-3.5 w-3.5" />}{label}</button>)}</div></div></Section>
        <Section icon={Phone} tone="bg-emerald-100 text-emerald-700" title="Coordonnées" subtitle="Au moins un moyen de contact est recommandé."><div className="grid gap-4 md:grid-cols-2">
          <label><Label>Téléphone</Label><div className="relative"><Phone className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input id="patient-telephone" type="tel" autoComplete="tel" value={form.telephone} onChange={(e) => value('telephone', e.target.value)} className={`${input('telephone')} pl-10`} placeholder="ex. 06 12 34 56 78" /></div>{invalid('telephone')}</label>
          <label><Label>Email</Label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input type="email" autoComplete="email" value={form.email} onChange={(e) => value('email', e.target.value)} className={`${input('email')} pl-10`} placeholder="ex. salma@email.com" /></div>{invalid('email')}</label>
          <label><Label>Adresse</Label><div className="relative"><MapPin className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input autoComplete="street-address" value={form.adresse} onChange={(e) => value('adresse', e.target.value)} className={`${input('adresse')} pl-10`} placeholder="Rue, quartier…" /></div></label>
          <label><Label>Ville</Label><input autoComplete="address-level2" value={form.ville} onChange={(e) => value('ville', e.target.value)} className={input('ville')} placeholder="ex. Casablanca" /></label>
        </div></Section>
        <Section icon={Building2} tone="bg-violet-100 text-violet-700" title="Couverture & informations médicales" subtitle="À compléter si elles sont disponibles."><div className="grid gap-4 md:grid-cols-2">
          <label><Label>Mutuelle / assurance</Label><input value={form.mutuelle} onChange={(e) => value('mutuelle', e.target.value)} className={input('mutuelle')} placeholder="ex. CNOPS, AXA…" /><QuickSuggestions options={['CNOPS', 'CNSS', 'AXA', 'RMA', 'Wafa Assurance']} onSelect={(option) => value('mutuelle', option)} /></label>
          {canSeeClinical && <label><Label>Groupe sanguin</Label><div className="relative"><Droplets className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-rose-400" /><select value={form.groupe_sanguin} onChange={(e) => value('groupe_sanguin', e.target.value)} className={`${input('groupe_sanguin')} appearance-none pl-10`}><option value="">Non renseigné</option>{BLOOD_TYPES.map((group) => <option key={group}>{group}</option>)}</select></div></label>}
          {canSeeClinical && <><label className="md:col-span-2"><Label hint="Visible uniquement par le corps médical">Allergies</Label><textarea rows={2} value={form.allergies} onChange={(e) => value('allergies', e.target.value)} className={`${input('allergies')} resize-y`} placeholder="Aucune allergie connue, ou précisez…" /><QuickSuggestions options={['Aucune allergie connue', 'Pénicilline', 'AINS', 'Latex']} onSelect={(option) => value('allergies', option)} /></label><label className="md:col-span-2"><Label hint="Visible uniquement par le corps médical">Antécédents médicaux</Label><textarea rows={2} value={form.antecedents} onChange={(e) => value('antecedents', e.target.value)} className={`${input('antecedents')} resize-y`} placeholder="Informations pertinentes pour la prise en charge…" /><QuickSuggestions options={['Aucun antécédent connu', 'HTA', 'Diabète', 'Asthme']} onSelect={(option) => value('antecedents', option)} /></label></>}
        </div>{canSeeClinical && <div className="mt-4 flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2.5 text-xs text-violet-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Les informations médicales sont protégées et réservées aux utilisateurs autorisés.</div>}</Section>
      </div>
      {error && <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur"><p className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">{hasUnsavedChanges ? <><AlertCircle className="h-4 w-4 text-amber-500" />Modifications non enregistrées</> : <><ShieldCheck className="h-4 w-4 text-emerald-600" />Données protégées</>}</p><div className="ml-auto flex gap-3"><button type="button" onClick={dismiss} disabled={loading} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">Annuler</button><button type="submit" disabled={loading || cabinetLoading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60">{loading || cabinetLoading ? <><Loader2 className="h-4 w-4 animate-spin" />{cabinetLoading ? 'Chargement…' : 'Enregistrement…'}</> : <>{patient ? 'Enregistrer les modifications' : 'Créer le dossier'}<ChevronRight className="h-4 w-4" /></>}</button></div></div>
    </form>
  </Modal>
  {showScan && <IdentityScanDialog onApply={applyScan} onClose={() => setShowScan(false)} />}
  </>
}

export default PatientFormModal
