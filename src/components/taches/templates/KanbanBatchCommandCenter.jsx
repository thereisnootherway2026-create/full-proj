import React, { useState } from 'react'
import { CheckSquare, Square, CheckCircle2, FastForward, MoveRight, ArrowRight, ShieldCheck, AlertCircle, FileText, Pill, MessageSquare, CreditCard } from 'lucide-react'
import Tooltip from '../ui/Tooltip'

export default function KanbanBatchCommandCenter({
  tasks = [],
  handleResolveTask,
  notify,
  isProcessing
}) {
  const [selectedTaskIds, setSelectedTaskIds] = useState([])
  const [kanbanTasks, setKanbanTasks] = useState([
    { id: 'k1', patientName: 'Hind Boukili', category: 'prescriptions', description: 'Ordonnance Amlor 5mg (HTA)', column: 'pending', time: '09:15' },
    { id: 'k2', patientName: 'Youssef Idrissi', category: 'prescriptions', description: 'Renouvellement Diabète HbA1c', column: 'pending', time: '09:40' },
    { id: 'k3', patientName: 'Karim Amrani', category: 'resultats', description: 'Bilan sanguin complet & lipides', column: 'validate', time: '08:30' },
    { id: 'k4', patientName: 'Meryem Tazi', category: 'urgences', description: 'Tension 185/110 mmHg (Urgence)', column: 'validate', time: '10:05' },
    { id: 'k5', patientName: 'Omar Bennani', category: 'messages', description: 'Question sur posologie antibiotique', column: 'patient_wait', time: '11:20' },
    { id: 'k6', patientName: 'Sarah Benali', category: 'facturation', description: 'Anomalie Dossier Mutuelle CNSS', column: 'completed', time: 'Hier' }
  ])

  // Toggle selection for batch actions
  const toggleSelectTask = (id) => {
    setSelectedTaskIds(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    )
  }

  const selectAllPending = () => {
    const pendingIds = kanbanTasks.filter(t => t.column === 'pending').map(t => t.id)
    setSelectedTaskIds(pendingIds)
  }

  // Batch action handler
  const handleBatchValidate = () => {
    if (selectedTaskIds.length === 0) return

    setKanbanTasks(prev => 
      prev.map(t => selectedTaskIds.includes(t.id) ? { ...t, column: 'completed' } : t)
    )

    notify?.({
      title: 'Validation en Lot Effectuée ⚡',
      description: `${selectedTaskIds.length} tâche(s) validée(s) et clôturée(s) en 1 seul clic.`,
      variant: 'success'
    })

    setSelectedTaskIds([])
  }

  // Single card move
  const moveTaskColumn = (id, targetColumn) => {
    setKanbanTasks(prev => 
      prev.map(t => t.id === id ? { ...t, column: targetColumn } : t)
    )
  }

  const columns = [
    { id: 'pending', title: '1. En Attente (Nouveau)', color: 'border-amber-300 bg-amber-50/40 text-amber-900', count: kanbanTasks.filter(t => t.column === 'pending').length },
    { id: 'validate', title: '2. À Valider (Docteur)', color: 'border-blue-300 bg-blue-50/40 text-blue-900', count: kanbanTasks.filter(t => t.column === 'validate').length },
    { id: 'patient_wait', title: '3. Attente Patient (WhatsApp)', color: 'border-purple-300 bg-purple-50/40 text-purple-900', count: kanbanTasks.filter(t => t.column === 'patient_wait').length },
    { id: 'completed', title: '4. Traité / Archivé', color: 'border-emerald-300 bg-emerald-50/40 text-emerald-900', count: kanbanTasks.filter(t => t.column === 'completed').length }
  ]

  return (
    <div className="space-y-4">
      {/* ⚡ BATCH ACTION TOOLBAR AT TOP */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30 flex items-center justify-center font-bold">
            <FastForward size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Centre de Commandement Kanban & Validation en Lot</h3>
              <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                High-Volume Mode
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Cochez plusieurs ordonnances de routine et validez-les en un seul clic.
            </p>
          </div>
        </div>

        {/* Batch Execution Controls */}
        <div className="flex items-center gap-3">
          <Tooltip content="Sélectionne automatiquement toutes les ordonnances en attente pour validation en lot">
            <button
              type="button"
              onClick={selectAllPending}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/10"
            >
              Tout Sélectionner ({kanbanTasks.filter(t => t.column === 'pending').length})
            </button>
          </Tooltip>

          <Tooltip content="Génère les ordonnances PDF sécurisées + Transmet la confirmation WhatsApp + Clôture les tâches sélectionnées en 1 clic">
            <button
              type="button"
              onClick={handleBatchValidate}
              disabled={selectedTaskIds.length === 0}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold shadow-md transition-all flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              <span>Valider la Sélection ({selectedTaskIds.length})</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 4-COLUMN KANBAN BOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-[calc(100vh-18rem)] min-h-[550px]">
        {columns.map(col => {
          const colTasks = kanbanTasks.filter(t => t.column === col.id)
          return (
            <div key={col.id} className="h-full rounded-2xl border border-slate-200/90 bg-slate-50/60 p-3 flex flex-col overflow-hidden">
              <div className={`p-2.5 rounded-xl border mb-3 flex items-center justify-between font-bold text-xs ${col.color}`}>
                <span>{col.title}</span>
                <span className="bg-white/80 text-slate-900 px-2 py-0.5 rounded-full font-black text-[11px] shadow-2xs">
                  {col.count}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                {colTasks.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-xl">
                    Aucune tâche
                  </div>
                ) : (
                  colTasks.map(task => {
                    const isChecked = selectedTaskIds.includes(task.id)
                    return (
                      <div
                        key={task.id}
                        className={`p-3.5 rounded-xl border transition-all bg-white shadow-2xs space-y-2 ${
                          isChecked ? 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/20' : 'border-slate-200/80 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {col.id === 'pending' && (
                            <Tooltip content="Cocher pour inclure dans la validation en lot">
                              <button
                                type="button"
                                onClick={() => toggleSelectTask(task.id)}
                                className="text-slate-400 hover:text-amber-600 mt-0.5"
                              >
                                {isChecked ? <CheckSquare size={16} className="text-amber-600" /> : <Square size={16} />}
                              </button>
                            </Tooltip>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 truncate">{task.patientName}</h4>
                              <span className="text-[10px] text-slate-400 font-semibold">{task.time}</span>
                            </div>
                            <p className="text-[11px] text-slate-600 font-medium line-clamp-2 mt-0.5">{task.description}</p>
                          </div>
                        </div>

                        {/* Kanban Stage Migration Action Buttons with Tooltips */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            {task.category}
                          </span>

                          {col.id !== 'completed' && (
                            <Tooltip content="Déplacer vers la colonne suivante dans le workflow">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextCol = col.id === 'pending' ? 'validate' : col.id === 'validate' ? 'patient_wait' : 'completed'
                                  moveTaskColumn(task.id, nextCol)
                                }}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                              >
                                <span>Avancer</span>
                                <ArrowRight size={11} />
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
          )
        })}
      </div>
    </div>
  )
}
