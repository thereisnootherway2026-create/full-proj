import React from 'react'
import { XCircle, CheckCircle2 } from 'lucide-react'
import { BeforeAfterPoint } from './storyData'

interface BeforeAfterComparisonProps {
  items: BeforeAfterPoint[]
}

export const BeforeAfterComparison: React.FC<BeforeAfterComparisonProps> = ({ items }) => {
  return (
    <div className="py-12 sm:py-16 border-t border-slate-200/80 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Lead */}
        <div className="max-w-3xl mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Points de Friction • Pratique Quotidienne</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-bold tracking-tight text-slate-900 mb-2">
            La différence concrète au quotidien du cabinet
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Comparaison entre les gestes habituels sur papier ou logiciels disparates, et l’organisation fluide de MacroMedica.
          </p>
        </div>

        {/* 3-Column Grounded Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-slate-50/50 border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between hover:border-slate-300 transition-all"
            >
              <div className="space-y-3">
                {/* Friction before */}
                <div className="p-3.5 rounded-lg bg-rose-50/80 border border-rose-200/90 text-rose-950">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 mb-1">
                    <XCircle size={14} className="text-rose-600" />
                    <span>Sans MacroMedica</span>
                  </div>
                  <h4 className="font-bold text-xs sm:text-sm text-rose-900 mb-1">
                    {item.beforeTitle}
                  </h4>
                  <p className="text-xs text-rose-800/90 leading-relaxed">
                    {item.beforeText}
                  </p>
                </div>

                {/* Structured after */}
                <div className="p-3.5 rounded-lg bg-emerald-50/80 border border-emerald-200/90 text-emerald-950">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-1">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Avec MacroMedica</span>
                  </div>
                  <h4 className="font-bold text-xs sm:text-sm text-emerald-900 mb-1">
                    {item.afterTitle}
                  </h4>
                  <p className="text-xs text-emerald-800/90 leading-relaxed">
                    {item.afterText}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Flux cabinet</span>
                <span className="text-teal-800 font-bold">Vérifiable</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
