import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { OneScreenAnnotation, FeatureStoryData } from './storyData'
import { CheckCircle2, ArrowRight } from 'lucide-react'

interface OneScreenDecisionProps {
  story: FeatureStoryData
}

export const OneScreenDecision: React.FC<OneScreenDecisionProps> = ({ story }) => {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    story.oneScreenAnnotations[0]?.id || 'q-waiting'
  )

  const activeAnnotation =
    story.oneScreenAnnotations.find((a) => a.id === selectedQuestionId) ||
    story.oneScreenAnnotations[0]

  return (
    <div className="py-12 sm:py-16 border-t border-slate-200/80 bg-slate-50/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Lead */}
        <div className="max-w-3xl mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Vision Unifiée • Clarté Opérationnelle</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-bold tracking-tight text-slate-900 mb-2">
            {story.oneScreenTitle}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            {story.oneScreenSubtitle}
          </p>
        </div>

        {/* 4 Clickable Questions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {story.oneScreenAnnotations.map((anno, idx) => {
            const isSelected = anno.id === selectedQuestionId
            return (
              <button
                key={anno.id}
                onClick={() => setSelectedQuestionId(anno.id)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white border-teal-700 shadow-md ring-1 ring-teal-700/20'
                    : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs font-mono ${
                      isSelected ? 'bg-teal-800 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    0{idx + 1}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    {anno.actionHint}
                  </span>
                </div>

                <div
                  className={`text-sm font-bold ${
                    isSelected ? 'text-teal-900' : 'text-slate-800'
                  }`}
                >
                  {anno.question}
                </div>
              </button>
            )
          })}
        </div>

        {/* Interactive Highlighted Operational Screen */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-lg p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-bold text-slate-900 font-mono">
                ÉCRAN DE PILOTAGE DU CABINET
              </span>
            </div>
            <div className="text-teal-800 font-semibold flex items-center gap-1.5">
              <span>Question sélectionnée :</span>
              <strong>{activeAnnotation.question}</strong>
            </div>
          </div>

          {/* Answer Callout Bar */}
          <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-950 text-xs sm:text-sm font-medium flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-teal-700 flex-shrink-0" />
              <span>{activeAnnotation.answer}</span>
            </div>
            <span className="text-[11px] text-teal-700 font-mono whitespace-nowrap hidden sm:inline">
              Zone en surbrillance ci-dessous ↓
            </span>
          </div>

          {/* 4 Operational Zones of the Screen */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Zone 1: Waiting */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                activeAnnotation.targetArea === 'waiting'
                  ? 'bg-teal-50/70 border-teal-600 shadow-md ring-2 ring-teal-600/20'
                  : 'bg-slate-50/70 border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-500">1. Salle d’attente</span>
                {activeAnnotation.targetArea === 'waiting' && (
                  <span className="text-[9px] bg-teal-700 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                    Ciblé
                  </span>
                )}
              </div>
              <div className="font-bold text-slate-900 mb-1">M. Karim T. (#0249)</div>
              <p className="text-[11px] text-slate-500">Attente 12 min • Prochain dans la file</p>
            </div>

            {/* Zone 2: Consulting */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                activeAnnotation.targetArea === 'consulting'
                  ? 'bg-teal-50/70 border-teal-600 shadow-md ring-2 ring-teal-600/20'
                  : 'bg-slate-50/70 border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-500">2. Bureau de consultation</span>
                {activeAnnotation.targetArea === 'consulting' && (
                  <span className="text-[9px] bg-teal-700 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                    Ciblé
                  </span>
                )}
              </div>
              <div className="font-bold text-slate-900 mb-1">Patient Démo 01 (Amina B.)</div>
              <p className="text-[11px] text-slate-500">En examen • Chrono actif 14 min</p>
            </div>

            {/* Zone 3: Payment */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                activeAnnotation.targetArea === 'payment'
                  ? 'bg-teal-50/70 border-teal-600 shadow-md ring-2 ring-teal-600/20'
                  : 'bg-slate-50/70 border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-500">3. Caisse &amp; Règlement</span>
                {activeAnnotation.targetArea === 'payment' && (
                  <span className="text-[9px] bg-teal-700 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                    Ciblé
                  </span>
                )}
              </div>
              <div className="font-bold text-slate-900 mb-1">Total à percevoir : 450 MAD</div>
              <p className="text-[11px] text-slate-500">CS 300 MAD + ECG 150 MAD</p>
            </div>

            {/* Zone 4: Action */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                activeAnnotation.targetArea === 'action'
                  ? 'bg-teal-50/70 border-teal-600 shadow-md ring-2 ring-teal-600/20'
                  : 'bg-slate-50/70 border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-500">4. Prochaine Action</span>
                {activeAnnotation.targetArea === 'action' && (
                  <span className="text-[9px] bg-teal-700 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                    Ciblé
                  </span>
                )}
              </div>
              <div className="font-bold text-teal-800 mb-1">Bouton « Faire Entrer »</div>
              <p className="text-[11px] text-slate-500">Appel silencieux vers le bureau</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
