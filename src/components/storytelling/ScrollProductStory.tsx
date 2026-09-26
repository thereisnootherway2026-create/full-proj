import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { StoryStage, FeatureStoryData, STATE_DEFINITIONS } from './storyData'
import { CheckCircle2, ArrowRight, User, Stethoscope, ChevronRight } from 'lucide-react'

interface ScrollProductStoryProps {
  story: FeatureStoryData
}

export const ScrollProductStory: React.FC<ScrollProductStoryProps> = ({ story }) => {
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const currentStage = story.storyStages[activeStageIndex] || story.storyStages[0]
  const currentDef = STATE_DEFINITIONS[currentStage.state]

  return (
    <div className="py-12 sm:py-16 border-t border-slate-200/80 bg-slate-50/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Lead */}
        <div className="max-w-3xl mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Continuité Opérationnelle • Le Flux de Travail</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-bold tracking-tight text-slate-900 mb-2">
            La progression naturelle d’un dossier dans le cabinet
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Chaque geste met à jour l’état du dossier en direct. Le secrétariat et le praticien partagent la même vision sans se téléphoner ni ouvrir les portes.
          </p>
        </div>

        {/* ── Interactive Progress Stages ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Interactive Stages */}
          <div className="lg:col-span-5 space-y-3">
            {story.storyStages.map((stage, idx) => {
              const isActive = idx === activeStageIndex
              const stDef = STATE_DEFINITIONS[stage.state]
              return (
                <div
                  key={stage.step}
                  onClick={() => setActiveStageIndex(idx)}
                  className={`p-4 sm:p-5 rounded-xl border transition-all cursor-pointer select-none ${
                    isActive
                      ? 'bg-white border-teal-700 shadow-md ring-1 ring-teal-700/20'
                      : 'bg-white/70 border-slate-200/80 hover:border-slate-300 hover:bg-white text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-md flex items-center justify-center font-mono font-bold text-xs ${
                          isActive
                            ? 'bg-teal-800 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {stage.step}
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {stage.actor}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${stDef.color}`}
                    >
                      {stDef.label}
                    </span>
                  </div>

                  <h3
                    className={`text-base font-bold tracking-tight mb-1 ${
                      isActive ? 'text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    {stage.title}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {stage.description}
                  </p>

                  {isActive && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-xs font-medium text-teal-800">
                      <CheckCircle2 size={13} className="text-teal-700 flex-shrink-0" />
                      <span>{stage.uiStateNote}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right Column: Sticky Evolving Live Inspection Panel */}
          <div className="lg:col-span-7 lg:sticky lg:top-24">
            <div className="rounded-xl bg-white border border-slate-200 shadow-lg p-5 sm:p-6 space-y-4">
              
              {/* Header Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-2 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-bold text-slate-900">
                    État Système • Étape {currentStage.step} sur 04
                  </span>
                </div>
                <div className="text-slate-500">
                  Acteur : <strong className="text-slate-800">{currentStage.actor}</strong>
                </div>
              </div>

              {/* Transition Banner */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    Statut Patient Démo 01 :
                  </span>
                  <span className={`px-2 py-0.5 rounded font-bold border ${currentDef.color}`}>
                    {currentDef.label} ({currentDef.state})
                  </span>
                </div>
                <span className="text-slate-500 text-[11px]">{currentDef.description}</span>
              </div>

              {/* Dynamic Queue Snapshot */}
              <div className="rounded-lg border border-slate-200 p-4 bg-white space-y-2 text-xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100 flex justify-between">
                  <span>File active du cabinet</span>
                  <span className="font-mono font-normal text-slate-400">Synchronisé</span>
                </div>

                {story.heroUI.rows.map((row, idx) => {
                  const isStageTarget = idx === activeStageIndex
                  const displayState = isStageTarget ? currentStage.state : row.state
                  const st = STATE_DEFINITIONS[displayState]
                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                        isStageTarget
                          ? 'bg-teal-50/80 border-teal-300 text-slate-900 shadow-sm'
                          : 'bg-white border-slate-200/80 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-slate-500 text-[11px] w-12">{row.col1}</span>
                        <div>
                          <div className="font-semibold text-slate-900">{row.col2}</div>
                          <div className="text-[10px] text-slate-500">{row.col3}</div>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Impact Callout */}
              <div className="p-3 rounded-lg bg-teal-800 text-white text-xs flex items-center justify-between">
                <span className="leading-snug">
                  Impact immédiat : <strong>{currentStage.uiStateNote}</strong>
                </span>
                <span className="text-teal-200 text-[10px] font-mono whitespace-nowrap ml-3">
                  Instantané
                </span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
