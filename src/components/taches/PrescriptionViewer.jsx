import React, { useState } from 'react'
import { Pill, CheckCircle2, FastForward, Edit3, ShieldCheck, User, Calendar, Stamp } from 'lucide-react'

export default function PrescriptionViewer({
  task,
  onSignNext,
  onEdit,
  isBatchMode = false,
  batchRemainingCount = 1,
  isProcessing = false
}) {
  const [hasSigned, setHasSigned] = useState(false)
  const [signatureDate] = useState(new Date().toLocaleDateString('fr-FR'))

  const handleSign = () => {
    setHasSigned(true)
    onSignNext?.(task)
  }

  // Prescription medications list
  const medications = task?.medications || [
    { name: 'Amlor (Amlodipine) 5mg', dosage: '1 comprimé', freq: 'Chaque matin', duration: '30 jours', note: 'Pendant les repas' },
    { name: 'Co-Aprovel 150mg/12.5mg', dosage: '1 comprimé', freq: 'À midi', duration: '30 jours', note: 'Prendre avec un grand verre d\'eau' },
    { name: 'Kardegic 75mg', dosage: '1 sachet', freq: 'Au dîner', duration: '30 jours', note: 'Diluer dans de l\'eau' },
  ]

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-bold">
            <Pill size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{task?.description || 'Ordonnance Médicale à Signer'}</h2>
              {isBatchMode && (
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-black px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1 animate-pulse">
                  <FastForward size={13} />
                  Mode Rafale ({batchRemainingCount} restant)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Patient: <strong className="text-slate-800">{task?.patientName}</strong> • {task?.metadata || 'À signer'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onEdit?.(task)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
        >
          <Edit3 size={15} />
          Modifier
        </button>
      </div>

      {/* Main Content: Prescription Paper Document */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-md p-8 max-w-2xl mx-auto relative overflow-hidden">
          {/* Background Stamp Watermark */}
          <div className="absolute top-4 right-4 text-slate-100 pointer-events-none select-none font-black text-6xl opacity-30 rotate-[-12deg]">
            MACROMEDICA
          </div>

          {/* Cabinet Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">DR. OTHMANE TOUGGANI</h1>
              <p className="text-xs font-bold text-blue-700">Médecine Générale & Cardiologie Clinique</p>
              <p className="text-xs font-medium text-slate-500 mt-1">Cabinet Médical Macromedica • Inscription CNO: 14890</p>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold text-slate-900">Casablanca, le {signatureDate}</p>
              <p className="text-xs text-slate-400 font-medium">Ref Ordonnance: #ORD-2026-992</p>
            </div>
          </div>

          {/* Patient Details Box */}
          <div className="bg-amber-50/60 rounded-2xl p-4 mb-6 border border-amber-200/60 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <User size={16} className="text-amber-700" />
              <span className="font-bold text-slate-900 text-base">{task?.patientName}</span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600 font-medium">Âge: 54 ans</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 font-medium text-xs">
              <Calendar size={14} strokeWidth={2.5} />
              <span>Ordonnance Valable: 3 Mois</span>
            </div>
          </div>

          {/* Prescribed Medications */}
          <div className="space-y-4 mb-8">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1">
              Prescription Médicamenteuse (Rx)
            </h3>

            {medications.map((med, index) => (
              <div key={index} className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-slate-900">{index + 1}. {med.name}</span>
                  <span className="text-xs font-bold text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-md border border-amber-200">
                    {med.duration}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-3">
                  <span>Posologie: <strong>{med.dosage}</strong></span>
                  <span>•</span>
                  <span>Fréquence: <strong>{med.freq}</strong></span>
                </div>
                {med.note && (
                  <p className="text-xs font-medium text-slate-500 italic pt-0.5">
                    Conseil: {med.note}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Interactive Signature Box */}
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-5 bg-slate-50/50 flex flex-col items-center justify-center text-center relative">
            <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
              <Stamp size={16} className="text-blue-600" />
              Signature & Cachet Électronique Médecin
            </div>

            {hasSigned ? (
              <div className="flex flex-col items-center gap-1 text-emerald-700 py-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-emerald-400 shadow-xs">
                  <CheckCircle2 size={24} className="text-emerald-600" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider">DOCUMENT SIGNÉ ÉLECTRONIQUEMENT</span>
                <span className="text-xs text-slate-400 font-medium">Horodaté le {signatureDate} • Certificat MACROMEDICA OK</span>
              </div>
            ) : (
              <div className="py-2 flex flex-col items-center gap-1">
                <div className="font-serif italic text-2xl text-blue-900 font-bold opacity-80 select-none">
                  Dr. Othmane Touggani
                </div>
                <span className="text-xs font-semibold text-slate-400">Prêt pour la signature numérique</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <ShieldCheck size={18} className="text-emerald-600" />
          <span>Certifié conforme CNO Maroc</span>
        </div>

        <button
          type="button"
          onClick={handleSign}
          disabled={isProcessing}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-sm font-bold shadow-md shadow-amber-500/20 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle2 size={18} />
          {hasSigned ? 'Signé ! Suivant...' : isBatchMode ? '⚡ Signer & Suivant' : 'Signer l\'ordonnance'}
        </button>
      </div>
    </div>
  )
}
