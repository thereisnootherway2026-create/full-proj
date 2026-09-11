import React, { useState, useEffect } from 'react';
import { useFacturationStore } from './store';
import { filterFactures } from './selectors';
import { factureNet, facturePaye, factureReste, Facture } from './data';
import { dh, fmtDate } from './format';
import { StatutBadge, Card } from './ui';
import { Eye, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

type SortKey = 'date' | 'total' | 'paye' | 'reste';

export function FacturesView() {
  const { factures, filters, setFactureOuverteId } = useFacturationStore();
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
              <th className="py-3 px-4">Actes</th>
              <th className="py-3 px-4 text-right cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('total')}>
                <div className="flex items-center justify-end gap-1">Total Net <SortIcon colKey="total" /></div>
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
              const resume = f.lignes.length > 0 
                ? f.lignes[0].libelle + (f.lignes.length > 1 ? ` +${f.lignes.length - 1}` : '') 
                : 'Aucun acte';

              return (
                <tr 
                  key={f.id} 
                  onClick={() => setFactureOuverteId(f.id)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="py-3 px-4 font-medium text-blue-600 group-hover:text-blue-700 whitespace-nowrap">
                    {f.numero}
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    {fmtDate(f.dateEmission)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{f.patientNom}</div>
                    <div className="text-xs text-slate-500">{f.patientRef}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 truncate max-w-[200px]" title={resume}>
                    {resume}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900 text-right whitespace-nowrap">
                    {dh(factureNet(f))}
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-right whitespace-nowrap">
                    {dh(facturePaye(f))}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900 text-right whitespace-nowrap">
                    {dh(factureReste(f))}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <StatutBadge statut={f.statut} />
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button 
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Voir les détails"
                      onClick={(e) => { e.stopPropagation(); setFactureOuverteId(f.id); }}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            
            {currentFactures.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Aucune facture ne correspond aux filtres.
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
