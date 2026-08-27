import React, { useState } from 'react'
import { Mic, Plus, Send, Clock, FileText, CheckCircle2, MessageSquare, Pill, Activity, User, Calendar, AlertCircle } from 'lucide-react'
import Tooltip from '../ui/Tooltip'

export default function PatientFocusStream({
  tasks = [],
  notify
}) {
  const [selectedPatientId, setSelectedPatientId] = useState('p1')
  const [isDictating, setIsDictating] = useState(false)
  const [noteInput, setNoteInput] = useState('')

  const patients = [
    { id: 'p1', name: 'Meryem Tazi', age: '54 ans', priority: 'Haute', condition: 'HTA Severa (185/110)', lastVisit: '10/07/2026' },
    { id: 'p2', name: 'Sarah Benali', age: '32 ans', priority: 'Normale', condition: 'Diabète T2 / HbA1c 8.2%', lastVisit: '22/07/2026' },
    { id: 'p3', name: 'Marc Dupont', age: '45 ans', priority: 'Moyenne', condition: 'Suivi ECG & Lipides', lastVisit: '01/08/2026' }
  ]

  const activePatient = patients.find(p => p.id === selectedPatientId) || patients[0]

  // Timeline events for active patient
  const [timelineEvents, setTimelineEvents] = useState([
    { id: 1, type: 'urgence', title: 'Alerte Constantes Vitales', detail: 'Tension artérielle mesurée à 185/110 mmHg par l\'infirmière d\'accueil.', time: 'Aujourd\'hui 10:15', badge: '🔴 Urgence Salle d\'Attente' },
    { id: 2, type: 'lab', title: 'Résultats Labo Reçus', detail: 'Bilan Sanguin: Glycémie 1.80 g/L, HbA1c 8.2%, Créatinine 8.5 mg/L.', time: 'Aujourd\'hui 09:30', badge: '🔵 PDF Labo' },
    { id: 3, type: 'whatsapp', title: 'Message Patient (WhatsApp)', detail: '"Bonjour Docteur, dois-je prendre mon médicament à midi avec un verre d\'eau ?"', time: 'Aujourd\'hui 08:20', badge: '🟣 Communication' },
    { id: 4, type: 'consultation', title: 'Consultation Précédente', detail: 'Diagnostic: Hypertension artérielle essentielle. Prescrit Amlor 5mg 1cp/j.', time: '10/07/2026', badge: '🟢 Historique Medical' }
  ])

  // Smart Template Action chips handler
  const handleAppendChip = (title, detail, type = 'note') => {
    const newEvent = {
      id: Date.now(),
      type,
      title,
      detail,
      time: 'À l\'instant',
      badge: '✨ Note Dictée / Action'
    }
    setTimelineEvents(prev => [newEvent, ...prev])
    notify?.({
      title: 'Action Ajoutée à la Chronologie 📝',
      description: `"${title}" enregistré au fil chronologique du patient.`,
      variant: 'success'
    })
  }

  const handleToggleDictation = () => {
    setIsDictating(!isDictating)
    if (!isDictating) {
      notify?.({
        title: 'Microphone Actif 🎙️',
        description: 'Dictée vocale en cours... Parlez clairement.',
        variant: 'info'
      })
      setTimeout(() => {
        setNoteInput('Tension régulée après repos. Poursuivre Amlor 5mg avec contrôle dans 15 jours.')
        setIsDictating(false)
      }, 2500)
    }
  }

  const handleAddCustomNote = () => {
    if (!noteInput.trim()) return
    handleAppendChip('Note Médicale', noteInput.trim())
    setNoteInput('')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-14rem)] min-h-[600px]">
      
      {/* 🔴 LEFT PANE (30% Width - Patient Priority List) */}
      <div className="lg:col-span-4 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="text-blue-600" size={18} />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Patients Prioritaires</h3>
          </div>
          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {patients.length} Dossiers
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {patients.map(p => {
            const isSelected = p.id === selectedPatientId
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPatientId(p.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/90 border-blue-500 shadow-sm ring-1 ring-blue-400/40'
                    : 'bg-white border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <h4 className="text-sm font-bold text-slate-900">{p.name}</h4>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    p.priority === 'Haute' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {p.priority}
                  </span>
                </div>

                <p className="text-xs font-medium text-slate-600 mb-2">{p.condition}</p>

                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                  <span>{p.age}</span>
                  <span>Dernière visite: {p.lastVisit}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 🟢 MAIN VIEW (70% Width - Unified Chronological Timeline) */}
      <div className="lg:col-span-8 h-full rounded-2xl border border-slate-200/90 bg-white shadow-sm flex flex-col overflow-hidden">
        
        {/* Voice & Quick Actions Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-sm">
                {activePatient.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{activePatient.name}</h2>
                <p className="text-xs text-slate-500 font-medium">Fil Chronologique Unifié • {activePatient.condition}</p>
              </div>
            </div>

            {/* Dictation Button with Tooltip */}
            <Tooltip content="Active la transcription vocale automatique pour enregistrer une note médicale en direct">
              <button
                type="button"
                onClick={handleToggleDictation}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 ${
                  isDictating
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                <Mic size={16} />
                <span>{isDictating ? '🎙️ Écoute en cours...' : '🎙️ Dicter une Note'}</span>
              </button>
            </Tooltip>
          </div>

          {/* Smart Action Template Chips with Tooltips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">Actions 1-Clic:</span>
            
            <Tooltip content="Ajoute une ordonnance standard de Paracétamol 1g 3cp/j pendant 5 jours">
              <button
                type="button"
                onClick={() => handleAppendChip('Prescription Rapide: Paracétamol 1g', 'Paracétamol 1g - 1 comprimé toutes les 8h si douleur/fièvre (max 3g/j).')}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold shrink-0 transition-all"
              >
                💊 [ Prescrire Paracétamol ]
              </button>
            </Tooltip>

            <Tooltip content="Génère un certificat de repos médical de 3 jours">
              <button
                type="button"
                onClick={() => handleAppendChip('Certificat Médical: Repos 3 Jours', 'Repos à domicile prescrit du 02/08 au 05/08/2026 inclus.')}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold shrink-0 transition-all"
              >
                📜 [ Repos 3 Jours ]
              </button>
            </Tooltip>

            <Tooltip content="Confirme les résultats biologiques récents et notifie le patient">
              <button
                type="button"
                onClick={() => handleAppendChip('Validation Bilan Sanguin', 'Bilan sanguin validé: Glycémie et bilan rénal satisfaisants.')}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold shrink-0 transition-all"
              >
                🧪 [ Bilan Sanguin OK ]
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Unified Vertical Chronological Timeline */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
            {timelineEvents.map((evt) => (
              <div key={evt.id} className="relative group">
                {/* Timeline Node Dot */}
                <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white border-4 border-slate-900 shadow-2xs" />

                <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-1.5 transition-all hover:bg-white hover:border-slate-300 hover:shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-800">{evt.title}</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                      {evt.badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium leading-relaxed">{evt.detail}</p>
                  
                  <div className="text-[10px] font-semibold text-slate-400 pt-1">
                    {evt.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dictated Note Input Bar */}
        <div className="p-3.5 border-t border-slate-100 bg-white flex items-center gap-2">
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Tapez ou dictez une observation..."
            className="flex-1 p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-slate-50/50"
          />
          <Tooltip content="Ajouter l'observation directement à la chronologie du patient">
            <button
              type="button"
              onClick={handleAddCustomNote}
              disabled={!noteInput.trim()}
              className="px-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Plus size={15} />
              <span>Ajouter</span>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
