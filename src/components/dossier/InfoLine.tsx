import { useNavigate } from 'react-router-dom';
import { dh, fmtDateLong } from '../facturation/format';
import { DossierRdvStatus } from './queries';

interface InfoLineProps {
  assurance?: string | null;
  resteDu: number;
  rdvStatus?: DossierRdvStatus;
}

/**
 * Quiet, centered, one line. Every value here is real:
 * - assurance: patients.mutuelle
 * - resteDu: get_debiteurs() RPC (facturation module, read-only reuse)
 * - prochain RDV: useDossierRdvStatus (same query that drives the header badge)
 *
 * NOTE: the "Reste dû" link goes to plain /facturation, not a patient-filtered
 * URL — the facturation module has no such filter today (checked its store/
 * queries before wiring this). See PR notes for a separate, more material
 * finding: /facturation currently renders from Zustand seed data in this
 * environment (VITE_FACTURATION_DEMO unset), not the real tables this figure
 * comes from.
 */
export function InfoLine({ assurance, resteDu, rdvStatus }: InfoLineProps) {
  const navigate = useNavigate();
  const parts: { key: string; node: React.ReactNode }[] = [];

  if (assurance) {
    parts.push({ key: 'assurance', node: <span>{assurance}</span> });
  }

  if (resteDu > 0) {
    parts.push({
      key: 'reste',
      node: (
        <button onClick={() => navigate('/facturation')} className="text-red-600 font-semibold hover:underline">
          Reste dû : {dh(resteDu)}
        </button>
      ),
    });
  }

  if (rdvStatus?.prochainRdv) {
    parts.push({
      key: 'rdv',
      node: <span>Prochain RDV : {fmtDateLong(rdvStatus.prochainRdv.date)}</span>,
    });
  }

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-3 text-[12px] text-slate-500 py-2 flex-wrap print:hidden">
      {parts.map((p, i) => (
        <span key={p.key} className="flex items-center gap-3">
          {i > 0 && <span className="text-slate-300">·</span>}
          {p.node}
        </span>
      ))}
    </div>
  );
}
