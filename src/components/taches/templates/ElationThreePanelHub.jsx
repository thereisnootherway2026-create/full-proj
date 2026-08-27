import React, { useState } from 'react'
import { AlertTriangle, Pill, CreditCard, Send, CheckCircle2, Calendar, FileText, User, Sparkles, MessageSquare, DollarSign, ShieldAlert, Download, Phone } from 'lucide-react'
import Tooltip from '../ui/Tooltip'

export default function ElationThreePanelHub({
  tasks = [],
  selectedTask,
  selectedTaskId,
  setSelectedTaskId,
  handleResolveTask,
  isProcessing,
  notify
}) {
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: 'patient', text: 'Bonjour Docteur, pouvez-vous vérifier mon bilan sanguin et me dire si je dois continuer Amlor ?', time: '09:30' }
  ])
  const [replyInput, setReplyInput] = useState('')

  // Group tasks by urgency
  const urgentTasks = tasks.filter(t => t.category === 'urgences')
  const rxTasks = tasks.filter(t => t.category === 'prescriptions')
  const adminTasks = tasks.filter(t => ['facturation', 'confirmations', 'cnss'].includes(t.category))

  const activeTask = selectedTask || tasks[0]

  const handleApproveRenew = () => {
    if (!activeTask) return
    notify?.({
      title: 'Ordonnance Approuvée & Renouvelée ⚡',
      description: `PDF généré, horodaté et envoyé par WhatsApp à ${activeTask.patientName}.`,
      variant: 'success'
    })
    setChatMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'doctor', text: `✅ Ordonnance approuvée et renouvelée pour 30 jours. Le document PDF vous a été transmis.`, time: 'À l\'instant' }
    ])
    handleResolveTask(activeTask.id, `Ordonnance de ${activeTask.patientName} traitée.`)
  }

  const handleSendBilanNormal = () => {
    if (!activeTask) return
    notify?.({
      title: 'Bilan Reassurant Transmis 🧪',
      description: `Message de réassurance transmis sur WhatsApp à ${activeTask.patientName}.`,
      variant: 'success'
    })
    setChatMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'doctor', text: `🧪 Bonjour ${activeTask.patientName}, votre bilan sanguin récent est parfaitement normal. Poursuivez vos habitudes actuelles.`, time: 'À l\'instant' }
    ])
    handleResolveTask(activeTask.id, `Bilan de ${activeTask.patientName} clôturé.`)
  }

  const handleConvoquerRDV = () => {
    if (!activeTask) return
    notify?.({
      title: 'Invitation RDV Transmise 📅',
      description: `Lien de prise de rendez-vous prioritaire envoyé à ${activeTask.patientName}.`,
      variant: 'info'
    })
    setChatMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'doctor', text: `📅 Bonjour ${activeTask.patientName}, une consultation en cabinet est conseillée. Voici le lien de réservation: https://macromedica.ma/rdv?p=${activeTask.patientName}`, time: 'À l\'instant' }
    ])
    handleResolveTask(activeTask.id, `Convoqué pour consultation.`)
  }

  const handleSendCustomMessage = () => {
    if (!replyInput.trim() || !activeTask) return
    setChatMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'doctor', text: replyInput.trim(), time: 'À l\'instant' }
    ])
    notify?.({
      title: 'Message Envoyé 💬',
      description: `Message transmis à ${activeTask.patientName}.`,
      variant: 'success'
    })
    setReplyInput('')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-14rem)] min-h-[620px]">
      
      {/* 🔴 LEFT PANE (25% Width - Elation Grouped Triage Feed) */}
      <div className="lg:col-span-3 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Sparkles size={16} className="text-blue-600" />
            <span>Console Elation Hub</span>
          </h3>
          <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full">
            {tasks.length} Tâches
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Urgent Group */}
          {urgentTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-red-600 animate-pulse" />
                🔴 Urgence Clinique ({urgentTasks.length})
              </div>
              <div className="space-y-1.5">
                {urgentTasks.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isSelected={selectedTaskId === t.id}
                    onSelect={() => setSelectedTaskId(t.id)}
                    badgeColor="bg-red-100 text-red-700"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Prescriptions Group */}
          {rxTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 mb-2 flex items-center gap-1.5">
                <Pill size={13} className="text-amber-600" />
                🟡 Renouvellements ({rxTasks.length})
              </div>
              <div className="space-y-1.5">
                {rxTasks.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isSelected={selectedTaskId === t.id}
                    onSelect={() => setSelectedTaskId(t.id)}
                    badgeColor="bg-amber-100 text-amber-800"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Admin Group */}
          {adminTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 mb-2 flex items-center gap-1.5">
                <CreditCard size={13} className="text-emerald-600" />
                🔵 Admin / CNSS ({adminTasks.length})
              </div>
              <div className="space-y-1.5">
                {adminTasks.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isSelected={selectedTaskId === t.id}
                    onSelect={() => setSelectedTaskId(t.id)}
                    badgeColor="bg-emerald-100 text-emerald-800"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 🟢 CENTER PANE (50% Width - Contextual Workspace with Sticky Patient Banner) */}
      <div className="lg:col-span-6 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
        {!activeTask ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="text-4xl mb-2">🩺</div>
            <p className="text-sm font-bold text-slate-800">Aucune tâche sélectionnée</p>
          </div>
        ) : (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Sticky Patient Quick-Profile Banner (Doctolib / Elation Style) */}
            <div className="p-3.5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  {activeTask.patientName?.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-white">{activeTask.patientName}</h3>
                    <span className="bg-white/20 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      54 ans • HTA / Diabète T2
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium flex items-center gap-2 mt-0.5">
                    <span>Dernière visite: 12/07/2026</span>
                    <span>•</span>
                    <span className="text-blue-300 font-bold">CIN: AB88419</span>
                  </div>
                </div>
              </div>

              {/* Unpaid Balance Warning Pill */}
              <div className="flex items-center gap-2">
                <Tooltip content="Le patient possède un solde impayé de consultation antérieure à régulariser en caisse">
                  <span className="bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-black px-2.5 py-1 rounded-xl flex items-center gap-1">
                    <DollarSign size={13} className="text-amber-400" />
                    Reste 150 MAD
                  </span>
                </Tooltip>
              </div>
            </div>

            {/* Main Body: WhatsApp Thread & Embedded Lab Document */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/40">
              {/* WhatsApp Chat Thread */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-emerald-600" />
                    Fil de discussion WhatsApp Direct
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">Canal Sécurisé MACROMEDICA</span>
                </div>

                <div className="space-y-2.5 max-h-56 overflow-y-auto p-1">
                  {chatMessages.map(m => (
                    <div key={m.id} className={`flex flex-col ${m.sender === 'doctor' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3 rounded-2xl text-xs max-w-sm leading-relaxed ${
                        m.sender === 'doctor' ? 'bg-blue-600 text-white font-medium rounded-tr-xs' : 'bg-slate-100 text-slate-800 font-medium rounded-tl-xs'
                      }`}>
                        {m.text}
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold mt-0.5">{m.time}</span>
                    </div>
                  ))}
                </div>

                {/* Reply Input Bar */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <input
                    type="text"
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendCustomMessage()}
                    placeholder="Saisissez votre réponse WhatsApp..."
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                  />
                  <Tooltip content="Envoyer le message WhatsApp au patient">
                    <button
                      type="button"
                      onClick={handleSendCustomMessage}
                      className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
                    >
                      <Send size={14} />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Embedded Lab / Prescription Document Inspection Box */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText size={14} className="text-blue-600" />
                    Document Médical Associé (#LAB-2026-881)
                  </span>
                  <Tooltip content="Télécharger le fichier PDF au format d'impression original">
                    <button type="button" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                      <Download size={13} />
                      PDF
                    </button>
                  </Tooltip>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-700 font-medium space-y-1">
                  <div className="flex justify-between">
                    <span>Examen: Bilan Sanguin Complexe</span>
                    <strong className="text-red-600 font-bold">Glycémie 1.80 g/L (Élevé)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>HbA1c: 8.2%</span>
                    <span className="text-emerald-700 font-bold">Créatinine: 8.5 mg/L (Normal)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 🔵 RIGHT PANE (25% Width - AI Note Assist & 1-Click Protocol Bundles) */}
      <div className="lg:col-span-3 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Sparkles size={16} className="text-amber-500" />
            <span>AI Smart Protocol Bundles</span>
          </h3>
          <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
            1-Click Execution
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
            Résolutions Automatiques:
          </span>

          <div className="space-y-2.5">
            {/* Action 1 */}
            <Tooltip content="Génère l'ordonnance PDF sécurisée + Envoie le message de confirmation WhatsApp au patient + Clôture la tâche dans l'inbox.">
              <button
                type="button"
                onClick={handleApproveRenew}
                disabled={!activeTask || isProcessing}
                className="w-full p-3.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold text-left transition-all hover:scale-[1.01] active:scale-95 shadow-2xs flex items-center justify-between group disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>[ Approuver & Renouveler ]</span>
                </div>
              </button>
            </Tooltip>

            {/* Action 2 */}
            <Tooltip content="Envoie un message WhatsApp automatique de réassurance ('Bilan Normal') au patient et marque le dossier comme traité.">
              <button
                type="button"
                onClick={handleSendBilanNormal}
                disabled={!activeTask || isProcessing}
                className="w-full p-3.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 rounded-2xl text-xs font-bold text-left transition-all hover:scale-[1.01] active:scale-95 shadow-2xs flex items-center justify-between group disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Send size={16} className="text-blue-600 shrink-0" />
                  <span>[ Envoyer "Bilan Normal" ]</span>
                </div>
              </button>
            </Tooltip>

            {/* Action 3 */}
            <Tooltip content="Envoie un lien interactif de réservation de rendez-vous sur WhatsApp avec suggestions de créneaux disponibles.">
              <button
                type="button"
                onClick={handleConvoquerRDV}
                disabled={!activeTask || isProcessing}
                className="w-full p-3.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-2xl text-xs font-bold text-left transition-all hover:scale-[1.01] active:scale-95 shadow-2xs flex items-center justify-between group disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-amber-600 shrink-0" />
                  <span>[ Convoquer au Cabinet ]</span>
                </div>
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskCard({ task, isSelected, onSelect, badgeColor }) {
  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-400/40 shadow-2xs'
          : 'bg-white border-slate-200/80 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <h4 className="text-xs font-bold text-slate-900 truncate">{task.patientName}</h4>
        <span className="text-[10px] font-semibold text-slate-400 shrink-0">{task.metadata}</span>
      </div>
      <p className="text-[11px] text-slate-600 font-medium line-clamp-1">{task.description}</p>
    </div>
  )
}
