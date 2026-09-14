import React, { useState, useMemo } from 'react';
import {
  Calendar,
  FileText,
  Plus,
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
import { useQuery } from '@tanstack/react-query';
import { usePatientDossier } from '../../hooks/usePatientDossier';
import { useAppContext } from '../../context/AppContext';
import { getOrdonnances } from '../../lib/api';

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

/* ─── Helpers ─── */
function calcAge(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const birth = new Date(dateStr);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDateFr(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const PROBLEM_STATUS_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  'Actif': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  'À surveiller': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  'Stable': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  'Résolu': { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-500' },
};

const OBSERVANCE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  'Excellente': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  'Bonne': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  'Variable': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  'Mauvaise': { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
};

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
      className="bg-white rounded-[21px] p-6 w-[360px] shadow-[0_12px_48px_rgba(0,0,0,0.12)]"
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
  const { cabinetId } = useAppContext();
  const {
    patient,
    clinical,
    problems,
    medications,
    labResults,
    vitals,
    timeline,
    isLoading,
  } = usePatientDossier(patientId);
  const timelineLoading = isLoading;
  const [activeTab, setActiveTab] = useState<'Parcours' | 'Informations' | 'Ordonnances'>('Parcours');
  const [activeFilter, setActiveFilter] = useState('Tous');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTerminer, setShowTerminer] = useState(false);

  const { data: ordonnances, isLoading: ordonnancesLoading } = useQuery({
    queryKey: ['ordonnances', cabinetId, patientId],
    queryFn: () => getOrdonnances(cabinetId!, patientId),
    enabled: !!cabinetId && !!patientId,
  });

  const parsedOrdonnances = useMemo(() => {
    return (ordonnances || []).map((doc: any) => {
      let parsedData: any = {};
      try {
        if (doc.consultations?.notes) parsedData = JSON.parse(doc.consultations.notes);
      } catch (e) {
        // Malformed/non-JSON notes — fall back to the raw document only.
      }
      return { ...doc, parsedData };
    });
  }, [ordonnances]);

  const patientName = `${patient?.prenom || ''} ${patient?.nom || ''}`.trim() || 'Patient';
  const age = calcAge(patient?.date_naissance);
  const initials = `${(patient?.prenom?.[0] || '')}${(patient?.nom?.[0] || '')}`.toUpperCase() || '--';

  const activeConditions = (problems || []).filter(
    (p: any) => p.status === 'Actif' || p.status === 'À surveiller'
  );
  const activeProblems = (problems || []).filter((p: any) => p.status !== 'Résolu');
  const activeMedications = (medications || []).filter((m: any) => m.status === 'Actif');

  const latestVitals = vitals && vitals.length > 0 ? vitals[0] : null;
  const heightM = latestVitals?.height ? latestVitals.height / 100 : null;
  const imc = latestVitals?.weight && heightM ? latestVitals.weight / (heightM * heightM) : null;
  const vitalsDisplay = [
    { label: 'T.A.', value: latestVitals?.blood_pressure, unit: 'mmHg', icon: HeartPulse },
    { label: 'SpO₂', value: latestVitals?.spo2, unit: '%', icon: Activity },
    { label: 'FC', value: latestVitals?.heart_rate, unit: 'bpm', icon: Zap },
    { label: 'Temp.', value: latestVitals?.temperature, unit: '°C', icon: Thermometer },
    { label: 'Poids', value: latestVitals?.weight, unit: 'kg', icon: Weight },
    { label: 'IMC', value: imc ? imc.toFixed(1) : null, unit: 'kg/m²', icon: Ruler },
  ].filter((v) => v.value !== undefined && v.value !== null && v.value !== '');

  const attentionItems = useMemo(() => {
    const items: string[] = [];
    (labResults || []).forEach((l: any) => {
      if (l.status !== 'normal') items.push(`Résultat à vérifier : ${l.exam_name} (${l.status})`);
    });
    (problems || []).forEach((p: any) => {
      if (p.status === 'À surveiller') items.push(`À surveiller : ${p.name}`);
    });
    if (!latestVitals) {
      items.push('Constantes non mises à jour récemment');
    } else {
      const daysSince = (Date.now() - new Date(latestVitals.date_mesure).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 180) items.push('Constantes non mises à jour récemment');
    }
    return items;
  }, [labResults, problems, latestVitals]);

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
                {patientName}
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
            className="bg-white border border-slate-200 rounded-[21px] p-4 mb-7 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
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
                  {patientName}
                </p>
                <p className="text-[13px] text-[#64748B]">
                  {age !== null ? `${age} ans` : '—'}
                  {patient?.sexe ? ` • ${patient.sexe}` : ''}
                  {clinical?.groupe_sanguin ? ` • Gr. ${clinical.groupe_sanguin}` : ''}
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px h-10 bg-[#E2E8F0]" />

            {/* Vitals */}
            <div className="flex items-center gap-5 flex-wrap">
              {vitalsDisplay.length === 0 ? (
                <p className="text-[13px] text-[#94A3B8]">Aucune constante enregistrée</p>
              ) : (
                vitalsDisplay.map((v, i) => {
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
                })
              )}
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

          {/* Allergy + chronic condition badges — only shown once loaded and only if there's something real to report */}
          {!isLoading && ((clinical?.allergies && clinical.allergies.trim()) || activeConditions.length > 0) && (
            <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-[#E2E8F0]">
              {clinical?.allergies && clinical.allergies.trim() && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-rose-50 border border-rose-200 text-rose-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Allergie : {clinical.allergies}
                </span>
              )}
              {activeConditions.map((p: any) => {
                const style = PROBLEM_STATUS_STYLES[p.status] || PROBLEM_STATUS_STYLES['Stable'];
                return (
                  <span
                    key={p.id}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${style.bg} ${style.border} ${style.text}`}
                  >
                    {p.name}
                  </span>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* ── Left sidebar ── */}
          <div className="lg:col-span-4 space-y-5">
            {/* Summary stats */}
            <motion.div
              className="bg-white border border-slate-200 rounded-[21px] p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
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

            {/* Points d'attention — real, computed from fetched data only. No panel at all when there's nothing to flag. */}
            {!isLoading && attentionItems.length > 0 && (
              <motion.div
                className="bg-white border border-slate-200 rounded-[21px] p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
                initial="hidden" animate="visible" custom={2} variants={fadeUp}
              >
                <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-4">POINTS D'ATTENTION</p>
                <div className="space-y-2.5">
                  {attentionItems.map((text, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-[12px] bg-amber-50 border border-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[13px] text-amber-800">{text}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Problèmes actifs */}
            <motion.div
              className="bg-white border border-slate-200 rounded-[21px] p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
              initial="hidden" animate="visible" custom={3} variants={fadeUp}
            >
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-4">PROBLÈMES ACTIFS</p>
              {activeProblems.length === 0 ? (
                <p className="text-[13px] text-[#64748B]">Aucun problème actif enregistré.</p>
              ) : (
                <div className="space-y-2.5">
                  {activeProblems.map((p: any) => {
                    const style = PROBLEM_STATUS_STYLES[p.status] || PROBLEM_STATUS_STYLES['Stable'];
                    const since = formatDateFr(p.diagnosed_date);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-[12px] bg-[#F8FAFC] border border-slate-100">
                        <div>
                          <p className="text-[13px] font-semibold text-[#0F172A]">{p.name}</p>
                          {since && <p className="text-[12px] text-[#64748B]">depuis {since}</p>}
                        </div>
                        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${style.bg} ${style.border} ${style.text}`}>
                          {p.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* Traitements en cours */}
            <motion.div
              className="bg-white border border-slate-200 rounded-[21px] p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
              initial="hidden" animate="visible" custom={4} variants={fadeUp}
            >
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-4">TRAITEMENTS EN COURS</p>
              {activeMedications.length === 0 ? (
                <p className="text-[13px] text-[#64748B]">Aucun traitement en cours.</p>
              ) : (
                <div className="space-y-2.5">
                  {activeMedications.map((m: any) => {
                    const style = OBSERVANCE_STYLES[m.observance] || OBSERVANCE_STYLES['Bonne'];
                    return (
                      <div key={m.id} className="p-3 rounded-[12px] bg-[#F8FAFC] border border-slate-100">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-[13px] font-semibold text-[#0F172A]">{m.medication_name}</p>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.border} ${style.text}`}>
                            {m.observance}
                          </span>
                        </div>
                        <p className="text-[12px] text-[#64748B]">{[m.dosage, m.posology].filter(Boolean).join(' — ')}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* Actions rapides */}
            <motion.div
              className="bg-white border border-slate-200 rounded-[21px] p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
              initial="hidden" animate="visible" custom={5} variants={fadeUp}
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
              className="bg-white border border-slate-200 rounded-[21px] p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
              initial="hidden" animate="visible" custom={6} variants={fadeUp}
            >
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-4">CONTACT</p>
              <div className="space-y-3">
                {patient?.telephone && (
                  <div className="flex items-center gap-3 text-[13px] text-[#64748B]">
                    <Phone className="w-4 h-4 text-[#94A3B8]" />
                    <span>{patient.telephone}</span>
                  </div>
                )}
                {patient?.email && (
                  <div className="flex items-center gap-3 text-[13px] text-[#64748B]">
                    <Mail className="w-4 h-4 text-[#94A3B8]" />
                    <span>{patient.email}</span>
                  </div>
                )}
                {patient?.ville && (
                  <div className="flex items-center gap-3 text-[13px] text-[#64748B]">
                    <MapPin className="w-4 h-4 text-[#94A3B8]" />
                    <span>{patient.ville}</span>
                  </div>
                )}
                {patient?.cin && (
                  <div className="flex items-center gap-3 text-[13px] text-[#64748B]">
                    <User className="w-4 h-4 text-[#94A3B8]" />
                    <span>CIN : {patient.cin}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* ── Right main area ── */}
          <div className="lg:col-span-8 space-y-5">
            {/* Tabs — 3 only, no redundancy */}
            <motion.div
              className="bg-white border border-slate-200 rounded-[14px] p-1 inline-flex shadow-[0_1px_2px_rgba(0,0,0,.04)]"
              initial="hidden" animate="visible" custom={7} variants={fadeUp}
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
                className={`bg-white border border-slate-200 border-l-4 ${cfg.border} rounded-[16px] p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_20px_rgba(15,23,42,.08)] hover:-translate-y-0.5 transition-all duration-200 ${
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
                  className="bg-white border border-slate-200 rounded-[21px] p-6 shadow-[0_6px_18px_rgba(15,23,42,0.04)] space-y-6"
                >
                  <h2 className="text-[18px] font-bold text-[#0F172A]">Informations du patient</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Prénom', value: patient?.prenom || '—' },
                      { label: 'Nom', value: patient?.nom || '—' },
                      { label: 'Date de naissance', value: formatDateFr(patient?.date_naissance) || '—' },
                      { label: 'Âge', value: age !== null ? `${age} ans` : '—' },
                      { label: 'Sexe', value: patient?.sexe || '—' },
                      { label: 'Groupe sanguin', value: clinical?.groupe_sanguin || '—' },
                      { label: 'Téléphone', value: patient?.telephone || '—' },
                      { label: 'Email', value: patient?.email || '—' },
                      { label: 'Ville', value: patient?.ville || '—' },
                      { label: 'CIN', value: patient?.cin || '—' },
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
                  </div>

                  {ordonnancesLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[16px] border border-[#E2E8F0] border-dashed">
                      <div className="w-8 h-8 border-4 border-slate-100 border-t-[#3B82F6] rounded-full animate-spin mb-4" />
                      <p className="text-[14px] font-medium text-[#64748B]">Chargement des ordonnances...</p>
                    </div>
                  ) : parsedOrdonnances.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 bg-slate-50 rounded-[16px] border border-[#E2E8F0] border-dashed text-center">
                      <div className="w-12 h-12 bg-white rounded-xl border border-slate-100 flex items-center justify-center shadow-sm mb-3">
                        <FileText className="w-6 h-6 text-slate-400" />
                      </div>
                      <h3 className="text-[14px] font-semibold text-[#0F172A]">Aucune ordonnance</h3>
                      <p className="text-[13px] text-[#64748B] mt-1 max-w-[250px]">
                        Ce patient n'a pas encore d'ordonnance enregistrée.
                      </p>
                    </div>
                  ) : (
                    parsedOrdonnances.map((doc: any) => {
                      const drugs = (doc.parsedData?.medicaments || []).filter((m: any) => m.nom?.trim());
                      return (
                        <div key={doc.id} className="bg-white border border-slate-200 rounded-[16px] p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-[14px] font-semibold text-[#0F172A]">{formatDateFr(doc.created_at) || doc.created_at}</p>
                              {doc.parsedData?.medecin && (
                                <p className="text-[12px] text-[#94A3B8]">Dr. {doc.parsedData.medecin}</p>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            {drugs.length > 0 ? (
                              drugs.map((med: any, j: number) => (
                                <div key={med.id || j} className="flex items-center gap-2 p-3 bg-[#F5F3FF] rounded-[12px]">
                                  <Pill className="w-4 h-4 text-[#8B5CF6] flex-shrink-0" />
                                  <span className="text-[13px] text-[#3B0764]">
                                    {[med.nom, med.posologie, med.duree].filter(Boolean).join(' — ')}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-[13px] text-[#64748B]">{doc.nom_fichier}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
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
