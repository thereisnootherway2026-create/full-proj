import React from 'react'
import { CheckCircle2, Phone, Building2 } from 'lucide-react'

export default function AdminTaskViewer({ task, onResolve, onContact, isProcessing }) {
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold">
            <Building2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{task?.description || 'Tâche Administrative & Secrétariat'}</h2>
              <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
                Secrétariat
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Patient: <strong className="text-slate-800">{task?.patientName}</strong> • {task?.metadata || 'Priorité normale'}
            </p>
          </div>
        </div>

        <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
          En attente secrétariat
        </span>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">
            Détails de la demande
          </h3>

          <div className="space-y-3.5 text-sm bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80">
            <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">Type d'anomalie / Objet:</span>
              <span className="font-bold text-slate-900">{task?.description}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">Patient concerné:</span>
              <span className="font-bold text-blue-700">{task?.patientName}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 font-medium">Dossier / Facture liée:</span>
              <span className="font-semibold text-slate-700">#FAC-2026-441</span>
            </div>
          </div>
        </div>

        {/* Action Instruction Box */}
        <div className="bg-blue-50/80 rounded-2xl p-4 border border-blue-100 text-sm text-blue-900 leading-relaxed font-medium">
          💡 <strong>Action Recommandée:</strong> Vérifiez la pièce justificative manquante ou contactez le patient pour valider la prise en charge CNSS avant transmission administrative.
        </div>
      </div>

      {/* Bottom Sticky Actions */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={() => onContact?.(task)}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-bold flex items-center gap-2 transition-colors"
        >
          <Phone size={16} />
          Contacter le patient
        </button>

        <button
          type="button"
          onClick={() => onResolve?.(task)}
          disabled={isProcessing}
          className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle2 size={18} />
          Valider & Transmettre
        </button>
      </div>
    </div>
  )
}
