import React from 'react'

export const WaitingRoomMiniPreview: React.FC = () => {
  return (
    <div className="w-full mt-4 p-3 rounded-xl bg-slate-900/90 text-white font-mono text-[11px] shadow-inner border border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60 text-slate-400">
        <span className="flex items-center gap-1.5 font-sans font-bold text-[10px] uppercase text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Salle d'attente en direct
        </span>
        <span className="text-[10px] text-slate-400 font-sans">3 patients</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between p-1.5 rounded-lg bg-blue-950/60 border border-blue-800/40">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            <span className="font-sans font-semibold text-slate-200">Fatima Chraibi</span>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-blue-500/20 text-blue-300">
            En consult • 18m
          </span>
        </div>

        <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span className="font-sans font-medium text-slate-300">Amine El Mansouri</span>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-medium bg-slate-700/50 text-slate-300">
            En attente • 12m
          </span>
        </div>

        <div className="flex items-center justify-between p-1.5 rounded-lg bg-amber-950/40 border border-amber-800/30">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="font-sans font-medium text-amber-200">Soufiane Kadiri</span>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-amber-500/20 text-amber-300">
            À encaisser • 300 MAD
          </span>
        </div>
      </div>
    </div>
  )
}

export const AgendaMiniPreview: React.FC = () => {
  return (
    <div className="w-full mt-4 p-3 rounded-xl bg-slate-900/90 text-white font-mono text-[11px] shadow-inner border border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60 text-slate-400">
        <span className="flex items-center gap-1.5 font-sans font-bold text-[10px] uppercase text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Planning du jour • Dr. Alami
        </span>
        <span className="text-[10px] font-sans text-slate-400">Aujourd'hui</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <span className="text-slate-400 font-bold">09:30</span>
          <span className="font-sans font-semibold text-slate-200">Mme. Benjelloun</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-emerald-500/20 text-emerald-300">
            Confirmé SMS ✓
          </span>
        </div>

        <div className="flex items-center justify-between p-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40">
          <span className="text-emerald-400 font-bold">10:00</span>
          <span className="font-sans font-semibold text-emerald-300">Créneau libéré</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-emerald-500/30 text-emerald-200">
            Disponible
          </span>
        </div>

        <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <span className="text-slate-400 font-bold">10:30</span>
          <span className="font-sans font-semibold text-slate-200">M. Karim Tazi</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-medium bg-blue-500/20 text-blue-300">
            Bilan annuel
          </span>
        </div>
      </div>
    </div>
  )
}

export const ConsultationMiniPreview: React.FC = () => {
  return (
    <div className="w-full mt-4 p-3 rounded-xl bg-slate-900/90 text-white font-mono text-[11px] shadow-inner border border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60 text-slate-400">
        <span className="flex items-center gap-1.5 font-sans font-bold text-[10px] uppercase text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Cockpit Clinique Actif
        </span>
        <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
          ⚠️ Pénicilline
        </span>
      </div>

      <div className="space-y-1.5 font-sans">
        <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-[10px]">
          <span className="text-slate-400">Constantes :</span>
          <span className="font-bold text-slate-200">TA 125/80 mmHg</span>
          <span className="text-slate-400">Pouls : 72 bpm</span>
          <span className="text-emerald-400 font-bold">Normal</span>
        </div>

        <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
          <div className="text-[10px] text-slate-400 mb-0.5 flex justify-between">
            <span>Ordonnance marocaine</span>
            <span className="text-emerald-400 font-semibold">1 clic</span>
          </div>
          <p className="text-[10px] text-slate-200 font-medium truncate">
            Amoxicilline 1g • 1 comprimé matin et soir — 6 jours
          </p>
        </div>
      </div>
    </div>
  )
}

export const FacturationMiniPreview: React.FC = () => {
  return (
    <div className="w-full mt-4 p-3 rounded-xl bg-slate-900/90 text-white font-mono text-[11px] shadow-inner border border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60 text-slate-400">
        <span className="flex items-center gap-1.5 font-sans font-bold text-[10px] uppercase text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Encaissement & Actes
        </span>
        <span className="text-[10px] font-sans text-emerald-300 font-bold">CNOPS / Espèces</span>
      </div>

      <div className="space-y-1 font-sans text-[10px]">
        <div className="flex justify-between text-slate-300">
          <span>Consultation Spécialiste</span>
          <span className="font-mono font-bold text-white">300 MAD</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Électrocardiogramme (ECG)</span>
          <span className="font-mono font-bold text-white">150 MAD</span>
        </div>
        <div className="flex justify-between pt-1.5 mt-1 border-t border-slate-700/60 text-emerald-300 font-bold text-[11px]">
          <span>Total Facturé</span>
          <span className="font-mono text-emerald-400">450 MAD (Encaissé)</span>
        </div>
      </div>
    </div>
  )
}

export const DossiersPatientsMiniPreview: React.FC = () => {
  return (
    <div className="w-full mt-4 p-3 rounded-xl bg-slate-900/90 text-white font-mono text-[11px] shadow-inner border border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60 text-slate-400">
        <span className="flex items-center gap-1.5 font-sans font-bold text-[10px] uppercase text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Fiche Patient 360°
        </span>
        <span className="text-[10px] font-sans text-slate-400">ID: #4082</span>
      </div>

      <div className="space-y-1.5 font-sans text-[10px]">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200">Soufiane Kadiri, 42 ans</span>
          <span className="text-slate-400">Casablanca</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700/40 text-[9px] font-semibold">
            HTA stade 1
          </span>
          <span className="px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700/40 text-[9px] font-semibold">
            Diabète Type 2
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 text-slate-400 text-[9px]">
          <span>Pièces : Bilan_Bio.pdf • ECG.pdf</span>
          <span className="text-emerald-400 font-bold">À jour</span>
        </div>
      </div>
    </div>
  )
}

export const TachesMiniPreview: React.FC = () => {
  return (
    <div className="w-full mt-4 p-3 rounded-xl bg-slate-900/90 text-white font-mono text-[11px] shadow-inner border border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60 text-slate-400">
        <span className="flex items-center gap-1.5 font-sans font-bold text-[10px] uppercase text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Coordination Secrétariat
        </span>
        <span className="text-[10px] font-sans text-slate-400">2 urgences</span>
      </div>

      <div className="space-y-1.5 font-sans text-[10px]">
        <div className="flex items-center justify-between p-1 rounded bg-rose-950/40 border border-rose-800/40">
          <span className="text-rose-300 font-semibold truncate">Appel labo : Résultat glycémie M. Kadiri</span>
          <span className="shrink-0 px-1 py-0.2 rounded text-[8px] bg-rose-500/20 text-rose-300 font-bold">
            URGENT
          </span>
        </div>
        <div className="flex items-center justify-between p-1 rounded bg-amber-950/30 border border-amber-800/30">
          <span className="text-amber-200 font-medium truncate">Signature ordonnance Dr. Alami</span>
          <span className="shrink-0 px-1 py-0.2 rounded text-[8px] bg-amber-500/20 text-amber-300 font-bold">
            À TRAITER
          </span>
        </div>
      </div>
    </div>
  )
}

export const EquipeMiniPreview: React.FC = () => {
  return (
    <div className="w-full mt-4 p-3 rounded-xl bg-slate-900/90 text-white font-mono text-[11px] shadow-inner border border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60 text-slate-400">
        <span className="flex items-center gap-1.5 font-sans font-bold text-[10px] uppercase text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Accès Sécurisés & Rôles
        </span>
        <span className="text-[10px] font-sans text-emerald-300 font-bold">CNDP ✓</span>
      </div>

      <div className="space-y-1.5 font-sans text-[10px]">
        <div className="flex items-center justify-between p-1 rounded bg-slate-800/50">
          <span className="font-semibold text-slate-200">Dr. Yassine Alami</span>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-500/20 text-blue-300">
            Praticien • Accès Total
          </span>
        </div>
        <div className="flex items-center justify-between p-1 rounded bg-slate-800/50">
          <span className="font-medium text-slate-300">Salma (Secrétariat)</span>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/20 text-emerald-300">
            Accueil & Caisse • Notes 🔒
          </span>
        </div>
      </div>
    </div>
  )
}
