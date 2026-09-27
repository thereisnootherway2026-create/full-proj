import { useMemo, useState } from 'react';
import { Building2, Download, FileStack, Landmark, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Button from '../common/Button';
import Chip from '../common/Chip';
import { useFacturationStore } from './store';
import { periodeStartMs } from './selectors';
import { numeroFacture } from './data';
import { Card, ErrorState, SectionTitle, Skeleton } from './ui';
import { dh, fmtDate, num } from './format';
import { CreateClaimModal } from './CreateClaimModal';
import { OrganizationsModal } from './OrganizationsModal';
import {
  AWAITING_SETTLEMENT_STATUSES, CLAIM_STATUS, COVERAGE_TYPE_LABEL, OPEN_CLAIM_STATUSES, ORGANIZATION_TYPE_LABEL, RESOLUTION_LABEL,
  canReceiveSettlement, claimOutstanding, unresolvedRejected, useClaimsQuery, useOrganizationsQuery, useSettlementsQuery,
} from './tiersPayant';
import type { Claim, ClaimStatus } from './tiersPayant';
import { ClaimActionDialogs, ClaimBadge, ClaimDetailModal, ResolutionBadge } from './ClaimDialogs';
import type { ClaimAction } from './ClaimDialogs';
import { cn } from '../../lib/utils';

const plural = (n: number, word: string) => `${num(n)} ${word}${n > 1 ? 's' : ''}`;

// ------------------------------------------------------------------ export

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const money = (n: number) => n.toFixed(2).replace('.', ',');

function exportClaims(claims: Claim[]) {
  const headers = ['Organisme', 'Couverture', 'Date', 'Patient', 'N° adhérent', 'Facture', 'Total facture', 'Montant demandé', 'Part patient à la création', 'Reçu', 'Rejeté', 'Reste à recevoir', 'Statut', 'Référence', 'Motif du rejet', 'Traitement du rejet'];
  const rows = claims.map(c => [
    csvCell(c.organizationName), c.coverageType ? COVERAGE_TYPE_LABEL[c.coverageType] : '', c.createdAt.split('T')[0], csvCell(c.patientNom), csvCell(c.membershipNumber), numeroFacture(c.invoiceId),
    money(c.invoiceAmount), money(c.claimed), money(c.patientShare), money(c.received), money(c.rejected), money(claimOutstanding(c)),
    CLAIM_STATUS[c.status].label, csvCell(c.externalReference), csvCell(c.rejectionReason),
    c.rejections.map(r => `${money(r.amount)} ${r.resolution ? RESOLUTION_LABEL[r.resolution] : 'à traiter'}`).join(' / '),
  ].join(';'));
  const blob = new Blob(['﻿' + [headers.join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tiers_payant_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------ view

const TABS: Array<{ id: string; label: string; statuses: ClaimStatus[] | null }> = [
  { id: 'all', label: 'Tous', statuses: null },
  { id: 'ready', label: 'À déposer', statuses: ['READY'] },
  { id: 'submitted', label: 'Déposés', statuses: ['SUBMITTED'] },
  { id: 'processing', label: 'En cours', statuses: ['PROCESSING', 'PARTIALLY_SETTLED'] },
  { id: 'settled', label: 'Réglés', statuses: ['SETTLED'] },
  { id: 'rejected', label: 'Rejetés', statuses: ['REJECTED'] },
];
// "Rejetés" also lists a settled claim whose refused remainder still needs a decision.
const inTab = (tab: (typeof TABS)[number], c: Claim) =>
  tab.statuses ? tab.statuses.includes(c.status) || (tab.id === 'rejected' && unresolvedRejected(c) > 0) : c.status !== 'CANCELLED';

export function TiersPayantView() {
  const { can } = useAppContext();
  const { filters, showToast } = useFacturationStore();
  const organizationsQ = useOrganizationsQuery();
  const claimsQ = useClaimsQuery();
  const settlementsQ = useSettlementsQuery();
  const organizations = organizationsQ.data || [];
  const claims = claimsQ.data || [];
  const settlements = settlementsQ.data || [];

  const [tab, setTab] = useState('all');
  const [showOrganizations, setShowOrganizations] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [action, setAction] = useState<{ claim: Claim; action: ClaimAction } | null>(null);
  const runAction = (claim: Claim, a: ClaimAction) => { setDetailId(null); setAction({ claim, action: a }); };
  const canEdit = can('billing.collect');

  // Top filters (patient / numéro, période, praticien, organisme, statut) apply to everything below.
  const filtered = useMemo(() => {
    const start = periodeStartMs(filters.periode);
    const q = filters.recherche.trim().toLowerCase();
    return claims.filter(c => {
      if (start > 0 && new Date(c.createdAt).getTime() < start) return false;
      if (filters.praticienId && c.praticienId !== filters.praticienId) return false;
      if (filters.organisationId && c.organizationId !== filters.organisationId) return false;
      if (filters.claimStatut && c.status !== filters.claimStatut) return false;
      if (filters.patientId && c.patientId !== filters.patientId) return false;
      if (q && ![c.patientNom, numeroFacture(c.invoiceId), c.externalReference, c.membershipNumber]
        .some(v => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [claims, filters]);

  const kpis = useMemo(() => {
    const sum = (list: Claim[], f: (c: Claim) => number) => list.reduce((a, c) => a + f(c), 0);
    const ready = filtered.filter(c => c.status === 'READY');
    const awaiting = filtered.filter(c => AWAITING_SETTLEMENT_STATUSES.includes(c.status) && claimOutstanding(c) > 0);
    const paid = filtered.filter(c => c.received > 0 && c.status !== 'CANCELLED');
    // refused amounts still waiting for an explicit decision
    const rejected = filtered.filter(c => unresolvedRejected(c) > 0);
    return {
      ready: { n: ready.length, amount: sum(ready, c => c.claimed) },
      awaiting: { n: awaiting.length, amount: sum(awaiting, claimOutstanding) },
      received: { n: paid.length, amount: sum(paid, c => c.received) },
      rejected: { n: rejected.length, amount: sum(rejected, unresolvedRejected) },
    };
  }, [filtered]);

  // Only tiers-payant receivables: what each organism still owes the cabinet.
  const balances = useMemo(() => {
    const byOrg = new Map<string, { id: string; name: string; open: number; owed: number }>();
    filtered.filter(c => OPEN_CLAIM_STATUSES.includes(c.status) && claimOutstanding(c) > 0).forEach(c => {
      const org = organizations.find(o => o.id === c.organizationId);
      const row = byOrg.get(c.organizationId) || { id: c.organizationId, name: org?.name || c.organizationName, open: 0, owed: 0 };
      row.open += 1;
      row.owed += claimOutstanding(c);
      byOrg.set(c.organizationId, row);
    });
    return Array.from(byOrg.values()).sort((a, b) => b.owed - a.owed);
  }, [filtered, organizations]);

  const activeTab = TABS.find(t => t.id === tab) || TABS[0];
  const shown = filtered.filter(c => inTab(activeTab, c));
  const detail = claims.find(c => c.id === detailId) || null;

  if (claimsQ.isLoading || organizationsQ.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (claimsQ.isError) return <ErrorState error={claimsQ.error as Error} onRetry={claimsQ.refetch} />;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">Suivez les dossiers en tiers payant et les règlements attendus des organismes.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowOrganizations(true)}><Building2 className="h-4 w-4" />Organismes</Button>
          {canEdit && <Button variant="accent" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Créer un dossier</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">À déposer</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{dh(kpis.ready.amount)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{plural(kpis.ready.n, 'dossier')}</p>
        </Card>
        <Card className="border-blue-100 bg-blue-50/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">En attente de règlement</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-blue-700">{dh(kpis.awaiting.amount)}</p>
          <p className="mt-0.5 text-xs text-blue-600/80">{plural(kpis.awaiting.n, 'dossier')}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Réglé par l'organisme</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-600">{dh(kpis.received.amount)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{plural(kpis.received.n, 'dossier')}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rejetés à traiter</p>
          <p className={cn('mt-1 text-2xl font-bold tracking-tight', kpis.rejected.n ? 'text-red-600' : 'text-slate-900')}>{dh(kpis.rejected.amount)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{plural(kpis.rejected.n, 'dossier')}</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <SectionTitle title="Soldes par organisme" subtitle="Montants encore attendus des organismes" className="border-b border-slate-100 p-6 pb-4" />
        {balances.length === 0 ? (
          <div className="py-12 text-center">
            <Landmark className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 font-medium text-slate-900">Aucun règlement en attente</p>
            <p className="text-sm text-slate-500">Les montants apparaîtront lorsque des dossiers en tiers payant seront créés.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-semibold">Organisme</th>
                <th className="px-3 py-3 font-semibold">Dossiers ouverts</th>
                <th className="px-6 py-3 text-right font-semibold">Montant à recevoir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {balances.map(b => {
                const org = organizations.find(o => o.id === b.id);
                return (
                  <tr key={b.id}>
                    <td className="px-6 py-3">
                      <span className="font-semibold text-slate-900">{b.name}</span>
                      {org && <span className="ml-2 text-xs text-slate-400">{ORGANIZATION_TYPE_LABEL[org.type]}</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{b.open}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900">{dh(b.owed)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Dossiers en tiers payant</h3>
            <p className="mt-0.5 text-xs text-slate-500">{plural(shown.length, 'dossier')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map(t => <Chip key={t.id} size="md" selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>)}
            <Button variant="secondary" size="sm" disabled={shown.length === 0}
              onClick={() => { exportClaims(shown); showToast(`Export de ${plural(shown.length, 'dossier')} réussi.`); }}>
              <Download className="h-4 w-4" />Exporter
            </Button>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="py-14 text-center">
            <FileStack className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 font-medium text-slate-900">Aucun dossier en tiers payant</p>
            <p className="text-sm text-slate-500">Les dossiers apparaîtront après la création d'une facture avec le mode de paiement tiers payant.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3 font-semibold">Patient</th>
                  <th className="px-3 py-3 font-semibold">Organisme · couverture</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 text-right font-semibold">Demandé</th>
                  <th className="px-3 py-3 text-right font-semibold">Reçu</th>
                  <th className="px-3 py-3 text-right font-semibold">Reste</th>
                  <th className="px-3 py-3 font-semibold">Statut</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(c => (
                  <tr key={c.id} onClick={() => setDetailId(c.id)} className="cursor-pointer align-top transition-colors hover:bg-slate-50/60">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-slate-900">{c.patientNom}</p>
                      <p className="text-xs text-slate-400">{numeroFacture(c.invoiceId)}{c.externalReference ? ` · Réf. ${c.externalReference}` : ''}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {c.organizationName}
                      <span className="block text-xs text-slate-400">
                        {[c.coverageType && COVERAGE_TYPE_LABEL[c.coverageType], c.membershipNumber && `N° ${c.membershipNumber}`].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{fmtDate(c.createdAt)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">{dh(c.claimed)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={c.received > 0 ? 'font-semibold text-emerald-600' : 'text-slate-400'}>{dh(c.received)}</span>
                      {c.rejected > 0 && <span className="block text-xs font-medium text-red-600">{dh(c.rejected)} rejeté</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">{dh(claimOutstanding(c))}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <ClaimBadge status={c.status} />
                        <ResolutionBadge claim={c} />
                      </div>
                      {unresolvedRejected(c) > 0 && c.rejectionReason && <p className="mt-1 max-w-[180px] text-xs text-red-600">{c.rejectionReason}</p>}
                    </td>
                    <td className="px-6 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end">
                        {canEdit && canReceiveSettlement(c) ? (
                          <Button variant="success" size="xs" onClick={() => runAction(c, { type: 'settle' })}>Enregistrer un règlement</Button>
                        ) : canEdit && unresolvedRejected(c) > 0 ? (
                          <Button variant="accentOutline" size="xs" onClick={() => setDetailId(c.id)}>Traiter le rejet</Button>
                        ) : (
                          <Button variant="ghost" size="xs" onClick={() => setDetailId(c.id)}>Détails</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <OrganizationsModal open={showOrganizations} onClose={() => setShowOrganizations(false)} />
      <CreateClaimModal open={showCreate} onClose={() => setShowCreate(false)} />
      <ClaimDetailModal claim={detail} claims={claims} settlements={settlements} canEdit={canEdit}
        onAction={runAction} onOpenClaim={setDetailId} onClose={() => setDetailId(null)} />
      <ClaimActionDialogs current={action} onClose={() => setAction(null)} />
    </div>
  );
}
