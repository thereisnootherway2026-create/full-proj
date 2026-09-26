import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, CheckCircle2, Clock, User, ShieldCheck, Stethoscope, ChevronRight, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FeatureStoryData, STATE_DEFINITIONS, MacroMedicaState } from './storyData'

interface FeatureStoryHeroProps {
  story: FeatureStoryData
  onExploreWorkflow: () => void
}

export const FeatureStoryHero: React.FC<FeatureStoryHeroProps> = ({ story, onExploreWorkflow }) => {
  const { heroUI } = story
  const [selectedRowIndex, setSelectedRowIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState('09:14:22')
  const [consultationTimer, setConsultationTimer] = useState(864) // 14m 24s in seconds

  // Real-time autonomous ticking clock & active consultation timer
  useEffect(() => {
    const interval = setInterval(() => {
      // Clock
      const now = new Date()
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const seconds = String(now.getSeconds()).padStart(2, '0')
      setCurrentTime(`${hours}:${minutes}:${seconds}`)

      // Consultation timer ticking up every second
      setConsultationTimer((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}m ${String(s).padStart(2, '0')}s`
  }

  const activeRow = heroUI.rows[selectedRowIndex] || heroUI.rows[0]
  const stateInfo = STATE_DEFINITIONS[activeRow.state]

  return (
    <section className="relative pt-4 sm:pt-8 pb-12 sm:pb-16 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column: Clinical OS Positioning */}
          <div className="lg:col-span-5 space-y-5">
            {/* Category Badge & Live Synchronization Status */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                <span>{story.categoryBadge}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-xs font-mono">
                <Clock size={11} className="text-slate-500" />
                <span>{currentTime}</span>
              </div>
            </div>

            {/* Title & Grounded Subtitle */}
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-sans font-bold tracking-tight text-slate-900 leading-tight">
                {story.title}
              </h1>
              <p className="text-base sm:text-lg font-medium text-slate-700 leading-snug">
                {story.subtitle}
              </p>
            </div>

            {/* Operational Narrative */}
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg">
              {story.explanation}
            </p>

            {/* Continuous Patient Callout Note */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
              <User size={15} className="text-teal-700 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-900">Dossier fil conducteur : </span>
                <span className="text-slate-600">
                  Suivez <strong>Patient Démo 01 (Mme Amina B. #0248)</strong> tout au long de cette page pour observer la synchronisation en direct entre médecin et secrétariat.
                </span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={onExploreWorkflow}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-teal-800 hover:bg-teal-900 text-white font-bold text-sm shadow-sm transition-all cursor-pointer group"
              >
                <span>Explorer le flux direct</span>
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </button>

              <Link
                to="/signup"
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-lg border border-slate-300 hover:border-slate-400 bg-white text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all cursor-pointer"
              >
                <span>Accès Démo</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* Grounded Reassurance */}
            <div className="flex items-center gap-4 text-xs text-slate-500 pt-1 font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-teal-700" />
                <span>Données cabinet réelles</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-teal-700" />
                <span>Cotation en Dirhams (MAD)</span>
              </span>
            </div>
          </div>

          {/* Right Column: Live Operating Clinical Interface */}
          <div className="lg:col-span-7">
            <div className="rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden ring-1 ring-slate-900/5">
              
              {/* Chrome Top Bar with Autonomous Time & System Status */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 text-white text-xs border-b border-slate-800">
                <div className="flex items-center gap-2.5 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold">MacroMedica OS</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-300">{heroUI.contextTag}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Activity size={12} />
                    <span>Synchronisé</span>
                  </span>
                  <span>{currentTime}</span>
                </div>
              </div>

              {/* Sub-Header: Role Status & Live Metrics */}
              <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Module en cours d’utilisation
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-100 text-teal-800">
                      {heroUI.statusBadge}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{heroUI.moduleName}</span>
                  </h3>
                </div>

                <div className="flex items-center gap-5 text-right">
                  <div className="pl-3 border-l border-slate-200 sm:border-l-0">
                    <div className="text-base font-bold text-slate-900 font-mono">
                      {heroUI.primaryMetric.value}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {heroUI.primaryMetric.label}
                    </div>
                  </div>
                  <div className="pl-3 border-l border-slate-200">
                    <div className="text-base font-bold text-teal-800 font-mono flex items-center justify-end gap-1">
                      <Clock size={12} className="text-teal-600 animate-spin-slow" />
                      <span>{formatTimer(consultationTimer)}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      Chrono actif consultation
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-User Synchronized State Notice */}
              <div className="px-4 py-2 bg-slate-100/70 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-600">
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-semibold text-slate-800">Médecin :</span>
                  <span>Bureau 1 (Dr. Alami)</span>
                  <span className="text-slate-400">↔</span>
                  <span className="font-semibold text-slate-800">Accueil :</span>
                  <span>Poste Secrétariat (Nadia)</span>
                </div>
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  Mise à jour instantanée sans rechargement
                </span>
              </div>

              {/* Realistic Operational State Machine Table */}
              <div className="p-3 divide-y divide-slate-100">
                {heroUI.rows.map((row, idx) => {
                  const isSelected = idx === selectedRowIndex
                  const st = STATE_DEFINITIONS[row.state]
                  const isOngoing = row.state === 'IN_CONSULTATION'

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedRowIndex(idx)}
                      className={`p-3 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-all text-xs ${
                        isSelected
                          ? 'bg-teal-50/90 border border-teal-300 shadow-sm'
                          : 'hover:bg-slate-50/80 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center gap-1.5 w-14 flex-shrink-0 font-mono text-slate-500 text-[11px]">
                          {isOngoing && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          )}
                          <span>{row.col1}</span>
                        </div>

                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate flex items-center gap-2">
                            <span>{row.col2}</span>
                            {row.col2.includes('Patient Démo 01') && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-900 text-white font-mono">
                                Fil Suivi
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{row.col3}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0 text-right">
                        <span className="text-slate-500 text-[11px] hidden sm:inline font-medium">
                          {isOngoing ? formatTimer(consultationTimer) : row.col4}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.color}`}
                        >
                          {st.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Active Inspector Footer */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Inspection :
                  </span>
                  <span className="font-semibold text-slate-900">{activeRow.col2}</span>
                  <span className="text-slate-500 hidden sm:inline">— {stateInfo.description}</span>
                </div>
                <div className="text-[10px] font-mono text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  État système : {activeRow.state}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
