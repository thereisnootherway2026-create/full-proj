import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { HeaderBand } from './HeaderBand';
import { ConclusionStrip } from './ConclusionStrip';
import { ParcoursTimeline } from './ParcoursTimeline';
import { InfoLine } from './InfoLine';
import {
  usePatient,
  useDossierEvents,
  useDossierRdvStatus,
  usePatientFacturation,
  useProblemesActifs,
} from './queries';

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

function TerminerModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-2xl p-6 w-[360px] shadow-[0_12px_48px_rgba(0,0,0,0.12)]"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold text-slate-900">Terminer la consultation ?</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[13px] text-slate-500 mb-6">
          Le dossier sera clos. Assurez-vous d'avoir enregistré toutes les informations.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-10 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-all"
          >
            Confirmer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function DossierPatientPage() {
  const { id: patientId } = useParams();
  const { profile, currentUser } = useAppContext();
  const [showTerminer, setShowTerminer] = useState(false);

  const { data: patient, isLoading: patientLoading } = usePatient(patientId);
  const { data: events = [], isLoading: eventsLoading } = useDossierEvents(patientId);
  const { data: rdvStatus } = useDossierRdvStatus(patientId);
  const { data: facturation } = usePatientFacturation(patientId);
  const { data: problemesActifs = [] } = useProblemesActifs(patientId);

  const age = calcAge(patient?.date_naissance);

  // Same array the timeline renders — the conclusion strip is never a
  // separate query, it just reads the first consultation-kind entry.
  const latestConsultation = useMemo(() => events.find((e) => e.kind === 'consultation'), [events]);

  // Every visible consultation on this page already belongs to the current
  // doctor (consultations RLS: doctor_id = auth.uid()) — see Phase 1 notes.
  // "acteur" is therefore always the logged-in user, resolved here instead
  // of via a fragile profiles join inside the view.
  const acteur = profile?.nom_complet || currentUser?.name || '';

  const isLoading = patientLoading || eventsLoading;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 print:bg-white print:py-0">
      <div className="max-w-5xl mx-auto space-y-5 print:space-y-3">
        {isLoading ? (
          <DossierSkeleton />
        ) : (
          <>
            <HeaderBand
              patient={patient}
              age={age}
              problemesActifs={problemesActifs}
              rdvStatus={rdvStatus}
              onOrdonnance={() => {}}
              onNouvelActe={() => {}}
              onTerminer={() => setShowTerminer(true)}
              onPrint={() => window.print()}
            />
            <ConclusionStrip latestConsultation={latestConsultation} />
            <ParcoursTimeline events={events} acteur={acteur} />
            <InfoLine assurance={patient?.mutuelle} resteDu={facturation?.resteDu || 0} rdvStatus={rdvStatus} />
          </>
        )}
      </div>

      <AnimatePresence>
        {showTerminer && (
          <TerminerModal onClose={() => setShowTerminer(false)} onConfirm={() => setShowTerminer(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function DossierSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-[76px] bg-white rounded-2xl border border-slate-200" />
      <div className="h-[70px] bg-white rounded-2xl border border-slate-200" />
      <div className="h-[420px] bg-white rounded-2xl border border-slate-200" />
    </div>
  );
}

export default DossierPatientPage;
