import React, { useState } from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { filterFactures, getDebiteurs } from './selectors';
import { Card, SectionTitle, Skeleton, ErrorState, StatutBadge } from './ui';
import { dh, fmtDate, num } from './format';
import { Facture, factureReste } from './data';
import { ChevronDown, ChevronUp, CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EncaisserModal } from './EncaisserModal';

export function DebiteursView() {
  const { filters, setFactureOuverteId } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  // Patient debt only: factureReste excludes the share an organism owes in tiers payant, which is
  // followed in the Tiers payant tab.
  const debiteurs = getDebiteurs(filterFactures(factures, filters));

  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);
  const [encaisserFacture, setEncaisserFacture] = useState<Facture | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState error={error as Error} onRetry={refetch} />;
  }

  const totalCreances = debiteurs.reduce((acc, d) => acc + d.resteDu, 0);
  const worstDelay = debiteurs.length > 0 ? Math.max(...debiteurs.map(d => d.retardMax)) : 0;
  const avgDelay = debiteurs.length > 0
    ? Math.round(debiteurs.reduce((acc, d) => acc + d.retardMax, 0) / debiteurs.length)
    : 0;

  return (
    <div className="space-y-6 pb-12">

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-50/50 border-red-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Créances patients</p>
          <p className="text-2xl font-bold tracking-tight text-red-700 mt-1">{dh(totalCreances)}</p>
          <p className="mt-1 text-xs text-red-600/80">Hors montants attendus des organismes (Tiers payant)</p>
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

      <Card className="p-0 overflow-hidden">
        <SectionTitle title="Liste des débiteurs" subtitle="Patients ayant un reste à payer" className="p-6 pb-4 border-b border-slate-100" />

        {debiteurs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-medium text-slate-900">Aucun débiteur</p>
            <p className="text-slate-500 mt-1">Aucun reste à payer ne correspond au filtre actuel.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {debiteurs.map(d => {
              const isExpanded = expandedPatient === d.patientId;

              return (
                <div key={d.patientId} className="bg-white">
                  <div
                    onClick={() => setExpandedPatient(prev => prev === d.patientId ? null : d.patientId)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 cursor-pointer hover:bg-slate-50 transition-colors gap-4"
                  >
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900 text-lg">{d.patientNom}</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        {d.nbFactures} facture{d.nbFactures > 1 ? 's' : ''} impayée{d.nbFactures > 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-400 uppercase">Retard max</p>
                        <p className={cn("text-sm font-bold mt-0.5", d.retardMax > 0 ? "text-red-600" : "text-slate-600")}>
                          {d.retardMax} jours
                        </p>
                      </div>
                      <div className="text-right w-32">
                        <p className="text-xs font-semibold text-slate-400 uppercase">Reste dû</p>
                        <p className="text-lg font-black text-red-600 mt-0.5">{dh(d.resteDu)}</p>
                      </div>
                      <div className="text-slate-400 pl-4 border-l border-slate-200">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-slate-50 border-t border-slate-100 p-4 sm:p-6">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-200">
                            <th className="pb-2 font-medium">Facture</th>
                            <th className="pb-2 font-medium">Échéance</th>
                            <th className="pb-2 font-medium">Statut</th>
                            <th className="pb-2 font-medium text-right">Reste</th>
                            <th className="pb-2 pl-4"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {d.factures.map(f => (
                            <tr
                              key={f.id}
                              onClick={() => setFactureOuverteId(f.id)}
                              className="hover:bg-white cursor-pointer transition-colors"
                            >
                              <td className="py-2.5 font-medium text-blue-600">{f.numero}</td>
                              <td className="py-2.5 text-slate-600">{fmtDate(f.dateEcheance)}</td>
                              <td className="py-2.5"><StatutBadge statut={f.statut} /></td>
                              <td className="py-2.5 font-bold text-slate-900 text-right">{dh(factureReste(f))}</td>
                              <td className="py-2.5 pl-4 text-right">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEncaisserFacture(f); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded font-medium transition-colors text-xs"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  Encaisser
                                </button>
                              </td>
                            </tr>
                          ))}
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
        isOpen={!!encaisserFacture}
        onClose={() => setEncaisserFacture(null)}
        facture={encaisserFacture}
      />
    </div>
  );
}
