import { useMemo } from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { Skeleton, ErrorState } from './ui';
import { getTotals, filterFactures } from './selectors';
import { Card } from './ui';
import { dh, num, pct } from './format';
import { factureReste, inconsistentFactures } from './data';
import { ReconciliationWarning } from './ui';
import { TrendingUp, Banknote, Clock, AlertCircle, Landmark } from 'lucide-react';

export function KpiCards() {
  const { filters } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  const filteredFactures = filterFactures(factures, filters);
  const totals = getTotals(filteredFactures);
  const inconsistent = inconsistentFactures(filteredFactures);

  // Who owes / who paid, never mixed. Every figure is the server's reconciliation of the invoice
  // (Facture.fin); invoices that do not reconcile are left out and flagged above the cards.
  const split = useMemo(() => {
    const ok = filteredFactures.filter(f => !f.fin || f.fin.reconciled);
    const creancesPatients = ok.filter(f => factureReste(f) > 0);
    const creancesOrganismes = ok.filter(f => (f.fin?.organismDue || 0) > 0);
    return {
      encaissePatients: ok.reduce((a, f) => a + f.paye, 0),
      encaisseOrganismes: ok.reduce((a, f) => a + (f.fin?.organismReceived || 0), 0),
      creancesPatients: creancesPatients.reduce((a, f) => a + factureReste(f), 0),
      nbCreancesPatients: creancesPatients.length,
      creancesOrganismes: creancesOrganismes.reduce((a, f) => a + (f.fin?.organismDue || 0), 0),
      nbCreancesOrganismes: creancesOrganismes.length,
    };
  }, [filteredFactures]);
  const totalEncaisse = split.encaissePatients + split.encaisseOrganismes;

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4"><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/></div>;
  if (isError) return <ErrorState error={error as Error} onRetry={refetch} />;

  return (
    <div className="space-y-3">
    <ReconciliationWarning count={inconsistent.length} />
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      
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
              {num(totals.count)} {totals.count > 1 ? 'factures' : 'facture'}
            </p>
          </div>
        </div>
      </Card>

      {/* Encaissé: patients + organismes, shown separately */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600">
            <Banknote className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total encaissé</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{dh(totalEncaisse)}</p>
            <p className="text-[12.5px] text-slate-500 mt-1">Encaissements patients {dh(split.encaissePatients)}</p>
            <p className="text-[12.5px] text-slate-500">Règlements organismes {dh(split.encaisseOrganismes)}</p>
          </div>
        </div>
      </Card>

      {/* Créances patients: what patients still owe */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Créances patients</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{dh(split.creancesPatients)}</p>
            <p className="text-sm text-slate-500 mt-1">
              {num(split.nbCreancesPatients)} {split.nbCreancesPatients > 1 ? 'factures' : 'facture'} · {pct(totals.caNet > 0 ? totalEncaisse / totals.caNet : 0)} encaissé
            </p>
          </div>
        </div>
      </Card>

      {/* Créances organismes: tiers-payant amounts still expected */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Créances organismes</p>
            <p className="text-2xl font-bold tracking-tight text-blue-700 mt-1">{dh(split.creancesOrganismes)}</p>
            <p className="text-sm text-slate-500 mt-1">
              {num(split.nbCreancesOrganismes)} {split.nbCreancesOrganismes > 1 ? 'factures' : 'facture'} en tiers payant
            </p>
          </div>
        </div>
      </Card>

      {/* En retard: unpaid balances older than the payment term */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-red-50 text-red-600">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Patients en retard</p>
            <p className="text-2xl font-bold tracking-tight text-red-600 mt-1">{dh(totals.enRetardAmount)}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                {totals.enRetardCount} {totals.enRetardCount > 1 ? 'factures impayées' : 'facture impayée'}
              </p>
              <div className="h-1.5 w-14 max-w-[60px] flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${Math.min(100, totals.caNet > 0 ? (totals.enRetardAmount / totals.caNet) * 100 : 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

    </div>
    </div>
  );
}
