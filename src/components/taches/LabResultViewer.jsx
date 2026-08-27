import React, { useState } from 'react'
import { FileText, Download, ZoomIn, ZoomOut, CheckCircle2, Send, Archive, AlertCircle, Sparkles } from 'lucide-react'

export default function LabResultViewer({ task, onApproveAndSend, onArchive, isProcessing }) {
  const [zoom, setZoom] = useState(100)
  const [patientMessage, setPatientMessage] = useState(
    `Bonjour ${task?.patientName || 'Patient'}, vos récents résultats d'analyse (Bilan Sanguin) ont été vérifiés par le médecin. Vos paramètres sont globalement stables. Veuillez poursuivre votre traitement habituel.`
  )
  const [isSent, setIsSent] = useState(false)

  const handleApprove = () => {
    setIsSent(true)
    onApproveAndSend?.(task, patientMessage)
  }

  // Mock Lab Data parameters for PDF preview
  const labParameters = task?.labData || [
    { param: 'Glycémie à jeun', value: '1.80 g/L', norm: '0.70 - 1.10 g/L', status: 'high', label: 'ÉLEVÉ' },
    { param: 'HbA1c (Hémoglobine glyquée)', value: '8.2 %', norm: '< 6.5 %', status: 'high', label: 'ÉLEVÉ' },
    { param: 'Cholestérol Total', value: '2.10 g/L', norm: '< 2.00 g/L', status: 'borderline', label: 'LÉGÈREMENT ÉLEVÉ' },
    { param: 'Triglycérides', value: '1.45 g/L', norm: '< 1.50 g/L', status: 'normal', label: 'NORMAL' },
    { param: 'Créatinine sérique', value: '8.5 mg/L', norm: '6.0 - 11.0 mg/L', status: 'normal', label: 'NORMAL' },
    { param: 'Clairance Créatinine (CKD-EPI)', value: '92 mL/min', norm: '> 60 mL/min', status: 'normal', label: 'NORMAL' },
  ]

  const abnormalParams = labParameters.filter(p => p.status === 'high' || p.status === 'borderline')

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold">
            <FileText size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{task?.description || 'Bilan Sanguin / Analyse Biologique'}</h2>
              <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-200">
                Lab Result PDF
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Patient: <strong className="text-slate-800">{task?.patientName}</strong> • {task?.metadata || 'Reçu aujourd\'hui'}
            </p>
          </div>
        </div>

        {/* Zoom & Download Bar */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(70, z - 10))}
            className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded-lg transition-colors"
            title="Zoom arrière"
          >
            <ZoomOut size={15} />
          </button>
          <span className="text-xs font-bold text-slate-700 w-10 text-center">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom(z => Math.min(130, z + 10))}
            className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded-lg transition-colors"
            title="Zoom avant"
          >
            <ZoomIn size={15} />
          </button>
          <div className="h-4 w-px bg-slate-300 mx-1" />
          <button
            type="button"
            className="px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white rounded-lg transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Download size={14} />
            PDF
          </button>
        </div>
      </div>

      {/* Scrollable Viewer Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* AI Summary Box */}
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 border border-amber-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <Sparkles size={16} />
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-amber-900">
                Synthèse IA & Valeurs Anormales
              </h3>
            </div>
            <span className="text-xs font-bold bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full border border-rose-300">
              {abnormalParams.length} anomalie(s)
            </span>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed mb-3 font-medium">
            Analyse par Antigravity AI: hyper-glycémie modérée (1.80 g/L) associée à une HbA1c à 8.2%. Les fonctions rénales et lipides secondaires demeurent dans les limites physiologiques satisfaisantes.
          </p>

          <div className="flex flex-wrap gap-2">
            {abnormalParams.map((p, idx) => (
              <div
                key={idx}
                className="bg-white/90 border border-rose-200 px-3 py-1 rounded-xl flex items-center gap-2"
              >
                <AlertCircle size={14} className="text-rose-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800">{p.param}:</span>
                <span className="text-xs font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  {p.value}
                </span>
                <span className="text-xs font-bold text-rose-800">({p.label})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Embedded PDF Document Body */}
        <div 
          className="bg-white rounded-xl border border-slate-200 p-6 transition-transform duration-200"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
        >
          {/* Lab Header */}
          <div className="border-b border-slate-200 pb-3 mb-4 flex items-center justify-between">
            <div>
              <div className="text-base font-black text-blue-950 tracking-tight">LABORATOIRE D'ANALYSES MÉDICALES DE CASABLANCA</div>
              <div className="text-xs font-semibold text-slate-500 mt-0.5">244 Boulevard Mohamed V, Casablanca • Tel: 0522-889900</div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">Examen #LAB-2026-881</span>
            </div>
          </div>

          {/* Patient Info Row */}
          <div className="bg-slate-50 rounded-xl p-3.5 mb-4 border border-slate-200/60 grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Nom & Prénom:</span>
              <strong className="text-slate-900 font-bold text-sm">{task?.patientName}</strong>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Mutuelle:</span>
              <span className="font-semibold text-blue-700">CNSS / CNOPS</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Prescripteur:</span>
              <span className="font-semibold text-slate-800">Dr. Othmane Touggani</span>
            </div>
          </div>

          {/* Test Parameters Table */}
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                <th className="py-2.5 px-3">Analyse / Paramètre</th>
                <th className="py-2.5 px-3">Résultat Obtenu</th>
                <th className="py-2.5 px-3">Valeurs de Référence</th>
                <th className="py-2.5 px-3 text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {labParameters.map((item, idx) => (
                <tr key={idx} className={item.status === 'high' ? 'bg-rose-50/40' : item.status === 'borderline' ? 'bg-amber-50/30' : ''}>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{item.param}</td>
                  <td className={`py-2.5 px-3 font-extrabold ${item.status === 'high' ? 'text-rose-700' : item.status === 'borderline' ? 'text-amber-700' : 'text-slate-900'}`}>
                    {item.value}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">{item.norm}</td>
                  <td className="py-2.5 px-3 text-right">
                    {item.status === 'high' ? (
                      <span className="bg-rose-100 text-rose-800 text-xs font-black px-2.5 py-0.5 rounded border border-rose-200">
                        {item.label}
                      </span>
                    ) : item.status === 'borderline' ? (
                      <span className="bg-amber-100 text-amber-800 text-xs font-black px-2.5 py-0.5 rounded border border-amber-200">
                        {item.label}
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded border border-emerald-200">
                        {item.label}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pre-Drafted AI Action / Patient Notification */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Send size={15} className="text-blue-600" />
              Notification Patient (WhatsApp / SMS)
            </label>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <Sparkles size={13} />
              Brouillon IA Prêt
            </span>
          </div>

          <textarea
            rows={3}
            value={patientMessage}
            onChange={(e) => setPatientMessage(e.target.value)}
            className="w-full p-3.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 leading-relaxed font-medium bg-slate-50/50"
            placeholder="Saisissez ou modifiez le message..."
          />
        </div>
      </div>

      {/* Bottom Sticky Action Controls */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={() => onArchive?.(task)}
          disabled={isProcessing}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-bold flex items-center gap-2 transition-colors"
        >
          <Archive size={16} />
          Archiver au dossier
        </button>

        <button
          type="button"
          onClick={handleApprove}
          disabled={isProcessing || isSent}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md shadow-blue-500/20 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle2 size={18} />
          {isSent ? 'Approuvé & Envoyé !' : 'Approuver & Send WhatsApp/SMS'}
        </button>
      </div>
    </div>
  )
}
