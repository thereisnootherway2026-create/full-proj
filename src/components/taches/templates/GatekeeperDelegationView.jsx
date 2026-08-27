import React, { useState } from 'react'
import { ShieldCheck, Stethoscope, ArrowUpRight, ArrowLeftRight, CheckCircle2, UserCheck, AlertTriangle, FileText, Pill, CreditCard } from 'lucide-react'
import Tooltip from '../ui/Tooltip'
import LabResultViewer from '../LabResultViewer'
import PrescriptionViewer from '../PrescriptionViewer'
import PatientMessageViewer from '../PatientMessageViewer'
import AdminTaskViewer from '../AdminTaskViewer'

export default function GatekeeperDelegationView({
  tasks = [],
  selectedTask,
  selectedTaskId,
  setSelectedTaskId,
  handleResolveTask,
  handleApproveAndSend,
  handleArchive,
  handleSignNextPrescription,
  handleSendReply,
  handleAdminResolve,
  isProcessing,
  notify
}) {
  const [delegationRole, setDelegationRole] = useState('secretary') // 'secretary' or 'doctor'

  const [gatekeeperTasks, setGatekeeperTasks] = useState([
    { id: 'g1', patientName: 'Meryem Tazi', category: 'urgences', description: 'Tension 185/110 mmHg en salle d\'attente', tag: '#SymptômeUrgent', assignedRole: 'doctor', time: '10:05' },
    { id: 'g2', patientName: 'Sarah Benali', category: 'resultats', description: 'Bilan sanguin complet & HbA1c 8.2%', tag: '#ValidationBiologique', assignedRole: 'doctor', time: '09:30' },
    { id: 'g3', patientName: 'Ahmed Benali', category: 'prescriptions', description: 'Renouvellement Amlor 5mg', tag: '#RenouvellementRx', assignedRole: 'doctor', time: '09:15' },
    { id: 'g4', patientName: 'Omar Bennani', category: 'facturation', description: 'Anomalie Dossier Mutuelle CNSS', tag: '#CNSS_Manquant', assignedRole: 'secretary', time: 'Secrétariat' },
    { id: 'g5', patientName: 'Karim Amrani', category: 'confirmations', description: 'Demande de confirmation RDV Demain', tag: '#Facturation', assignedRole: 'secretary', time: 'Secrétariat' },
    { id: 'g6', patientName: 'Soufiane Kadiri', category: 'messages', description: 'Question posologie traitement', tag: '#MessageSecrétariat', assignedRole: 'secretary', time: 'Il y a 2h' }
  ])

  const activeRoleTasks = gatekeeperTasks.filter(t => t.assignedRole === delegationRole)
  const activeTask = activeRoleTasks.find(t => t.id === selectedTaskId) || activeRoleTasks[0] || null

  const handleEscalateToDoctor = (task) => {
    setGatekeeperTasks(prev => 
      prev.map(t => t.id === task.id ? { ...t, assignedRole: 'doctor', tag: '#DoctorUrgent' } : t)
    )
    notify?.({
      title: 'Tâche Escaladée au Docteur 🩺',
      description: `La tâche de ${task.patientName} a été transférée au bureau du médecin avec le badge #DoctorUrgent.`,
      variant: 'success'
    })
  }

  const handleSendBackToSecretary = (task) => {
    setGatekeeperTasks(prev => 
      prev.map(t => t.id === task.id ? { ...t, assignedRole: 'secretary', tag: '#RDV_Secrétariat' } : t)
    )
    notify?.({
      title: 'Renvoyé au Secrétariat ↩️',
      description: `Dossier de ${task.patientName} transmis pour prise de RDV / suivi caisse.`,
      variant: 'info'
    })
  }

  return (
    <div className="space-y-4">
      {/* TOP DELEGATION DUAL-ROLE TOGGLE HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center justify-center font-bold">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Dual-Role Gatekeeper & Inter-Role Handoffs</h3>
              <span className="bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                Athenahealth & Klara Model
              </span>
            </div>
            <p className="text-xs text-indigo-200 font-medium mt-0.5">
              Filtrage strict entre tâches secrétariat et cliniques avec boutons de transfert bilatéral en 1 clic.
            </p>
          </div>
        </div>

        {/* Dual Role Header Toggle */}
        <div className="bg-white/10 p-1 rounded-xl flex items-center gap-1.5 border border-white/10 shrink-0">
          <Tooltip content="Afficher uniquement les tâches administratives, factures et confirmations RDV du secrétariat">
            <button
              type="button"
              onClick={() => setDelegationRole('secretary')}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-2 ${
                delegationRole === 'secretary'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <UserCheck size={15} />
              <span>🛡️ Vue Secrétariat (Admin & CNSS)</span>
            </button>
          </Tooltip>

          <Tooltip content="Afficher uniquement les urgences cliniques, résultats de labo et ordonnances du docteur">
            <button
              type="button"
              onClick={() => setDelegationRole('doctor')}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-2 ${
                delegationRole === 'doctor'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Stethoscope size={15} />
              <span>🩺 Vue Docteur (Cliniques)</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 2-COLUMN SPLIT WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-18rem)] min-h-[580px]">
        {/* Left Pane (40% width) */}
        <div className="lg:col-span-5 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              {delegationRole === 'doctor' ? <Stethoscope size={16} className="text-blue-600" /> : <UserCheck size={16} className="text-emerald-600" />}
              <span>{delegationRole === 'doctor' ? 'Tâches Cliniques Assignées au Docteur' : 'Tâches Administratives Secrétariat'}</span>
            </h3>
            <span className="bg-slate-200 text-slate-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
              {activeRoleTasks.length} Actives
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {activeRoleTasks.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <div className="text-4xl mb-2">✨</div>
                <p className="text-sm font-bold text-slate-700">Aucune tâche dans cette file</p>
              </div>
            ) : (
              activeRoleTasks.map(t => {
                const isSelected = (activeTask?.id === t.id)
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTaskId(t.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/90 border-indigo-500 shadow-xs ring-1 ring-indigo-400/40'
                        : 'bg-white border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{t.patientName}</h4>
                      <span className="text-[10px] text-slate-400 font-semibold">{t.time}</span>
                    </div>

                    <p className="text-xs text-slate-600 font-medium line-clamp-1 mb-2">{t.description}</p>

                    <div className="flex items-center justify-between">
                      {/* Automated AI Keyword Badge */}
                      <span className="text-[10px] font-mono font-extrabold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {t.tag}
                      </span>

                      {/* Role Handoff Action Button */}
                      {delegationRole === 'secretary' ? (
                        <Tooltip content="Transfère le fil au bureau du médecin avec notification visuelle prioritaire #DoctorUrgent">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEscalateToDoctor(t)
                            }}
                            className="text-[10px] font-extrabold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all shadow-2xs"
                          >
                            <ArrowUpRight size={12} />
                            <span>[ ↗️ Escalader au Médecin ]</span>
                          </button>
                        </Tooltip>
                      ) : (
                        <Tooltip content="Renoie le dossier au secrétariat pour convocation de rendez-vous ou règlement caisse">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSendBackToSecretary(t)
                            }}
                            className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all shadow-2xs"
                          >
                            <span>[ ↩️ Renvoyer pour RDV ]</span>
                          </button>
                        </Tooltip>
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
          {!activeTask ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 text-center">
              <div className="text-4xl mb-2">🩺</div>
              <p className="text-sm font-bold text-slate-800">Aucune tâche sélectionnée</p>
            </div>
          ) : (
            <div className="h-full flex flex-col overflow-hidden">
              {/* Context Handoff Top Banner */}
              <div className="p-3 bg-slate-900 text-white flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2 font-bold">
                  <ArrowLeftRight size={15} className="text-indigo-400" />
                  <span>Dossier: {activeTask.patientName} ({activeTask.tag})</span>
                </div>

                {delegationRole === 'secretary' ? (
                  <Tooltip content="Transfère immédiatement le fil au médecin">
                    <button
                      type="button"
                      onClick={() => handleEscalateToDoctor(activeTask)}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-extrabold shadow-2xs transition-all flex items-center gap-1"
                    >
                      <ArrowUpRight size={13} />
                      <span>[ ↗️ Escalader au Médecin ]</span>
                    </button>
                  </Tooltip>
                ) : (
                  <Tooltip content="Renoie l'instruction au secrétariat">
                    <button
                      type="button"
                      onClick={() => handleSendBackToSecretary(activeTask)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold shadow-2xs transition-all flex items-center gap-1"
                    >
                      <span>[ ↩️ Renvoyer au Secrétariat pour RDV ]</span>
                    </button>
                  </Tooltip>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {activeTask.category === 'resultats' && (
                  <LabResultViewer
                    task={activeTask}
                    onApproveAndSend={handleApproveAndSend}
                    onArchive={handleArchive}
                    isProcessing={isProcessing}
                  />
                )}

                {activeTask.category === 'prescriptions' && (
                  <PrescriptionViewer
                    task={activeTask}
                    onSignNext={handleSignNextPrescription}
                    onEdit={() => {}}
                    isBatchMode={false}
                    batchRemainingCount={1}
                    isProcessing={isProcessing}
                  />
                )}

                {activeTask.category === 'messages' && (
                  <PatientMessageViewer
                    task={activeTask}
                    onSendReply={handleSendReply}
                    isProcessing={isProcessing}
                  />
                )}

                {(activeTask.category === 'urgences' || activeTask.category === 'facturation' || activeTask.category === 'confirmations' || activeTask.category === 'cnss') && (
                  <AdminTaskViewer
                    task={activeTask}
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
