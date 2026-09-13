import { LockKeyhole, Loader2, LogOut, Stethoscope, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { ContentCard } from '../../components/dashboard/DashboardPrimitives'
import SecretaryManagementSection from '../../components/dashboard/SecretaryManagementSection'
import { useAppContext } from '../../context/AppContext'
import PinLock from '../../components/common/PinLock'

function SettingsPage() {
  const { currentUser, cabinetId, notificationPrefs, setNotificationPrefs, notify, profile: userProfile, logout, role, canonicalRole, devRoleOverride, setDevRoleOverride } = useAppContext()
  const [profile, setProfile] = useState(currentUser)
  const [loading, setLoading] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [pinEnabled, setPinEnabled] = useState(
    localStorage.getItem(`pin_enabled_${currentUser?.id}`) === 'true'
  )
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [pinError, setPinError] = useState('')

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 300))
      notify({ title: 'Profil sauvegardé', description: 'Les modifications ont été enregistrées.' })
    } catch (err) {
      notify({ title: 'Erreur', description: err.message || "Échec de la sauvegarde", tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const togglePin = (enabled) => {
    if (!enabled) {
      localStorage.removeItem(`pin_enabled_${currentUser?.id}`)
      localStorage.removeItem(`pin_hash_${currentUser?.id}`)
      setPinEnabled(false)
      setNewPin('')
      setConfirmPin('')
      notify({ title: 'Succès', description: 'PIN désactivé' })
    } else {
      setPinEnabled(true)
    }
  }

  const savePin = () => {
    setPinError('')
    
    if (newPin.length !== 4) {
      setPinError('Le PIN doit contenir 4 chiffres')
      return
    }
    if (!/^\d{4}$/.test(newPin)) {
      setPinError('Le PIN doit contenir uniquement des chiffres')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('Les PIN ne correspondent pas')
      return
    }

    const pinHash = btoa(`${currentUser?.id}:${newPin}:macromedica`)
    
    localStorage.setItem(`pin_enabled_${currentUser?.id}`, 'true')
    localStorage.setItem(`pin_hash_${currentUser?.id}`, pinHash)
    
    setPinSaved(true)
    setNewPin('')
    setConfirmPin('')
    notify({ title: 'Succès', description: 'PIN enregistré avec succès 🔐' })
    
    setTimeout(() => setPinSaved(false), 3000)
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch (err) {
      notify({ title: 'Erreur', description: err.message || 'Impossible de se déconnecter.', tone: 'error' })
      setLoggingOut(false)
    }
  }

  return (
    <PinLock>
      <div className="space-y-8">

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ContentCard title="Profil du cabinet" subtitle="Met à jour le praticien affiché partout dans l'application">
          <form className="space-y-4" onSubmit={handleProfileSubmit}>
            {[
              ['name', 'Nom'],
              ['specialty', 'Spécialité'],
              ['phone', 'Téléphone'],
              ['email', 'Email'],
              ['address', 'Adresse cabinet'],
              ['cabinetName', 'Nom du cabinet'],
            ].map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-2 block text-base font-medium text-slate-700">{label}</span>
                <input value={profile[key] || ''} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300" />
              </label>
            ))}
            <button type="submit" disabled={loading} className="interactive rounded-2xl bg-blue-600 px-5 py-3 text-base font-medium text-white disabled:opacity-70">
              {loading ? 'Enregistrement...' : 'Sauvegarder'}
            </button>
          </form>
        </ContentCard>

        <div className="space-y-6">
          <SecretaryManagementSection
            cabinetId={cabinetId}
            notify={notify}
            userRole={canonicalRole || role}
          />

          {/* ─── Sécurité & Accès (PIN) ─── */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                  🔐 Code PIN de sécurité
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0, paddingRight: '12px' }}>
                  Protégez les actions sensibles avec un code à 4 chiffres. Optionnel.
                </p>
              </div>
              
              <button
                type="button"
                onClick={() => togglePin(!pinEnabled)}
                style={{
                  width: '48px', height: '26px', borderRadius: '999px',
                  background: pinEnabled ? '#3B82F6' : '#e2e8f0',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 0.2s', flexShrink: 0
                }}
              >
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                  position: 'absolute', top: '3px',
                  left: pinEnabled ? '25px' : '3px',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }} />
              </button>
            </div>

            {pinEnabled && (
              <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-2">
                  <p className="text-xs font-semibold text-blue-800 mb-2">Actions protégées par le PIN :</p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"/> Supprimer un patient / RDV</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"/> Modifier un montant</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"/> Statistiques financières</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"/> Paramètres cabinet</li>
                  </ul>
                </div>
                
                {pinError && (
                  <div className="text-xs font-bold text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-100">
                    {pinError}
                  </div>
                )}
                
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">Nouveau PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center tracking-[1em] font-mono text-xl outline-none focus:border-blue-400"
                    placeholder="••••"
                  />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">Confirmer PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center tracking-[1em] font-mono text-xl outline-none focus:border-blue-400"
                    placeholder="••••"
                  />
                </div>
                
                <button
                  onClick={savePin}
                  className="interactive mt-2 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-all shadow-md shadow-blue-500/20 active:scale-[0.98]"
                >
                  {pinSaved ? 'Enregistré ✓' : 'Enregistrer le PIN'}
                </button>
              </div>
            )}
          </div>

          {/* ─── Notifications ─── */}
          <ContentCard title="Notifications" subtitle="Préférences sauvegardées dans localStorage">
            <div className="space-y-3">
              {[
                ['email', 'Notifications email'],
                ['browser', 'Notifications navigateur'],
                ['reminders', 'Rappels de rendez-vous'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-100">
                  <span className="text-base font-medium text-slate-700">{label}</span>
                  <input type="checkbox" checked={Boolean(notificationPrefs[key])} onChange={(event) => setNotificationPrefs((current) => ({ ...current, [key]: event.target.checked }))} className="h-5 w-5 rounded border-slate-300 text-blue-600" />
                </label>
              ))}
            </div>
          </ContentCard>

          {/* ─── Dev Tools (Développement uniquement) ─── */}
          {import.meta.env.DEV && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                  <div className="w-5 h-5 rounded bg-amber-400/80" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Dev Tools
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aperçu rôle actif
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl mb-4">
                <button
                  onClick={() => setDevRoleOverride('doctor')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    (devRoleOverride || canonicalRole) === 'doctor'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Stethoscope size={18} />
                  Médecin
                </button>
                <button
                  onClick={() => setDevRoleOverride('secretary')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    (devRoleOverride || canonicalRole) === 'secretary'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <FolderOpen size={18} />
                  Secrétaire
                </button>
              </div>

              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-amber-600 text-xl">⚠️</div>
                <div className="text-xs text-amber-800 font-medium leading-relaxed">
                  Ce switcher est disponible en mode développement uniquement.{' '}
                  <button
                    onClick={() => setDevRoleOverride(null)}
                    className="underline font-semibold hover:text-amber-900"
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>
            </div>
          )}

          <ContentCard title="Session" subtitle="Déconnectez-vous de votre compte sur cet appareil">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="interactive flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-medium text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
            >
              {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {loggingOut ? 'Déconnexion...' : 'Se déconnecter'}
            </button>
          </ContentCard>
        </div>
        </div>
      </div>
    </PinLock>
  )
}

export default SettingsPage
