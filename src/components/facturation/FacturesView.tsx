import React, { useState, useEffect } from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { filterFactures } from './selectors';
import { factureNet, facturePaye, factureReste } from './data';
import { dh, fmtDate } from './format';
import { StatutBadge, Card, Skeleton, ErrorState } from './ui';
import { Eye, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, FileText, CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';

const formatPatientName = (name?: string) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

const initialsOf = (label?: string) =>
  String(label || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

type SortKey = 'date' | 'total' | 'paye' | 'reste';

export function FacturesView() {
  const { filters, setFactureOuverteId } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  const filteredFactures = filterFactures(factures, filters);

  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedFactures = [...filteredFactures].sort((a, b) => {
    let valA = 0;
    let valB = 0;

    if (sortKey === 'date') {
      valA = new Date(a.dateEmission).getTime();
      valB = new Date(b.dateEmission).getTime();
    } else if (sortKey === 'total') {
      valA = factureNet(a);
      valB = factureNet(b);
    } else if (sortKey === 'paye') {
      valA = facturePaye(a);
      valB = facturePaye(b);
    } else if (sortKey === 'reste') {
      valA = factureReste(a);
      valB = factureReste(b);
    }

    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  if (isError) {
    return <ErrorState error={error as Error} onRetry={refetch} />;
  }

  const totalPages = Math.max(1, Math.ceil(sortedFactures.length / itemsPerPage));
  const currentFactures = sortedFactures.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortKey !== colKey) return <ChevronDown className="w-3 h-3 text-transparent group-hover:text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />;
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="py-3 px-4">Numéro</th>
              <th className="py-3 px-4 cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('date')}>
                <div className="flex items-center gap-1">Date <SortIcon colKey="date" /></div>
              </th>
              <th className="py-3 px-4">Patient</th>
              <th className="py-3 px-4 text-right cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('total')}>
                <div className="flex items-center justify-end gap-1">Facturé <SortIcon colKey="total" /></div>
              </th>
              <th className="py-3 px-4 text-right cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('paye')}>
                <div className="flex items-center justify-end gap-1">Payé <SortIcon colKey="paye" /></div>
              </th>
              <th className="py-3 px-4 text-right cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('reste')}>
                <div className="flex items-center justify-end gap-1">Reste <SortIcon colKey="reste" /></div>
              </th>
              <th className="py-3 px-4 text-center">Statut</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-100">
            {currentFactures.map(f => {
              const reste = factureReste(f);
              const net = factureNet(f);
              const paye = facturePaye(f);
              const isSoldee = reste <= 0;

              return (
                <tr
                  key={f.id}
                  onClick={() => setFactureOuverteId(f.id)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                >
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-xs font-semibold bg-slate-100 text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors border border-slate-200/80 group-hover:border-blue-200">
                      <FileText className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
                      {f.numero}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-xs">
                    {fmtDate(f.dateEmission)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center border border-slate-200 shrink-0">
                        {initialsOf(f.patientNom)}
                      </div>
                      <span className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                        {formatPatientName(f.patientNom)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900 text-right whitespace-nowrap">
                    {dh(net)}
                  </td>
                  <td className="py-3 px-4 text-emerald-600 font-semibold text-right whitespace-nowrap">
                    {dh(paye)}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {isSoldee ? (
                      <span className="text-slate-400 font-medium text-xs">0 DH</span>
                    ) : (
                      <span className="inline-block font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-200/70">
                        {dh(reste)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <StatutBadge statut={f.statut} />
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                      {!isSoldee && (
                        <button
                          onClick={() => setFactureOuverteId(f.id, 'pay')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-600 hover:text-white border border-emerald-200 hover:border-transparent transition-all shadow-xs"
                          title="Encaisser un paiement"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Encaisser</span>
                        </button>
                      )}
                      <button
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Consulter la facture"
                        onClick={() => setFactureOuverteId(f.id, 'detail')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {currentFactures.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {factures.length === 0
                    ? 'Aucune facturation enregistrée pour le moment. Les consultations terminées apparaîtront ici.'
                    : 'Aucune facture ne correspond aux filtres.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <p className="text-sm text-slate-500">
            Affichage de <span className="font-medium text-slate-700">{(page - 1) * itemsPerPage + 1}</span> à <span className="font-medium text-slate-700">{Math.min(page * itemsPerPage, sortedFactures.length)}</span> sur <span className="font-medium text-slate-700">{sortedFactures.length}</span>
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
  );
}
