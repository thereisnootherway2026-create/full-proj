import React from 'react'
import { AlertTriangle, ArrowRight, HeartPulse } from 'lucide-react'

export default function StickyTriageBanner({ emergencyTasks = [], onSelectTask }) {
  if (!emergencyTasks || emergencyTasks.length === 0) return null

  return (
    <div className="bg-gradient-to-r from-red-500 via-rose-500 to-amber-500 rounded-xl p-0.5 shadow-sm">
      <div className="bg-white rounded-[10px] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
            </span>
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-red-700">
              <AlertTriangle size={14} className="text-red-600" />
              <span>Sur Place / Urgences Vitales ({emergencyTasks.length})</span>
            </div>
          </div>
          <span className="text-[10px] font-extrabold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
            Triage Prioritaire
          </span>
        </div>

        <div className="space-y-1.5">
          {emergencyTasks.map(task => (
            <div
              key={task.id}
              onClick={() => onSelectTask?.(task)}
              className="flex items-center justify-between bg-red-50/80 hover:bg-red-100/90 border border-red-200/90 rounded-lg px-2.5 py-1.5 transition-all duration-150 cursor-pointer group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-md bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  {task.patientName ? task.patientName.charAt(0) : 'U'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 truncate">{task.patientName}</span>
                    <span className="bg-red-100 text-red-700 font-extrabold text-[10px] px-1.5 py-0.2 rounded border border-red-300 flex items-center gap-1">
                      <HeartPulse size={11} className="animate-pulse" />
                      {task.description}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.2">
                    <span>{task.metadata || 'Salle d\'attente'}</span>
                    <span>•</span>
                    <span className="text-red-700 font-semibold">{task.status || 'Sur place'}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="text-[11px] font-bold text-red-700 group-hover:text-red-900 flex items-center gap-1 shrink-0 bg-white px-2 py-0.5 rounded border border-red-200 shadow-2xs group-hover:translate-x-0.5 transition-transform"
              >
                <span>Ouvrir</span>
                <ArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
