import React, { useState } from 'react'
import { Layers, Sparkles, ShieldCheck, Kanban, UserCheck, Plus, SlidersHorizontal, RefreshCw, Terminal, Command, LayoutGrid } from 'lucide-react'
import Tooltip from './ui/Tooltip'

import ClassicSplitView from './templates/ClassicSplitView'
import ActionDrivenThreePaneView from './templates/ActionDrivenThreePaneView'
import GatekeeperTriageView from './templates/GatekeeperTriageView'
import KanbanBatchCommandCenter from './templates/KanbanBatchCommandCenter'
import PatientFocusStream from './templates/PatientFocusStream'

import ElationThreePanelHub from './templates/ElationThreePanelHub'
import CanvasCommandTimeline from './templates/CanvasCommandTimeline'
import KanbanTriageMatrix from './templates/KanbanTriageMatrix'
import GatekeeperDelegationView from './templates/GatekeeperDelegationView'

export default function TachesHub({
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
  setRoleView,
  isBatchMode,
  setIsBatchMode,
  isProcessing,
  handleResolveTask,
  handleApproveAndSend,
  handleArchive,
  handleSignNextPrescription,
  handleSendReply,
  handleAdminResolve,
  remainingPrescriptionCount,
  handleManualRefresh,
  isSpinning,
  setShowAddModal,
  notify
}) {
  // Architectural requirement: Active Template state
  const [activeTemplate, setActiveTemplate] = useState('template6') // Defaulting to the new Elation 3-Panel Hub

  const templatesList = [
    { id: 'template1', label: '1. Classic Split', icon: Layers, tooltip: 'Baseline layout: full-width category filter bar + 2-column master-detail panels' },
    { id: 'template2', label: '2. Action-Driven 3-Pane', icon: Sparkles, tooltip: 'Epic & Doctolib inspired: 25% grouped triage, 50% patient context + workspace, 25% Action Pad' },
    { id: 'template3', label: '3. Gatekeeper Triage', icon: ShieldCheck, tooltip: 'Athenahealth inspired: strict role delegation between Doctor and Secretary' },
    { id: 'template4', label: '4. Kanban Batch Command', icon: Kanban, tooltip: 'Agile high-volume mode: 4-column drag/move kanban board with multi-select batch validation' },
    { id: 'template5', label: '5. Patient Focus Stream', icon: UserCheck, tooltip: 'Minimalist single-patient timeline: 30% priority list + 70% chronological timeline with voice dictation' },
    { id: 'template6', label: '6. Elation 3-Panel Hub', icon: LayoutGrid, tooltip: 'Elation & Doctolib inspired: Clinical-First 3-Pane split with Patient Quick-Profile & WhatsApp thread' },
    { id: 'template7', label: '7. Canvas Command Stream', icon: Terminal, tooltip: 'Canvas Medical & Linear inspired: Single vertical event stream + Smart Command Bar (/)' },
    { id: 'template8', label: '8. Care-Flow Matrix', icon: Kanban, tooltip: 'Luma Health inspired: 4-column care-flow matrix with batch validation toolbar' },
    { id: 'template9', label: '9. Dual-Role Gatekeeper', icon: ShieldCheck, tooltip: 'Athenahealth & Klara inspired: Dual-role header toggle + 1-click inter-role handoffs' }
  ]

  return (
    <div className="w-full space-y-5">
      {/* 🚀 COMPREHENSIVE TEMPLATE SWITCHER NAVIGATION BAR WITH TOOLTIPS */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-3 shadow-md text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 px-2">
          <Sparkles size={20} className="text-amber-400 shrink-0" />
          <div>
            <span className="text-xs font-black uppercase tracking-wider block text-white">MacroMedica Clinical Inbox (Evaluation Suite)</span>
            <span className="text-[10px] text-indigo-200 font-medium">Switch between 9 distinct UI/UX paradigms live</span>
          </div>
        </div>

        {/* Template Selector Pill Buttons */}
        <div className="bg-white/10 p-1.5 rounded-xl flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {templatesList.map(tmpl => {
            const Icon = tmpl.icon
            const isActive = activeTemplate === tmpl.id
            return (
              <Tooltip key={tmpl.id} content={tmpl.tooltip}>
                <button
                  type="button"
                  onClick={() => setActiveTemplate(tmpl.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-md font-black'
                      : 'text-indigo-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-blue-600' : 'text-indigo-300'} />
                  <span>{tmpl.label}</span>
                </button>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* Main Page Top Header matching BillingPage */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Tâches & Hub Clinique</h1>
            <Tooltip content="Actualiser les données du fil de triage">
              <button
                type="button"
                onClick={handleManualRefresh}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200"
              >
                <RefreshCw size={16} className={isSpinning ? 'animate-spin text-blue-600' : ''} />
              </button>
            </Tooltip>
            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full border border-blue-200/80">
              {roleView === 'doctor' ? 'Vue Docteur' : 'Vue Secrétariat'}
            </span>
          </div>
          <p className="text-gray-500 font-medium text-sm mt-1">
            Suivi clinique en temps réel, triage prioritaire et gestion des tâches
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Role Switcher Button */}
          <Tooltip content="Basculer entre la vue Docteur (dossiers médicaux, ordonnances) et la vue Secrétaire (CNSS, RDV, factures)">
            <button
              type="button"
              onClick={() => setRoleView(v => v === 'doctor' ? 'secretary' : 'doctor')}
              className="h-10 px-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-xl font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-sm text-xs flex items-center gap-2"
            >
              <SlidersHorizontal size={15} className="text-blue-600" />
              <span>{roleView === 'doctor' ? 'Vue Secrétaire' : 'Vue Docteur'}</span>
            </button>
          </Tooltip>

          {/* Primary Action Button */}
          <Tooltip content="Créer une nouvelle tâche de suivi clinique ou secrétariat">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-md shadow-blue-500/20 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 text-xs flex items-center gap-2"
            >
              <Plus size={16} />
              <span>Nouvelle tâche</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* RENDER ACTIVE TEMPLATE */}
      {activeTemplate === 'template1' && (
        <ClassicSplitView
          tasks={tasks}
          visibleTasks={visibleTasks}
          filteredTasks={filteredTasks}
          emergencyTasks={emergencyTasks}
          selectedTask={selectedTask}
          selectedTaskId={selectedTaskId}
          setSelectedTaskId={setSelectedTaskId}
          activeCategory={activeCategory}
          handleCategoryChange={handleCategoryChange}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          roleView={roleView}
          isBatchMode={isBatchMode}
          setIsBatchMode={setIsBatchMode}
          isProcessing={isProcessing}
          handleApproveAndSend={handleApproveAndSend}
          handleArchive={handleArchive}
          handleSignNextPrescription={handleSignNextPrescription}
          handleSendReply={handleSendReply}
          handleAdminResolve={handleAdminResolve}
          remainingPrescriptionCount={remainingPrescriptionCount}
        />
      )}

      {activeTemplate === 'template2' && (
        <ActionDrivenThreePaneView
          tasks={visibleTasks}
          selectedTask={selectedTask}
          selectedTaskId={selectedTaskId}
          setSelectedTaskId={setSelectedTaskId}
          roleView={roleView}
          handleResolveTask={handleResolveTask}
          handleApproveAndSend={handleApproveAndSend}
          handleArchive={handleArchive}
          handleSignNextPrescription={handleSignNextPrescription}
          handleSendReply={handleSendReply}
          handleAdminResolve={handleAdminResolve}
          isProcessing={isProcessing}
        />
      )}

      {activeTemplate === 'template3' && (
        <GatekeeperTriageView
          tasks={tasks}
          selectedTask={selectedTask}
          selectedTaskId={selectedTaskId}
          setSelectedTaskId={setSelectedTaskId}
          roleView={roleView}
          handleResolveTask={handleResolveTask}
          handleApproveAndSend={handleApproveAndSend}
          handleArchive={handleArchive}
          handleSignNextPrescription={handleSignNextPrescription}
          handleSendReply={handleSendReply}
          handleAdminResolve={handleAdminResolve}
          isProcessing={isProcessing}
          notify={notify}
        />
      )}

      {activeTemplate === 'template4' && (
        <KanbanBatchCommandCenter
          tasks={tasks}
          handleResolveTask={handleResolveTask}
          notify={notify}
          isProcessing={isProcessing}
        />
      )}

      {activeTemplate === 'template5' && (
        <PatientFocusStream
          tasks={tasks}
          notify={notify}
        />
      )}

      {activeTemplate === 'template6' && (
        <ElationThreePanelHub
          tasks={visibleTasks}
          selectedTask={selectedTask}
          selectedTaskId={selectedTaskId}
          setSelectedTaskId={setSelectedTaskId}
          handleResolveTask={handleResolveTask}
          isProcessing={isProcessing}
          notify={notify}
        />
      )}

      {activeTemplate === 'template7' && (
        <CanvasCommandTimeline
          tasks={tasks}
          handleResolveTask={handleResolveTask}
          notify={notify}
        />
      )}

      {activeTemplate === 'template8' && (
        <KanbanTriageMatrix
          tasks={tasks}
          handleResolveTask={handleResolveTask}
          notify={notify}
        />
      )}

      {activeTemplate === 'template9' && (
        <GatekeeperDelegationView
          tasks={tasks}
          selectedTask={selectedTask}
          selectedTaskId={selectedTaskId}
          setSelectedTaskId={setSelectedTaskId}
          handleResolveTask={handleResolveTask}
          handleApproveAndSend={handleApproveAndSend}
          handleArchive={handleArchive}
          handleSignNextPrescription={handleSignNextPrescription}
          handleSendReply={handleSendReply}
          handleAdminResolve={handleAdminResolve}
          isProcessing={isProcessing}
          notify={notify}
        />
      )}
    </div>
  )
}
