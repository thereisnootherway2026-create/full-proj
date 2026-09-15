import { useState } from 'react';
import { DossierEvent } from './types';

function formatDateFr(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Reads the latest consultation event straight out of the SAME array the
 * timeline renders — never a separate query, so this can't disagree with
 * what "Parcours de soins" shows as the most recent consultation.
 */
export function ConclusionStrip({ latestConsultation }: { latestConsultation: DossierEvent | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!latestConsultation) return null;

  const conclusion = [latestConsultation.payload?.diagnosis, latestConsultation.payload?.treatment]
    .filter(Boolean)
    .join(' — ');
  if (!conclusion) return null;

  const isLong = conclusion.length > 220;
  const display = expanded || !isLong ? conclusion : `${conclusion.slice(0, 220)}…`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
        Dernière conclusion · {formatDateFr(latestConsultation.date)}
      </p>
      <p className="text-[13px] text-slate-700 leading-relaxed">{display}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
        >
          {expanded ? 'Voir moins' : 'Voir tout'}
        </button>
      )}
    </div>
  );
}
