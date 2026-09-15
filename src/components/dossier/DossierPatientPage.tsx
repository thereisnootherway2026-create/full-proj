import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { HeaderBand } from './HeaderBand';
import { ConclusionStrip } from './ConclusionStrip';
import { ParcoursTimeline } from './ParcoursTimeline';
import { InfoLine } from './InfoLine';
import { Skeleton, ErrorState } from '../facturation/ui';
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

  const {
    data: patient,
    isLoading: patientLoading,
    isError: patientError,
    error: patientErrorObj,
    refetch: refetchPatient,
  } = usePatient(patientId);
  const {
    data: events = [],
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErrorObj,
    refetch: refetchEvents,
  } = useDossierEvents(patientId);
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
  const isError = patientError || eventsError;

  return (
    // Same escape-hatch print technique as FactureDrawer.tsx: DashboardLayout
    // and its sidebar carry no print:hidden classes at all, so this page
    // becomes a full-viewport, opaque overlay at print time instead —
    // it paints over the surrounding chrome rather than depending on it
    // to hide itself.
    <div className="min-h-screen bg-slate-50 py-6 px-4 print:fixed print:inset-0 print:z-[9999] print:bg-white print:py-6 print:overflow-visible print:min-h-0 print:h-auto">
      <div className="max-w-5xl mx-auto space-y-5 print:space-y-3">
        {isLoading ? (
          <DossierSkeleton />
        ) : isError ? (
          <ErrorState
            error={(patientErrorObj || eventsErrorObj) as Error}
            onRetry={() => {
              if (patientError) refetchPatient();
              if (eventsError) refetchEvents();
            }}
          />
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
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 space-y-3">
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default DossierPatientPage;
