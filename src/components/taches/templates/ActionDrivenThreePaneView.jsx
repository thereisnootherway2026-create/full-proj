import React from 'react'
import { AlertTriangle, FileText, Pill, MessageSquare, CreditCard, User, Calendar, Activity, CheckCircle2, Send, Clock, Sparkles, Phone, ShieldCheck } from 'lucide-react'
import LabResultViewer from '../LabResultViewer'
import PrescriptionViewer from '../PrescriptionViewer'
import PatientMessageViewer from '../PatientMessageViewer'
import AdminTaskViewer from '../AdminTaskViewer'

export default function ActionDrivenThreePaneView({
  tasks,
  selectedTask,
  selectedTaskId,
  setSelectedTaskId,
  roleView,
  handleResolveTask,
  handleApproveAndSend,
  handleArchive,
  handleSignNextPrescription,
  handleSendReply,
  handleAdminResolve,
  isProcessing
}) {
  const isDoctorView = roleView === 'doctor'

  // Categorized Triage Groups for Left Pane (25% width)
  const urgentTasks = tasks.filter(t => t.category === 'urgences')
  const prescriptionTasks = tasks.filter(t => t.category === 'prescriptions')
  const labTasks = tasks.filter(t => t.category === 'resultats')
  const messageTasks = tasks.filter(t => t.category === 'messages')
  const adminTasks = tasks.filter(t => ['facturation', 'confirmations', 'cnss'].includes(t.category))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-14rem)] min-h-[620px]">
      
      {/* 🔴 LEFT PANE (25% width - Grouped Triage Feed) */}
      <div className="lg:col-span-3 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-blue-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Fil de Triage Groupé</h3>
          </div>
          <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
            {tasks.length} Tâches
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Group 1: 🔴 Médical Urgent */}
          {urgentTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-red-600 animate-pulse" />
                  🔴 Médical Urgent ({urgentTasks.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {urgentTasks.map(t => (
                  <TaskCardItem
                    key={t.id}
                    task={t}
                    isSelected={selectedTaskId === t.id}
                    onSelect={() => setSelectedTaskId(t.id)}
                    accentColor="border-red-300 bg-red-50/30"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 2: 🟡 Renouvellement Ordonnance */}
          {prescriptionTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Pill size={13} className="text-amber-600" />
                  🟡 Renouvellement Ordonnance ({prescriptionTasks.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {prescriptionTasks.map(t => (
                  <TaskCardItem
                    key={t.id}
                    task={t}
                    isSelected={selectedTaskId === t.id}
                    onSelect={() => setSelectedTaskId(t.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 3: 🔵 Bilans & Résultats */}
          {labTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText size={13} className="text-blue-600" />
                  🔵 Bilans & Résultats ({labTasks.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {labTasks.map(t => (
                  <TaskCardItem
                    key={t.id}
                    task={t}
                    isSelected={selectedTaskId === t.id}
                    onSelect={() => setSelectedTaskId(t.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 4: 🟣 Messages Patients */}
          {messageTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-purple-800 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-purple-600" />
                  🟣 Messages Patients ({messageTasks.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {messageTasks.map(t => (
                  <TaskCardItem
                    key={t.id}
                    task={t}
                    isSelected={selectedTaskId === t.id}
                    onSelect={() => setSelectedTaskId(t.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 5: 🟢 Admin, Facturation & CNSS */}
          {adminTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CreditCard size={13} className="text-emerald-600" />
                  🟢 Admin, Factures & CNSS ({adminTasks.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {adminTasks.map(t => (
                  <TaskCardItem
                    key={t.id}
                    task={t}
                    isSelected={selectedTaskId === t.id}
                    onSelect={() => setSelectedTaskId(t.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 🟢 CENTER PANE (50% width - Active Contextual Workspace) */}
      <div className="lg:col-span-6 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
        {!selectedTask ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 text-center">
            <div className="text-4xl mb-2">🩺</div>
            <p className="text-sm font-bold text-slate-800">Sélectionnez une tâche à traiter</p>
          </div>
        ) : (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Top Compact Contextual Patient Banner (Doctolib style) */}
            <div className="p-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  {selectedTask.patientName?.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black tracking-wide">{selectedTask.patientName}</h3>
                    <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      54 ans • HTA / Diabète T2
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium flex items-center gap-2 mt-0.5">
                    <span>Dernière visite: 12/07/2026</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">Dossier #MAC-8841</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-400/30">
                  Patient Actif
                </span>
              </div>
            </div>

            {/* Active Task Workspace Component */}
            <div className="flex-1 overflow-y-auto">
              {selectedTask.category === 'resultats' && (
                <LabResultViewer
                  task={selectedTask}
                  onApproveAndSend={handleApproveAndSend}
                  onArchive={handleArchive}
                  isProcessing={isProcessing}
                />
              )}

              {selectedTask.category === 'prescriptions' && (
                <PrescriptionViewer
                  task={selectedTask}
                  onSignNext={handleSignNextPrescription}
                  onEdit={() => {}}
                  isBatchMode={false}
                  batchRemainingCount={1}
                  isProcessing={isProcessing}
                />
              )}

              {selectedTask.category === 'messages' && (
                <PatientMessageViewer
                  task={selectedTask}
                  onSendReply={handleSendReply}
                  isProcessing={isProcessing}
                />
              )}

              {(selectedTask.category === 'urgences' || selectedTask.category === 'facturation' || selectedTask.category === 'confirmations' || selectedTask.category === 'cnss') && (
                <AdminTaskViewer
                  task={selectedTask}
                  onResolve={handleAdminResolve}
                  onContact={() => {}}
                  isProcessing={isProcessing}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 🔵 RIGHT PANE (25% width - Action Pad & SmartPhrases) */}
      <div className="lg:col-span-3 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Action Pad (SmartPhrases)</h3>
          </div>
          <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
            1-Click Protocols
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick Action Protocol Buttons */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
              Protocoles Médicaux Rapides:
            </span>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => selectedTask && handleResolveTask(selectedTask.id, `Ordonnance de ${selectedTask.patientName} approuvée & renouvelée en 1 clic.`)}
                disabled={!selectedTask || isProcessing}
                className="w-full p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold text-left transition-all hover:scale-[1.01] active:scale-95 shadow-2xs flex items-center justify-between group disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>[ Approuver & Renouveler Ordonnance ]</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectedTask && handleResolveTask(selectedTask.id, `Notification "Bilan OK" transmise à ${selectedTask.patientName}.`)}
                disabled={!selectedTask || isProcessing}
                className="w-full p-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold text-left transition-all hover:scale-[1.01] active:scale-95 shadow-2xs flex items-center justify-between group disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Send size={15} className="text-blue-600 shrink-0" />
                  <span>[ Envoyer "Bilan OK" & Clôturer ]</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectedTask && handleResolveTask(selectedTask.id, `Invitation de consultation transmise à ${selectedTask.patientName}.`)}
                disabled={!selectedTask || isProcessing}
                className="w-full p-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold text-left transition-all hover:scale-[1.01] active:scale-95 shadow-2xs flex items-center justify-between group disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Calendar size={15} className="text-amber-600 shrink-0" />
                  <span>[ Convoquer pour RDV ]</span>
                </div>
              </button>
            </div>
          </div>

          {/* Quick Notes & Chart Summary */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Notes Rapides & Constantes:
            </span>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-1.5 font-medium">
              <div className="flex justify-between">
                <span className="text-slate-400">Tension Artérielle:</span>
                <strong className="text-slate-900 font-bold">135/85 mmHg</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Poids / IMC:</span>
                <strong className="text-slate-900 font-bold">78 kg (26.2)</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Allergies:</span>
                <strong className="text-red-700 font-bold">Pénicilline</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskCardItem({ task, isSelected, onSelect, accentColor }) {
  return (
    <div
      onClick={onSelect}
      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-400/40 shadow-xs'
          : accentColor || 'bg-white border-slate-200/80 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <h4 className="text-xs font-bold text-slate-900 truncate">{task.patientName}</h4>
        <span className="text-[10px] text-slate-400 font-medium shrink-0">{task.metadata}</span>
      </div>
      <p className="text-[11px] text-slate-600 font-medium line-clamp-1">{task.description}</p>
    </div>
  )
}
