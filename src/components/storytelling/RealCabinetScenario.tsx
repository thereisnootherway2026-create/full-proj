import React from 'react'
import { Clock, User, CheckCircle2 } from 'lucide-react'
import { ScenarioTimestamp, STATE_DEFINITIONS } from './storyData'

interface RealCabinetScenarioProps {
  scenario: ScenarioTimestamp[]
  featureTitle: string
}

export const RealCabinetScenario: React.FC<RealCabinetScenarioProps> = ({
  scenario,
  featureTitle,
}) => {
  return (
    <div className="py-12 sm:py-16 border-t border-slate-200/80 bg-slate-50/30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Chronologie d’une Matinée • Cas Réel</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-bold tracking-tight text-slate-900 mb-2">
            Le parcours réel au fil des minutes
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Déroulement horaire effectif de <strong>Patient Démo 01 (Mme Amina B. #0248)</strong> au sein du cabinet du Dr. Yassine Alami.
          </p>
        </div>

        {/* Connected Vertical Timeline */}
        <div className="relative pl-6 sm:pl-8 border-l-2 border-slate-200 space-y-6 sm:space-y-8 ml-2 sm:ml-4">
          {scenario.map((item, idx) => {
            const st = STATE_DEFINITIONS[item.macroState]
            return (
              <div key={idx} className="relative group">
                
                {/* Timeline Bullet Node */}
                <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-teal-700 ring-4 ring-slate-100 group-hover:border-teal-800 transition-colors" />

                {/* Event Card */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-sm space-y-2 hover:border-slate-300 transition-all">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-slate-900 text-white font-mono text-xs font-bold">
                        <Clock size={11} className="text-teal-400" />
                        <span>{item.time}</span>
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${st.color}`}>
                        {st.label}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 font-medium">
                      Acteur : <strong className="text-slate-800">{item.actionActor}</strong>
                    </div>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-slate-900 pt-0.5">
                    {item.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="pt-1.5 flex items-center gap-1.5 text-xs text-teal-800 font-medium">
                    <CheckCircle2 size={13} className="text-teal-700 flex-shrink-0" />
                    <span>{item.stateChange}</span>
                  </div>
                </div>

              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
