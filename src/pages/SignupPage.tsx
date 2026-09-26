import React, { useState } from 'react'
import { Eye, EyeOff, Loader2, User, Mail, Phone, Lock, Building2, MapPin, ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { SPECIALITES } from '../data/specialites'
import { supabase } from '../lib/supabase'
import { formatDoctorLabel } from '../lib/professionalName'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

const SignupPage: React.FC = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    password: '',
    confirmPassword: '',
    specialite: '',
    nomCabinet: '',
    ville: '',
    acceptTerms: false
  })
  
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | React.SelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement
    const checked = (e.target as HTMLInputElement).checked
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!form.prenom || !form.nom || !form.email || !form.telephone || !form.password || !form.specialite || !form.nomCabinet) {
      setError('Veuillez remplir tous les champs obligatoires')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    if (form.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    if (!form.acceptTerms) {
      setError("Veuillez accepter les conditions d'utilisation")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const nomComplet = formatDoctorLabel(`${form.prenom.trim()} ${form.nom.trim()}`)

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: {
            nom_complet: nomComplet,
            telephone: form.telephone,
            specialite: form.specialite,
            nom_cabinet: form.nomCabinet.trim(),
            prenom: form.prenom.trim(),
            nom: form.nom.trim(),
            ville: form.ville?.trim() || '',
            role: 'docteur',
          }
        }
      })

      if (authError) {
        if (authError.message?.includes('Database error saving new user')) {
          throw new Error(
            'Erreur base de données lors de la création du compte. ' +
            'Exécutez fix_signup_database_error.sql dans Supabase SQL Editor, puis réessayez.'
          )
        }
        throw authError
      }
      if (!authData.user) throw new Error('Erreur lors de la création du compte')

      // DB trigger normally creates cabinet + profile; fetch or fall back to client-side creation
      let cabinetId: string | null = null

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('cabinet_id')
        .eq('id', authData.user.id)
        .maybeSingle()

      cabinetId = existingProfile?.cabinet_id ?? null

      if (!cabinetId) {
        const { data: cabinet, error: cabinetError } = await supabase
          .from('cabinets')
          .insert([{
            tenant_id: authData.user.id,
            nom: form.nomCabinet.trim(),
            ville: form.ville?.trim() || null,
            telephone: form.telephone?.trim() || null
          }])
          .select('id')
          .single()

        if (cabinetError) {
          console.error('Cabinet creation error:', cabinetError)
          throw new Error('Erreur lors de la création du cabinet: ' + cabinetError.message)
        }

        cabinetId = cabinet.id

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([{
            id: authData.user.id,
            cabinet_id: cabinetId,
            role: 'docteur',
            nom_complet: nomComplet
          }], { onConflict: 'id' })

        if (profileError) {
          console.error('Profile creation error:', profileError)
          throw new Error('Erreur lors de la création du profil: ' + profileError.message)
        }
      }

      localStorage.setItem('pending_verification', JSON.stringify({
        userId: authData.user.id,
        nomComplet,
        email: form.email,
        cabinetId
      }))

      toast.success('Compte créé ! Bienvenue sur MacroMedica.')
      navigate('/verification')

    } catch (err: any) {
      console.error('Signup error:', err)
      setError(err.message || 'Erreur lors de la création du compte')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 animated-mesh-bg overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card-morphism w-full max-w-2xl p-10 rounded-[40px] relative z-10"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-3">Rejoignez MacroMedica</h1>
          <p className="text-blue-700 font-bold bg-blue-50 inline-block px-4 py-1 rounded-full text-sm uppercase tracking-wider">
            14 jours d'essai gratuit · Sans engagement
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSignup}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Prénom</label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 focus-within:border-blue-500 transition-all">
                <User size={18} className="text-slate-400" />
                <input name="prenom" value={form.prenom} onChange={handleChange} required className="w-full bg-transparent outline-none text-slate-900" placeholder="Jean" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Nom</label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 focus-within:border-blue-500 transition-all">
                <User size={18} className="text-slate-400" />
                <input name="nom" value={form.nom} onChange={handleChange} required className="w-full bg-transparent outline-none text-slate-900" placeholder="Dupont" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Email</label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 focus-within:border-blue-500 transition-all">
                <Mail size={18} className="text-slate-400" />
                <input type="email" name="email" value={form.email} onChange={handleChange} required className="w-full bg-transparent outline-none text-slate-900" placeholder="dr@clinique.ma" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Téléphone</label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 focus-within:border-blue-500 transition-all">
                <Phone size={18} className="text-slate-400" />
                <input name="telephone" value={form.telephone} onChange={handleChange} required className="w-full bg-transparent outline-none text-slate-900" placeholder="06 12 34 56 78" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1">Spécialité médicale</label>
            <select name="specialite" value={form.specialite} onChange={handleChange} required className="w-full rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer text-slate-900">
              <option value="" disabled>Choisir une spécialité</option>
              {SPECIALITES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Nom du Cabinet</label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 focus-within:border-blue-500 transition-all">
                <Building2 size={18} className="text-slate-400" />
                <input name="nomCabinet" value={form.nomCabinet} onChange={handleChange} required className="w-full bg-transparent outline-none text-slate-900" placeholder="Clinique du Sud" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Ville</label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 focus-within:border-blue-500 transition-all">
                <MapPin size={18} className="text-slate-400" />
                <input name="ville" value={form.ville} onChange={handleChange} className="w-full bg-transparent outline-none text-slate-900" placeholder="Marrakech" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Mot de passe</label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 focus-within:border-blue-500 transition-all">
                <Lock size={18} className="text-slate-400" />
                <input type={showPassword ? 'text' : 'password'} name="password" value={form.password} onChange={handleChange} required className="w-full bg-transparent outline-none text-slate-900" placeholder="••••••••" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Confirmer</label>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3 focus-within:border-blue-500 transition-all">
                <Lock size={18} className="text-slate-400" />
                <input type={showPassword ? 'text' : 'password'} name="confirmPassword" value={form.confirmPassword} onChange={handleChange} required className="w-full bg-transparent outline-none text-slate-900" placeholder="••••••••" />
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" name="acceptTerms" checked={form.acceptTerms} onChange={handleChange} className="mt-1.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-slate-500 font-medium leading-relaxed group-hover:text-slate-700 transition-colors">
              J'accepte les <Link to="/terms" className="text-blue-700 font-bold hover:underline">Conditions d'Utilisation</Link> et la politique de confidentialité.
            </span>
          </label>

          {error && <div className="p-4 bg-rose-50 text-rose-600 text-sm font-bold rounded-2xl border border-rose-100">{error}</div>}

          <button type="submit" disabled={loading} className="w-full h-[60px] bg-blue-600 hover:bg-blue-700 text-white font-black text-xl rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3">
            {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <>Créer mon compte <ArrowRight size={22} /></>}
          </button>
        </form>

        <p className="mt-8 text-center text-slate-500 font-bold">
          Déjà inscrit ? <Link to="/login" className="text-blue-700 hover:underline">Connectez-vous</Link>
        </p>
      </motion.div>
    </div>
  )
}

export default SignupPage
