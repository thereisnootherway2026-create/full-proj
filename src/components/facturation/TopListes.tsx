import React from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { Skeleton, ErrorState } from './ui';
import { filterFactures, getBreakdowns } from './selectors';
import { Card, SectionTitle, StatutBadge } from './ui';
import { dh, fmtDate, num } from './format';
import { factureNet } from './data';
import { cn } from '../../lib/utils';

export function TopListes() {
  const { filters, setFactureOuverteId } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  const filteredFactures = filterFactures(factures, filters);
  
  const { topActes } = getBreakdowns(filteredFactures);

  if (isLoading) return <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Skeleton className="h-64 lg:col-span-2"/><Skeleton className="h-64"/></div>;
  if (isError) return <ErrorState error={error as Error} onRetry={refetch} />;
  
  // Dernières factures: sort by dateEmission desc and take 5
  const dernieres = [...filteredFactures]
    .sort((a, b) => new Date(b.dateEmission).getTime() - new Date(a.dateEmission).getTime())
    .slice(0, 5);

  const maxActeAmount = topActes.length > 0 ? topActes[0].amount : 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      
      {/* Top Actes Facturés */}
      <Card>
        <SectionTitle title="Top actes facturés" subtitle="Les prestations générant le plus de CA" />
        <div className="mt-4 space-y-4">
          {topActes.map((acte, index) => (
            <div key={acte.code} className="flex items-center gap-4">
              <div className="w-6 text-center text-sm font-bold text-slate-400">
                #{index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-sm font-medium text-slate-900 truncate pr-4">{acte.libelle}</p>
                  <p className="text-sm font-bold text-slate-900 shrink-0">{dh(acte.amount)}</p>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (acte.amount / maxActeAmount) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">{num(acte.count)} actes réalisés</p>
              </div>
            </div>
          ))}
          {topActes.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">Aucune donnée sur cette période.</p>
          )}
        </div>
      </Card>

      {/* Dernières Factures */}
      <Card>
        <SectionTitle title="Dernières factures" subtitle="Historique récent des émissions" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="pb-2 font-medium">N° Facture</th>
                <th className="pb-2 font-medium">Patient</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium text-right">Montant</th>
                <th className="pb-2 font-medium pl-4">Statut</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {dernieres.map((f) => (
                <tr 
                  key={f.id} 
                  onClick={() => setFactureOuverteId(f.id)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 font-medium text-blue-600 group-hover:text-blue-700">
                    {f.numero}
                  </td>
                  <td className="py-2.5 text-slate-900 truncate max-w-[120px]">
                    {f.patientNom}
                  </td>
                  <td className="py-2.5 text-slate-500 whitespace-nowrap">
                    {fmtDate(f.dateEmission)}
                  </td>
                  <td className="py-2.5 font-bold text-slate-900 text-right whitespace-nowrap">
                    {dh(factureNet(f))}
                  </td>
                  <td className="py-2.5 pl-4 whitespace-nowrap">
                    <StatutBadge statut={f.statut} />
                  </td>
                </tr>
              ))}
              {dernieres.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500 text-sm">
                    Aucune facture trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}
