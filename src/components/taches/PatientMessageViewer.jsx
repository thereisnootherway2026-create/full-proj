import React, { useState } from 'react'
import { MessageSquare, Send, Sparkles, CheckCheck, Phone } from 'lucide-react'

export default function PatientMessageViewer({ task, onSendReply, isProcessing }) {
  const [replyText, setReplyText] = useState('')
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'patient',
      text: task?.description || 'Bonjour Docteur, j\'ai une petite question sur les effets secondaires de mon traitement. Dois-je continuer à prendre le médicament à midi ?',
      time: task?.metadata || 'Il y a 2h'
    }
  ])

  // AI Quick Template Chips
  const aiTemplates = [
    { label: '📅 RDV Nécessaire', text: 'Bonjour, il convient d\'effectuer une consultation de contrôle en cabinet. Merci de contacter le secrétariat pour convenir d\'un RDV.' },
    { label: '💊 Traitement Normal', text: 'Bonjour, l\'effet mentionné est habituel et transitoire. Vous pouvez poursuivre le traitement normalement avec un verre d\'eau.' },
    { label: '🧪 Bilan OK', text: 'Bonjour, votre bilan est tout à fait rassurant. Continuez vos habitudes actuelles sans modification.' },
    { label: '⚠️ Suspendre Traitement', text: 'Bonjour, veuillez interrompre la prise du médicament temporairement et venir nous consulter rapidement.' }
  ]

  const handleApplyTemplate = (text) => {
    setReplyText(text)
  }

  const handleSend = () => {
    if (!replyText.trim()) return
    const newMsg = {
      id: Date.now(),
      sender: 'doctor',
      text: replyText.trim(),
      time: 'À l\'instant'
    }
    setMessages(prev => [...prev, newMsg])
    onSendReply?.(task, replyText.trim())
    setReplyText('')
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center font-bold">
            <MessageSquare size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Fil de discussion avec {task?.patientName}</h2>
              <span className="bg-purple-50 text-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
                Message Patient
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Demande reçue {task?.metadata || 'aujourd\'hui'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-9 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Phone size={14} />
            Appeler le patient
          </button>
        </div>
      </div>

      {/* Message History Thread */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'doctor' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-xs text-slate-400 font-semibold">
              <span>{msg.sender === 'doctor' ? 'Vous (Dr. Touggani)' : task?.patientName}</span>
              <span>•</span>
              <span>{msg.time}</span>
            </div>

            <div
              className={`max-w-lg p-4 rounded-2xl text-sm leading-relaxed shadow-2xs ${
                msg.sender === 'doctor'
                  ? 'bg-blue-600 text-white rounded-tr-xs font-medium'
                  : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-xs font-medium'
              }`}
            >
              {msg.text}
            </div>

            {msg.sender === 'doctor' && (
              <span className="text-xs text-blue-600 font-bold mt-1 flex items-center gap-1">
                <CheckCheck size={14} />
                Transmis au patient
              </span>
            )}
          </div>
        ))}
      </div>

      {/* AI Quick Response Chips + Reply Box */}
      <div className="p-4 bg-white border-t border-slate-100 space-y-3 shrink-0">
        {/* Quick Chips */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
            <Sparkles size={14} className="text-amber-500" />
            <span>Réponses Rapides Intelligentes (IA):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {aiTemplates.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyTemplate(item.text)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-all duration-150 active:scale-95"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea + Send */}
        <div className="flex gap-2">
          <textarea
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Tapez votre réponse au patient..."
            className="flex-1 p-3.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-medium resize-none bg-slate-50/50"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={isProcessing || !replyText.trim()}
            className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            <Send size={16} />
            <span>Envoyer</span>
          </button>
        </div>
      </div>
    </div>
  )
}
