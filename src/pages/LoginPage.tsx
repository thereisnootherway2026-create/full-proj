import React, { useState } from 'react'
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react'
import { Link, useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { needsSecretaryOnboarding } from '../lib/onboarding'
import { motion } from 'framer-motion'

const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, isAuthenticated, isInitializing, profile, user } = useAppContext()
  const [form, setForm] = useState({ email: searchParams.get('email') || '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.email || !form.password) {
      setError('Veuillez remplir tous les champs')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await login(form.email, form.password)
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.message || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f0f9f9]">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    )
  }

  if (isAuthenticated && profile) {
    if (needsSecretaryOnboarding(user, profile)) {
      return <Navigate to="/bienvenue-secretaire" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 animated-mesh-bg relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="glass-card-morphism w-full max-w-md p-8 relative z-10 rounded-[32px]"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-6 shadow-lg shadow-blue-600/20">
            <span className="text-white font-black text-3xl">M</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">MacroMedica<span className="text-blue-600">.</span></h1>
          <p className="text-slate-500 font-medium">Votre espace de santé intelligent</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1">Email professionnel</label>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
              <Mail className="h-5 w-5 text-slate-400" />
              <input
                value={form.email}
                onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                type="email"
                required
                className="w-full border-0 bg-transparent outline-none text-slate-900 font-medium placeholder:text-slate-400"
                placeholder="docteur@macromedica.ma"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1">Mot de passe</label>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/50 px-4 py-3.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
              <Lock className="h-5 w-5 text-slate-400" />
              <input
                value={form.password}
                onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))}
                type="password"
                required
                className="w-full border-0 bg-transparent outline-none text-slate-900 font-medium placeholder:text-slate-400"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-600 font-bold flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-rose-600"></div>
              {error}
            </motion.div>
          )}

          <button 
            type="submit" 
            disabled={loading} 
            className="group relative w-full h-[56px] flex items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white font-bold text-lg overflow-hidden transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-blue-600/25"
          >
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                Se connecter
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center space-y-4">
          <button
            type="button"
            className="text-sm font-bold text-blue-700 hover:text-blue-800 transition-colors"
          >
            Mot de passe oublié ?
          </button>
          
          <p className="text-slate-500 font-medium text-sm">
            Nouveau sur MacroMedica ?{' '}
            <Link to="/signup" className="text-blue-700 font-bold hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default LoginPage
