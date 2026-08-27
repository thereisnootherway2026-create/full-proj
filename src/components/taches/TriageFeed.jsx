import React from 'react'
import { AlertCircle, Zap } from 'lucide-react'
import StickyTriageBanner from './StickyTriageBanner'

export default function TriageFeed({
  tasks = [],
  emergencyTasks = [],
  selectedTaskId,
  onSelectTask,
  activeCategory,
  isBatchMode,
  onToggleBatchMode,
  userRole = 'doctor',
  roleView = 'doctor'
}) {
  const isDoctorView = roleView === 'doctor'
  const prescriptionCount = tasks.filter(t => t.category === 'prescriptions').length

  // Deduplicate: Exclude emergency tasks from standard feed list so emergency patients are not duplicated
  const emergencyTaskIds = new Set(emergencyTasks.map(t => t.id))
  const nonEmergencyFilteredTasks = tasks.filter(t => !emergencyTaskIds.has(t.id))

  const getBadgeStyle = (category) => {
    switch (category) {
      case 'urgences': return 'bg-red-50 text-red-700 border-red-200'
      case 'resultats': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'prescriptions': return 'bg-amber-50 text-amber-800 border-amber-200'
      case 'messages': return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'facturation': return 'bg-emerald-50 text-emerald-800 border-emerald-200'
      case 'confirmations': return 'bg-sky-50 text-sky-800 border-sky-200'
      case 'cnss': return 'bg-slate-100 text-slate-700 border-slate-200'
      default: return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'urgences': return 'Urgence'
      case 'resultats': return 'Bilan Sanguin'
      case 'prescriptions': return 'À signer'
      case 'messages': return 'Message'
      case 'facturation': return 'Facturation'
      case 'confirmations': return 'RDV'
      case 'cnss': return 'CNSS'
      default: return 'Tâche'
    }
  }

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Top Banner Section if Mode Rafale or Emergency active */}
      {(isDoctorView && (activeCategory === 'prescriptions' || activeCategory === 'all') && prescriptionCount > 0) || (activeCategory === 'all' || activeCategory === 'urgences') ? (
        <div className="p-3.5 border-b border-slate-100 space-y-3 shrink-0 bg-white">
          {/* Mode Rafale (Batch Signing) Banner */}
          {isDoctorView && (activeCategory === 'prescriptions' || activeCategory === 'all') && prescriptionCount > 0 && (
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-3 rounded-2xl text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <Zap size={18} className="text-amber-200 fill-amber-200" />
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider block">Mode Rafale (Tout Signer)</span>
                  <span className="text-xs text-amber-100 font-semibold">{prescriptionCount} ordonnance(s) en attente</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleBatchMode}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  isBatchMode
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-white text-amber-900 hover:bg-amber-50'
                }`}
              >
                {isBatchMode ? '✓ ACTIF' : '⚡ Activer'}
              </button>
            </div>
          )}

          {/* Fixed Emergency Triage Banner */}
          {activeCategory === 'all' || activeCategory === 'urgences' ? (
            <StickyTriageBanner
              emergencyTasks={emergencyTasks}
              onSelectTask={onSelectTask}
            />
          ) : null}
        </div>
      ) : null}

      {/* Middle Feed Task List Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Feed Cards matching BillingPage table row effects */}
        {nonEmergencyFilteredTasks.length === 0 && emergencyTasks.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="text-4xl mb-3">✨</div>
            <p className="text-sm font-bold text-slate-700">Aucune tâche en attente</p>
            <p className="text-xs text-slate-400 mt-1">Vous avez traité toutes les tâches dans cette catégorie.</p>
          </div>
        ) : (
          nonEmergencyFilteredTasks.map(task => {
            const isSelected = selectedTaskId === task.id
            const badgeClass = getBadgeStyle(task.category)
            const categoryLabel = getCategoryLabel(task.category)
            const initial = task.patientName ? task.patientName.charAt(0).toUpperCase() : 'P'

            return (
              <div
                key={task.id}
                onClick={() => onSelectTask(task)}
                className={`p-4 rounded-2xl border transition-all duration-150 cursor-pointer relative ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-500 shadow-sm ring-1 ring-blue-400/40'
                    : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-blue-600 rounded-r-full" />
                )}

                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                    task.category === 'urgences' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
                  }`}>
                    {initial}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{task.patientName}</h3>
                      <span className="text-xs font-semibold text-slate-400 shrink-0">{task.metadata || 'À l\'instant'}</span>
                    </div>

                    <p className="text-xs font-medium text-slate-600 line-clamp-1 mb-2">
                      {task.description}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
                        {categoryLabel}
                      </span>

                      {task.status && (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-full flex items-center gap-1">
                          ● {task.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
