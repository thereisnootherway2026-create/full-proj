import React from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { Skeleton, ErrorState } from './ui';
import { getTotals, filterFactures, getDSO } from './selectors';
import { Card, Ring } from './ui';
import { dh, num, pct, fmtMonthShort } from './format';
import { Reveal } from './chartTheme';
import { Wallet, CalendarDays, Timer } from 'lucide-react';

// The analytical cards of "Détail avancé": panier moyen, ce mois-ci, recouvrement, délai moyen de
// paiement. Data logic is unchanged from the former Aperçu cards.
export function DetailKpis() {
  const { filters } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  const filteredFactures = filterFactures(factures, filters);
  const totals = getTotals(filteredFactures);
  // Two collection rates, never blended: what patients paid of what they were billed, and what
  // the cabinet collected (patients + organisms) of everything it billed. Organism figures come
  // from the server's reconciliation (Facture.fin).
  const partPatientFacturee = filteredFactures.reduce((a, f) => a + f.montant - (f.fin?.organismShare ?? f.partOrganisme ?? 0), 0);
  const recuOrganismes = filteredFactures.reduce((a, f) => a + (f.fin?.organismReceived || 0), 0);
  const tauxPatients = partPatientFacturee > 0 ? totals.totalEncaisse / partPatientFacturee : 0;
  const tauxGlobal = totals.caNet > 0 ? (totals.totalEncaisse + recuOrganismes) / totals.caNet : 0;
  const dsoInfo = getDSO(filteredFactures);

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/></div>;
  if (isError) return <ErrorState error={error as Error} onRetry={refetch} />;

  // Current month, from all billed consultations (independent of the period filter).
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let caMois = 0;
  let encaisseMois = 0;
  factures.forEach(f => {
    if (new Date(f.dateEmission).getTime() >= firstDayOfMonth) caMois += f.montant;
    f.paiements.forEach(p => {
      if (new Date(p.date).getTime() >= firstDayOfMonth) encaisseMois += p.montant;
    });
  });
  const currentMonthLabel = fmtMonthShort(now.toISOString());

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

      {/* Panier moyen */}
      <Reveal>
        <Card className="h-full">
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
      </Reveal>

      {/* Ce mois-ci. No monthly target is configured anywhere yet, so none is shown. */}
      <Reveal delay={0.05}>
        <Card className="h-full">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ce mois-ci · {currentMonthLabel}</p>
              <p className="text-xl font-bold tracking-tight text-slate-900 mt-1">{dh(caMois)} facturés</p>
              <p className="text-sm text-slate-500 mt-0.5">{dh(encaisseMois)} encaissés auprès des patients</p>
              <p className="text-[11px] text-slate-400 mt-1">Objectif mensuel non configuré</p>
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Taux d'encaissement: patients and global, each with its numerator and denominator */}
      <Reveal delay={0.1}>
        <Card className="h-full space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <Ring progress={Math.round(tauxPatients * 100)} size={44} strokeWidth={4} colorClass="text-emerald-500" />
              <span className="absolute text-[10px] font-bold text-slate-700">{pct(tauxPatients)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Taux d'encaissement patients</p>
              <p className="text-xs text-slate-500">{dh(totals.totalEncaisse)} payés sur {dh(partPatientFacturee)} de part patient</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <Ring progress={Math.round(tauxGlobal * 100)} size={44} strokeWidth={4} colorClass="text-blue-500" />
              <span className="absolute text-[10px] font-bold text-slate-700">{pct(tauxGlobal)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Taux d'encaissement global</p>
              <p className="text-xs text-slate-500">{dh(totals.totalEncaisse + recuOrganismes)} (patients + organismes) sur {dh(totals.caNet)} facturés · {num(totals.count)} facture{totals.count > 1 ? 's' : ''}</p>
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Délai moyen de paiement */}
      <Reveal delay={0.15}>
        <Card className="h-full">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Délai moyen de paiement</p>
              {dsoInfo.dso === null ? (
                <>
                  <p className="text-2xl font-bold tracking-tight text-slate-300 mt-1">—</p>
                  <p className="text-sm text-slate-500 mt-1">Aucune facture soldée sur la période</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                    {dsoInfo.dso} <span className="text-sm font-medium text-slate-500">jour{dsoInfo.dso > 1 ? 's' : ''}</span>
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Sur {dsoInfo.count} facture{dsoInfo.count > 1 ? 's' : ''} soldée{dsoInfo.count > 1 ? 's' : ''}</p>
                </>
              )}
            </div>
          </div>
        </Card>
      </Reveal>

    </div>
  );
}
