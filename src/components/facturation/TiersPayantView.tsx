import React, { useMemo, useState } from 'react';
import { Building2, Download, FileStack, Landmark, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Button from '../common/Button';
import Chip from '../common/Chip';
import Modal from '../common/Modal';
import { useFacturationStore } from './store';
import { periodeStartMs } from './selectors';
import { numeroFacture } from './data';
import { Card, ErrorState, SectionTitle, Skeleton } from './ui';
import { dh, fmtDate, num } from './format';
import { CreateClaimModal } from './CreateClaimModal';
import { OrganizationsModal } from './OrganizationsModal';
import {
  AWAITING_SETTLEMENT_STATUSES, CLAIM_STATUS, OPEN_CLAIM_STATUSES, ORGANIZATION_TYPE_LABEL,
  claimOutstanding, useClaimSettlement, useClaimStatus, useClaimsQuery, useOrganizationsQuery, useRejectClaim,
} from './tiersPayant';
import type { Claim, ClaimStatus } from './tiersPayant';
import { cn } from '../../lib/utils';

const inputCls = 'h-[44px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500';

const parseAmount = (s: string) => (String(s).trim() === '' ? 0 : Number(String(s).replace(/\s/g, '').replace(',', '.')));
const round2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, word: string) => `${num(n)} ${word}${n > 1 ? 's' : ''}`;

function ClaimBadge({ status }: { status: ClaimStatus }) {
  const meta = CLAIM_STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', meta.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

// ------------------------------------------------------------------ claim actions

type ActionKind = 'ready' | 'draft' | 'submit' | 'processing' | 'settle' | 'reject' | 'refile' | 'cancel';
type Action = { kind: ActionKind; claim: Claim } | null;

const ACTION_TITLE: Record<ActionKind, string> = {
  ready: 'Marquer prêt à déposer',
  draft: 'Repasser en brouillon',
  submit: 'Marquer comme déposé',
  processing: "Marquer en cours de traitement",
  settle: "Enregistrer un règlement de l'organisme",
  reject: 'Enregistrer un rejet',
  refile: 'Corriger et redéposer',
  cancel: 'Annuler le dossier',
};

function ClaimActionModal({ action, onClose }: { action: Action; onClose: () => void }) {
  const status = useClaimStatus();
  const settle = useClaimSettlement();
  const reject = useRejectClaim();
  const { showToast } = useFacturationStore();
  const [reference, setReference] = useState('');
  const [received, setReceived] = useState('');
  const [rejected, setRejected] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!action) return;
    setReference(action.claim.externalReference);
    setReceived(String(claimOutstanding(action.claim)));
    setRejected('');
    setReason('');
    setNote('');
    setError('');
  }, [action]);

  if (!action) return null;
  const { kind, claim } = action;
  const outstanding = claimOutstanding(claim);
  const pending = status.isPending || settle.isPending || reject.isPending;

  const run = async () => {
    try {
      if (kind === 'settle') {
        const r = parseAmount(received);
        const x = parseAmount(rejected);
        if (!Number.isFinite(r) || !Number.isFinite(x) || r < 0 || x < 0 || r + x <= 0) return setError('Montant invalide.');
        if (round2(r + x) > outstanding) return setError(`Le total dépasse ce que l'organisme doit encore (${dh(outstanding, true)}).`);
        if (x > 0 && !reason.trim()) return setError('Indiquez le motif de la part refusée.');
        await settle.mutateAsync({ id: claim.id, received: r, rejected: x, reason, reference });
        showToast(r > 0 ? `Règlement de ${dh(r)} enregistré.` : 'Refus partiel enregistré.');
      } else if (kind === 'reject') {
        if (!reason.trim()) return setError('Indiquez le motif du rejet.');
        await reject.mutateAsync({ id: claim.id, reason });
        showToast('Rejet enregistré.');
      } else {
        const next: Record<string, ClaimStatus> = {
          ready: 'READY', draft: 'DRAFT', submit: 'SUBMITTED', processing: 'PROCESSING', refile: 'READY', cancel: 'CANCELLED',
        };
        await status.mutateAsync({ id: claim.id, status: next[kind], reference, notes: note });
        showToast({
          ready: 'Dossier prêt à déposer.', draft: 'Dossier repassé en brouillon.', submit: 'Dossier marqué comme déposé.',
          processing: 'Dossier marqué en cours.', refile: 'Dossier à redéposer.', cancel: 'Dossier annulé.',
        }[kind] as string);
      }
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open onClose={onClose} title={ACTION_TITLE[kind]}
      description={`${claim.patientNom} · ${claim.organizationName} · part organisme ${dh(claim.claimed, true)}`} width="max-w-md">
      <div className="space-y-3">
        {kind === 'cancel' && (
          <p className="text-sm text-slate-600">
            La part de l'organisme ({dh(claim.claimed, true)}) redevient due par le patient sur la facture. Cette action ne peut pas être annulée.
          </p>
        )}
        {kind === 'refile' && claim.rejectionReason && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Motif du rejet : {claim.rejectionReason}</p>
        )}
        {kind === 'settle' && (
          <>
            <p className="text-sm text-slate-600">Reste attendu de l'organisme : <b>{dh(outstanding, true)}</b></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Montant reçu (DH)</label>
                <input className={inputCls} inputMode="decimal" value={received} onChange={e => setReceived(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Montant refusé (DH)</label>
                <input className={inputCls} inputMode="decimal" value={rejected} onChange={e => setRejected(e.target.value)} placeholder="0" />
              </div>
            </div>
            {parseAmount(rejected) > 0 && (
              <div>
                <label className={labelCls}>Motif du refus</label>
                <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} />
              </div>
            )}
          </>
        )}
        {kind === 'reject' && (
          <>
            <p className="text-sm text-slate-600">L'organisme refuse les {dh(outstanding, true)} encore attendus. Aucun paiement n'est enregistré.</p>
            <div>
              <label className={labelCls}>Motif du rejet</label>
              <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
          </>
        )}
        {(kind === 'submit' || kind === 'settle') && (
          <div>
            <label className={labelCls}>{kind === 'submit' ? 'N° de dossier / bordereau (optionnel)' : 'Référence du règlement (optionnel)'}</label>
            <input className={inputCls} value={reference} onChange={e => setReference(e.target.value)} />
          </div>
        )}
        {kind === 'cancel' && (
          <div>
            <label className={labelCls}>Note (optionnel)</label>
            <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} />
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Retour</Button>
        <Button variant={kind === 'settle' ? 'success' : kind === 'reject' || kind === 'cancel' ? 'danger' : 'primary'} size="sm" onClick={run} disabled={pending}>
          {kind === 'cancel' ? 'Annuler le dossier' : 'Confirmer'}
        </Button>
      </div>
    </Modal>
  );
}

// Actions offered for each status (the server enforces the same lifecycle).
const ACTIONS: Record<ClaimStatus, Array<{ kind: ActionKind; label: string; variant: string }>> = {
  DRAFT: [{ kind: 'ready', label: 'Prêt à déposer', variant: 'accentOutline' }, { kind: 'cancel', label: 'Annuler', variant: 'ghost' }],
  READY: [{ kind: 'submit', label: 'Déposer', variant: 'accentOutline' }, { kind: 'draft', label: 'Brouillon', variant: 'ghost' }, { kind: 'cancel', label: 'Annuler', variant: 'ghost' }],
  SUBMITTED: [{ kind: 'settle', label: 'Règlement', variant: 'success' }, { kind: 'processing', label: 'En cours', variant: 'secondary' }, { kind: 'reject', label: 'Rejet', variant: 'secondary' }, { kind: 'cancel', label: 'Annuler', variant: 'ghost' }],
  PROCESSING: [{ kind: 'settle', label: 'Règlement', variant: 'success' }, { kind: 'reject', label: 'Rejet', variant: 'secondary' }, { kind: 'cancel', label: 'Annuler', variant: 'ghost' }],
  PARTIALLY_SETTLED: [{ kind: 'settle', label: 'Règlement', variant: 'success' }, { kind: 'reject', label: 'Rejeter le reste', variant: 'secondary' }],
  SETTLED: [],
  REJECTED: [{ kind: 'refile', label: 'Redéposer', variant: 'accentOutline' }, { kind: 'cancel', label: 'Annuler', variant: 'ghost' }],
  CANCELLED: [],
};

// ------------------------------------------------------------------ export

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const money = (n: number) => n.toFixed(2).replace('.', ',');

function exportClaims(claims: Claim[]) {
  const headers = ['Organisme', 'Date', 'Patient', 'N° adhérent', 'Facture', 'Total facture', 'Part organisme', 'Part patient', 'Reçu', 'Refusé', 'Reste attendu', 'Statut', 'Référence', 'Motif du rejet'];
  const rows = claims.map(c => [
    csvCell(c.organizationName), c.createdAt.split('T')[0], csvCell(c.patientNom), csvCell(c.membershipNumber), numeroFacture(c.invoiceId),
    money(c.invoiceAmount), money(c.claimed), money(c.patientShare), money(c.received), money(c.rejected), money(claimOutstanding(c)),
    CLAIM_STATUS[c.status].label, csvCell(c.externalReference), csvCell(c.rejectionReason),
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

export function TiersPayantView() {
  const { can } = useAppContext();
  const { filters, showToast } = useFacturationStore();
  const organizationsQ = useOrganizationsQuery();
  const claimsQ = useClaimsQuery();
  const organizations = organizationsQ.data || [];
  const claims = claimsQ.data || [];

  const [tab, setTab] = useState('all');
  const [showOrganizations, setShowOrganizations] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [action, setAction] = useState<Action>(null);
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
    const rejected = filtered.filter(c => c.status === 'REJECTED');
    return {
      ready: { n: ready.length, amount: sum(ready, c => c.claimed) },
      awaiting: { n: awaiting.length, amount: sum(awaiting, claimOutstanding) },
      received: { n: paid.length, amount: sum(paid, c => c.received) },
      rejected: { n: rejected.length, amount: sum(rejected, c => c.rejected) },
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
  const shown = filtered.filter(c => (activeTab.statuses ? activeTab.statuses.includes(c.status) : c.status !== 'CANCELLED'));

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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rejetés</p>
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
                <th className="px-6 py-3 text-right font-semibold">Montant attendu</th>
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
                  <th className="px-3 py-3 font-semibold">Organisme</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 text-right font-semibold">Facture</th>
                  <th className="px-3 py-3 text-right font-semibold">Part organisme</th>
                  <th className="px-3 py-3 text-right font-semibold">Reste attendu</th>
                  <th className="px-3 py-3 font-semibold">Statut</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(c => (
                  <tr key={c.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-slate-900">{c.patientNom}</p>
                      <p className="text-xs text-slate-400">{numeroFacture(c.invoiceId)}{c.externalReference ? ` · Réf. ${c.externalReference}` : ''}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {c.organizationName}
                      {c.membershipNumber && <span className="block text-xs text-slate-400">N° {c.membershipNumber}</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{fmtDate(c.createdAt)}</td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {dh(c.invoiceAmount)}
                      <span className="block text-xs text-slate-400">patient {dh(c.patientShare)}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {dh(c.claimed)}
                      {c.received > 0 && <span className="block text-xs font-medium text-emerald-600">{dh(c.received)} reçu</span>}
                      {c.rejected > 0 && <span className="block text-xs font-medium text-red-600">{dh(c.rejected)} refusé</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">{dh(claimOutstanding(c))}</td>
                    <td className="px-3 py-3">
                      <ClaimBadge status={c.status} />
                      {c.rejectionReason && <p className="mt-1 max-w-[180px] text-xs text-red-600">{c.rejectionReason}</p>}
                    </td>
                    <td className="px-6 py-3">
                      {canEdit && ACTIONS[c.status].length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {ACTIONS[c.status].map(a => (
                            <Button key={a.kind} variant={a.variant} size="xs" onClick={() => setAction({ kind: a.kind, claim: c })}>{a.label}</Button>
                          ))}
                        </div>
                      )}
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
      <ClaimActionModal action={action} onClose={() => setAction(null)} />
    </div>
  );
}
