import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams, useBlocker } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Calendar,
  FileText,
  Activity,
  AlertTriangle,
  Pill,
  Stethoscope,
  User,
  Phone,
  Heart,
  Droplets,
  Thermometer,
  Scale,
  Ruler,
  ChevronRight,
  Download,
  Printer,
  FileCheck2,
  TestTube2,
  Image as ImageIcon,
  Microscope,
  CheckCircle2,
  X,
  Plus,
  Sparkles,
  Brain,
  ListChecks,
  ClipboardList,
  BookOpen,
  MoreHorizontal,
  Share2,
  FilePlus,
  Save,
  CalendarClock,
  Wind,
  Zap,
  Shield,
  Calculator,
  Info,
  ContactRound,
  HeartPulse,
} from 'lucide-react'
import { useAppContext } from '../../context/AppContext'

import { getPatientById, getPatientClinicalFields } from '../../lib/api'
import { VISIT_STATUSES } from '../../lib/workflow'
import { useFocusMode } from '../../hooks/useFocusMode'
import { Backdrop, FocusableCard, MedicalTextarea } from '../../components/FocusMode'
import PreparationChecklist from '../../components/consultation/PreparationChecklist'

// --- Mock Data ---
const MOCK_ALERTS = [
  { id: 1, type: 'allergy', label: 'Allergie pénicilline', severity: 'critical' },
  { id: 2, type: 'chronic', label: 'Diabète type 2', severity: 'warning' },
]

const MOCK_MEDICATIONS = [
  { id: 1, name: 'Metformine 850mg', dosage: '1 cp matin & soir', compliance: 'good' },
  { id: 2, name: 'Ramipril 5mg', dosage: '1 cp le soir', compliance: 'good' },
]

const MOCK_RESULTS = [
  { id: 1, type: 'Glycémie', value: '1,2 g/L', date: '14 juin 2026', status: 'normal' },
  { id: 2, type: 'Tension', value: '120/80 mmHg', date: '14 juin 2026', status: 'normal' },
]

const TIMELINE_EVENTS = [
  {
    id: '1',
    type: 'urgency',
    date: '19 juin 2026',
    time: '14:30',
    title: 'Urgence Douleurs Abdominales',
    doctor: 'Dr. Benali',
    summary: 'Patient admis pour douleurs abdominales aiguës. Analyses sanguines effectuées. Prise en charge immédiate.',
    details: `
- Symptômes: Douleurs abdominales diffuses, nausées
- Examen physique: Tendresse au niveau de l'épigastre
- Analyses: Leucocytes 12G/L, CRP 45 mg/L
- Traitement: Antalgiques, repos
- Suivi: Rendez-vous dans 7 jours
    `,
    tags: ['Analyses', 'Douleur']
  },
  {
    id: '2',
    type: 'lab',
    date: '14 juin 2026',
    time: '09:00',
    title: 'Analyses Sanguines',
    doctor: 'Dr. Touggani',
    summary: 'Biologie standard, formule sanguine complète, glycémie à jeun.',
    details: `
- Hémoglobine: 14,2 g/dL
- Glycémie à jeun: 1,2 g/L
- Cholestérol total: 1,9 g/L
- Triglycérides: 1,1 g/L
- Conclusion: Bilan dans les normes, surveiller glycémie
    `,
    tags: ['Bilan']
  },
  {
    id: '3',
    type: 'consultation',
    date: '10 juin 2026',
    time: '10:30',
    title: 'Consultation Annuelle',
    doctor: 'Dr. Benali',
    summary: 'Bilan de santé annuel. Tension 120/80. Poids stable. À revoir dans 6 mois.',
    details: `
- Poids: 78 kg
- Taille: 1,75 m
- IMC: 25,5
- Tension artérielle: 120/80 mmHg
- Fréquence cardiaque: 72 bpm
- Recommandations: Continuer régime équilibré, activité physique régulière
    `,
    tags: ['Suivi', 'Bilan']
  },
  {
    id: '4',
    type: 'prescription',
    date: '10 juin 2026',
    time: '11:00',
    title: 'Prescription Médicamenteuse',
    doctor: 'Dr. Benali',
    summary: 'Metformine 500mg — 2x/jour. Oméprazole 20mg — 1x/jour le matin.',
    details: `
- Metformine 500mg: 1 comprimé matin et soir au repas
- Oméprazole 20mg: 1 comprimé le matin avant le petit-déjeuner
- Durée: 3 mois renouvelable
- Rendez-vous de contrôle: dans 3 mois
    `,
    tags: []
  }
]

const DOCUMENTS = [
  { id: 1, type: 'prescription', name: 'Ordonnance', date: '19 juin 2026', doctor: 'Dr. Benali' },
  { id: 2, type: 'lab', name: 'Bilan sanguin (NFS)', date: '14 juin 2026', doctor: 'Dr. Touggani' },
  { id: 3, type: 'imaging', name: 'Échographie abdominale', date: '20 mai 2026', doctor: 'Dr. Benali' },
]

// --- Helper Functions ---
function calcAge(dateStr) {
  if (!dateStr) return 34
  const birth = new Date(dateStr)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age > 0 ? age : 34
}

function formatTimer(seconds) {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [hours, mins, secs].map(v => String(v).padStart(2, '0')).join(':')
}

function getGenderLabel(sexe) {
  if (sexe === 'homme') return 'Homme'
  if (sexe === 'femme') return 'Femme'
  return 'Non renseigné'
}

function formatPatientSince(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

function calcBMI(weightKg, heightCm) {
  const w = parseFloat(weightKg)
  const h = parseFloat(heightCm)
  if (!w || !h) return null
  const bmi = w / ((h / 100) ** 2)
  return bmi.toFixed(1)
}

const CONSULTATION_TABS = ['Constantes & Motif', 'Examen', 'Bilan', 'Historique']

function PatientInfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-[14px] font-semibold text-slate-800">{value || '—'}</p>
      </div>
    </div>
  )
}

function PatientSidebar({ patient, age, chronicDisease, currentTreatment, emergencyContact }) {
  const initials = `${patient.prenom?.[0] || ''}${patient.nom?.[0] || ''}`.toUpperCase()
  const allergies = patient.allergies?.trim()
  const hasAllergies = allergies && allergies.toLowerCase() !== 'aucune'

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-6 py-6 text-white">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-lg font-bold text-blue-600 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-bold leading-tight tracking-tight">
              {patient.prenom} {patient.nom}
            </h2>
            <p className="mt-1 text-sm text-blue-100/90 font-medium">
              {age} ans • {getGenderLabel(patient.sexe)}
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 px-5">
        <PatientInfoRow icon={Droplets} label="Groupe sanguin" value={patient.groupe_sanguin || '—'} />
        <PatientInfoRow icon={Phone} label="Téléphone" value={patient.telephone || '—'} />
        <PatientInfoRow icon={Shield} label="Assurance" value={patient.mutuelle || patient.assurance || '—'} />
        <PatientInfoRow icon={Calendar} label="Patient depuis" value={formatPatientSince(patient.created_at)} />
      </div>

      <div className="px-5 py-4">
        <div className={`rounded-xl border p-4 ${hasAllergies ? 'border-red-200 bg-red-50' : 'border-red-100 bg-red-50/50'}`}>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={15} className={hasAllergies ? 'text-red-500' : 'text-red-400'} />
            <span className={`text-sm font-bold ${hasAllergies ? 'text-red-700' : 'text-red-600'}`}>Allergies</span>
          </div>
          <p className={`text-sm font-medium leading-relaxed ${hasAllergies ? 'text-red-800' : 'text-red-700/80'}`}>
            {hasAllergies ? allergies : 'Aucune connue'}
          </p>
        </div>
      </div>

      <div className="space-y-0 border-t border-slate-100 px-5 pb-5">
        <PatientInfoRow icon={HeartPulse} label="Maladies chroniques" value={chronicDisease} />
        <PatientInfoRow icon={Pill} label="Traitement actuel" value={currentTreatment} />
        <PatientInfoRow icon={ContactRound} label="Contact d'urgence" value={emergencyContact} />
      </div>
    </div>
  )
}

function VitalCard({ icon: Icon, label, unit, value, onChange, placeholder, readOnly = false, className = '' }) {
  // ⓘ STUB : Indicateur d'anomalie (toujours masqué).
  // Pour l'activer ultérieurement : remplacer `false` par la condition issue des règles fournies
  // (aucun seuil n'est actuellement documenté dans le codebase).
  const isAbnormal = false

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      <div className="mb-2 flex items-center gap-1.5 text-slate-400">
        <Icon size={14} />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`w-full bg-transparent text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-300 ${readOnly ? 'cursor-default' : ''}`}
        />
        {unit && <span className="shrink-0 text-xs font-medium text-slate-400">{unit}</span>}
      </div>
      <div className="mt-2 h-1 w-full">
        {isAbnormal && <span className="block h-1.5 w-1.5 rounded-full bg-red-500" />}
      </div>
    </div>
  )
}

function BloodPressureCard({ systolic, diastolic, onSystolicChange, onDiastolicChange }) {
  // ⓘ STUB : Indicateur d'anomalie (toujours masqué).
  // Règles attendues (non documentées dans codebase, stub jusqu'à fourniture) :
  // systo > 140 || diasto > 90 || systo < 90 || diasto < 60  →  point
  const isAbnormal = false

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-1.5 text-slate-400">
        <Heart size={14} />
        <span className="text-xs font-medium text-slate-500">Tension artérielle</span>
      </div>
      <div className="flex items-baseline gap-2">
        <input
          type="text"
          value={systolic}
          onChange={onSystolicChange}
          placeholder="120"
          className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-300"
        />
        <span className="text-xl font-light text-slate-300">/</span>
        <input
          type="text"
          value={diastolic}
          onChange={onDiastolicChange}
          placeholder="80"
          className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-300"
        />
        <span className="shrink-0 text-xs font-medium text-slate-400">mmHg</span>
      </div>
      <div className="mt-2 h-1 w-full">
        {isAbnormal && <span className="block h-1.5 w-1.5 rounded-full bg-red-500" />}
      </div>
    </div>
  )
}

// --- Timeline Event Component ---
function TimelineEvent({ event, index, onViewDetails }) {
  const getEventConfig = () => {
    switch (event.type) {
      case 'urgency': return { label: 'Urgence', icon: <AlertTriangle size={14} /> }
      case 'lab': return { label: 'Laboratoire', icon: <Microscope size={14} /> }
      case 'consultation': return { label: 'Consultation', icon: <Stethoscope size={14} /> }
      case 'imaging': return { label: 'Imagerie', icon: <ImageIcon size={14} /> }
      case 'prescription': return { label: 'Ordonnance', icon: <Pill size={14} /> }
      default: return { label: 'Autre', icon: <FileText size={14} /> }
    }
  }

  const config = getEventConfig()

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="relative w-full pl-12 pb-6 last:pb-0"
    >
      <motion.div
        className="absolute left-0 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-blue-600"
      >
        {config.icon}
      </motion.div>
      <motion.div
        whileHover={{ x: 1, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
        transition={{ duration: 0.1 }}
        className="w-full min-h-[176px] rounded-xl border border-slate-200 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.06)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-[12px] font-medium text-slate-400">
              {event.date} • {event.doctor}
            </p>
            <h3 className="mt-1 text-base font-semibold leading-snug text-slate-900">
              {event.title}
            </h3>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium leading-none text-blue-600">
            {config.label}
          </span>
        </div>
        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-slate-600">
          {event.summary}
        </p>
        <div className="flex items-center justify-between">
          <button
            onClick={() => onViewDetails(event)}
            className="flex items-center gap-1 text-[13px] font-semibold text-blue-600 hover:text-blue-700"
          >
            Voir détails →
          </button>
          {event.tags?.length > 0 && (
            <div className="flex gap-1.5">
              {event.tags.map(tag => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium leading-none text-slate-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.article>
  )
}

// --- Quick Action Component ---
function QuickAction({ icon, title, description, isPrimary, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 group text-left"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center group-hover:bg-blue-50 transition-all ${isPrimary ? 'bg-blue-50' : 'bg-slate-50'}`}>
        <div className={`transition-all ${isPrimary ? 'text-blue-600' : 'text-slate-500'} group-hover:text-blue-600`}>
          {icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-slate-800 leading-tight">{title}</p>
        <p className="text-[11.5px] text-slate-500 mt-0.5 leading-snug">{description}</p>
      </div>
      <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-all shrink-0" />
    </button>
  )
}

// --- Event Details Modal ---
function EventDetailsModal({ event, onClose }) {
  const getEventConfig = () => {
    switch (event.type) {
      case 'urgency': return { color: '#EF4444', label: 'Urgence', icon: <AlertTriangle size={18} /> }
      case 'lab': return { color: '#3B82F6', label: 'Laboratoire', icon: <Microscope size={18} /> }
      case 'consultation': return { color: '#10B981', label: 'Consultation', icon: <Stethoscope size={18} /> }
      case 'prescription': return { color: '#F59E0B', label: 'Ordonnance', icon: <Pill size={18} /> }
      default: return { color: '#6B7280', label: 'Autre', icon: <FileText size={18} /> }
    }
  }
  const config = getEventConfig()

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-2xl bg-white rounded-[21px] shadow-[0_12px_48px_rgba(0,0,0,0.12)] overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${config.color}10` }}
            >
              <div style={{ color: config.color }}>{config.icon}</div>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{event.title}</h2>
              <p className="text-xs text-slate-500">{event.date} à {event.time} • {event.doctor}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-4">
            {event.tags?.map(tag => (
              <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{tag}</span>
            ))}
            <span
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: `${config.color}10`, color: config.color }}
            >
              {config.label}
            </span>
          </div>
          <h3 className="text-xs font-semibold text-slate-900 mb-2">Détails</h3>
          <pre className="whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 p-3 rounded-xl font-sans leading-relaxed border border-[#e2e8f0]">
            {event.details}
          </pre>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-[#e2e8f0] bg-[#f8fafc]">
          <button onClick={onClose} className="px-3.5 py-2 text-xs text-slate-700 bg-white border border-[#e2e8f0] rounded-xl font-medium hover:bg-slate-50 hover:border-slate-400 transition-all">
            Fermer
          </button>
          <button onClick={() => { try { window.print() } catch(e){} }} className="px-3.5 py-2 text-xs text-white bg-[#2563eb] border border-[#2563eb] rounded-xl font-medium hover:bg-blue-700 hover:border-blue-700 transition-all shadow-[0_2px_8px_rgba(37,99,235,0.2)]">
            Imprimer
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// --- Simple Modal ---
function SimpleModal({ title, description, icon, color, onClose, onSave, children, saveText = "Enregistrer", saveButtonClass = "", footer = null }) {
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-xl bg-white rounded-[21px] shadow-[0_12px_48px_rgba(0,0,0,0.12)] overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${color}10` }}
            >
              <div style={{ color }}>{icon}</div>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              {description && <p className="text-xs text-slate-500">{description}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        <div className="flex items-center justify-between gap-2 p-5 border-t border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex-1">{footer}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3.5 py-2 text-xs text-slate-700 bg-white border border-[#e2e8f0] rounded-xl font-medium hover:bg-slate-50 hover:border-slate-400 transition-all">
              Annuler
            </button>
            <button onClick={onSave} className={`px-3.5 py-2 text-xs text-white rounded-xl font-medium transition-all ${saveButtonClass || 'bg-[#2563eb] border border-[#2563eb] hover:bg-blue-700 hover:border-blue-700 shadow-[0_2px_8px_rgba(37,99,235,0.2)]'}`}>
              {saveText}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// --- Success Modal ---
function SuccessModal({ message, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-sm bg-white rounded-[21px] shadow-[0_12px_48px_rgba(0,0,0,0.12)] overflow-hidden p-5 text-center"
      >
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">Succès !</h2>
        <p className="text-xs text-slate-600 mb-5">{message}</p>
        <button onClick={onClose} className="w-full px-4 py-2 text-xs text-white bg-[#2563eb] border border-[#2563eb] rounded-xl font-medium hover:bg-blue-700 hover:border-blue-700 transition-all shadow-[0_2px_8px_rgba(37,99,235,0.2)]">
          Continuer
        </button>
      </motion.div>
    </div>
  )
}

// --- Status Badge ---
function StatusBadge({ status }) {
  let bgClass = 'bg-slate-100'
  let textClass = 'text-slate-600'
  let label = 'Non commencé'
  if (status === 'in_progress') { bgClass = 'bg-blue-50'; textClass = 'text-blue-700'; label = 'En cours' }
  else if (status === 'completed') { bgClass = 'bg-emerald-50'; textClass = 'text-emerald-700'; label = 'Terminé' }
  const className = 'flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium ' + bgClass + ' ' + textClass
  return (
    <span className={className}>
      {status === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
      {label}
    </span>
  )
}

// --- Chip ---
function Chip({ children, color = 'blue' }) {
  let colorClass = 'bg-blue-50 text-blue-700 border-blue-200'
  if (color === 'emerald') colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'
  else if (color === 'amber') colorClass = 'bg-amber-50 text-amber-700 border-amber-200'
  else if (color === 'red') colorClass = 'bg-red-50 text-red-700 border-red-200'
  const className = 'px-2 py-0.5 rounded-full text-[10px] font-medium border ' + colorClass
  return <span className={className}>{children}</span>
}

// --- Alert Item ---
function AlertItem({ label, severity }) {
  let colorClass = 'bg-red-50 border-red-200 text-red-700'
  let iconColor = 'text-red-600'
  if (severity === 'warning') { colorClass = 'bg-amber-50 border-amber-200 text-amber-700'; iconColor = 'text-amber-600' }
  const className = 'flex items-center gap-2 p-2 rounded-lg border ' + colorClass
  return (
    <div className={className}>
      <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
      <span className="text-[11px] font-medium">{label}</span>
    </div>
  )
}

// --- Document Card ---
function DocumentCard({ doc }) {
  const iconMap = { prescription: FileCheck2, lab: TestTube2, imaging: ImageIcon }
  const iconStyleMap = {
    prescription: 'bg-blue-50 border-blue-100 text-blue-600',
    lab: 'bg-violet-50 border-violet-100 text-violet-600',
    imaging: 'bg-orange-50 border-orange-100 text-orange-600',
  }
  const Icon = iconMap[doc.type] || FileText
  const iconStyle = iconStyleMap[doc.type] || 'bg-slate-50 border-slate-200 text-slate-500'
  return (
    <div role="button" tabIndex={0} aria-label={`Ouvrir le document : ${doc.name}`} className="group h-[208px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer flex flex-col">
      <div className="flex items-start justify-between mb-5">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${iconStyle}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex gap-1.5">
          <button type="button" aria-label={`Télécharger ${doc.name}`} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <h4 className="text-[14px] font-semibold text-slate-900 mb-1 leading-tight line-clamp-2 min-h-[2.5rem]">{doc.name}</h4>
      <p className="text-[12px] text-slate-500 font-medium">{doc.date} • {doc.doctor}</p>
      <span className="mt-auto pt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 opacity-80 transition-opacity group-hover:opacity-100">
        Ouvrir <ChevronRight className="w-3.5 h-3.5" />
      </span>
    </div>
  )
}

// --- Quick Note Field (with Focus Mode) ---
function QuickNoteField({ 
  title, 
  placeholder, 
  value, 
  onChange, 
  icon: Icon, 
  autoFocus = false, 
  cardId, 
  activeCardId, 
  enterFocusMode, 
  exitFocusMode,
  patientConsultations = [],
  onSave,
  autoSaveDelay = 3000
}) {
  return (
    <FocusableCard
      cardId={cardId}
      activeCardId={activeCardId}
      enterFocusMode={enterFocusMode}
      exitFocusMode={exitFocusMode}
      title={title}
      icon={Icon}
    >
      <MedicalTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        patientConsultations={patientConsultations}
        onSave={onSave}
        autoSaveDelay={autoSaveDelay}
      />
    </FocusableCard>
  )
}

// --- Empty State Component ---
function EmptyState({ title, description, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500">{description}</p>
    </div>
  )
}

// --- Main Component ---
export default function PatientWorkspace() {
  const navigate = useNavigate()
  const { id: patientIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const startConsultation = searchParams.get('startConsultation') === 'true'
  const visitId = searchParams.get('visitId')
  const { profile, updateVisitStatus, notify } = useAppContext()
  
  const { activeCardId, isActive, enterFocusMode, exitFocusMode } = useFocusMode()

  // --- State ---
  const actionParam = searchParams.get('action')
  const [activeTab, setActiveTab] = useState(startConsultation ? 'Constantes & Motif' : 'Historique')
  const [consultationStatus, setConsultationStatus] = useState(startConsultation ? 'in_progress' : 'not_started')
  const [showPatientSidebar, setShowPatientSidebar] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showModal, setShowModal] = useState(searchParams.get('action') || null)
  const [showSuccess, setShowSuccess] = useState(null)
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved')

  // --- Form States ---
  const [prescriptionForm, setPrescriptionForm] = useState({ medications: '', notes: '' })
  const [labForm, setLabForm] = useState({ type: '', notes: '' })
  const [reportForm, setReportForm] = useState({ title: '', content: '' })
  const [documentForm, setDocumentForm] = useState({ name: '', type: '' })
  const [acteForm, setActeForm] = useState({ name: '', description: '', montant: '' })
  // --- Session actes (local, sprint actuel — persistance Supabase à faire séparément) ---
  // Structure: { id: string, name: string, description: string, montant: number }
  // ⚠️ Branchement futur : au handleConfirmEndConsultation, passer sessionActes au service
  //    d'encaissement (ex: comme billing_amount = sessionActesTotal ou lignes JSON)
  const [sessionActes, setSessionActes] = useState([])

  // --- Consultation Notes State ---
  const [consultationReason, setConsultationReason] = useState('')
  const [symptomsHistory, setSymptomsHistory] = useState('')
  const [vitals, setVitals] = useState({
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    heartRate: '',
    temperature: '',
    respiratoryRate: '',
    oxygenSaturation: '',
    weight: '',
    height: '',
  })
  const [subjectiveNote, setSubjectiveNote] = useState('')
  const [objectiveNote, setObjectiveNote] = useState('')
  const [clinicalExam, setClinicalExam] = useState('')
  const [assessmentNote, setAssessmentNote] = useState('')
  const [planNote, setPlanNote] = useState('')

  // --- Query Patient Data ---
  const { data: patient, isLoading: loadingPatient, isError: patientLoadFailed, error: patientLoadError, refetch: retryPatientLoad } = useQuery({
    queryKey: ['patient', patientIdParam],
    queryFn: async () => {
      try {
        const data = await getPatientById(patientIdParam)
        if (!data) return null
        // antecedents/allergies/groupe_sanguin are doctor/admin-only and
        // come from a separate RPC — getPatientById no longer carries them
        // (see mm_get_patient_clinical / migration 20260912070000).
        const clinical = await getPatientClinicalFields(patientIdParam)
        return clinical ? { ...data, ...clinical } : data
      } catch (err) {
        console.error('Supabase fetch failed:', err)
        throw err
      }
    },
    enabled: !!patientIdParam,
    retry: 1,
    staleTime: 1000 * 60 * 5 // 5 mins cache
  })

  // --- Timer Effect ---
  useEffect(() => {
    let interval
    if (consultationStatus === 'in_progress') {
      interval = setInterval(() => { setTimerSeconds(prev => prev + 1) }, 1000)
    }
    return () => clearInterval(interval)
  }, [consultationStatus])

  // --- Consultations du patient (pour suggestions historiques) ---
  const patientConsultations = useMemo(() => {
    return [].map(ev => ({
      id: ev.id,
      type: ev.type,
      date: ev.date,
      reason: ev.title,
      notes: ev.details || ev.summary,
      diagnosis: ev.title,
      plan: ev.tags?.join(', ') || '',
      symptoms: ev.summary,
      clinicalExam: ev.details,
      assessment: ev.details
    }))
  }, [])

  // --- Sauvegarde auto locale (peut être remplacée par un appel API) ---
  const handleAutoSaveField = useCallback(async (fieldKey, value) => {
    throw new Error('Local consultation storage is disabled in production.')

    try {
      const key = `mm_autosave_${patientIdParam || 'demo'}_${fieldKey}`
      localStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }))
    } catch (_err) {
      // ignore storage errors
    }
  }, [patientIdParam])

  // --- Handlers ---
  const handleStartConsultation = useCallback(() => {
    setConsultationStatus('in_progress')
    setActiveTab('Constantes & Motif')
  }, [])

  const handleEndConsultation = useCallback(() => {
    setShowEndConfirmModal(true)
  }, [])

  const handleConfirmEndConsultation = useCallback(() => {
    setShowEndConfirmModal(false)
    setConsultationStatus('completed')
    setTimerSeconds(0)
    if (visitId) {
      const totalActes = sessionActes.reduce((sum, a) => sum + a.montant, 0)
      updateVisitStatus(visitId, VISIT_STATUSES.BILLING, {
        amount: totalActes > 0 ? totalActes : 300, // Use actes total or default 300
        sessionActes: sessionActes // Pass actes data for secretary view
      })
      notify({ title: 'Consultation terminée', description: 'Le patient a été envoyé à la caisse', tone: 'success' })
    } else {
      // FIXME: consultation démarrée sans visitId (ex: depuis DossierPatient ?startConsultation=true).
      // updateVisitStatus est ignoré — les actes ne sont pas transmis à la caisse.
      // À corriger quand la création de visite à la volée sera implémentée.
      console.warn('[PatientWorkspace] handleConfirmEndConsultation: visitId absent — updateVisitStatus ignoré, actes non transmis à la caisse.')
      notify({ title: 'Consultation enregistrée', description: 'Notes sauvegardées (aucun acte transmis à la caisse — visitId absent)', tone: 'info' })
    }
    navigate('/dashboard')
  }, [visitId, updateVisitStatus, notify, navigate, sessionActes])

  const handleSavePrescription = useCallback(() => {
    setShowModal(null)
    setShowSuccess('Ordonnance créée avec succès !')
    setPrescriptionForm({ medications: '', notes: '' })
  }, [])

  const handleSaveLab = useCallback(() => {
    setShowModal(null)
    setShowSuccess('Demande d\'analyses envoyée !')
    setLabForm({ type: '', notes: '' })
  }, [])

  const handleSaveReport = useCallback(() => {
    setShowModal(null)
    setShowSuccess('Compte-rendu enregistré !')
    setReportForm({ title: '', content: '' })
  }, [])

  const handleSaveDocument = useCallback(() => {
    setShowModal(null)
    setShowSuccess('Document ajouté !')
    setDocumentForm({ name: '', type: '' })
  }, [])

  const handleSaveActe = useCallback(() => {
    const montantNum = parseFloat(acteForm.montant) || 0
    if (acteForm.name.trim()) {
      setSessionActes(prev => [
        ...prev,
        { id: `acte_${Date.now()}`, name: acteForm.name.trim(), description: acteForm.description.trim(), montant: montantNum }
      ])
    }
    setShowModal(null)
    setShowSuccess('Acte ajouté avec succès !')
    setActeForm({ name: '', description: '', montant: '' })
  }, [acteForm])

  const handleManualSave = useCallback(async () => {
    setSaveStatus('saving')
    try {
      await Promise.all([
        handleAutoSaveField('consultation_reason', consultationReason),
        handleAutoSaveField('symptoms_history', symptomsHistory),
        handleAutoSaveField('clinical_exam', clinicalExam),
        handleAutoSaveField('assessment', assessmentNote),
        handleAutoSaveField('plan', planNote),
        handleAutoSaveField('vitals', JSON.stringify(vitals)),
      ])
      setSaveStatus('saved')
      notify({ title: 'Enregistré', description: 'Les données de la consultation ont été sauvegardées.', tone: 'success' })
    } catch (_err) {
      setSaveStatus('error')
      notify({ title: 'Erreur', description: 'Impossible de sauvegarder.', tone: 'error' })
    }
  }, [consultationReason, symptomsHistory, clinicalExam, assessmentNote, planNote, vitals, handleAutoSaveField, notify])

  // --- Derived Values ---
  const age = patient ? calcAge(patient.date_naissance) : null
  const bmi = calcBMI(vitals.weight, vitals.height)
  const chronicDisease = patient?.antecedents || '—'
  const currentTreatment = '—'
  const emergencyContact = patient?.contact_urgence || '—'
  const isConsultationActive = consultationStatus === 'in_progress'

  // --- isDirty: true si au moins un champ de consultation contient des données non sauvegardées ---
  const isDirty = useMemo(() => {
    if (consultationStatus !== 'in_progress') return false
    return (
      consultationReason.trim() !== '' ||
      symptomsHistory.trim() !== '' ||
      clinicalExam.trim() !== '' ||
      assessmentNote.trim() !== '' ||
      planNote.trim() !== '' ||
      Object.values(vitals).some(v => v !== '')
    )
  }, [consultationStatus, consultationReason, symptomsHistory, clinicalExam, assessmentNote, planNote, vitals])

  // --- Blocage navigation interne (React Router useBlocker) ---
  // Bloque dès qu'une consultation est active, indépendamment de isDirty
  const blocker = useBlocker(consultationStatus === 'in_progress')

  // --- Blocage fermeture onglet / rafraîchissement ---
  useEffect(() => {
    const handler = (e) => {
      if (consultationStatus === 'in_progress') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [consultationStatus])

  // --- Loading State ---
  if (loadingPatient) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-500 font-medium text-sm">Chargement du dossier...</p>
        </div>
      </div>
    )
  }

  if (patientLoadFailed || !patient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <h1 className="text-lg font-bold text-red-900">Erreur de chargement du dossier</h1>
          <p className="mt-2 text-sm text-red-800">{patientLoadError?.message || 'Patient introuvable.'}</p>
          <button onClick={() => retryPatientLoad()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Réessayer</button>
          <button onClick={() => navigate('/dashboard')} className="mt-3 block w-full text-sm font-semibold text-red-800">Retour au tableau de bord</button>
        </div>
      </div>
    )
  }

  return (
    <section aria-label="Espace Patient" className="min-h-screen bg-[#f8fafc] flex flex-col pb-5">
      {/* Backdrop for Focus Mode */}
      <Backdrop isVisible={isActive} onClick={exitFocusMode} />
      {/* --- Breadcrumb Style Top Bar --- */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="sticky top-0 z-50 bg-[#f8fafc]/95 backdrop-blur-sm px-6 pt-4 pb-3 border-b border-slate-200"
      >
        <div className="w-full flex justify-between items-center relative gap-5">
          <div className="flex items-center min-w-0 flex-1">
            {/* Retour Patients */}
            <button
              onClick={() => navigate('/dashboard')}
              aria-label="Retour à la liste des patients"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 text-slate-500 group-hover:text-slate-700" />
              <span className="text-[13.5px] font-medium text-slate-500 group-hover:text-slate-700">Patients</span>
            </button>
          </div>

          {/* Center: Statut de consultation / Timer */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none z-10 hidden md:flex">
            {consultationStatus === 'in_progress' && (
              <motion.div
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex items-center gap-2.5 select-none bg-white/60 px-4 py-1.5 rounded-full border border-slate-200/60 shadow-sm pointer-events-auto"
              >
                {/* Indicateur actif */}
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                </span>

                <span className="font-bold text-[14px] text-slate-700 tracking-tight">
                  En consultation
                </span>

                <span className="font-mono text-[15px] font-extrabold tabular-nums tracking-tighter text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                  {formatTimer(timerSeconds)}
                </span>
              </motion.div>
            )}
          </div>

          {/* Bloc actions côté droit */}
          <div className="flex items-center gap-2.5 shrink-0">
            {consultationStatus === 'in_progress' ? (
              <>

                {/* Badge total actes — lecture seule, masqué si 0 */}
                {sessionActes.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="h-10 px-3.5 rounded-[0.625rem] flex items-center gap-2 select-none"
                    style={{
                      background: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                    }}
                    title={`${sessionActes.length} acte${sessionActes.length > 1 ? 's' : ''} : ${sessionActes.map(a => a.name).join(', ')}`}
                  >
                    <Calculator className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-semibold text-[13px] text-slate-700 tabular-nums">
                      {sessionActes.reduce((sum, a) => sum + a.montant, 0).toLocaleString('fr-FR')} MAD
                    </span>
                  </motion.div>
                )}

                {/* Bouton + Acte (Même style que "Voir dossier") */}
                <button
                  onClick={() => setShowModal('addActe')}
                  className="h-10 px-4 rounded-[0.625rem] font-bold text-[13px] bg-white text-[#334155] border-2 border-[#cbd5e1] hover:bg-[#f1f5f9] hover:border-[#94a3b8] transition-all flex items-center gap-1.5 shadow-sm hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Plus className="w-4 h-4 text-slate-600" />
                  Acte
                </button>

                {/* Bouton Dossier (Patient Infos) */}
                <button
                  onClick={() => setShowPatientSidebar(true)}
                  className="h-10 px-4 rounded-[0.625rem] font-bold text-[13px] bg-white text-[#334155] border-2 border-[#cbd5e1] hover:bg-[#f1f5f9] hover:border-[#94a3b8] transition-all flex items-center gap-1.5 shadow-sm hover:-translate-y-0.5 active:translate-y-0"
                >
                  <User className="w-4 h-4 text-slate-600" />
                  Dossier patient
                </button>

                {/* Bouton Terminer / Enregistrer (Même style que "Commencer") */}
                <button
                  onClick={handleEndConsultation}
                  className="h-10 px-5 rounded-[0.625rem] font-bold text-[13px] bg-[#2563eb] text-white border-2 border-[#60a5fa] hover:bg-[#1e40af] hover:border-[#1e3a8a] transition-all flex items-center gap-2 shadow-[0_3px_10px_rgba(37,99,235,0.25)] hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Save className="w-4 h-4 text-white" />
                  Enregistrer
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowPatientSidebar(true)}
                  className="h-10 px-4 rounded-[0.625rem] font-bold text-[13px] bg-white text-[#334155] border-2 border-[#cbd5e1] hover:bg-[#f1f5f9] hover:border-[#94a3b8] transition-all flex items-center gap-1.5 shadow-sm hover:-translate-y-0.5 active:translate-y-0"
                >
                  <User className="w-4 h-4 text-slate-600" />
                  Dossier patient
                </button>
                
                <button
                  onClick={handleStartConsultation}
                  className="h-10 px-5 rounded-[0.625rem] font-bold text-[13px] bg-[#2563eb] text-white border-2 border-[#60a5fa] hover:bg-[#1e40af] hover:border-[#1e3a8a] transition-all flex items-center gap-2 shadow-[0_3px_10px_rgba(37,99,235,0.25)] hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Save className="w-4 h-4 text-white" />
                  Enregistrer
                </button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      {/* --- Main Content Layout --- */}
      <main className="flex-1 w-full px-6 py-5 w-full">
        <div className="w-full">
          {/* --- Main Content --- */}
          <div className="space-y-5 w-full">
            {/* Tabs Navigation */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <nav role="tablist" className="bg-gray-100 rounded-full p-1 flex w-full shadow-inner">
                {['Constantes & Motif', 'Examen', 'Bilan', 'Historique', 'Documents'].map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-5 py-2 text-[13.5px] font-semibold rounded-full transition-all duration-200 ${
                      activeTab === tab
                        ? 'bg-white text-slate-900 shadow-[0_2px_6px_rgba(0,0,0,0.08)]'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </nav>
            </motion.div>

            {/* --- Tab Content --- */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {/* --- Constants & Motif Content --- */}
                {activeTab === 'Constantes & Motif' && (
                  <div className="space-y-5">
                    {/* Consultation Reason & Symptoms */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <QuickNoteField
                        cardId="consultation-reason"
                        activeCardId={activeCardId}
                        enterFocusMode={enterFocusMode}
                        exitFocusMode={exitFocusMode}
                        title="Motif de consultation"
                        placeholder="Motif de la visite — ex. céphalées persistantes depuis 5 jours, plus marquées le matin..."
                        icon={Stethoscope}
                        value={consultationReason}
                        onChange={(value) => setConsultationReason(value)}
                        autoFocus={consultationStatus === 'in_progress'}
                        patientConsultations={patientConsultations}
                        onSave={(v) => handleAutoSaveField('consultation_reason', v)}
                      />
                      <QuickNoteField
                        cardId="symptoms-history"
                        activeCardId={activeCardId}
                        enterFocusMode={enterFocusMode}
                        exitFocusMode={exitFocusMode}
                        title="Symptômes / Histoire"
                        placeholder="Histoire de la maladie, symptômes, contexte..."
                        icon={Activity}
                        value={symptomsHistory}
                        onChange={(value) => setSymptomsHistory(value)}
                        patientConsultations={patientConsultations}
                        onSave={(v) => handleAutoSaveField('symptoms_history', v)}
                      />
                    </div>
                    
                    {/* Vitals Section - Target Grid Style */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between mb-5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                            <Heart className="w-4.5 h-4.5 text-blue-600" />
                          </div>
                          <h3 className="text-[15.5px] font-bold text-slate-900">Constantes vitales</h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Info size={14} />
                          <span className="text-[12px] font-medium">Valeurs anormales signalées</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <BloodPressureCard
                          systolic={vitals.bloodPressureSystolic}
                          diastolic={vitals.bloodPressureDiastolic}
                          onSystolicChange={(e) => setVitals({...vitals, bloodPressureSystolic: e.target.value})}
                          onDiastolicChange={(e) => setVitals({...vitals, bloodPressureDiastolic: e.target.value})}
                        />
                        <VitalCard
                          icon={Wind}
                          label="Fréq. cardiaque"
                          unit="bpm"
                          value={vitals.heartRate}
                          onChange={(e) => setVitals({...vitals, heartRate: e.target.value})}
                          placeholder="72"
                        />
                        <VitalCard
                          icon={Thermometer}
                          label="Température"
                          unit="°C"
                          value={vitals.temperature}
                          onChange={(e) => setVitals({...vitals, temperature: e.target.value})}
                          placeholder="37"
                        />
                        <VitalCard
                          icon={Scale}
                          label="Poids"
                          unit="kg"
                          value={vitals.weight}
                          onChange={(e) => setVitals({...vitals, weight: e.target.value})}
                          placeholder="70"
                        />
                        <VitalCard
                          icon={Ruler}
                          label="Taille"
                          unit="cm"
                          value={vitals.height}
                          onChange={(e) => setVitals({...vitals, height: e.target.value})}
                          placeholder="170"
                        />
                        <VitalCard
                          icon={Droplets}
                          label="SpO₂"
                          unit="%"
                          value={vitals.oxygenSaturation}
                          onChange={(e) => setVitals({...vitals, oxygenSaturation: e.target.value})}
                          placeholder="98"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* --- Exam Content --- */}
                {activeTab === 'Examen' && (
                  <div className="space-y-5">
                    <QuickNoteField
                      cardId="clinical-exam"
                      activeCardId={activeCardId}
                      enterFocusMode={enterFocusMode}
                      exitFocusMode={exitFocusMode}
                      title="Examen clinique"
                      placeholder="Observations de l'examen physique..."
                      icon={Stethoscope}
                      value={clinicalExam}
                      onChange={(value) => setClinicalExam(value)}
                      patientConsultations={patientConsultations}
                      onSave={(v) => handleAutoSaveField('clinical_exam', v)}
                    />
                  </div>
                )}

                {/* --- Bilan Content --- */}
                {activeTab === 'Bilan' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <QuickNoteField
                        cardId="assessment"
                        activeCardId={activeCardId}
                        enterFocusMode={enterFocusMode}
                        exitFocusMode={exitFocusMode}
                        title="Évaluation / Conclusion"
                        placeholder="Votre diagnostic et évaluation..."
                        icon={Brain}
                        value={assessmentNote}
                        onChange={(value) => setAssessmentNote(value)}
                        patientConsultations={patientConsultations}
                        onSave={(v) => handleAutoSaveField('assessment', v)}
                      />
                      <QuickNoteField
                        cardId="plan"
                        activeCardId={activeCardId}
                        enterFocusMode={enterFocusMode}
                        exitFocusMode={exitFocusMode}
                        title="Plan de soins"
                        placeholder="Plan de traitement et suivi..."
                        icon={ListChecks}
                        value={planNote}
                        onChange={(value) => setPlanNote(value)}
                        patientConsultations={patientConsultations}
                        onSave={(v) => handleAutoSaveField('plan', v)}
                      />
                    </div>
                    {false && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                            <Pill className="w-4.5 h-4.5 text-blue-600" />
                          </div>
                          <h3 className="text-[15.5px] font-bold text-slate-900">Traitements en cours</h3>
                        </div>
                        <div className="space-y-2">
                          {MOCK_MEDICATIONS.map((med) => (
                            <div key={med.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div>
                                <p className="text-[13px] font-semibold text-slate-800">{med.name}</p>
                                <p className="text-[11.5px] text-slate-500 mt-0.5">{med.dosage}</p>
                              </div>
                              {med.compliance === 'good' ? (
                                <Chip color="emerald">Bon suivi</Chip>
                              ) : (
                                <Chip color="amber">À vérifier</Chip>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* --- History Content --- */}
                {activeTab === 'Historique' && (
                  <div className="space-y-5">
                    <div className="mb-4">
                        <h2 className="text-[16px] font-bold text-slate-900">
                          Parcours de soins
                        </h2>
                      </div>
                    {/* Timeline */}
                    {TIMELINE_EVENTS.length > 0 ? (
                      <div className="relative w-full pt-1 before:absolute before:left-4 before:top-5 before:bottom-5 before:w-px before:bg-slate-200">
                        {TIMELINE_EVENTS.map((event, index) => (
                          <TimelineEvent
                            key={event.id}
                            event={event}
                            index={index}
                            onViewDetails={setSelectedEvent}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={CalendarClock}
                        title="Aucun événement trouvé"
                        description="Ce patient n'a pas encore de parcours de soins"
                      />
                    )}
                  </div>
                )}

                {/* --- Documents Content --- */}
                {activeTab === 'Documents' && (
                  <div className="space-y-5">
                    {false ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {DOCUMENTS.map((doc) => (
                          <DocumentCard key={doc.id} doc={doc} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={FileText}
                        title="Aucun document disponible"
                        description="Ajoutez des documents pour ce patient"
                      />
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* --- Modals --- */}
      <AnimatePresence>
        {showEndConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEndConfirmModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-md bg-white rounded-[21px] shadow-[0_12px_48px_rgba(0,0,0,0.12)] overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-center w-14 h-14 bg-red-50 rounded-full mx-auto mb-4">
                  <AlertTriangle className="w-7 h-7 text-red-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 text-center mb-2">Terminer la consultation ?</h2>
                <p className="text-sm text-slate-600 text-center mb-6">
                  Le patient sera envoyé à la caisse pour paiement.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowEndConfirmModal(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-[#e2e8f0] rounded-[12px] hover:bg-slate-50 hover:border-slate-400 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleConfirmEndConsultation}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#2563eb] border border-[#2563eb] rounded-[12px] hover:bg-blue-700 hover:border-blue-700 transition-all shadow-[0_2px_8px_rgba(37,99,235,0.2)]"
                  >
                    Terminer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {selectedEvent && (
          <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        )}
        {showModal === 'prescription' && (
          <SimpleModal
            title="Nouvelle Ordonnance"
            description={`Pour ${patient.prenom} ${patient.nom}`}
            icon={<Pill size={18} />}
            color="#F59E0B"
            onClose={() => setShowModal(null)}
            onSave={handleSavePrescription}
          >
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Médicaments
                </label>
                <textarea
                  value={prescriptionForm.medications}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, medications: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                  rows={4}
                  placeholder="Ex: Metformine 500mg 2x/jour"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={prescriptionForm.notes}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, notes: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                  rows={2}
                  placeholder="Instructions supplémentaires..."
                />
              </div>
            </div>
          </SimpleModal>
        )}
        {showModal === 'lab' && (
          <SimpleModal
            title="Demande d'Analyses"
            description={`Pour ${patient.prenom} ${patient.nom}`}
            icon={<Microscope size={18} />}
            color="#3B82F6"
            onClose={() => setShowModal(null)}
            onSave={handleSaveLab}
          >
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Type d'analyses
                </label>
                <select
                  value={labForm.type}
                  onChange={(e) => setLabForm({ ...labForm, type: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                >
                  <option value="">Sélectionner...</option>
                  <option value="blood">Sanguin</option>
                  <option value="urine">Urinaire</option>
                  <option value="imaging">Imagerie</option>
                  <option value="other">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={labForm.notes}
                  onChange={(e) => setLabForm({ ...labForm, notes: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                  rows={4}
                  placeholder="Détails sur les analyses à effectuer..."
                />
              </div>
            </div>
          </SimpleModal>
        )}
        {showModal === 'report' && (
          <SimpleModal
            title="Nouveau Compte-Rendu"
            description={`Pour ${patient.prenom} ${patient.nom}`}
            icon={<FileText size={18} />}
            color="#10B981"
            onClose={() => setShowModal(null)}
            onSave={handleSaveReport}
          >
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Titre
                </label>
                <input
                  value={reportForm.title}
                  onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                  placeholder="Ex: Consultation du 19/06/2026"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Contenu
                </label>
                <textarea
                  value={reportForm.content}
                  onChange={(e) => setReportForm({ ...reportForm, content: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                  rows={6}
                  placeholder="Rédigez votre compte-rendu ici..."
                />
              </div>
            </div>
          </SimpleModal>
        )}
        {showModal === 'document' && (
          <SimpleModal
            title="Ajouter un Document"
            description={`Pour ${patient.prenom} ${patient.nom}`}
            icon={<FilePlus size={18} />}
            color="#6B7280"
            onClose={() => setShowModal(null)}
            onSave={handleSaveDocument}
          >
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nom du document
                </label>
                <input
                  value={documentForm.name}
                  onChange={(e) => setDocumentForm({ ...documentForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                  placeholder="Ex: Résultats d'analyses"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Type de document
                </label>
                <select
                  value={documentForm.type}
                  onChange={(e) => setDocumentForm({ ...documentForm, type: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                >
                  <option value="">Sélectionner...</option>
                  <option value="lab">Analyses</option>
                  <option value="report">Compte-rendu</option>
                  <option value="prescription">Ordonnance</option>
                  <option value="other">Autre</option>
                </select>
              </div>
              <div className="border-2 border-dashed border-[#e2e8f0] rounded-xl p-6 text-center bg-slate-50">
                <FileText className="w-9 h-9 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500">
                  Glissez-déposez un fichier ou cliquez pour parcourir
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  PDF, PNG, JPG (max 10MB)
                </p>
              </div>
            </div>
          </SimpleModal>
        )}
        {blocker.state === 'blocked' && (
          <SimpleModal
            title="Quitter la consultation ?"
            description="Des données non enregistrées sont présentes"
            icon={<AlertTriangle size={18} />}
            color="#3b82f6"
            onClose={() => blocker.reset()}
            onSave={async () => {
              await handleManualSave()
              blocker.proceed()
            }}
            saveText="Enregistrer et quitter"
            footer={
              <button
                onClick={() => blocker.proceed()}
                className="text-[13px] font-medium text-red-500 hover:text-red-700 hover:underline transition-all py-1"
              >
                Quitter sans enregistrer
              </button>
            }
          >
            <p className="text-sm text-slate-600 leading-relaxed">
              La session de consultation reste active en arrière-plan, mais les informations saisies dans ce formulaire <span className="font-medium text-slate-800">(motif, examen, constantes)</span> ne sont pas encore enregistrées.
              <br /><br />
              Enregistrez avant de quitter pour ne rien perdre.
            </p>
          </SimpleModal>
        )}
        {showModal === 'addActe' && (
          <SimpleModal
            title="Ajouter un Acte"
            description={`Pour ${patient.prenom} ${patient.nom}`}
            icon={<ClipboardList size={18} />}
            color="#8B5CF6"
            onClose={() => setShowModal(null)}
            onSave={handleSaveActe}
          >
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nom de l'acte
                </label>
                <input
                  value={acteForm.name}
                  onChange={(e) => setActeForm({ ...acteForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                  placeholder="Ex: Consultation, Injection..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={acteForm.description}
                  onChange={(e) => setActeForm({ ...acteForm, description: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs"
                  rows={2}
                  placeholder="Détails sur l'acte effectué..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Montant (MAD)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={acteForm.montant}
                    onChange={(e) => setActeForm({ ...acteForm, montant: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#e2e8f0] bg-slate-50 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs pr-14"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                    MAD
                  </span>
                </div>
              </div>
            </div>
          </SimpleModal>
        )}
        {showSuccess && (
          <SuccessModal message={showSuccess} onClose={() => setShowSuccess(null)} />
        )}
      </AnimatePresence>

      {/* Modal Dossier Patient */}
      {showPatientSidebar && (
        <SimpleModal
          title="Informations Patient"
          onClose={() => setShowPatientSidebar(false)}
          saveText="Fermer"
          onSave={() => setShowPatientSidebar(false)}
        >
          <div className="pt-2">
            <PatientSidebar
              patient={patient}
              age={age}
              chronicDisease={chronicDisease}
              currentTreatment={currentTreatment}
              emergencyContact={emergencyContact}
            />
          </div>
        </SimpleModal>
      )}
    </section>
  )
}
