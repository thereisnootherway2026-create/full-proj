import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FeatureStoryData, STATE_DEFINITIONS, MacroMedicaState } from './storyData'
import {
  Play,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  Clock,
  User,
  Stethoscope,
  Receipt,
  Calendar,
  AlertCircle,
  Check,
  FileText,
  CreditCard,
  Wallet,
  Activity,
  ChevronRight,
  ShieldCheck,
  Plus,
} from 'lucide-react'

interface InteractiveProductShowcaseProps {
  story: FeatureStoryData
}

export const InteractiveProductShowcase: React.FC<InteractiveProductShowcaseProps> = ({ story }) => {
  const slug = story.canonicalSlug

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Démonstration Interactive Réelle</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-bold tracking-tight text-slate-900 mb-2">
            {slug === 'salle-attente' && 'Le cycle complet d’un patient en direct'}
            {slug === 'gestion-rdv' && 'La gestion du planning et des disponibilités en direct'}
            {slug === 'ordonnances' && 'Le cockpit clinique : de l’examen à la prescription'}
            {slug === 'facturation' && 'La clôture d’une visite et l’émission de la quittance'}
            {slug === 'dossiers-patients' && 'L’exploration continue de l’historique médical'}
            {slug === 'taches' && 'Le tableau d’attribution et de suivi des actions du cabinet'}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Manipulez les commandes ci-dessous pour tester l’ergonomie réelle de MacroMedica sans quitter votre navigateur.
          </p>
        </div>

        {/* Dynamic Interactive Module based on active feature */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden ring-1 ring-slate-900/5">
          {slug === 'salle-attente' && <SalleAttenteSimulator />}
          {slug === 'gestion-rdv' && <GestionRdvSimulator />}
          {slug === 'ordonnances' && <OrdonnancesSimulator />}
          {slug === 'facturation' && <FacturationSimulator />}
          {slug === 'dossiers-patients' && <DossiersPatientsSimulator />}
          {slug === 'taches' && <TachesSimulator />}
        </div>

      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SALLE D'ATTENTE — Full Patient Lifecycle Journey & Role Handoff
// ─────────────────────────────────────────────────────────────────────────────
function SalleAttenteSimulator() {
  const [activeStep, setActiveStep] = useState(0)

  const steps = [
    {
      state: 'ARRIVED' as MacroMedicaState,
      time: '08:42',
      title: 'Arrivée au comptoir',
      actor: 'Secrétariat (Nadia)',
      whoActed: 'Nadia clique sur « Patient Arrivé »',
      whatChanged: 'Patient Démo 01 (#0248) passe à l’état ARRIVED. Horodatage de présence enregistré.',
      whatNext: 'La patiente s’installe en salle d’attente. Le praticien est informé silencieusement.',
      doctorView: 'File active : 1 nouvelle arrivée signalée.',
      secretaryView: 'Pointage effectué à 08:42. Dossier orienté vers salon.',
    },
    {
      state: 'WAITING' as MacroMedicaState,
      time: '08:44',
      title: 'Installation au salon d’attente',
      actor: 'Système & Patiente',
      whoActed: 'Positionnement automatique dans la file',
      whatChanged: 'Patient Démo 01 prend la position #1 dans la file active. Attente en cours : 19 min.',
      whatNext: 'Le Dr. Alami termine sa consultation précédente et s’apprête à appeler le patient suivant.',
      doctorView: 'Prochain patient : Patient Démo 01 (Mme Amina B. • Suivi HTA). Position #1.',
      secretaryView: 'Salle d’attente : 3 patients au total (Amina B., Karim T., Sofia M.).',
    },
    {
      state: 'IN_CONSULTATION' as MacroMedicaState,
      time: '09:03',
      title: 'Appel en consultation',
      actor: 'Médecin Praticien (Dr. Alami)',
      whoActed: 'Le Dr. Alami clique sur « Faire Entrer »',
      whatChanged: 'Patient Démo 01 passe en IN_CONSULTATION. Le chrono démarre. La file d’attente s’ajuste.',
      whatNext: 'Examen clinique en cours : prise de tension artérielle, écoute cardiaque, renouvellement.',
      doctorView: 'Chrono actif : 14m 24s • Examen en cours dans le Bureau 1.',
      secretaryView: 'Bureau 1 occupé par Patient Démo 01. Prochain patient en attente : M. Karim T.',
    },
    {
      state: 'TO_BE_PAID' as MacroMedicaState,
      time: '09:18',
      title: 'Transmission pour encaissement',
      actor: 'Médecin ↔ Accueil',
      whoActed: 'Le Dr. Alami valide la consultation et cotation',
      whatChanged: 'Cotation transmise : CS (300 MAD) + ECG (150 MAD) = Total 450 MAD. Statut TO_BE_PAID.',
      whatNext: 'La patiente se dirige vers l’accueil pour régler. Nadia sait exactement quoi percevoir.',
      doctorView: 'Consultation clôturée. Ordonnance émise. Bureau prêt pour le patient suivant.',
      secretaryView: 'Notification instantanée : À encaisser pour Patient Démo 01 : 450 MAD.',
    },
    {
      state: 'DONE' as MacroMedicaState,
      time: '09:21',
      title: 'Quittance officielle & clôture',
      actor: 'Secrétariat (Nadia)',
      whoActed: 'Nadia perçoit 450 MAD en espèces',
      whatChanged: 'Quittance #MM-2026-0842 imprimée et remise. Statut DONE. Visite archivée.',
      whatNext: 'Le tiroir-caisse est actualisé (+450 MAD). Le circuit de Patient Démo 01 est terminé.',
      doctorView: 'Historique de Patient Démo 01 mis à jour avec la visite soldée.',
      secretaryView: 'Reçu officiel délivré. Caisse journalière équilibrée.',
    },
  ]

  const current = steps[activeStep]
  const st = STATE_DEFINITIONS[current.state]

  return (
    <div>
      {/* Top Simulator Control Bar */}
      <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="font-mono text-xs font-bold">
            Simulateur de Cycle Patient • Synchronisation Médecin ↔ Secrétariat
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveStep((prev) => (prev + 1) % steps.length)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all cursor-pointer"
          >
            <span>Avancer le flux</span>
            <ArrowRight size={13} />
          </button>
          <button
            onClick={() => setActiveStep(0)}
            title="Réinitialiser à l'arrivée"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Stepper Tabs Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-slate-100 border-b border-slate-200 bg-slate-50/70 text-xs">
        {steps.map((step, idx) => {
          const isCurrent = idx === activeStep
          const isPast = idx < activeStep
          return (
            <button
              key={step.state}
              onClick={() => setActiveStep(idx)}
              className={`p-3 text-left transition-colors cursor-pointer ${
                isCurrent
                  ? 'bg-white font-bold text-teal-900 border-b-2 border-teal-700 shadow-sm'
                  : isPast
                  ? 'text-slate-700 hover:bg-slate-100/80 font-medium'
                  : 'text-slate-400 hover:bg-slate-100/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-slate-500">{step.time}</span>
                {isPast && <CheckCircle2 size={12} className="text-teal-700" />}
              </div>
              <div className="truncate font-medium">{step.title}</div>
            </button>
          )
        })}
      </div>

      {/* Main Interactive Screen Split */}
      <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left: Dual Screen Live Mirror (Doctor vs Secretary) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-4">
            
            {/* Patient Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                  DOSSIER #0248
                </span>
                <span className="font-semibold text-slate-800">Patient Démo 01 (Mme Amina B. • 52 ans)</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.color}`}>
                {st.label} ({st.state})
              </span>
            </div>

            {/* Split Screen Views: Doctor on Top, Secretary Below */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              
              {/* Doctor Cockpit View */}
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-slate-500 pb-1.5 border-b border-slate-100">
                  <span className="font-bold uppercase text-[10px] flex items-center gap-1 text-slate-700">
                    <Stethoscope size={12} className="text-teal-700" />
                    <span>Poste Dr. Yassine Alami</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">Bureau 1</span>
                </div>
                <div className="text-slate-800 text-xs leading-relaxed font-medium">
                  {current.doctorView}
                </div>
                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Chrono :</span>
                  <span className="font-mono font-bold text-teal-800">
                    {activeStep === 2 ? '14m 24s (Actif)' : activeStep > 2 ? 'Terminé (15 min)' : 'En attente'}
                  </span>
                </div>
              </div>

              {/* Secretary Accueil View */}
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-slate-500 pb-1.5 border-b border-slate-100">
                  <span className="font-bold uppercase text-[10px] flex items-center gap-1 text-slate-700">
                    <User size={12} className="text-teal-700" />
                    <span>Poste Secrétariat (Nadia)</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">Accueil &amp; Caisse</span>
                </div>
                <div className="text-slate-800 text-xs leading-relaxed font-medium">
                  {current.secretaryView}
                </div>
                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Montant :</span>
                  <span className="font-mono font-bold text-slate-900">
                    {activeStep >= 3 ? '450 MAD (CS + ECG)' : 'Non coté'}
                  </span>
                </div>
              </div>

            </div>

            {/* Waiting Queue Visualizer */}
            <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-1.5">
              <div className="text-[10px] font-bold uppercase text-slate-400 flex justify-between">
                <span>File active partagée</span>
                <span className="font-mono text-emerald-700">Mise à jour temps réel</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 border ${
                  activeStep === 2 ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}>
                  <User size={12} />
                  <span>Amina B. (#0248)</span>
                  <span className="font-mono text-[10px] text-slate-500">({current.state})</span>
                </span>
                <span className="text-slate-300">→</span>
                <span className="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-xs">
                  M. Karim T. (#0249)
                </span>
                <span className="text-slate-300">→</span>
                <span className="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-xs">
                  Mme Sofia M. (#0250)
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Right: Operational Causality Card (Who, What, Next) */}
        <div className="lg:col-span-5 space-y-3.5">
          <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3 text-xs">
            <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-slate-200">
              <span className="font-bold uppercase tracking-wider text-[10px]">
                Mécanique Logicielle MacroMedica
              </span>
              <span className="font-mono">Étape {activeStep + 1} / 5</span>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500">1. Qui a agi ?</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{current.whoActed}</div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500">2. Ce qui a changé dans le système</div>
              <p className="text-slate-700 leading-relaxed mt-0.5">{current.whatChanged}</p>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500">3. Prochaine étape attendue</div>
              <p className="text-slate-700 leading-relaxed mt-0.5">{current.whatNext}</p>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <span>Responsable actif :</span>
              <strong className="text-slate-800">{current.actor}</strong>
            </div>
          </div>

          <button
            onClick={() => setActiveStep((prev) => (prev + 1) % steps.length)}
            className="w-full py-2.5 rounded-lg bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>Passer à l’étape suivante</span>
            <ArrowRight size={13} />
          </button>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GESTION-RDV — Interactive Day Schedule & Conflict-Free Slot Booker
// ─────────────────────────────────────────────────────────────────────────────
function GestionRdvSimulator() {
  const [selectedSlot, setSelectedSlot] = useState(1) // 09:00 Patient Démo 01
  const [isBooked, setIsBooked] = useState(false)

  const slots = [
    { time: '08:30', duration: '30 min', patient: 'M. Karim T. (#0247)', motif: 'Bilan annuel', state: 'DONE' as MacroMedicaState },
    { time: '09:00', duration: '30 min', patient: 'Patient Démo 01 (Mme Amina B.)', motif: 'Suivi HTA régulier', state: 'IN_CONSULTATION' as MacroMedicaState },
    { time: '09:30', duration: '30 min', patient: 'Mme Sofia M. (#0250)', motif: 'Renouvellement ordonnance', state: 'WAITING' as MacroMedicaState },
    { time: '10:00', duration: '30 min', patient: isBooked ? 'M. Omar B. (#0251)' : 'Créneau Libre', motif: isBooked ? 'Première consultation' : 'Disponible pour réservation', state: (isBooked ? 'SCHEDULED' : 'SCHEDULED') as MacroMedicaState, isAvailable: !isBooked },
    { time: '10:30', duration: '15 min', patient: 'M. Youssef K. (#0252)', motif: 'Contrôle tension rapide', state: 'SCHEDULED' as MacroMedicaState },
  ]

  const active = slots[selectedSlot] || slots[0]
  const st = STATE_DEFINITIONS[active.state]

  return (
    <div>
      <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="font-mono text-xs font-bold">
            Simulateur d’Agenda Médical • Cabinet Dr. Yassine Alami
          </span>
        </div>
        <div className="text-xs font-mono text-slate-300">
          Matinée du 14 Septembre 2026
        </div>
      </div>

      <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: Schedule Slots Grid */}
        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs text-slate-500 font-medium">
            <span>Horaires de la matinée</span>
            <span>Cliquez sur un créneau pour inspecter</span>
          </div>

          <div className="space-y-2">
            {slots.map((slot, idx) => {
              const isSelected = idx === selectedSlot
              const slotSt = STATE_DEFINITIONS[slot.state]
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedSlot(idx)}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all text-xs ${
                    isSelected
                      ? 'bg-teal-50/90 border-teal-500 ring-2 ring-teal-500/20 shadow-sm'
                      : slot.isAvailable
                      ? 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50/80 text-emerald-900'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-bold text-slate-800 text-xs w-12 flex-shrink-0">
                      {slot.time}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate flex items-center gap-2">
                        <span>{slot.patient}</span>
                        {slot.patient.includes('Patient Démo 01') && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-900 text-white font-mono">
                            Fil Suivi
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{slot.motif}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-slate-400 font-mono text-[10px] hidden sm:inline">
                      {slot.duration}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${slotSt.color}`}>
                      {slot.isAvailable ? 'Libre' : slotSt.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Slot Action & Conflict Inspector */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3.5 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-slate-500">
              <span className="font-bold uppercase text-[10px]">Détails du créneau sélectionné</span>
              <span className="font-mono font-bold text-slate-800">{active.time}</span>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Patient</div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">{active.patient}</div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Motif de visite</div>
              <div className="text-slate-700 font-medium mt-0.5">{active.motif}</div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Durée recommandée calculée</div>
              <div className="text-slate-800 font-mono font-semibold mt-0.5">{active.duration} (Pas de débordement)</div>
            </div>

            {active.isAvailable ? (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="text-emerald-800 font-medium">
                  Ce créneau de 10:00 est libre. Vous pouvez tester la réservation en un clic.
                </div>
                <button
                  onClick={() => setIsBooked(true)}
                  className="w-full py-2.5 rounded-lg bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Réserver ce créneau pour M. Omar B.</span>
                </button>
              </div>
            ) : isBooked && selectedSlot === 3 ? (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="p-2 rounded bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>Créneau réservé et synchronisé sur tous les postes !</span>
                </div>
                <button
                  onClick={() => setIsBooked(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
                >
                  Annuler la réservation fictive
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span>Synchronisation :</span>
                <span className="font-semibold text-teal-800">Partagé Médecin &amp; Secrétariat</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ORDONNANCES — Clinical Cockpit & Progressive Consultation Builder
// ─────────────────────────────────────────────────────────────────────────────
function OrdonnancesSimulator() {
  const [activeTab, setActiveTab] = useState<'context' | 'vitals' | 'rx' | 'billing'>('rx')

  return (
    <div>
      <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="font-mono text-xs font-bold">
            Cockpit Clinique • Patient Démo 01 (Mme Amina B. #0248)
          </span>
        </div>
        <div className="text-xs font-mono text-emerald-400">
          Chrono examen : 14m 24s
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-200 bg-slate-50/70 text-xs">
        <button
          onClick={() => setActiveTab('context')}
          className={`p-3 text-center transition-colors cursor-pointer ${
            activeTab === 'context' ? 'bg-white font-bold text-teal-900 border-b-2 border-teal-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          1. Antécédents
        </button>
        <button
          onClick={() => setActiveTab('vitals')}
          className={`p-3 text-center transition-colors cursor-pointer ${
            activeTab === 'vitals' ? 'bg-white font-bold text-teal-900 border-b-2 border-teal-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          2. Constantes
        </button>
        <button
          onClick={() => setActiveTab('rx')}
          className={`p-3 text-center transition-colors cursor-pointer ${
            activeTab === 'rx' ? 'bg-white font-bold text-teal-900 border-b-2 border-teal-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          3. Ordonnance DCI
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`p-3 text-center transition-colors cursor-pointer ${
            activeTab === 'billing' ? 'bg-white font-bold text-teal-900 border-b-2 border-teal-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          4. Cotation (450 MAD)
        </button>
      </div>

      <div className="p-6 sm:p-8">
        {activeTab === 'context' && (
          <div className="max-w-2xl mx-auto space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-amber-900">Alerte Médicale Active :</strong>
                <span>Contre-indication majeure notée : <strong>Allergie à la Pénicilline</strong>. Signalement permanent en tête de cockpit.</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-sm">Pathologies Chroniques Connues</div>
              <p className="text-slate-600 leading-relaxed">
                Hypertension artérielle modérée suivie au cabinet depuis octobre 2022. Traitement habituel bien toléré sans retentissement rénal.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'vitals' && (
          <div className="max-w-2xl mx-auto space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-white border border-slate-200 text-center">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Tension Artérielle</div>
                <div className="font-mono font-bold text-lg text-slate-900 mt-1">13.2 / 8.0</div>
                <div className="text-[10px] text-emerald-600 font-medium">mmHg • Normotendu</div>
              </div>
              <div className="p-4 rounded-xl bg-white border border-slate-200 text-center">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Fréquence Cardiaque</div>
                <div className="font-mono font-bold text-lg text-slate-900 mt-1">72</div>
                <div className="text-[10px] text-slate-500">bpm • Rythme régulier</div>
              </div>
              <div className="p-4 rounded-xl bg-white border border-slate-200 text-center">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Poids / IMC</div>
                <div className="font-mono font-bold text-lg text-slate-900 mt-1">68 kg</div>
                <div className="text-[10px] text-slate-500">IMC 24.5 (Stable)</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rx' && (
          <div className="max-w-2xl mx-auto p-5 rounded-xl border border-slate-200 bg-white space-y-4 text-xs shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-900 text-sm">Ordonnance Médicale Dactylographiée</div>
                <div className="text-[11px] text-slate-500">Dr. Yassine Alami • Spécialiste Cardiologie</div>
              </div>
              <div className="font-mono text-slate-500">14 Sep 2026</div>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">1. AMLODIPINE 5 mg, comprimé pelliculé</div>
                  <div className="text-slate-600 mt-0.5">1 comprimé le matin au petit-déjeuner.</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">Durée : 3 mois (Renouvelable) • Boîte de 30</div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                  DCI
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">2. KARDEGIC 75 mg, poudre pour solution buvable</div>
                  <div className="text-slate-600 mt-0.5">1 sachet le midi au cours du repas.</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">Durée : 3 mois • Boîte de 30 sachets</div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                  DCI
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-slate-500 text-[11px]">
              <span>Cachet &amp; Signature préenregistrés</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 size={13} />
                <span>Prêt pour impression / QR-Code</span>
              </span>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="max-w-2xl mx-auto space-y-4 text-xs">
            <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-3">
              <div className="font-bold text-slate-900 text-sm">Cotation des Actes de la Consultation</div>
              <div className="space-y-2">
                <div className="flex justify-between p-2.5 rounded bg-slate-50 border border-slate-200">
                  <span className="font-medium text-slate-800">Consultation Spécialisée (CS)</span>
                  <span className="font-mono font-bold text-slate-900">300 MAD</span>
                </div>
                <div className="flex justify-between p-2.5 rounded bg-slate-50 border border-slate-200">
                  <span className="font-medium text-slate-800">Électrocardiogramme de contrôle (ECG)</span>
                  <span className="font-mono font-bold text-slate-900">150 MAD</span>
                </div>
                <div className="flex justify-between p-3 rounded bg-teal-50 border border-teal-200 font-bold text-sm text-teal-950">
                  <span>Total transmis à la caisse :</span>
                  <span className="font-mono">450 MAD</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FACTURATION — Moroccan Cabinet Checkout & Official Quittance Simulator
// ─────────────────────────────────────────────────────────────────────────────
function FacturationSimulator() {
  const [payMethod, setPayMethod] = useState<'cash' | 'tpe' | 'cheque'>('cash')
  const [cashTendered, setCashTendered] = useState<number>(500)
  const [isReceiptIssued, setIsReceiptIssued] = useState(false)

  const totalDue = 450
  const changeDue = Math.max(0, cashTendered - totalDue)

  return (
    <div>
      <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="font-mono text-xs font-bold">
            Caisse &amp; Émission Quittance • Poste Secrétariat (Nadia)
          </span>
        </div>
        <div className="text-xs font-mono text-slate-300">
          Dossier #0248 • Amina B.
        </div>
      </div>

      <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: Payment Method & Breakdown */}
        <div className="lg:col-span-6 space-y-4 text-xs">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">Actes Télétransmis du Bureau 1</div>
            <div className="flex justify-between text-slate-700">
              <span>Consultation Spécialisée (CS)</span>
              <span className="font-mono font-semibold">300 MAD</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Électrocardiogramme (ECG)</span>
              <span className="font-mono font-semibold">150 MAD</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
              <span>Total à percevoir :</span>
              <span className="font-mono text-teal-800">450 MAD</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">Mode de Règlement</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPayMethod('cash')}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  payMethod === 'cash' ? 'bg-teal-50 border-teal-600 text-teal-900 font-bold' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <Wallet size={16} />
                <span>Espèces</span>
              </button>
              <button
                onClick={() => setPayMethod('tpe')}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  payMethod === 'tpe' ? 'bg-teal-50 border-teal-600 text-teal-900 font-bold' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <CreditCard size={16} />
                <span>Carte TPE</span>
              </button>
              <button
                onClick={() => setPayMethod('cheque')}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  payMethod === 'cheque' ? 'bg-teal-50 border-teal-600 text-teal-900 font-bold' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <FileText size={16} />
                <span>Chèque</span>
              </button>
            </div>
          </div>

          {/* Cash Change Calculator */}
          {payMethod === 'cash' && (
            <div className="p-3.5 rounded-lg bg-white border border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-slate-600">
                <span>Montant remis par la patiente :</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setCashTendered(450)}
                    className={`px-2 py-1 rounded font-mono text-xs cursor-pointer ${cashTendered === 450 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    450 MAD
                  </button>
                  <button
                    onClick={() => setCashTendered(500)}
                    className={`px-2 py-1 rounded font-mono text-xs cursor-pointer ${cashTendered === 500 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    500 MAD
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-slate-900 font-bold">
                <span>Monnaie à rendre :</span>
                <span className="font-mono text-base text-emerald-700">{changeDue} MAD</span>
              </div>
            </div>
          )}

          <button
            onClick={() => setIsReceiptIssued(true)}
            className="w-full py-3 rounded-lg bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Receipt size={14} />
            <span>Valider le règlement et éditer la quittance</span>
          </button>
        </div>

        {/* Right: Printable Official Moroccan Quittance Preview */}
        <div className="lg:col-span-6">
          <div className="p-6 rounded-xl border border-slate-300 bg-white shadow-lg space-y-4 text-xs font-mono">
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <div className="font-bold text-sm text-slate-900">CABINET MÉDICAL DR. YASSINE ALAMI</div>
              <div className="text-[10px] text-slate-500">Spécialiste Cardiologie • N° Ordre 12849</div>
              <div className="text-[10px] text-slate-500">Avenue Mohammed V, Rabat • IF 4018294</div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Quittance N° : MM-2026-0842</span>
              <span>14/09/2026 09:21</span>
            </div>

            <div className="p-2 rounded bg-slate-50 text-[11px] text-slate-700">
              Patient : Mme Amina Benali (#0248)
            </div>

            <div className="space-y-1.5 py-2 border-y border-dashed border-slate-300 text-[11px]">
              <div className="flex justify-between">
                <span>Consultation Spécialisée (CS)</span>
                <span>300.00 MAD</span>
              </div>
              <div className="flex justify-between">
                <span>Électrocardiogramme (ECG)</span>
                <span>150.00 MAD</span>
              </div>
            </div>

            <div className="flex justify-between font-bold text-sm text-slate-900">
              <span>TOTAL ACQUITTÉ :</span>
              <span>450.00 MAD</span>
            </div>

            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Mode : {payMethod.toUpperCase()}</span>
              <span className="font-bold text-emerald-700">STATUT : ACQUITTÉ</span>
            </div>

            {isReceiptIssued && (
              <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-center font-sans text-xs font-bold text-emerald-800">
                ✓ Quittance officielle générée avec succès et archivée en caisse
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DOSSIERS-PATIENTS — Longitudinal Record Explorer
// ─────────────────────────────────────────────────────────────────────────────
function DossiersPatientsSimulator() {
  const [activeTab, setActiveTab] = useState<'history' | 'biometrics' | 'documents'>('history')

  return (
    <div>
      <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="font-mono text-xs font-bold">
            Dossier Médical Unique • Patient Démo 01 (#0248)
          </span>
        </div>
        <div className="text-xs font-mono text-slate-300">
          Suivi depuis Octobre 2022
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-200 bg-slate-50/70 text-xs">
        <button
          onClick={() => setActiveTab('history')}
          className={`p-3 text-center transition-colors cursor-pointer ${
            activeTab === 'history' ? 'bg-white font-bold text-teal-900 border-b-2 border-teal-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          1. Chronologie des visites (4)
        </button>
        <button
          onClick={() => setActiveTab('biometrics')}
          className={`p-3 text-center transition-colors cursor-pointer ${
            activeTab === 'biometrics' ? 'bg-white font-bold text-teal-900 border-b-2 border-teal-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          2. Évolution Tension (4 ans)
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`p-3 text-center transition-colors cursor-pointer ${
            activeTab === 'documents' ? 'bg-white font-bold text-teal-900 border-b-2 border-teal-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          3. Analyses Labo &amp; ECG
        </button>
      </div>

      <div className="p-6 sm:p-8">
        {activeTab === 'history' && (
          <div className="max-w-2xl mx-auto space-y-3 text-xs">
            <div className="p-3.5 rounded-lg bg-teal-50/70 border border-teal-200">
              <div className="flex justify-between font-bold text-teal-950">
                <span>14 Septembre 2026 (Ce jour)</span>
                <span className="font-mono text-teal-800">Dr. Yassine Alami</span>
              </div>
              <p className="text-teal-900 mt-1">Consultation de contrôle HTA : TA 13.2 / 8.0 mmHg. Traitement renouvelé 3 mois.</p>
            </div>

            <div className="p-3.5 rounded-lg bg-white border border-slate-200">
              <div className="flex justify-between font-bold text-slate-900">
                <span>02 Mars 2026</span>
                <span className="font-mono text-slate-500">Laboratoire Rabat</span>
              </div>
              <p className="text-slate-600 mt-1">Bilan biologique sanguin rattaché : Créatinine normale, Glycémie à jeun 0.95 g/L.</p>
            </div>

            <div className="p-3.5 rounded-lg bg-white border border-slate-200">
              <div className="flex justify-between font-bold text-slate-900">
                <span>18 Novembre 2025</span>
                <span className="font-mono text-slate-500">Dr. Yassine Alami</span>
              </div>
              <p className="text-slate-600 mt-1">Visite semestrielle : Ajustement posologique Amlodipine 5mg. Bonne tolérance clinique.</p>
            </div>

            <div className="p-3.5 rounded-lg bg-white border border-slate-200">
              <div className="flex justify-between font-bold text-slate-900">
                <span>11 Octobre 2022</span>
                <span className="font-mono text-slate-500">Dr. Yassine Alami</span>
              </div>
              <p className="text-slate-600 mt-1">Première consultation : Diagnostic initial HTA stade 1 (14.5/9.0 mmHg). Bilan d’inclusion réalisé.</p>
            </div>
          </div>
        )}

        {activeTab === 'biometrics' && (
          <div className="max-w-2xl mx-auto space-y-4 text-xs">
            <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
              <div className="font-bold text-slate-900 text-sm">Courbe Tensionnelle 2022 - 2026</div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-slate-500">11 Oct 2022 (Départ)</span>
                  <div className="w-1/2 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: '85%' }} />
                  </div>
                  <span className="font-mono font-bold text-amber-700">14.5 / 9.0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-mono text-slate-500">18 Nov 2025 (Suivi)</span>
                  <div className="w-1/2 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-teal-500 h-2.5 rounded-full" style={{ width: '70%' }} />
                  </div>
                  <span className="font-mono font-bold text-teal-800">13.8 / 8.5</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-mono text-slate-500">14 Sep 2026 (Ce jour)</span>
                  <div className="w-1/2 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '60%' }} />
                  </div>
                  <span className="font-mono font-bold text-emerald-700">13.2 / 8.0</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-slate-500 text-[11px]">
                Preuve d’efficacité du traitement par les chiffres, visualisable en un coup d’œil.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="max-w-2xl mx-auto space-y-3 text-xs">
            <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-teal-700" />
                <div>
                  <div className="font-bold text-slate-900">Bilan Biologique Sanguin — Laboratoire Rabat</div>
                  <div className="text-slate-500 text-[11px]">02 Mars 2026 • PDF rattaché</div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200">
                Consulter
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-teal-700" />
                <div>
                  <div className="font-bold text-slate-900">Tracé Électrocardiogramme (ECG 12 dérivations)</div>
                  <div className="text-slate-500 text-[11px]">14 Septembre 2026 • Numérisé</div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200">
                Consulter
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TÂCHES — Cabinet Coordination & Action Workflow
// ─────────────────────────────────────────────────────────────────────────────
function TachesSimulator() {
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Vérifier bilan INR de contrôle (Patient Démo 01 #0248)', priority: 'P1 Urgent', assignee: 'Dr. Yassine Alami', done: false },
    { id: 2, title: 'Faire signer certificat médical de sport', priority: 'P2 Normal', assignee: 'Dr. Yassine Alami', done: false },
    { id: 3, title: 'Rappeler M. Karim T. pour confirmation bilan', priority: 'P3 Standard', assignee: 'Nadia (Secrétaire)', done: false },
  ])

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    )
  }

  return (
    <div>
      <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="font-mono text-xs font-bold">
            Tableau de Coordination • Actions du Cabinet
          </span>
        </div>
        <div className="text-xs font-mono text-slate-300">
          Zéro post-it oublié
        </div>
      </div>

      <div className="p-6 sm:p-8 max-w-2xl mx-auto space-y-3 text-xs">
        <div className="flex justify-between items-center pb-2 border-b border-slate-200 text-slate-500">
          <span>Tâches actives du cabinet</span>
          <span>Cochez une tâche pour la clôturer</span>
        </div>

        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => toggleTask(task.id)}
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
              task.done
                ? 'bg-slate-50 border-slate-200 opacity-60 line-through'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                  task.done ? 'bg-teal-700 border-teal-700 text-white' : 'border-slate-300'
                }`}
              >
                {task.done && <Check size={13} />}
              </div>
              <div>
                <div className="font-semibold text-slate-900">{task.title}</div>
                <div className="text-[11px] text-slate-500">Assigné à : {task.assignee}</div>
              </div>
            </div>

            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                task.priority.includes('P1')
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : task.priority.includes('P2')
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {task.priority}
            </span>
          </div>
        ))}

        <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs">
          <strong>Communication silencieuse :</strong> Lorsque le médecin valide une tâche entre deux consultations, la secrétaire est immédiatement notifiée sans appel téléphonique ni intrusion dans le bureau.
        </div>
      </div>
    </div>
  )
}
