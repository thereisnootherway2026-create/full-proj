import {
  Building2,
  Users,
  FileText,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  Loader2,
  LogOut,
  Check,
  AlertCircle,
  Phone,
  MapPin,
  Stethoscope,
  ShieldAlert,
  Info,
  FolderOpen,
  ClipboardList,
  ImagePlus,
  Trash2
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'
import SecretaryManagementSection from '../../components/dashboard/SecretaryManagementSection'
import ActesCatalogueSection from '../../components/dashboard/ActesCatalogueSection'
import { useAppContext } from '../../context/AppContext'
import PinLock from '../../components/common/PinLock'
import { supabase } from '../../lib/supabase'
import { logoFileToDataUrl, LOGO_ACCEPT } from '../../lib/cabinetLogo'
import { SPECIALITES } from '../../data/specialites'
import { InsuranceProviderSettings } from '../../components/facturation/InsuranceProviderSettings'
import { doctorSpecialite } from '../../lib/letterhead'

function SettingsPage() {
  const reduceMotion = useReducedMotion()
  const {
    user,
    currentUser,
    cabinet,
    cabinetId,
    notificationPrefs,
    setNotificationPrefs,
    notify,
    profile,
    refreshProfile,
    logout,
    role,
    canonicalRole,
    devRoleOverride,
    setDevRoleOverride
  } = useAppContext()

  const isDoctor = (canonicalRole || role) === 'doctor' || (canonicalRole || role) === 'docteur' || devRoleOverride === 'doctor'
  // The acte catalogue is managed by the doctor or an admin (also enforced server-side by upsert_acte).
  const canManageActes = isDoctor || (canonicalRole || role) === 'admin'
  const [activeTab, setActiveTab] = useState('profil')
  const [loggingOut, setLoggingOut] = useState(false)

  // ── 1. Profil & Cabinet state ──
  const [doctorName, setDoctorName] = useState('')
  const [specialite, setSpecialite] = useState('')
  const [cabinetNom, setCabinetNom] = useState('')
  const [cabinetTel, setCabinetTel] = useState('')
  const [cabinetVille, setCabinetVille] = useState('')
  const [cabinetAdresse, setCabinetAdresse] = useState('')
  const [cabinetLogo, setCabinetLogo] = useState(null)
  const [logoDirty, setLogoDirty] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState(null)

  const [savingProfile, setSavingProfile] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Populate from DB profile & cabinet
  useEffect(() => {
    if (profile) {
      setDoctorName(profile.nom_complet || '')
      setSpecialite(doctorSpecialite(profile, user) || '')
    }
    if (cabinet) {
      setCabinetNom(cabinet.nom || '')
      setCabinetTel(cabinet.telephone || '')
      setCabinetVille(cabinet.ville || '')
      setCabinetAdresse(cabinet.adresse || '')
      setCabinetLogo(cabinet.logo_data_url || null)
      setLogoDirty(false)
    }
  }, [profile, cabinet, user])

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setLogoError(null)
    setLogoBusy(true)
    try {
      setCabinetLogo(await logoFileToDataUrl(file))
      setLogoDirty(true)
    } catch (err) {
      setLogoError(err.message)
    } finally {
      setLogoBusy(false)
    }
  }

  const removeLogo = () => {
    setCabinetLogo(null)
    setLogoDirty(true)
    setLogoError(null)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    setSaveSuccess(false)
    setSaveError(null)

    try {
      // 1. Update public.cabinets if cabinetId exists (normalize empty address/tel/ville to null)
      const targetCabinetId = cabinetId || cabinet?.id || profile?.cabinet_id
      if (targetCabinetId) {
        const { error: cabErr } = await supabase
          .from('cabinets')
          .update({
            nom: cabinetNom.trim(),
            telephone: cabinetTel.trim() || null,
            ville: cabinetVille.trim() || null,
            adresse: cabinetAdresse.trim() || null,
            // Only sent when changed, so saving the other fields never depends on the logo column.
            ...(logoDirty ? { logo_data_url: cabinetLogo || null } : {})
          })
          .eq('id', targetCabinetId)

        if (cabErr) throw cabErr
      }

      // 2. Update public.profiles (doctor's full name)
      if (user?.id) {
        const { error: profErr } = await supabase
          .from('profiles')
          .update({
            nom_complet: doctorName.trim(),
            // Only sent when changed, so saving the rest never depends on this column.
            ...(specialite.trim() !== (profile?.specialite || '') ? { specialite: specialite.trim() || null } : {})
          })
          .eq('id', user.id)

        if (profErr) throw profErr
      }

      // 3. Refresh in-memory AppContext state
      if (refreshProfile) {
        await refreshProfile()
      }

      setSaveSuccess(true)
      notify({
        title: 'Profil mis à jour',
        description: 'Les informations du cabinet ont été enregistrées avec succès.',
        variant: 'success'
      })
      setTimeout(() => setSaveSuccess(false), 3500)
    } catch (err) {
      console.error('Error saving cabinet profile:', err)
      setSaveError(err.message || 'Impossible de sauvegarder les modifications.')
      notify({
        title: 'Erreur',
        description: err.message || 'Échec de la sauvegarde.',
        tone: 'error'
      })
    } finally {
      setSavingProfile(false)
    }
  }

  // ── 2. PIN Security state ──
  const effectiveUserId = currentUser?.id || user?.id || 'local'
  const [pinEnabled, setPinEnabled] = useState(
    localStorage.getItem(`pin_enabled_${effectiveUserId}`) === 'true'
  )
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [pinError, setPinError] = useState('')

  const togglePin = (enabled) => {
    if (!enabled) {
      localStorage.removeItem(`pin_enabled_${effectiveUserId}`)
      localStorage.removeItem(`pin_hash_${effectiveUserId}`)
      setPinEnabled(false)
      setNewPin('')
      setConfirmPin('')
      notify({ title: 'Succès', description: 'Code PIN désactivé sur cet appareil.', variant: 'success' })
    } else {
      setPinEnabled(true)
    }
  }

  const savePin = () => {
    setPinError('')
    if (newPin.length !== 4) {
      setPinError('Le PIN doit contenir exactement 4 chiffres.')
      return
    }
    if (!/^\d{4}$/.test(newPin)) {
      setPinError('Le PIN doit contenir uniquement des chiffres.')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('Les deux codes saisis ne correspondent pas.')
      return
    }

    const pinHash = btoa(`${effectiveUserId}:${newPin}:macromedica`)
    localStorage.setItem(`pin_enabled_${effectiveUserId}`, 'true')
    localStorage.setItem(`pin_hash_${effectiveUserId}`, pinHash)

    setPinSaved(true)
    setNewPin('')
    setConfirmPin('')
    notify({ title: 'Succès', description: 'Code PIN enregistré avec succès sur cet appareil.', variant: 'success' })
    setTimeout(() => setPinSaved(false), 3000)
  }

  // ── Logout ──
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch (err) {
      notify({ title: 'Erreur', description: err.message || 'Impossible de se déconnecter.', tone: 'error' })
      setLoggingOut(false)
    }
  }

  // ── Settings Navigation Structure ──
  const TABS = [
    { id: 'profil', label: 'Profil & Cabinet', desc: 'Vos informations professionnelles', icon: Building2 },
    ...(isDoctor ? [{ id: 'equipe', label: 'Équipe & Accès', desc: 'Gestion des utilisateurs', icon: Users }] : []),
    ...(canManageActes ? [{ id: 'actes', label: 'Actes', desc: 'Catalogue et tarifs', icon: ClipboardList }] : []),
    { id: 'securite', label: 'Sécurité & PIN', desc: 'Authentification et sécurité', icon: ShieldCheck },
    { id: 'preferences', label: 'Préférences locales', desc: 'Langue, fuseau horaire, etc.', icon: SlidersHorizontal },
    { id: 'documents', label: 'Documents', desc: 'Ordonnances et documents', icon: FileText },
    ...(import.meta.env.DEV ? [{ id: 'dev', label: 'Dev Tools', desc: 'Mode développeur', icon: Wrench }] : []),
  ]

  return (
    <PinLock>
      <div className="pt-6 space-y-6 max-w-[1400px] mx-auto pb-16">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black text-slate-900 leading-tight">Paramètres</h1>
            <p className="mt-0.5 text-[15px] font-medium text-slate-500">
              Configuration de votre cabinet et de votre espace de travail
            </p>
          </div>

          <div className="flex items-center gap-3">
            {saveSuccess && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-xl animate-in fade-in">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Modifications enregistrées</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 transition-all hover:bg-rose-100 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" strokeWidth={2.5} />}
              <span>{loggingOut ? 'Déconnexion...' : 'Se déconnecter'}</span>
            </button>
          </div>
        </div>

        {/* Horizontal Settings Navigation - matching Facturation tab bar */}
        <div className="flex items-center gap-6 border-b border-slate-200 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 whitespace-nowrap cursor-pointer group",
                  isActive ? "text-blue-600 font-semibold" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                  )}
                  strokeWidth={isActive ? 2.2 : 2}
                />
                <span>{tab.label}</span>
                {isActive && (
                  // One shared underline that glides between tabs
                  <motion.span
                    layoutId="settings-tab-underline"
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content fades and lifts in (the outgoing tab fades out first) - matching Facturation */}
        <div className="mt-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
              className="w-full grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
            >
          
          {/* ── LEFT/CENTER: FORM / CONFIGURATION ── */}
          <div className="xl:col-span-8 space-y-6">
              
              {/* TAB 1: PROFIL & CABINET */}
              {activeTab === 'profil' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
                  <div className="border-b border-slate-100 pb-4 mb-6">
                    <h2 className="text-lg font-bold text-slate-900">Profil & Cabinet</h2>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                      Vos informations professionnelles et celles de votre cabinet.
                    </p>
                  </div>

                  {saveSuccess && (
                    <div className="mb-5 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-semibold text-emerald-800 animate-in fade-in">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Modifications enregistrées avec succès.</span>
                    </div>
                  )}

                  {saveError && (
                    <div className="mb-5 flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm font-semibold text-rose-800 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{saveError}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    {/* Row 1: Practitioner Name & Cabinet Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                          Nom du praticien
                        </label>
                        <input
                          type="text"
                          value={doctorName}
                          onChange={(e) => setDoctorName(e.target.value)}
                          placeholder="Dr. Prénom Nom"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                          Nom commercial / Raison sociale du cabinet
                        </label>
                        <input
                          type="text"
                          value={cabinetNom}
                          onChange={(e) => setCabinetNom(e.target.value)}
                          placeholder="Ex: Cabinet Médical Al Hikma"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                        />
                      </div>
                    </div>

                    {/* Specialty: printed under the doctor's name on ordonnances and documents */}
                    <div>
                      <label htmlFor="settings-specialite" className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                        Spécialité
                      </label>
                      <select
                        id="settings-specialite"
                        value={specialite}
                        onChange={(e) => setSpecialite(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                      >
                        <option value="">— Non renseignée (Médecin généraliste) —</option>
                        {[...new Set([specialite, ...SPECIALITES].filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Row 2: Phone & City */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                          Téléphone
                        </label>
                        <input
                          type="tel"
                          value={cabinetTel}
                          onChange={(e) => setCabinetTel(e.target.value)}
                          placeholder="05 00 00 00 00"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                          Ville
                        </label>
                        <input
                          type="text"
                          value={cabinetVille}
                          onChange={(e) => setCabinetVille(e.target.value)}
                          placeholder="Ex: Rabat, Casablanca..."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                        />
                      </div>
                    </div>

                    {/* Row 3: Address (Optional, full width) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                          Adresse
                        </label>
                        <span className="text-[11px] font-medium text-slate-400">Facultatif</span>
                      </div>
                      <input
                        type="text"
                        value={cabinetAdresse}
                        onChange={(e) => setCabinetAdresse(e.target.value)}
                        placeholder="Numéro, rue, quartier, étage..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>

                    {/* Row 4: Logo (Optional) — printed at the top of ordonnances */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                          Logo du cabinet
                        </label>
                        <span className="text-[11px] font-medium text-slate-400">Facultatif</span>
                      </div>
                      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                        <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white">
                          {cabinetLogo ? (
                            <img src={cabinetLogo} alt="Logo du cabinet" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <ImagePlus className="h-5 w-5 text-slate-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-500">
                            Imprimé en haut des ordonnances. PNG, JPG, WebP ou SVG — un fond transparent rend mieux.
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className={cn(
                              'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50',
                              logoBusy && 'pointer-events-none opacity-60'
                            )}>
                              {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                              {cabinetLogo ? 'Changer' : 'Choisir un logo'}
                              <input type="file" accept={LOGO_ACCEPT} className="sr-only" onChange={handleLogoFile} disabled={logoBusy} />
                            </label>
                            {cabinetLogo && (
                              <button
                                type="button"
                                onClick={removeLogo}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Retirer
                              </button>
                            )}
                            {logoDirty && <span className="text-[11px] font-medium text-amber-600">Non enregistré</span>}
                          </div>
                          {logoError && <p className="mt-1.5 text-xs font-medium text-rose-600">{logoError}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Clean Save Footer */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                      <div>
                        {saveSuccess ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            Données synchronisées
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">
                            Tous les changements sont persistés en temps réel
                          </span>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 cursor-pointer"
                      >
                        {savingProfile ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Enregistrement...</span>
                          </>
                        ) : (
                          <span>Enregistrer les modifications</span>
                        )}
                      </button>
                    </div>
                  </form>
                  {canManageActes && <InsuranceProviderSettings />}
                </div>
              )}

              {/* TAB 2: ÉQUIPE & ACCÈS */}
              {activeTab === 'equipe' && isDoctor && (
                <div className="space-y-4">
                  <SecretaryManagementSection
                    cabinetId={cabinetId}
                    notify={notify}
                    userRole={canonicalRole || role}
                  />
                </div>
              )}

              {/* TAB: ACTES (catalogue & tarifs) */}
              {activeTab === 'actes' && canManageActes && (
                <ActesCatalogueSection clinicId={cabinetId} canEdit={canManageActes} notify={notify} />
              )}

              {/* TAB 3: SÉCURITÉ */}
              {activeTab === 'securite' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-lg font-bold text-slate-900">Sécurité</h2>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                      Authentification et sécurité de vos sessions de travail.
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${pinEnabled ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                        <ShieldAlert className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Verrouillage par code PIN</h4>
                        <p className="text-xs font-medium text-slate-500">
                          {pinEnabled ? 'Actif sur ce navigateur' : 'Désactivé'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => togglePin(!pinEnabled)}
                      className="relative h-7 w-12 rounded-full transition-colors outline-none cursor-pointer"
                      style={{
                        background: pinEnabled ? '#2563eb' : '#cbd5e1',
                        transition: 'background 0.2s',
                        flexShrink: 0
                      }}
                    >
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: 'white',
                          position: 'absolute',
                          top: '3.5px',
                          left: pinEnabled ? '24px' : '4px',
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }}
                      />
                    </button>
                  </div>

                  {pinEnabled && (
                    <div className="pt-2 border-t border-slate-100 space-y-4 animate-in fade-in">
                      {pinError && (
                        <div className="text-xs font-bold text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
                          {pinError}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                            Nouveau code PIN (4 chiffres)
                          </label>
                          <input
                            type="password"
                            maxLength={4}
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                            placeholder="••••"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-center font-mono text-xl tracking-[0.5em] outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                            Confirmer le code PIN
                          </label>
                          <input
                            type="password"
                            maxLength={4}
                            value={confirmPin}
                            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                            placeholder="••••"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-center font-mono text-xl tracking-[0.5em] outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={savePin}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow cursor-pointer"
                      >
                        {pinSaved ? 'Code PIN Enregistré ✓' : 'Enregistrer le nouveau PIN'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: PRÉFÉRENCES LOCALES */}
              {activeTab === 'preferences' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-lg font-bold text-slate-900">Préférences locales</h2>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                      Langue, fuseau horaire et paramètres d&apos;affichage pour cet appareil.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Langue de l&apos;interface
                      </span>
                      <p className="text-sm font-bold text-slate-900">Français (FR)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Standard MacroMedica</p>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Fuseau horaire
                      </span>
                      <p className="text-sm font-bold text-slate-900">Africa/Casablanca (GMT+1)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Heure locale marocaine</p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Options d&apos;affichage du poste</p>
                    {[
                      ['browser', 'Alertes du navigateur', 'Affiche une notification système lors des arrivées de patients.'],
                      ['reminders', 'Rappels de rendez-vous à l’écran', 'Active les repères visuels pour les consultations imminentes.'],
                      ['email', 'Notifications de session', 'Conserve l’historique local des alertes pour cet utilisateur.'],
                    ].map(([key, label, desc]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 transition-colors cursor-pointer"
                      >
                        <div className="pr-4">
                          <p className="text-sm font-semibold text-slate-800">{label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(notificationPrefs[key])}
                          onChange={(e) =>
                            setNotificationPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: DOCUMENTS */}
              {activeTab === 'documents' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-lg font-bold text-slate-900">Documents</h2>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                      Ordonnances et documents imprimés.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <Info className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        Les documents sont imprimés directement depuis le navigateur. Les coordonnées configurées dans l&apos;onglet <strong>Profil & Cabinet</strong> sont automatiquement réutilisées en en-tête.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="p-4 rounded-xl border border-slate-200 bg-white">
                        <span className="text-xs font-bold text-slate-800 block mb-1">Ordonnances Médicales</span>
                        <p className="text-xs text-slate-500">Format A4 / A5 avec en-tête praticien, posologie et signature.</p>
                      </div>
                      <div className="p-4 rounded-xl border border-slate-200 bg-white">
                        <span className="text-xs font-bold text-slate-800 block mb-1">Reçus de Paiement</span>
                        <p className="text-xs text-slate-500">Justificatif patient avec détail de l&apos;acte et montant encaissé.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: DEV TOOLS (DEV ONLY) */}
              {activeTab === 'dev' && import.meta.env.DEV && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wide bg-amber-100 text-amber-800 rounded">
                        Dev Only
                      </span>
                      <h2 className="text-lg font-bold text-slate-900">Mode développeur</h2>
                    </div>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                      Simulateur de permissions et de rôles pour l&apos;interface locale.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                      Rôle actif simulé
                    </label>
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setDevRoleOverride('doctor')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          (devRoleOverride || canonicalRole) === 'doctor'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        <Stethoscope size={16} />
                        Médecin
                      </button>
                      <button
                        type="button"
                        onClick={() => setDevRoleOverride('secretary')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          (devRoleOverride || canonicalRole) === 'secretary'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        <FolderOpen size={16} />
                        Secrétaire
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed font-medium">
                    Ce switcher s&apos;exécute en mémoire et n&apos;affecte pas la base de données distante.{' '}
                    <button
                      type="button"
                      onClick={() => setDevRoleOverride(null)}
                      className="underline font-bold hover:text-amber-900 ml-1 cursor-pointer"
                    >
                      Réinitialiser au rôle réel
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* ── RIGHT: CONTEXTUAL PREVIEW / SUMMARY PANEL ── */}
            <aside className="xl:col-span-5 2xl:col-span-4 space-y-4">
              
              {/* CONTEXT FOR PROFIL */}
              {activeTab === 'profil' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      Aperçu En-tête Médical
                    </span>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                      Direct
                    </span>
                  </div>

                  {/* Realistic Miniature Document Header */}
                  <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm text-center">
                    {cabinetLogo && (
                      <img src={cabinetLogo} alt="" className="mx-auto mb-3 max-h-12 max-w-[140px] object-contain" />
                    )}
                    <p className="text-base font-black text-slate-900 tracking-tight">
                      {doctorName.trim() || 'Dr. Praticien'}
                    </p>
                    {cabinetNom.trim() && (
                      <p className="text-xs font-semibold text-slate-600 mt-1">
                        {cabinetNom.trim()}
                      </p>
                    )}

                    {(cabinetAdresse.trim() || cabinetVille.trim() || cabinetTel.trim()) && (
                      <>
                        <div className="my-3 border-t border-dashed border-slate-200" />

                        <div className="space-y-1.5 text-xs text-slate-600 text-left">
                          {cabinetAdresse.trim() && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{cabinetAdresse.trim()}</span>
                            </div>
                          )}
                          {cabinetVille.trim() && (
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{cabinetVille.trim()}</span>
                            </div>
                          )}
                          {cabinetTel.trim() && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{cabinetTel.trim()}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Cet en-tête est généré automatiquement sur vos ordonnances, comptes-rendus et reçus patients.
                  </p>
                </div>
              )}

              {/* CONTEXT FOR ACTES */}
              {activeTab === 'actes' && canManageActes && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3 text-xs text-slate-600">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
                    Comment ça marche
                  </span>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <p className="font-bold text-slate-900 mb-0.5">Prix automatique</p>
                    <p className="text-slate-500 text-[11px]">Choisir un acte dans « Ajouter un acte » remplit son montant avec le prix standard.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <p className="font-bold text-slate-900 mb-0.5">Historique préservé</p>
                    <p className="text-slate-500 text-[11px]">Modifier un prix ou archiver un acte ne change jamais les factures déjà émises.</p>
                  </div>
                </div>
              )}

              {/* CONTEXT FOR EQUIPE */}
              {activeTab === 'equipe' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      Politique d&apos;Accès
                    </span>
                  </div>

                  <div className="space-y-3 text-xs text-slate-600">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="font-bold text-slate-900 mb-0.5">Secret médical garanti</p>
                      <p className="text-slate-500 text-[11px]">
                        Les données cliniques (antécédents, observations médicales) sont strictement verrouillées au médecin par les politiques RLS serveur.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="font-bold text-slate-900 mb-0.5">Permissions granulaires</p>
                      <p className="text-slate-500 text-[11px]">
                        Les bascules activées ci-contre sont vérifiées instantanément par les RPCs Supabase lors de chaque action de la secrétaire.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CONTEXT FOR SECURITE */}
              {activeTab === 'securite' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      Verrouillage de Session
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className={`w-2.5 h-2.5 rounded-full ${pinEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span className="text-xs font-bold text-slate-800">
                      {pinEnabled ? 'Verrouillage PIN actif' : 'Poste non verrouillé'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 space-y-2">
                    <p className="font-semibold text-slate-700">Actions sous protection PIN :</p>
                    <ul className="space-y-1 list-disc list-inside text-[11px]">
                      <li>Suppression de dossier patient</li>
                      <li>Suppression ou modification de RDV</li>
                      <li>Consultation des rapports financiers</li>
                      <li>Modification des paramètres du cabinet</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* CONTEXT FOR PREFERENCES */}
              {activeTab === 'preferences' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                      Préférences du Poste
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Ces préférences sont mémorisées sur cet ordinateur uniquement. Si vous changez de poste ou de navigateur, elles devront être réactivées.
                  </p>
                </div>
              )}

              {/* CONTEXT FOR DOCUMENTS */}
              {activeTab === 'documents' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      Format d&apos;Impression
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600 space-y-2.5">
                    <div className="h-6 bg-slate-100 rounded flex items-center justify-center font-bold text-slate-500 text-[10px]">
                      [ EN-TÊTE CABINET & CONTACT ]
                    </div>
                    <div className="h-4 bg-slate-50 rounded flex items-center px-2 text-[10px] text-slate-400">
                      Lieu, le JJ/MM/AAAA — Nom du patient
                    </div>
                    <div className="h-16 bg-slate-50 border border-dashed border-slate-200 rounded p-2 text-[10px] text-slate-400 flex items-center justify-center">
                      Corps de la prescription (DCI, posologie, durée)
                    </div>
                    <div className="h-8 bg-slate-100 rounded flex items-center justify-end px-3 text-[10px] font-bold text-slate-500">
                      [ Signature & Cachet ]
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Mise en page conforme pour ordonnances A4/A5 et reçus financiers.
                  </p>
                </div>
              )}

              {/* CONTEXT FOR DEV */}
              {activeTab === 'dev' && import.meta.env.DEV && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-amber-600" />
                      Outils Développeur
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Ce module permet de valider le comportement de l&apos;interface sous différents profils utilisateurs sans avoir à se déconnecter.
                  </p>
                </div>
              )}

            </aside>

          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  </PinLock>
  )
}

export default SettingsPage
