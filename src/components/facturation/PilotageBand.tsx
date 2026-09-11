import React from 'react';
import { useFacturationStore } from './store';
import { getTotals, filterFactures, getDSO } from './selectors';
import { Card, Ring } from './ui';
import { dh, num, pct, fmtMonthShort } from './format';
import { factureNet, cabinet } from './data';
import { cn } from '../../lib/utils';

export function PilotageBand() {
  const { factures, filters } = useFacturationStore();
  const filteredFactures = filterFactures(factures, filters);
  const totals = getTotals(filteredFactures);
  const dsoInfo = getDSO(filteredFactures);

  // Compute Current Month Stats
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  
  let caMois = 0;
  let encaisseMois = 0;
  
  factures.forEach(f => {
    if (f.statut !== 'annulee' && f.statut !== 'brouillon') {
      if (new Date(f.dateEmission).getTime() >= firstDayOfMonth) {
        caMois += factureNet(f);
      }
    }
    f.paiements.forEach(p => {
      if (new Date(p.date).getTime() >= firstDayOfMonth) {
        encaisseMois += p.montant;
      }
    });
  });

  const obj = cabinet.objectifMensuel;
  const pctObjValue = Math.round((caMois / obj) * 100);
  const pctObjVisual = Math.min(100, pctObjValue);
  const currentMonthLabel = fmtMonthShort(now.toISOString());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-6">
      
      {/* Objectif Mois */}
      <Card className="flex items-center gap-4">
        <div className="relative flex items-center justify-center">
          <Ring progress={pctObjVisual} size={56} strokeWidth={5} colorClass="text-blue-600" />
          <span className="absolute text-xs font-bold text-slate-800">{pctObjValue}%</span>
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Objectif {currentMonthLabel}</p>
          <p className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{num(caMois)} / {num(obj)} DH</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <p className="text-xs text-slate-600">+{num(encaisseMois)} DH encaissé</p>
          </div>
        </div>
      </Card>

      {/* Taux de recouvrement */}
      <Card className="flex items-center gap-4">
        <div className="relative flex items-center justify-center">
          <Ring progress={Math.round(totals.tauxRecouvrement * 100)} size={56} strokeWidth={5} colorClass={totals.tauxRecouvrement >= (cabinet.benchmarkRecouvrement/100) ? 'text-emerald-500' : 'text-amber-500'} />
          <span className="absolute text-xs font-bold text-slate-800">{pct(totals.tauxRecouvrement)}</span>
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recouvrement</p>
          <p className="text-sm font-medium text-slate-900 mt-0.5">Période filtrée ({totals.count} factures)</p>
          <p className="text-xs text-slate-500 mt-1">Benchmark secteur : {cabinet.benchmarkRecouvrement} %</p>
        </div>
      </Card>

      {/* DSO */}
      <Card className="flex flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Délai moyen de paiement</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-3xl font-bold tracking-tight text-slate-900">{dsoInfo.dso}</span>
          <span className="text-sm font-medium text-slate-500">jours</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">{dsoInfo.label}</p>
      </Card>

      {/* En retard */}
      <Card className="flex flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">En retard</p>
        <p className="text-3xl font-bold tracking-tight text-red-600 mt-1">{dh(totals.enRetardAmount)}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-600">{totals.enRetardCount} {totals.enRetardCount > 1 ? 'factures impayées' : 'facture impayée'}</p>
          <div className="flex-1 max-w-[60px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-red-500 rounded-full" 
              style={{ width: `${Math.min(100, totals.caNet > 0 ? (totals.enRetardAmount / totals.caNet) * 100 : 0)}%` }}
            />
          </div>
        </div>
      </Card>

    </div>
  );
}
