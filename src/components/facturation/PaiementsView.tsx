import React, { useState, useEffect } from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { filterFactures, getPaiementsJournal } from './selectors';
import { Card, Skeleton, ErrorState } from './ui';
import { dh, fmtDateLong } from './format';
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

const MODE_COLORS: Record<string, string> = {
  'Especes': 'bg-emerald-100 text-emerald-700',
  'Carte': 'bg-blue-100 text-blue-700',
  'Cheque': 'bg-amber-100 text-amber-700',
  'Virement': 'bg-purple-100 text-purple-700',
  'Tiers payant': 'bg-slate-200 text-slate-700'
};

export function PaiementsView() {
  const { filters, setRecuPaiementId } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  const filteredFactures = filterFactures(factures, filters);
  const journal = getPaiementsJournal(filteredFactures);

  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setPage(1);
  }, [filters]);

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  if (isError) {
    return <ErrorState error={error as Error} onRetry={refetch} />;
  }

  const totalPages = Math.max(1, Math.ceil(journal.length / itemsPerPage));
  const currentItems = journal.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // Totals strip logic
  let totalEncaisse = 0;
  const modeBreakdown = new Map<string, number>();

  journal.forEach(item => {
    totalEncaisse += item.paiement.montant;
    const mode = item.paiement.mode;
    modeBreakdown.set(mode, (modeBreakdown.get(mode) || 0) + item.paiement.montant);
  });

  return (
    <div className="space-y-6">
      
      {/* Totals Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="col-span-2 md:col-span-1 lg:col-span-2 bg-slate-900 text-white border-transparent">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total encaissé</p>
          <p className="text-2xl font-bold tracking-tight mt-1">{dh(totalEncaisse)}</p>
          <p className="text-sm text-slate-400 mt-1">{journal.length} encaissements</p>
        </Card>
        
        {['Especes', 'Carte', 'Cheque', 'Virement', 'Tiers payant'].map(mode => {
          const val = modeBreakdown.get(mode) || 0;
          return (
            <Card key={mode} className="flex flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{mode === 'Especes' ? 'Espèces' : mode}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{dh(val)}</p>
            </Card>
          );
        })}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">N° Facture</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4 text-center">Mode</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {currentItems.map((item, idx) => (
                <tr 
                  key={`${item.paiement.id}-${idx}`}
                  onClick={() => setRecuPaiementId(item.paiement.id)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                    {fmtDateLong(item.paiement.date)}
                  </td>
                  <td className="py-3 px-4 font-medium text-blue-600 group-hover:text-blue-700 whitespace-nowrap">
                    {item.facture.numero}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{item.facture.patientNom}</div>
                    <div className="text-xs text-slate-500">{item.facture.patientRef}</div>
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-bold rounded', MODE_COLORS[item.paiement.mode] || MODE_COLORS['Tiers payant'])}>
                      {item.paiement.mode}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900 text-right whitespace-nowrap">
                    {dh(item.paiement.montant)}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button 
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Voir le reçu"
                      onClick={(e) => { e.stopPropagation(); setRecuPaiementId(item.paiement.id); }}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              
              {currentItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Aucun paiement ne correspond aux filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-sm text-slate-500">
              Affichage de <span className="font-medium text-slate-700">{(page - 1) * itemsPerPage + 1}</span> à <span className="font-medium text-slate-700">{Math.min(page * itemsPerPage, journal.length)}</span> sur <span className="font-medium text-slate-700">{journal.length}</span>
            </p>
            <div className="flex items-center gap-1">
              <button 
                disabled={page === 1} 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-slate-700 px-2">{page} / {totalPages}</span>
              <button 
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
