import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { FEATURE_STORIES } from './storyData'

interface FeatureStoryCTAProps {
  currentSlug: string
  nextSlug: string
  nextLabel: string
}

export const FeatureStoryCTA: React.FC<FeatureStoryCTAProps> = ({
  currentSlug,
  nextSlug,
  nextLabel,
}) => {
  const navigate = useNavigate()
  const nextStory = FEATURE_STORIES[nextSlug] || FEATURE_STORIES['gestion-rdv']

  return (
    <section className="pt-10 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Next Relevant Feature Navigation Ribbon */}
        <div className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Poursuivre la visite
            </span>
            <h4 className="text-base font-bold text-slate-900 mt-0.5">
              Module suivant : {nextStory.title}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {nextStory.subtitle}
            </p>
          </div>

          <button
            onClick={() => {
              navigate(`/features/${nextSlug}`)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm transition-all cursor-pointer group"
          >
            <span>Découvrir {nextLabel}</span>
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Closing Operational Launchpad */}
        <div className="rounded-2xl bg-slate-900 text-white border border-slate-800 p-8 sm:p-12 text-center shadow-xl">
          <div className="max-w-xl mx-auto space-y-5">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-bold tracking-tight text-white leading-tight">
              Et si votre cabinet fonctionnait simplement comme ça ?
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Mettez fin aux incertitudes d’accueil, aux retards non signalés et aux démarches administratives dispersées.
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
              >
                <span>Découvrir Macro Medica</span>
                <ArrowRight size={15} />
              </Link>

              <button
                onClick={() => {
                  navigate(`/features/${nextSlug}`)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="inline-flex items-center gap-1.5 px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-all cursor-pointer"
              >
                <span>Voir une autre fonctionnalité</span>
              </button>
            </div>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 size={13} className="text-teal-400" />
                <span>Essai gratuit</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 size={13} className="text-teal-400" />
                <span>Accompagnement au démarrage</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 size={13} className="text-teal-400" />
                <span>Sans engagement</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
