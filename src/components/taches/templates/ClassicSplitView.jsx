import React from 'react'
import { FileText, Search, XCircle, AlertCircle, Pill, MessageSquare, CreditCard, UserCheck, Building2 } from 'lucide-react'
import TriageFeed from '../TriageFeed'
import LabResultViewer from '../LabResultViewer'
import PrescriptionViewer from '../PrescriptionViewer'
import PatientMessageViewer from '../PatientMessageViewer'
import AdminTaskViewer from '../AdminTaskViewer'
import Tooltip from '../ui/Tooltip'

export default function ClassicSplitView({
  tasks,
  visibleTasks,
  filteredTasks,
  emergencyTasks,
  selectedTask,
  selectedTaskId,
  setSelectedTaskId,
  activeCategory,
  handleCategoryChange,
  searchQuery,
  setSearchQuery,
  roleView,
  isBatchMode,
  setIsBatchMode,
  isProcessing,
  handleApproveAndSend,
  handleArchive,
  handleSignNextPrescription,
  handleSendReply,
  handleAdminResolve,
  remainingPrescriptionCount
}) {
  const isDoctorView = roleView === 'doctor'

  const categories = isDoctorView ? [
    { key: 'urgences', label: 'Urgences', icon: AlertCircle, count: tasks.filter(t => t.category === 'urgences').length, tooltip: 'Afficher uniquement les alertes vitales et urgences en salle d\'attente' },
    { key: 'resultats', label: 'Résultats', icon: FileText, count: tasks.filter(t => t.category === 'resultats').length, tooltip: 'Résultats de laboratoire et bilans sanguins à valider' },
    { key: 'prescriptions', label: 'Ordonnances', icon: Pill, count: tasks.filter(t => t.category === 'prescriptions').length, tooltip: 'Ordonnances médicales en attente de signature numérique' },
    { key: 'messages', label: 'Messages', icon: MessageSquare, count: tasks.filter(t => t.category === 'messages').length, tooltip: 'Messages WhatsApp et demandes de renseignements patients' },
  ] : [
    { key: 'facturation', label: 'Facturation', icon: CreditCard, count: tasks.filter(t => t.category === 'facturation').length, tooltip: 'Dossiers financiers et anomalies de règlement CNSS' },
    { key: 'confirmations', label: 'Confirmations', icon: UserCheck, count: tasks.filter(t => t.category === 'confirmations').length, tooltip: 'Demandes de confirmation de RDV en attente' },
    { key: 'cnss', label: 'CNSS', icon: Building2, count: tasks.filter(t => t.category === 'cnss').length, tooltip: 'Prises en charge mutuelles et assurances complémentaires' },
    { key: 'messages', label: 'Messages', icon: MessageSquare, count: tasks.filter(t => t.category === 'messages').length, tooltip: 'Communications secrétariat et réception' },
  ]

  return (
    <div className="space-y-5">
      {/* FULL-WIDTH FILTER & SEARCH HEADER BAR */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText size={20} className="text-slate-800" />
          <div>
            <h3 className="text-lg font-bold text-gray-900">Dossiers & Fil de Triage</h3>
            <p className="text-sm text-gray-500 font-medium mt-0.5">Traitement rapide des demandes et suivi clinique</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher patient, tâche..."
              className="h-10 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 w-full sm:w-60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XCircle size={14} />
              </button>
            )}
          </div>

          {/* FULL-WIDTH CATEGORY FILTER TABS WITH TOOLTIPS */}
          <div className="bg-gray-100 rounded-xl p-1 flex items-center shrink-0">
            <Tooltip content="Afficher l'intégralité du fil de triage">
              <button
                type="button"
                onClick={() => handleCategoryChange('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  activeCategory === 'all'
                    ? 'bg-slate-900 text-white shadow-sm font-bold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>Toutes</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeCategory === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {visibleTasks.length}
                </span>
              </button>
            </Tooltip>

            {categories.map(cat => {
              const Icon = cat.icon
              const isActive = activeCategory === cat.key
              return (
                <Tooltip key={cat.key} content={cat.tooltip}>
                  <button
                    type="button"
                    onClick={() => handleCategoryChange(cat.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm font-bold'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{cat.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {cat.count}
                    </span>
                  </button>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>

      {/* 2-Column Split Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-16rem)] min-h-[600px]">
        {/* Left Pane: Triage Feed (~40% width) */}
        <div className="lg:col-span-5 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden flex flex-col">
          <TriageFeed
            tasks={filteredTasks}
            emergencyTasks={emergencyTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={(t) => setSelectedTaskId(t.id)}
            activeCategory={activeCategory}
            isBatchMode={isBatchMode}
            onToggleBatchMode={() => setIsBatchMode(!isBatchMode)}
            roleView={roleView}
          />
        </div>

        {/* Right Pane: Action Viewer Panel (~60% width) */}
        <div className="lg:col-span-7 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden flex flex-col">
          {!selectedTask ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <div className="text-4xl mb-3">🩺</div>
              <h3 className="text-base font-bold text-slate-800">Aucune tâche sélectionnée</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Sélectionnez une tâche dans le fil de triage à gauche pour afficher son espace d'action.
              </p>
            </div>
          ) : (
            <>
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
                  isBatchMode={isBatchMode}
                  batchRemainingCount={remainingPrescriptionCount}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
