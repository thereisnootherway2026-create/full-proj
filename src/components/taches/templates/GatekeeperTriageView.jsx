import React, { useState } from 'react'
import { ShieldCheck, UserCheck, Stethoscope, ArrowRightLeft, ArrowUpRight, AlertCircle, FileText, Pill, MessageSquare, CreditCard, Building2, CheckCircle2, User } from 'lucide-react'
import LabResultViewer from '../LabResultViewer'
import PrescriptionViewer from '../PrescriptionViewer'
import PatientMessageViewer from '../PatientMessageViewer'
import AdminTaskViewer from '../AdminTaskViewer'

export default function GatekeeperTriageView({
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
  isProcessing,
  notify
}) {
  const [isGatekeeperActive, setIsGatekeeperActive] = useState(true)

  const isDoctorView = roleView === 'doctor'

  // Route tasks based on Gatekeeper Mode rules
  const clinicalTasks = tasks.filter(t => ['urgences', 'resultats', 'prescriptions'].includes(t.category))
  const adminTasks = tasks.filter(t => ['facturation', 'confirmations', 'cnss'].includes(t.category))
  const messageTasks = tasks.filter(t => t.category === 'messages')

  const gatekeeperVisibleTasks = isGatekeeperActive
    ? (isDoctorView ? [...clinicalTasks, ...messageTasks] : [...adminTasks, ...messageTasks])
    : tasks

  const handleEscalateToDoctor = (task) => {
    notify?.({
      title: 'Tâche Escaladée 🩺',
      description: `La tâche de ${task.patientName} a été transmise prioritairement au Docteur.`,
      variant: 'success'
    })
    handleResolveTask(task.id, `Escaladée au Docteur.`)
  }

  return (
    <div className="space-y-4">
      {/* Top Banner: Athenahealth-inspired Gatekeeper Mode Indicator & Inter-Role Routing Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center justify-center font-bold">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Mode Gatekeeper (Triage Automatique)</h3>
              <span className="bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-400">
                Athenahealth Architecture
              </span>
            </div>
            <p className="text-xs text-indigo-200 font-medium mt-0.5">
              Routage strict des tâches administratives vers le secrétariat et cliniques vers le médecin.
            </p>
          </div>
        </div>

        {/* Gatekeeper Mode Toggle Switch */}
        <div className="flex items-center gap-4 bg-white/10 p-2 rounded-xl border border-white/10 shrink-0">
          <div className="text-right">
            <span className="text-xs font-extrabold block text-white">Routage Zéro-Clutter</span>
            <span className="text-[10px] text-indigo-200 font-medium">
              {isGatekeeperActive ? '✓ Filtre Rôles Actif' : 'Tous les flux visible'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsGatekeeperActive(!isGatekeeperActive)}
            className={`w-14 h-7 rounded-full transition-colors p-1 flex items-center ${
              isGatekeeperActive ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
            }`}
          >
            <div className="w-5 h-5 rounded-full bg-white shadow-md" />
          </button>
        </div>
      </div>

      {/* 2-Column Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-18rem)] min-h-[580px]">
        {/* Left Feed Pane (40% width) */}
        <div className="lg:col-span-5 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isDoctorView ? <Stethoscope size={16} className="text-blue-600" /> : <UserCheck size={16} className="text-emerald-600" />}
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                {isDoctorView ? 'Flux Clinique Docteur' : 'Flux Administratif Secrétaire'}
              </h3>
            </div>
            <span className="bg-slate-200 text-slate-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {gatekeeperVisibleTasks.length} Tâches
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {gatekeeperVisibleTasks.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <div className="text-4xl mb-2">✨</div>
                <p className="text-sm font-bold text-slate-700">Aucune tâche assignée à ce rôle</p>
                <p className="text-xs text-slate-400 mt-1">Le routage Gatekeeper a filtré tous les flux non pertinents.</p>
              </div>
            ) : (
              gatekeeperVisibleTasks.map(t => {
                const isSelected = selectedTaskId === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTaskId(t.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/90 border-indigo-500 shadow-xs ring-1 ring-indigo-400/40'
                        : 'bg-white border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{t.patientName}</h4>
                      <span className="text-[10px] text-slate-400 font-medium shrink-0">{t.metadata}</span>
                    </div>

                    <p className="text-xs text-slate-600 font-medium line-clamp-1 mb-2">{t.description}</p>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {t.category}
                      </span>

                      {!isDoctorView && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEscalateToDoctor(t)
                          }}
                          className="text-[10px] font-extrabold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1 transition-all"
                          title="Escalader au médecin"
                        >
                          <ArrowUpRight size={12} />
                          <span>[ Escalader au Médecin ]</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Active Viewer Pane (60% width) */}
        <div className="lg:col-span-7 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden flex flex-col">
          {!selectedTask ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 text-center">
              <div className="text-4xl mb-2">🩺</div>
              <p className="text-sm font-bold text-slate-800">Aucune tâche sélectionnée</p>
            </div>
          ) : (
            <div className="h-full flex flex-col overflow-hidden">
              {/* Gatekeeper Escalation Top Action Bar for Secretary View */}
              {!isDoctorView && (
                <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-900 shrink-0">
                  <div className="flex items-center gap-2 font-bold">
                    <ArrowRightLeft size={16} className="text-amber-600" />
                    <span>Besoin de l'avis médical du médecin sur ce dossier ?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEscalateToDoctor(selectedTask)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-extrabold shadow-xs transition-all flex items-center gap-1"
                  >
                    <ArrowUpRight size={13} />
                    <span>[ Escalader au Médecin ]</span>
                  </button>
                </div>
              )}

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
      </div>
    </div>
  )
}
