import React from 'react'
import AiScribeCard from '../components/ui/AiScribeCard'
import AiConsultantCard from '../components/ui/AiConsultantCard'
import AiLabReaderCard from '../components/ui/AiLabReaderCard'
import AiDiagnosisCard from '../components/ui/AiDiagnosisCard'
import AiSmartScheduleCard from '../components/ui/AiSmartScheduleCard'
import { Sparkles, Bot, Stethoscope, FileText, Calendar, Activity } from 'lucide-react'

export default function AiScribePage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 bg-gray-50 min-h-screen">
      
      {/* Top Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold">
              <Bot size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span>Centre de Commandement IA</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-bold">
                  Gemini 2.5 Flash
                </span>
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">L'écosystème complet pour automatiser votre cabinet médical et vos consultations.</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Agents IA & Edge Functions Actifs</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Colonne Gauche : Interaction Patient, Scribe & Diagnostic */}
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1.5">
              <Stethoscope size={14} className="text-sky-600" />
              1. Scribe Médical & Dictée Vocale
            </h2>
            <AiScribeCard />
          </div>
          
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1.5">
              <Activity size={14} className="text-amber-600" />
              2. Aide au Diagnostic & Triage
            </h2>
            <AiDiagnosisCard />
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-600" />
              5. Optimisation & Remplissage Agenda
            </h2>
            <AiSmartScheduleCard />
          </div>
        </div>
        
        {/* Colonne Droite : Extraction Labo OCR & Stratégie Cabinet */}
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1.5">
              <FileText size={14} className="text-blue-600" />
              3. Extraction Labo & Analyses PDF (OCR Vision)
            </h2>
            <AiLabReaderCard />
          </div>
          
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1.5">
              <Sparkles size={14} className="text-purple-600" />
              4. Consultant Stratégique Cabinet
            </h2>
            <AiConsultantCard />
          </div>
        </div>

      </div>
      
    </div>
  )
}