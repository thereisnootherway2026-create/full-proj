import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { ORDERED_FEATURE_SLUGS, FEATURE_STORIES } from './storyData'

interface StorytellingHeaderProps {
  currentSlug: string
}

export const StorytellingHeader: React.FC<StorytellingHeaderProps> = ({ currentSlug }) => {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/95 border-b border-slate-200 shadow-sm transition-all">
      {/* Top Professional Ticker */}
      <div className="bg-slate-900 text-white text-[11px] py-1 px-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <span className="font-semibold text-slate-200">MacroMedica</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400 hidden sm:inline">Démonstration interactive du flux de cabinet</span>
          </div>

          <div className="text-[10px] text-slate-400 font-mono">
            Environnement de démonstration
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        {/* Left: Brand & Back */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition-all group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Accueil</span>
          </Link>

          <span className="text-slate-300 hidden sm:inline">/</span>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-teal-800 flex items-center justify-center text-white text-xs font-bold">
              +
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight hidden sm:inline">
              MacroMedica
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/login')}
            className="hidden sm:inline-block px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Connexion
          </button>

          <Link
            to="/signup"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-800 hover:bg-teal-900 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm transition-all"
          >
            <span>Démarrer un essai</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Feature Switcher Track */}
      <div className="border-t border-slate-200/70 bg-slate-50/80 px-4 sm:px-6 lg:px-8 py-2 overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto flex items-center justify-start lg:justify-center">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200 shadow-inner">
            {ORDERED_FEATURE_SLUGS.map((slug) => {
              const item = FEATURE_STORIES[slug]
              if (!item) return null
              const isActive = slug === currentSlug
              return (
                <button
                  key={slug}
                  onClick={() => navigate(`/features/${slug}`)}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap select-none ${
                    isActive ? 'text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeFeatureCapsulePill"
                      className="absolute inset-0 bg-teal-800 rounded-lg shadow-sm"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{item.title.split('.')[0]}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
}
