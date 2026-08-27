import React, { useState } from 'react'
import { CheckSquare, Square, CheckCircle2, ArrowRight, FastForward, ShieldCheck, Filter } from 'lucide-react'
import Tooltip from '../ui/Tooltip'

export default function KanbanTriageMatrix({
  tasks = [],
  handleResolveTask,
  notify
}) {
  const [selectedTaskIds, setSelectedTaskIds] = useState([])
  const [matrixTasks, setMatrixTasks] = useState([
    { id: 'm1', patientName: 'Hind Boukili', category: 'prescriptions', description: 'Ordonnance Amlor 5mg (HTA)', column: 'col2', time: '09:15' },
    { id: 'm2', patientName: 'Youssef Idrissi', category: 'prescriptions', description: 'Renouvellement Diabète HbA1c', column: 'col2', time: '09:40' },
    { id: 'm3', patientName: 'Karim Amrani', category: 'resultats', description: 'Bilan sanguin complet & lipides', column: 'col1', time: '08:30' },
    { id: 'm4', patientName: 'Meryem Tazi', category: 'urgences', description: 'Tension 185/110 mmHg (Urgence)', column: 'col2', time: '10:05' },
    { id: 'm5', patientName: 'Omar Bennani', category: 'messages', description: 'Question sur posologie antibiotique', column: 'col3', time: '11:20' },
    { id: 'm6', patientName: 'Sarah Benali', category: 'facturation', description: 'Anomalie Dossier Mutuelle CNSS', column: 'col4', time: 'Hier' }
  ])

  const toggleSelect = (id) => {
    setSelectedTaskIds(prev =>
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    )
  }

  const handleBatchSign = () => {
    if (selectedTaskIds.length === 0) return

    setMatrixTasks(prev => 
      prev.map(t => selectedTaskIds.includes(t.id) ? { ...t, column: 'col4' } : t)
    )

    notify?.({
      title: 'Validation en Lot Effectuée ⚡',
      description: `${selectedTaskIds.length} ordonnance(s) signée(s) et clôturée(s) en 1 clic.`,
      variant: 'success'
    })

    setSelectedTaskIds([])
  }

  const advanceCard = (id) => {
    setMatrixTasks(prev => 
      prev.map(t => {
        if (t.id !== id) return t
        const nextCol = t.column === 'col1' ? 'col2' : t.column === 'col2' ? 'col3' : 'col4'
        return { ...t, column: nextCol }
      })
    )
  }

  const columns = [
    { id: 'col1', title: '1. À Trier (IA)', color: 'border-amber-300 bg-amber-50/40 text-amber-900', count: matrixTasks.filter(t => t.column === 'col1').length },
    { id: 'col2', title: '2. Validation Docteur', color: 'border-blue-300 bg-blue-50/40 text-blue-900', count: matrixTasks.filter(t => t.column === 'col2').length },
    { id: 'col3', title: '3. Attente Patient (WhatsApp)', color: 'border-purple-300 bg-purple-50/40 text-purple-900', count: matrixTasks.filter(t => t.column === 'col3').length },
    { id: 'col4', title: '4. Clôturé / Archivé', color: 'border-emerald-300 bg-emerald-50/40 text-emerald-900', count: matrixTasks.filter(t => t.column === 'col4').length }
  ]

  const col2SelectedCount = selectedTaskIds.length

  return (
    <div className="space-y-4">
      {/* TOP FLOATING BATCH TOOLBAR FOR COL 2 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30 flex items-center justify-center font-bold">
            <FastForward size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Kanban Care-Flow Matrix</h3>
              <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                Luma Health Architecture
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Cochez les ordonnances dans "Validation Docteur" pour valider le lot en 1 seul clic.
            </p>
          </div>
        </div>

        {/* Batch Action Toolbar */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-300">
            ⚡ {col2SelectedCount} Ordonnance(s) sélectionnée(s)
          </span>

          <Tooltip content="Signe électroniquement toutes les ordonnances sélectionnées + Transmet les reçus WhatsApp + Clôture les tâches">
            <button
              type="button"
              onClick={handleBatchSign}
              disabled={col2SelectedCount === 0}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold shadow-md transition-all flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              <span>[ Valider & Signer la Sélection ({col2SelectedCount}) ]</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 4-COLUMN MATRIX */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-[calc(100vh-18rem)] min-h-[550px]">
        {columns.map(col => {
          const colTasks = matrixTasks.filter(t => t.column === col.id)
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
                    Aucun élément
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
                          {col.id === 'col2' && (
                            <Tooltip content="Cocher pour la validation en lot rapide">
                              <button
                                type="button"
                                onClick={() => toggleSelect(task.id)}
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

                        {/* Move Arrow Button */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            {task.category}
                          </span>

                          {col.id !== 'col4' && (
                            <Tooltip content="Faire avancer vers la colonne suivante du workflow">
                              <button
                                type="button"
                                onClick={() => advanceCard(task.id)}
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
