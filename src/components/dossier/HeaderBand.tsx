import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DossierRdvStatus } from './queries';

interface ProblemeActif {
  id: string;
  name: string;
}

interface HeaderBandProps {
  patient: any;
  age: number | null;
  problemesActifs: ProblemeActif[];
  rdvStatus: DossierRdvStatus | undefined;
  onOrdonnance: () => void;
  onNouvelActe: () => void;
  onTerminer: () => void;
  onPrint: () => void;
}

const STATUS_META: Record<string, { label: string; dot: string; className: string }> = {
  en_consultation: {
    label: 'En consultation',
    dot: 'bg-emerald-500',
    className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  rdv: {
    label: "RDV aujourd'hui",
    dot: 'bg-blue-500',
    className: 'text-blue-700 bg-blue-50 border-blue-200',
  },
};

export function HeaderBand({
  patient,
  age,
  problemesActifs,
  rdvStatus,
  onOrdonnance,
  onNouvelActe,
  onTerminer,
  onPrint,
}: HeaderBandProps) {
  const navigate = useNavigate();
  const name = `${patient?.prenom || ''} ${patient?.nom || ''}`.trim() || 'Patient';
  const initials = `${patient?.prenom?.[0] || ''}${patient?.nom?.[0] || ''}`.toUpperCase() || '--';
  // Real status only (useDossierRdvStatus) — no badge at all when there is
  // no matching rdv today, rather than a hardcoded "En consultation".
  const statusMeta = rdvStatus?.activeStatus ? STATUS_META[rdvStatus.activeStatus] : null;

  const metaParts: string[] = [];
  if (age !== null) metaParts.push(`${age} ans`);
  if (patient?.sexe) metaParts.push(patient.sexe);
  if (patient?.cin) metaParts.push(patient.cin);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors flex-shrink-0"
          aria-label="Retour"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-bold text-slate-900 truncate">{name}</p>
            {statusMeta && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                  statusMeta.className
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', statusMeta.dot)} />
                {statusMeta.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[12px] text-slate-500">
            {metaParts.length > 0 && <span>{metaParts.join(' · ')}</span>}
            {problemesActifs.map((p) => (
              <span
                key={p.id}
                className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-medium"
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onOrdonnance}
          className="h-9 px-3.5 rounded-lg bg-blue-50 text-blue-700 text-[13px] font-semibold hover:bg-blue-100 transition-colors flex items-center gap-1.5"
        >
          <FileText className="w-3.5 h-3.5" /> Ordonnance
        </button>
        <button
          onClick={onNouvelActe}
          className="h-9 px-3.5 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Nouvel acte
        </button>
        <button
          onClick={onTerminer}
          className="h-9 px-3.5 rounded-lg border border-slate-300 text-slate-700 text-[13px] font-semibold hover:bg-slate-50 transition-colors"
        >
          Terminer
        </button>
        <button
          onClick={onPrint}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 transition-colors"
          aria-label="Imprimer"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
