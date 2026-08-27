import React, { useState } from 'react'
import { Terminal, Send, Zap, Calendar, CheckCircle2, FileText, Pill, MessageSquare, AlertCircle, Sparkles, Command } from 'lucide-react'
import Tooltip from '../ui/Tooltip'

export default function CanvasCommandTimeline({
  tasks = [],
  handleResolveTask,
  notify
}) {
  const [commandInput, setCommandInput] = useState('')
  const [showCommandsMenu, setShowCommandsMenu] = useState(false)

  // Real-time clinical event stream
  const [events, setEvents] = useState([
    { id: 'e1', patientName: 'Meryem Tazi', type: 'urgence', text: 'Alerte Constantes: Tension 185/110 mmHg mesurée par l\'accueil', time: '10:05', status: 'pending', code: 'VITAL_ALERT' },
    { id: 'e2', patientName: 'Sarah Benali', type: 'resultats', text: 'PDF Labo Téléchargé: HbA1c 8.2% & Glycémie à jeun 1.80 g/L', time: '09:30', status: 'pending', code: 'LAB_UPLOAD' },
    { id: 'e3', patientName: 'Ahmed Benali', type: 'prescriptions', text: 'Demande de renouvellement d\'ordonnance HTA (Amlor 5mg)', time: '09:15', status: 'pending', code: 'RX_RENEW' },
    { id: 'e4', patientName: 'Soufiane Kadiri', type: 'messages', text: 'WhatsApp: "Dois-je continuer le traitement avec les repas ?"', time: '08:45', status: 'pending', code: 'PATIENT_MSG' },
    { id: 'e5', patientName: 'Omar Bennani', type: 'facturation', text: 'Facture CNSS #441 en attente de régularisation mutuelle', time: 'Hier', status: 'resolved', code: 'CNSS_SYNC' }
  ])

  const commandOptions = [
    { cmd: '/prescrire Amlor 5mg', desc: 'Générer ordonnance HTA' },
    { cmd: '/rdv Demain 10:00', desc: 'Programmer consultation' },
    { cmd: '/facturer 300 MAD', desc: 'Créer note d\'honoraires' },
    { cmd: '/envoyer WhatsApp OK', desc: 'Transmission bilan normal' }
  ]

  const handleInputChange = (e) => {
    const val = e.target.value
    setCommandInput(val)
    setShowCommandsMenu(val.startsWith('/'))
  }

  const handleExecuteCommand = (cmdText) => {
    const topPending = events.find(e => e.status === 'pending')
    if (topPending) {
      setEvents(prev => prev.map(e => e.id === topPending.id ? { ...e, status: 'resolved' } : e))
      notify?.({
        title: 'Commande Exécutée ⚡',
        description: `Action "${cmdText}" exécutée sur le dossier de ${topPending.patientName}.`,
        variant: 'success'
      })
    } else {
      notify?.({
        title: 'Commande Enregistrée 📝',
        description: `Commande "${cmdText}" ajoutée au fil des événements.`,
        variant: 'info'
      })
    }
    setCommandInput('')
    setShowCommandsMenu(false)
  }

  const handleQuickChip = (chipLabel, detailText) => {
    const topPending = events.find(e => e.status === 'pending')
    if (topPending) {
      setEvents(prev => prev.map(e => e.id === topPending.id ? { ...e, status: 'resolved' } : e))
      notify?.({
        title: 'Événement Clôturé ⚡',
        description: `${chipLabel} exécuté pour ${topPending.patientName}.`,
        variant: 'success'
      })
    }
  }

  return (
    <div className="h-[calc(100vh-14rem)] min-h-[620px] rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
      {/* Top Stream Banner */}
      <div className="p-4 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center font-bold">
            <Terminal size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Canvas Event Stream & Smart Command Bar</h3>
              <span className="bg-blue-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                Canvas Medical Paradigm
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Flux chronologique unique unifié • Tapez <code className="bg-white/20 px-1 py-0.5 rounded font-mono text-white">/</code> pour les raccourcis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full border border-emerald-400/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Flux Live Actif
          </span>
        </div>
      </div>

      {/* Main Unified Chronological Event Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
        <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-4">
          {events.map((evt) => {
            const isResolved = evt.status === 'resolved'
            return (
              <div key={evt.id} className="relative group">
                <div className={`absolute -left-[31px] top-2.5 w-4 h-4 rounded-full border-4 shadow-2xs ${
                  isResolved ? 'bg-emerald-500 border-white' : 'bg-blue-600 border-white'
                }`} />

                <div className={`p-4 rounded-2xl border transition-all ${
                  isResolved ? 'bg-emerald-50/40 border-emerald-200/80 opacity-75' : 'bg-white border-slate-200 shadow-2xs hover:shadow-sm'
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-bold text-slate-900">{evt.patientName}</strong>
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {evt.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">{evt.time}</span>
                      {isResolved ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={12} /> Traité
                        </span>
                      ) : (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full animate-pulse">
                          En Attente
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 font-medium leading-relaxed">{evt.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* FIXED BOTTOM SMART COMMAND BAR */}
      <div className="p-4 bg-white border-t border-slate-200 space-y-3 shrink-0 relative shadow-lg">
        {/* Autocomplete Menu overlay when typing '/' */}
        {showCommandsMenu && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-slate-900 text-white rounded-2xl p-2 shadow-2xl border border-slate-700 space-y-1 z-50">
            <div className="text-[10px] font-black uppercase text-slate-400 px-3 py-1">Commandes Rapides Disponibles:</div>
            {commandOptions.map((opt, idx) => (
              <div
                key={idx}
                onClick={() => handleExecuteCommand(opt.cmd)}
                className="p-2.5 hover:bg-slate-800 rounded-xl cursor-pointer flex items-center justify-between text-xs font-medium transition-colors"
              >
                <code className="text-blue-400 font-mono font-bold">{opt.cmd}</code>
                <span className="text-slate-300">{opt.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* AI Contextual Action Chips above input */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs font-bold text-slate-400 uppercase shrink-0 flex items-center gap-1">
            <Sparkles size={13} className="text-amber-500" />
            Actions 1-Clic:
          </span>

          <Tooltip content="Valide le bilan récent, génère l'observation et notifie le patient par WhatsApp">
            <button
              type="button"
              onClick={() => handleQuickChip('[ ⚡ Valider Bilan + WhatsApp ]')}
              className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold shrink-0 transition-all shadow-2xs"
            >
              [ ⚡ Valider Bilan + WhatsApp ]
            </button>
          </Tooltip>

          <Tooltip content="Transmet un lien de convocation automatique pour le créneau de consultation de demain">
            <button
              type="button"
              onClick={() => handleQuickChip('[ 📅 Convoquer Demain ]')}
              className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold shrink-0 transition-all shadow-2xs"
            >
              [ 📅 Convoquer Demain ]
            </button>
          </Tooltip>

          <Tooltip content="Signe électroniquement l'ordonnance et l'envoie sur le smartphone du patient">
            <button
              type="button"
              onClick={() => handleQuickChip('[ 💊 Renouveler Ordonnance ]')}
              className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold shrink-0 transition-all shadow-2xs"
            >
              [ 💊 Renouveler Ordonnance ]
            </button>
          </Tooltip>
        </div>

        {/* Command Input Box */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Command size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={commandInput}
              onChange={handleInputChange}
              onKeyDown={(e) => e.key === 'Enter' && commandInput.trim() && handleExecuteCommand(commandInput)}
              placeholder="Tapez / pour les commandes cliniques rapides ou votre note..."
              className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
            />
          </div>

          <Tooltip content="Exécuter la commande et clôturer l'événement prioritaire">
            <button
              type="button"
              onClick={() => commandInput.trim() && handleExecuteCommand(commandInput)}
              className="h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
            >
              <Send size={15} />
              <span>Exécuter</span>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
