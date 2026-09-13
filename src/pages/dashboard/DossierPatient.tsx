import React, { useState } from 'react';
import {
  Calendar,
  FileText,
  Plus,
  CheckCircle2,
  Printer,
  Download,
  ChevronRight,
  HeartPulse,
  Activity,
  Droplet,
  ChevronLeft,
  Search,
  AlertTriangle,
  Pill,
  Stethoscope,
  Image,
  Clock,
  Phone,
  Mail,
  MapPin,
  User,
  Thermometer,
  Weight,
  Ruler,
  X,
  Edit3,
  Send,
  FlaskConical,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'react-router-dom';
import { usePatientDossier } from '../../hooks/usePatientDossier';

/* ─── Animation variants ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.07, ease: 'easeOut' },
  }),
};

const nodePop = {
  hidden: { opacity: 0, scale: 0 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.45,
      delay: 0.2 + i * 0.08,
      ease: [0.34, 1.56, 0.64, 1],
    },
  }),
};

/* ─── Mock data ─── */
const patient = {
  prenom: 'Karim',
  nom: 'Mansouri',
  age: 42,
  sexe: 'Homme',
  ddn: '14/02/1982',
  ville: 'Alger, Algérie',
  tel: '+213 555 12 34 56',
  email: 'k.mansouri@email.com',
  groupe: 'A+',
  medecin: 'Dr. Touggani',
  statut: 'En consultation',
};

const vitals = [
  { label: 'T.A.', value: '128/82', unit: 'mmHg', icon: HeartPulse, ok: true },
  { label: 'SpO₂', value: '98', unit: '%', icon: Activity, ok: true },
  { label: 'FC', value: '74', unit: 'bpm', icon: Zap, ok: true },
  { label: 'Temp.', value: '37.2', unit: '°C', icon: Thermometer, ok: true },
  { label: 'Poids', value: '78', unit: 'kg', icon: Weight, ok: true },
  { label: 'IMC', value: '24.1', unit: 'kg/m²', icon: Ruler, ok: true },
];

const journeyData = [
  {
    id: 1,
    type: 'Consultation',
    title: 'Consultation en cours',
    date: "Aujourd'hui, 09h30",
    doctor: 'Dr. Touggani',
    summary: 'Consultation de suivi — douleurs abdominales post-urgence. Évaluation clinique et bilan.',
    linkText: 'Ouvrir la consultation',
    isActive: true,
  },
  {
    id: 2,
    type: 'Urgence',
    title: 'Urgence — Douleurs abdominales',
    date: '19 juin 2024',
    doctor: 'Dr. Benali',
    summary: 'Admission aux urgences pour douleurs abdominales aiguës. Analyses sanguines. Prise en charge immédiate.',
    linkText: 'Voir le compte rendu',
  },
  {
    id: 3,
    type: 'Laboratoire',
    title: 'Bilan biologique complet',
    date: '14 juin 2024',
    doctor: 'Dr. Touggani',
    summary: 'Formule sanguine complète, glycémie à jeun, bilan lipidique et hépatique.',
    linkText: 'Voir les résultats',
  },
  {
    id: 4,
    type: 'Prescription',
    title: 'Ordonnance médicale',
    date: '10 juin 2024',
    doctor: 'Dr. Touggani',
    summary: 'Paracétamol 1g 3×/j — 7 jours. Oméprazole 20mg 1×/j avant repas — 14 jours.',
    linkText: 'Voir l\'ordonnance',
  },
  {
    id: 5,
    type: 'Imagerie',
    title: 'Radiographie thoracique',
    date: '5 juin 2024',
    doctor: 'Dr. Benali',
    summary: 'Radiographie F+P sans particularité notable. Poumons clairs, silhouette cardiaque normale.',
    linkText: 'Voir les images',
  },
  {
    id: 6,
    type: 'Consultation',
    title: 'Consultation générale',
    date: '28 mai 2024',
    doctor: 'Dr. Touggani',
    summary: 'Examen clinique complet. Tension artérielle stable. Bonne forme générale.',
    linkText: 'Voir le compte rendu',
  },
  {
    id: 7,
    type: 'Laboratoire',
    title: 'Bilan annuel',
    date: '3 janv. 2024',
    doctor: 'Dr. Touggani',
    summary: 'Bilan de routine annuel. NFS, ionogramme, bilan rénal et hépatique dans les normes.',
    linkText: 'Voir les résultats',
  },
];

type EventType = 'Consultation' | 'Laboratoire' | 'Prescription' | 'Document' | 'Administratif';

const typeConfig: Record<EventType, {
  dot: string; border: string; tag: string; tagText: string;
  iconBg: string; iconColor: string; icon: React.ReactNode; label: string;
}> = {
  Consultation: {
    dot: 'bg-[#3B82F6]', border: 'border-l-[#3B82F6]',
    tag: 'bg-[#EFF6FF]', tagText: 'text-[#2563EB]',
    iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#3B82F6]',
    icon: <Stethoscope className="w-5 h-5" />, label: 'Consultations',
  },
  Urgence: {
    dot: 'bg-[#EF4444]', border: 'border-l-[#EF4444]',
    tag: 'bg-[#FEF2F2]', tagText: 'text-[#DC2626]',
    iconBg: 'bg-[#FEF2F2]', iconColor: 'text-[#EF4444]',
    icon: <AlertTriangle className="w-5 h-5" />, label: 'Urgences',
  },
  Laboratoire: {
    dot: 'bg-[#10B981]', border: 'border-l-[#10B981]',
    tag: 'bg-[#ECFDF5]', tagText: 'text-[#059669]',
    iconBg: 'bg-[#ECFDF5]', iconColor: 'text-[#10B981]',
    icon: <FlaskConical className="w-5 h-5" />, label: 'Laboratoire',
  },
  Prescription: {
    dot: 'bg-[#8B5CF6]', border: 'border-l-[#8B5CF6]',
    tag: 'bg-[#F5F3FF]', tagText: 'text-[#7C3AED]',
    iconBg: 'bg-[#F5F3FF]', iconColor: 'text-[#8B5CF6]',
    icon: <Pill className="w-5 h-5" />, label: 'Prescriptions',
  },
  Imagerie: {
    dot: 'bg-[#0EA5E9]', border: 'border-l-[#0EA5E9]',
    tag: 'bg-[#F0F9FF]', tagText: 'text-[#0284C7]',
    iconBg: 'bg-[#F0F9FF]', iconColor: 'text-[#0EA5E9]',
    icon: <Image className="w-5 h-5" />, label: 'Imagerie',
  },
};

const filters = ['Tous', 'Consultations', 'Laboratoire', 'Prescriptions'];

const filterMap: Record<string, string | null> = {
  Tous: null,
  Consultations: 'Consultation',
  Laboratoire: 'Laboratoire',
  Prescriptions: 'Prescription',
};

/* ─── Confirm modal ─── */
const TerminerModal = ({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) => (
  <motion.div
    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    onClick={onClose}
  >
    <motion.div
      className="bg-white rounded-[20px] p-6 w-[360px] shadow-2xl"
      initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-bold text-[#0F172A]">Terminer la consultation ?</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[14px] text-[#64748B] mb-6">
        Le dossier sera clos. Assurez-vous d'avoir enregistré toutes les informations.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 h-[44px] rounded-[16px] border border-[#E2E8F0] text-[14px] font-semibold text-[#64748B] hover:bg-slate-50 transition-all"
        >
          Annuler
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 h-[44px] rounded-[16px] bg-[#EF4444] text-white text-[14px] font-semibold hover:bg-[#DC2626] transition-all"
        >
          Confirmer
        </button>
      </div>
    </motion.div>
  </motion.div>
);

/* ─── Main component ─── */
const DossierPatient = () => {
  const { id: patientId } = useParams();
  const { timeline, isLoading: timelineLoading } = usePatientDossier(patientId);
  const [activeTab, setActiveTab] = useState<'Parcours' | 'Informations' | 'Ordonnances'>('Parcours');
  const [activeFilter, setActiveFilter] = useState('Tous');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTerminer, setShowTerminer] = useState(false);

  const initials = `${patient.prenom[0]}${patient.nom[0]}`;

  const filteredJourney = (timeline || []).filter((item) => {
    const typeMatch = filterMap[activeFilter] === null || item.type === filterMap[activeFilter];
    const searchMatch =
      searchQuery === '' ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.doctor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return typeMatch && searchMatch;
  });

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      {/* ── Header card ── */}
      <div className="sticky top-0 z-50 bg-[#F4F7FB] px-6 pt-5 pb-3">
        <div
          className="w-full border border-[#E2E8F0] bg-white px-5 h-[64px] flex items-center justify-between gap-4"
          style={{ borderRadius: '24px', boxShadow: '0 6px 18px rgba(15,23,42,0.04)' }}
        >
          {/* Left: back + identity */}
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-xl hover:bg-[#EEF3F8] transition-colors">
              <ChevronLeft className="w-5 h-5 text-[#64748B]" />
            </button>
            <div>
              <p className="text-[15px] font-semibold text-[#0F172A] leading-tight">
                {patient.prenom} {patient.nom}
              </p>
              <p className="text-[12px] text-[#94A3B8]">Dossier patient</p>
            </div>
            <span className="ml-1 px-3 py-1.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] text-[12px] font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              En consultation
            </span>
          </div>

          {/* Right: primary actions */}
          <div className="flex items-center gap-2">
            {/* Ordonnance — primary CTA */}
            <button className="h-[44px] px-5 rounded-[16px] bg-[#3B82F6] text-white text-[14px] font-semibold hover:bg-[#2563EB] transition-all duration-200 flex items-center gap-2 shadow-md shadow-[#3B82F6]/20">
              <FileText className="w-4 h-4" />
              Ordonnance
            </button>
            {/* Nouvel acte */}
            <button className="h-[44px] px-5 rounded-[16px] bg-[#10B981] text-white text-[14px] font-semibold hover:bg-[#059669] transition-all duration-200 flex items-center gap-2 shadow-md shadow-[#10B981]/20">
              <Plus className="w-4 h-4" />
              Nouvel acte
            </button>
            {/* Terminer — muted, requires confirm */}
            <button
              onClick={() => setShowTerminer(true)}
              className="h-[44px] px-5 rounded-[16px] border border-[#CBD5E1] bg-white text-[#475569] text-[14px] font-semibold hover:border-[#94A3B8] hover:text-[#0F172A] transition-all duration-200"
            >
              Terminer
            </button>
            {/* Print */}
            <button className="w-[44px] h-[44px] flex items-center justify-center rounded-[16px] border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#EEF3F8] transition-all">
              <Printer className="w-4 h-4" />
            </button>
            <button className="w-[44px] h-[44px] flex items-center justify-center rounded-[16px] border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#EEF3F8] transition-all">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="w-full px-6 py-7">
        {/* ── Vitals ribbon ── */}
          <motion.div
            className="bg-white border border-[#CBD5E1] rounded-[18px] p-4 mb-7 shadow-[0_1px_3px_rgba(0,0,0,.04)]"
            initial="hidden" animate="visible" custom={0} variants={fadeUp}
          >
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Patient mini-id */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-[#0F172A] to-[#334155] flex items-center justify-center text-white text-[16px] font-bold flex-shrink-0">
                {initials}
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#0F172A]">
                  {patient.prenom} {patient.nom}
                </p>
                <p className="text-[13px] text-[#64748B]">
                  {patient.age} ans • {patient.sexe} • Gr. {patient.groupe}
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px h-10 bg-[#E2E8F0]" />

            {/* Vitals */}
            <div className="flex items-center gap-5 flex-wrap">
              {vitals.map((v, i) => {
                const Icon = v.icon;
                return (
                  <div key={i} className="text-center">
                    <div className="flex items-center gap-1 text-[#94A3B8] mb-0.5">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-medium uppercase tracking-wide">{v.label}</span>
                    </div>
                    <p className="text-[15px] font-bold text-[#0F172A]">
                      {v.value} <span className="text-[11px] text-[#94A3B8] font-normal">{v.unit}</span>
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px h-10 bg-[#E2E8F0]" />

            {/* Next appointment */}
            <div className="flex items-center gap-2 text-[#059669]">
              <Calendar className="w-4 h-4" />
              <div>
                <p className="text-[11px] text-[#94A3B8] uppercase tracking-wide font-medium">Prochain RDV</p>
                <p className="text-[13px] font-semibold text-[#059669]">28 juin 2024</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* ── Left sidebar ── */}
          <div className="lg:col-span-4 space-y-5">
            {/* Summary stats */}
            <motion.div
              className="bg-white border border-[#CBD5E1] rounded-[18px] p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)]"
              initial="hidden" animate="visible" custom={1} variants={fadeUp}
            >
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-4">RÉSUMÉ</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-[#F8FAFC] rounded-[14px] text-center">
                  <p className="text-[22px] font-bold text-[#0F172A]">7</p>
                  <p className="text-[11px] text-[#94A3B8] font-medium">Visites</p>
                </div>
                <div className="p-3 bg-[#F8FAFC] rounded-[14px] text-center">
                  <p className="text-[22px] font-bold text-[#0F172A]">2</p>
                  <p className="text-[11px] text-[#94A3B8] font-medium">Traitements</p>
                </div>
                <div className="p-3 bg-[#F8FAFC] rounded-[14px] text-center">
                  <p className="text-[22px] font-bold text-[#0F172A]">3</p>
                  <p className="text-[11px] text-[#94A3B8] font-medium">Docs</p>
                </div>
              </div>
              <div className="p-3 bg-[#EFF6FF] rounded-[14px] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#3B82F6]" />
                <div>
                  <p className="text-[11px] text-[#3B82F6] font-semibold uppercase tracking-wide">Dernière visite</p>
                  <p className="text-[13px] font-semibold text-[#1E40AF]">19 juin 2024</p>
                </div>
              </div>
            </motion.div>

            {/* Alertes & Risques */}
            <motion.div
              className="bg-white border border-[#CBD5E1] rounded-[18px] p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)]"
              initial="hidden" animate="visible" custom={2} variants={fadeUp}
            >
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-4">ALERTES & RISQUES</p>
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 p-3 rounded-[12px] bg-[#ECFDF5] border border-[#A7F3D0]">
                  <CheckCircle2 className="w-4 h-4 text-[#059669] flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-[#059669]">Aucune allergie connue</p>
                    <p className="text-[12px] text-[#64748B]">Profil allergique vide</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-[12px] bg-[#F8FAFC] border border-[#E2E8F0]">
                  <Pill className="w-4 h-4 text-[#3B82F6] flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-[#0F172A]">2 traitements en cours</p>
                    <p className="text-[12px] text-[#64748B]">Paracétamol · Oméprazole</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A]">
                  <AlertTriangle className="w-4 h-4 text-[#D97706] flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-[#92400E]">Suivi post-urgence</p>
                    <p className="text-[12px] text-[#64748B]">Urgence il y a 6 jours</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Actions rapides */}
            <motion.div
              className="bg-white border border-[#CBD5E1] rounded-[18px] p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)]"
              initial="hidden" animate="visible" custom={3} variants={fadeUp}
            >
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-4">ACTIONS RAPIDES</p>
              <div className="space-y-2.5">
                {/* Ordonnance — #1 priority */}
                <button className="w-full flex items-center gap-3 p-3.5 rounded-[14px] bg-[#3B82F6] hover:bg-[#2563EB] transition-all duration-200 text-left shadow-sm shadow-[#3B82F6]/20">
                  <div className="w-9 h-9 rounded-[10px] bg-white/20 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-white">Rédiger ordonnance</p>
                    <p className="text-[12px] text-white/70">Créer une prescription</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/50" />
                </button>

                {/* Planifier RDV — #2 */}
                <button className="w-full flex items-center gap-3 p-3.5 rounded-[14px] bg-[#F8FAFC] border border-[#E2E8F0] hover:bg-white hover:border-[#CBD5E1] hover:-translate-y-0.5 transition-all duration-200 text-left">
                  <div className="w-9 h-9 rounded-[10px] bg-white border border-[#E2E8F0] flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-[#3B82F6]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#0F172A]">Planifier un RDV</p>
                    <p className="text-[12px] text-[#64748B]">Prochain rendez-vous</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                </button>

                {/* Envoyer message — #3 */}
                <button className="w-full flex items-center gap-3 p-3.5 rounded-[14px] bg-[#F8FAFC] border border-[#E2E8F0] hover:bg-white hover:border-[#CBD5E1] hover:-translate-y-0.5 transition-all duration-200 text-left">
                  <div className="w-9 h-9 rounded-[10px] bg-white border border-[#E2E8F0] flex items-center justify-center">
                    <Send className="w-4 h-4 text-[#8B5CF6]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#0F172A]">Envoyer un message</p>
                    <p className="text-[12px] text-[#64748B]">Via SMS ou email</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                </button>

                {/* Ajouter doc — dashed */}
                <button className="w-full flex items-center gap-3 p-3.5 rounded-[14px] border border-dashed border-[#CBD5E1] hover:border-[#0F172A] hover:bg-white hover:-translate-y-0.5 transition-all duration-200 text-left">
                  <div className="w-9 h-9 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center">
                    <Plus className="w-4 h-4 text-[#64748B]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#0F172A]">Ajouter un document</p>
                    <p className="text-[12px] text-[#64748B]">PDF, image, résultat…</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                </button>
              </div>
            </motion.div>

            {/* Contact info */}
            <motion.div
              className="bg-white border border-[#CBD5E1] rounded-[18px] p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)]"
              initial="hidden" animate="visible" custom={4} variants={fadeUp}
            >
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-4">CONTACT</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-[13px] text-[#64748B]">
                  <Phone className="w-4 h-4 text-[#94A3B8]" />
                  <span>{patient.tel}</span>
                </div>
                <div className="flex items-center gap-3 text-[13px] text-[#64748B]">
                  <Mail className="w-4 h-4 text-[#94A3B8]" />
                  <span>{patient.email}</span>
                </div>
                <div className="flex items-center gap-3 text-[13px] text-[#64748B]">
                  <MapPin className="w-4 h-4 text-[#94A3B8]" />
                  <span>{patient.ville}</span>
                </div>
                <div className="flex items-center gap-3 text-[13px] text-[#64748B]">
                  <User className="w-4 h-4 text-[#94A3B8]" />
                  <span>Suivi par {patient.medecin}</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── Right main area ── */}
          <div className="lg:col-span-8 space-y-5">
            {/* Tabs — 3 only, no redundancy */}
            <motion.div
              className="bg-white border border-[#CBD5E1] rounded-[14px] p-1 inline-flex shadow-[0_1px_2px_rgba(0,0,0,.04)]"
              initial="hidden" animate="visible" custom={5} variants={fadeUp}
            >
              {(['Parcours', 'Informations', 'Ordonnances'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-[11px] text-[13px] font-semibold transition-all duration-200 ${
                    activeTab === tab
                      ? 'bg-[#0F172A] text-white shadow-sm'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </motion.div>

            {/* ── TAB: Parcours de soins (timeline) ── */}
            <AnimatePresence mode="wait">
              {activeTab === 'Parcours' && (
                <motion.div
                  key="parcours"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  {/* Section header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-[18px] font-bold text-[#0F172A]">Parcours de soins</h2>
                      <p className="text-[13px] text-[#64748B]">{filteredJourney.length} événements • chronologique</p>
                    </div>
                    <button className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border border-[#E2E8F0] bg-white text-[13px] text-[#64748B] hover:bg-[#F8FAFC] transition-all">
                      <Edit3 className="w-3.5 h-3.5" />
                      Annoter
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher dans le dossier…"
                      className="w-full h-[44px] pl-10 pr-4 bg-white border border-[#E2E8F0] rounded-[12px] text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/10 transition-all duration-200"
                    />
                  </div>

                                    {/* Filters */}
                  <div className="flex bg-slate-100 p-1 rounded-xl w-max flex-wrap">
                    {filters.map((f) => (
                      <button
                        key={f}
                        onClick={() => setActiveFilter(f)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                          activeFilter === f
                            ? 'bg-white text-blue-700 shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {/* Timeline */}
                  <div className="relative pl-8">
                    {/* Vertical line */}
                    <div className="absolute left-[10px] top-0 bottom-0 w-0.5 bg-[#D8E2EE]" style={{ zIndex: 5 }} />

                    <div className="space-y-4">
                                            {timelineLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[16px] border border-[#E2E8F0] border-dashed">
                          <div className="w-8 h-8 border-4 border-slate-100 border-t-[#3B82F6] rounded-full animate-spin mb-4" />
                          <p className="text-[14px] font-medium text-[#64748B]">Chargement de l'historique...</p>
                        </div>
                      ) : filteredJourney.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 bg-slate-50 rounded-[16px] border border-[#E2E8F0] border-dashed text-center">
                          <div className="w-12 h-12 bg-white rounded-xl border border-slate-100 flex items-center justify-center shadow-sm mb-3">
                            <Activity className="w-6 h-6 text-slate-400" />
                          </div>
                          <h3 className="text-[14px] font-semibold text-[#0F172A]">Aucun historique médical</h3>
                          <p className="text-[13px] text-[#64748B] mt-1 max-w-[250px]">
                            {searchQuery ? "Aucun événement correspondant à votre recherche." : "Ce patient n'a pas encore de consultations ou d'examens."}
                          </p>
                        </div>
                      ) : (
                        filteredJourney.map((item, index) => {
                          const cfg = typeConfig[item.type as EventType];
                          return (
                            <motion.div
                              key={item.id}
                              className="relative pl-6"
                              initial="hidden"
                              animate="visible"
                              custom={index}
                              variants={nodePop}
                            >
                              {/* Dot */}
                              <div
                                className={`absolute left-0 top-6 w-5 h-5 rounded-full border-[3px] border-white ${cfg.dot} z-20 shadow-sm ${
                                  item.isActive ? 'ring-4 ring-[#3B82F6]/20' : ''
                                }`}
                                style={{ transform: 'translateX(-8px)' }}
                              />

                              {/* Card */}
              <div
                className={`bg-white border border-[#CBD5E1] border-l-4 ${cfg.border} rounded-[16px] p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:shadow-[0_6px_20px_rgba(15,23,42,.08)] hover:-translate-y-0.5 transition-all duration-200 ${
                  item.isActive ? 'ring-1 ring-[#3B82F6]/25 bg-[#FAFCFF]' : ''
                }`}
              >
                                <div className="flex gap-4">
                                  <div
                                    className={`w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0 ${cfg.iconBg} ${cfg.iconColor}`}
                                  >
                                    {cfg.icon}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div>
                                        <h3 className="text-[15px] font-semibold text-[#0F172A] leading-snug">
                                          {item.title}
                                        </h3>
                                        <p className="text-[12px] text-[#94A3B8] mt-0.5 flex items-center gap-1.5">
                                          <Clock className="w-3.5 h-3.5" />
                                          {item.date} · {item.doctor}
                                        </p>
                                      </div>
                                      <span
                                        className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.tag} ${cfg.tagText} flex items-center gap-1`}
                                      >
                                        {item.type}
                                        {item.isActive && (
                                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-pulse" />
                                        )}
                                      </span>
                                    </div>

                                    <p className="text-[13px] text-[#64748B] mb-3 leading-relaxed">
                                      {item.summary}
                                    </p>

                                    <button
                                      className={`text-[12px] font-semibold flex items-center gap-1 transition-colors ${
                                        item.isActive
                                          ? 'text-[#3B82F6] hover:text-[#2563EB]'
                                          : 'text-[#0F172A] hover:text-[#3B82F6]'
                                      }`}
                                    >
                                      {item.linkText}
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── TAB: Informations ── */}
              {activeTab === 'Informations' && (
                <motion.div
                  key="informations"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                  className="bg-white border border-[#CBD5E1] rounded-[18px] p-6 shadow-[0_1px_2px_rgba(0,0,0,.04)] space-y-6"
                >
                  <h2 className="text-[18px] font-bold text-[#0F172A]">Informations du patient</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Prénom', value: patient.prenom },
                      { label: 'Nom', value: patient.nom },
                      { label: 'Date de naissance', value: patient.ddn },
                      { label: 'Âge', value: `${patient.age} ans` },
                      { label: 'Sexe', value: patient.sexe },
                      { label: 'Groupe sanguin', value: patient.groupe },
                      { label: 'Téléphone', value: patient.tel },
                      { label: 'Email', value: patient.email },
                      { label: 'Ville', value: patient.ville },
                      { label: 'Médecin traitant', value: patient.medecin },
                    ].map((field) => (
                      <div key={field.label} className="p-4 bg-[#F8FAFC] rounded-[14px] border border-[#E2E8F0]">
                        <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-1">
                          {field.label}
                        </p>
                        <p className="text-[14px] font-semibold text-[#0F172A]">{field.value}</p>
                      </div>
                    ))}
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2.5 rounded-[12px] border border-[#E2E8F0] text-[13px] font-semibold text-[#64748B] hover:bg-[#F8FAFC] transition-all">
                    <Edit3 className="w-4 h-4" />
                    Modifier les informations
                  </button>
                </motion.div>
              )}

              {/* ── TAB: Ordonnances ── */}
              {activeTab === 'Ordonnances' && (
                <motion.div
                  key="ordonnances"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-[18px] font-bold text-[#0F172A]">Ordonnances</h2>
                    <button className="h-[40px] px-4 rounded-[12px] bg-[#3B82F6] text-white text-[13px] font-semibold hover:bg-[#2563EB] transition-all flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Nouvelle ordonnance
                    </button>
                  </div>

                  {[
                    {
                      date: '10 juin 2024',
                      doctor: 'Dr. Touggani',
                      drugs: ['Paracétamol 1g — 3×/j — 7 jours', 'Oméprazole 20mg — 1×/j avant repas — 14 jours'],
                    },
                    {
                      date: '28 mai 2024',
                      doctor: 'Dr. Touggani',
                      drugs: ['Ibuprofène 400mg — 2×/j — 5 jours', 'Smecta — 3 sachets/j — 3 jours'],
                    },
                  ].map((ord, i) => (
                    <div key={i} className="bg-white border border-[#CBD5E1] rounded-[16px] p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[14px] font-semibold text-[#0F172A]">{ord.date}</p>
                          <p className="text-[12px] text-[#94A3B8]">{ord.doctor}</p>
                        </div>
                        <div className="flex gap-2">
                          <button className="w-9 h-9 flex items-center justify-center rounded-[10px] border border-[#CBD5E1] hover:bg-[#F8FAFC] transition-all">
                            <Printer className="w-4 h-4 text-[#64748B]" />
                          </button>
                          <button className="w-9 h-9 flex items-center justify-center rounded-[10px] border border-[#CBD5E1] hover:bg-[#F8FAFC] transition-all">
                            <Download className="w-4 h-4 text-[#64748B]" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {ord.drugs.map((drug, j) => (
                          <div key={j} className="flex items-center gap-2 p-3 bg-[#F5F3FF] rounded-[12px]">
                            <Pill className="w-4 h-4 text-[#8B5CF6] flex-shrink-0" />
                            <span className="text-[13px] text-[#3B0764]">{drug}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Terminer confirmation modal ── */}
      <AnimatePresence>
        {showTerminer && (
          <TerminerModal
            onClose={() => setShowTerminer(false)}
            onConfirm={() => setShowTerminer(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default DossierPatient;
