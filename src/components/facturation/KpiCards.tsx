import React from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { Skeleton, ErrorState } from './ui';
import { getTotals, filterFactures } from './selectors';
import { Card } from './ui';
import { dh, num, pct } from './format';
import { TrendingUp, Banknote, Clock, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';

export function KpiCards() {
  const { filters } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  const filteredFactures = filterFactures(factures, filters);
  const totals = getTotals(filteredFactures);

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/></div>;
  if (isError) return <ErrorState error={error as Error} onRetry={refetch} />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      
      {/* CA Net */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Chiffre d'affaires</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{dh(totals.caNet)}</p>
            <p className="text-sm text-slate-500 mt-1">
              Brut {num(totals.caBrut)} DH
            </p>
          </div>
        </div>
      </Card>

      {/* Encaissé */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Encaissé</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{dh(totals.totalEncaisse)}</p>
            <p className="text-sm text-slate-500 mt-1">
              {totals.facturesPayeesCount} {totals.facturesPayeesCount > 1 ? 'factures payées' : 'facture payée'}
            </p>
          </div>
        </div>
      </Card>

      {/* Reste à encaisser */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reste à encaisser</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{dh(totals.resteAEncaisser)}</p>
            <p className="text-sm text-slate-500 mt-1">
              {pct(totals.tauxRecouvrement)} encaissé
            </p>
          </div>
        </div>
      </Card>

      {/* Panier moyen */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-violet-50 text-violet-600">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Panier moyen</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{dh(totals.panierMoyen)}</p>
            <p className="text-sm text-slate-500 mt-1">
              {totals.count} {totals.count > 1 ? 'factures' : 'facture'}
            </p>
          </div>
        </div>
      </Card>

    </div>
  );
}
