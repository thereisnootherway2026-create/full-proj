import React, { useState } from 'react';
import { useFacturationStore } from './store';
import { filterFactures, getDebiteurs } from './selectors';
import { Card, SectionTitle } from './ui';
import { dh, fmtDate, num } from './format';
import { factureReste } from './data';
import { Bell, ChevronDown, ChevronUp, CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EncaisserModal } from './EncaisserModal';

export function DebiteursView() {
  const { factures, filters, markRelance, setFactureOuverteId } = useFacturationStore();
  const filteredFactures = filterFactures(factures, filters);
  const debiteurs = getDebiteurs(filteredFactures);

  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);
  
  // Encaisser modal state
  const [encaisserFactureId, setEncaisserFactureId] = useState<string | null>(null);
  const [encaisserReste, setEncaisserReste] = useState(0);

  const toggleExpand = (patientRef: string) => {
    setExpandedPatient(prev => prev === patientRef ? null : patientRef);
  };

  const openEncaisser = (factureId: string, reste: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEncaisserFactureId(factureId);
    setEncaisserReste(reste);
  };

  const handleRelancer = (patientRef: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Relance all their delayed factures
    const pFactures = factures.filter(f => f.patientRef === patientRef && f.statut === 'en_retard');
    pFactures.forEach(f => markRelance(f.id));
  };

  // Compute summary stats
  const totalCreances = debiteurs.reduce((acc, d) => acc + d.resteDu, 0);
  const worstDelay = debiteurs.length > 0 ? Math.max(...debiteurs.map(d => d.retardMax)) : 0;
  const avgDelay = debiteurs.length > 0 
    ? Math.round(debiteurs.reduce((acc, d) => acc + d.retardMax, 0) / debiteurs.length) 
    : 0;

  return (
    <div className="space-y-6 pb-12">
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-50/50 border-red-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Total créances</p>
          <p className="text-2xl font-bold tracking-tight text-red-700 mt-1">{dh(totalCreances)}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Débiteurs</p>
          <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{num(debiteurs.length)}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Retard maximum</p>
          <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{worstDelay} <span className="text-sm font-medium text-slate-500">jours</span></p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Retard moyen</p>
          <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{avgDelay} <span className="text-sm font-medium text-slate-500">jours</span></p>
        </Card>
      </div>

      {/* Main List */}
      <Card className="p-0 overflow-hidden">
        <SectionTitle title="Liste des débiteurs" subtitle="Patients ayant un reste à payer" className="p-6 pb-4 border-b border-slate-100" />
        
        {debiteurs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-medium text-slate-900">Aucun débiteur — toutes les factures sont soldées 🎉</p>
            <p className="text-slate-500 mt-1">Le filtre actuel ne correspond à aucun impayé.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {debiteurs.map(d => {
              const isExpanded = expandedPatient === d.patientRef;
              // Check if any delayed facture is relancée
              const hasRelance = d.factures.some(f => f.statut === 'en_retard' && f.relance);
              
              return (
                <div key={d.patientRef} className="bg-white">
                  {/* Debtor Row */}
                  <div 
                    onClick={() => toggleExpand(d.patientRef)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 cursor-pointer hover:bg-slate-50 transition-colors gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-slate-900 text-lg">{d.patientNom}</h3>
                        <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{d.patientRef}</span>
                        {hasRelance && (
                          <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded flex items-center gap-1">
                            <Bell className="w-3 h-3 fill-amber-700" /> Relancé
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {d.nbFactures} facture{d.nbFactures > 1 ? 's' : ''} impayée{d.nbFactures > 1 ? 's' : ''}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-400 uppercase">Retard max</p>
                        <p className={cn("text-sm font-bold mt-0.5", d.retardMax > 30 ? "text-red-600" : "text-amber-600")}>
                          {d.retardMax} jours
                        </p>
                      </div>
                      <div className="text-right w-32">
                        <p className="text-xs font-semibold text-slate-400 uppercase">Reste dû</p>
                        <p className="text-lg font-black text-red-600 mt-0.5">{dh(d.resteDu)}</p>
                      </div>
                      <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                        <button 
                          onClick={(e) => handleRelancer(d.patientRef, e)}
                          className={cn(
                            "p-2 rounded-full transition-colors",
                            hasRelance ? "text-amber-600 bg-amber-50" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                          )}
                          title="Marquer comme relancé"
                        >
                          <Bell className={cn("w-5 h-5", hasRelance && "fill-amber-600")} />
                        </button>
                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Factures */}
                  {isExpanded && (
                    <div className="bg-slate-50 border-t border-slate-100 p-4 sm:p-6">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-200">
                            <th className="pb-2 font-medium">Facture</th>
                            <th className="pb-2 font-medium">Échéance</th>
                            <th className="pb-2 font-medium">Retard</th>
                            <th className="pb-2 font-medium text-right">Reste</th>
                            <th className="pb-2 pl-4"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {d.factures.map(f => {
                            const reste = factureReste(f);
                            const isLate = f.statut === 'en_retard';
                            const retardJours = isLate ? Math.floor((new Date().getTime() - new Date(f.dateEcheance).getTime()) / 86400000) : 0;
                            
                            return (
                              <tr 
                                key={f.id} 
                                onClick={() => setFactureOuverteId(f.id)}
                                className="hover:bg-white cursor-pointer transition-colors group"
                              >
                                <td className="py-2.5 font-medium text-blue-600">{f.numero}</td>
                                <td className="py-2.5 text-slate-600">{fmtDate(f.dateEcheance)}</td>
                                <td className="py-2.5">
                                  {isLate ? (
                                    <span className="text-red-600 font-medium">{retardJours} j</span>
                                  ) : (
                                    <span className="text-emerald-600">À venir</span>
                                  )}
                                </td>
                                <td className="py-2.5 font-bold text-slate-900 text-right">{dh(reste)}</td>
                                <td className="py-2.5 pl-4 text-right">
                                  <button 
                                    onClick={(e) => openEncaisser(f.id, reste, e)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded font-medium transition-colors text-xs opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    Encaisser
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <EncaisserModal 
        isOpen={!!encaisserFactureId}
        onClose={() => setEncaisserFactureId(null)}
        factureId={encaisserFactureId!}
        reste={encaisserReste}
      />
    </div>
  );
}
