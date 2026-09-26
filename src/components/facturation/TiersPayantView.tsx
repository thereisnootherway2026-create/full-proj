import React, { useMemo, useState } from 'react';
import { Building2, Download, FilePlus2, Landmark, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Button from '../common/Button';
import Chip from '../common/Chip';
import Modal from '../common/Modal';
import Select from '../common/Select';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { Card, ErrorState, SectionTitle, Skeleton } from './ui';
import { dh, fmtDate, num } from './format';
import { factureReste } from './data';
import {
  CLAIM_STATUS, Claim, ClaimStatus, INSURER_KINDS, Insurer, InsurerKind, KIND_LABEL, claimOpenAmount,
  useClaimStatus, useClaimsQuery, useCreateClaim, useInsurersQuery, useReimbursement, useSaveInsurer,
} from './tiersPayant';
import { cn } from '../../lib/utils';

const inputCls = 'h-[44px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500';

const parseAmount = (s: string) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
const round2 = (n: number) => Math.round(n * 100) / 100;

function ClaimBadge({ status }: { status: ClaimStatus }) {
  const meta = CLAIM_STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', meta.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

function FormError({ message }: { message: string }) {
  return message ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{message}</p> : null;
}

// ------------------------------------------------------------------ insurers

function InsurersModal({ open, onClose, insurers }: { open: boolean; onClose: () => void; insurers: Insurer[] }) {
  const save = useSaveInsurer();
  const { showToast } = useFacturationStore();
  const [editing, setEditing] = useState<Insurer | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<InsurerKind>('mutuelle');
  const [rate, setRate] = useState('80');
  const [error, setError] = useState('');

  const reset = () => { setEditing(null); setName(''); setKind('mutuelle'); setRate('80'); setError(''); };
  const edit = (i: Insurer) => { setEditing(i); setName(i.name); setKind(i.kind); setRate(String(i.defaultRate)); setError(''); };

  const submit = async () => {
    const r = parseAmount(rate);
    if (!name.trim()) return setError("Saisissez le nom de l'organisme.");
    if (!Number.isFinite(r) || r < 0 || r > 100) return setError('Le taux doit être compris entre 0 et 100 %.');
    try {
      await save.mutateAsync({ id: editing?.id, name, kind, defaultRate: r });
      showToast(editing ? 'Organisme mis à jour.' : 'Organisme ajouté.');
      reset();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Organismes payeurs" description="CNSS, CNOPS, mutuelles et assurances du cabinet" width="max-w-lg">
      <div className="space-y-2">
        {insurers.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Aucun organisme pour le moment.</p>}
        {insurers.map(i => (
          <button key={i.id} type="button" onClick={() => edit(i)}
            className={cn('flex w-full items-center justify-between rounded-[10px] border px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
              editing?.id === i.id ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200')}>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{i.name}</span>
              <span className="text-xs text-slate-500">{KIND_LABEL[i.kind]}</span>
            </span>
            <span className="text-sm font-bold text-slate-700">{i.defaultRate} %</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-800">{editing ? `Modifier « ${editing.name} »` : 'Ajouter un organisme'}</p>
        <div>
          <label className={labelCls}>Nom</label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. CNSS, Saham, AXA…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Type</label>
            <Select value={kind} onChange={(v: string) => setKind(v as InsurerKind)}
              options={INSURER_KINDS.map(k => ({ value: k, label: KIND_LABEL[k] }))} />
          </div>
          <div>
            <label className={labelCls}>Prise en charge par défaut (%)</label>
            <input className={inputCls} inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} />
          </div>
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2 pt-1">
          {editing && <Button variant="secondary" size="sm" onClick={reset}>Nouveau</Button>}
          <Button variant="primary" size="sm" onClick={submit} disabled={save.isPending}>{editing ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ new claim

function NewClaimModal({ open, onClose, insurers, claimedPaymentIds }: { open: boolean; onClose: () => void; insurers: Insurer[]; claimedPaymentIds: Set<string> }) {
  const { data: factures = [] } = useFacturesQuery();
  const create = useCreateClaim();
  const { showToast } = useFacturationStore();
  const [factureId, setFactureId] = useState('');
  const [insurerId, setInsurerId] = useState('');
  const [rate, setRate] = useState('');
  const [save, setSave] = useState(true);
  const [error, setError] = useState('');

  const eligible = useMemo(
    () => factures.filter(f => f.visitId && factureReste(f) > 0 && !claimedPaymentIds.has(f.id)),
    [factures, claimedPaymentIds],
  );
  const facture = eligible.find(f => f.id === factureId) || null;
  const insurer = insurers.find(i => i.id === insurerId) || null;

  const close = () => { setFactureId(''); setInsurerId(''); setRate(''); setError(''); onClose(); };

  const pickFacture = (id: string) => {
    setFactureId(id);
    const f = eligible.find(x => x.id === id);
    const match = f ? insurers.find(i => i.name === f.assureurId) : undefined;
    if (match) { setInsurerId(match.id); setRate(String(match.defaultRate)); }
  };
  const pickInsurer = (id: string) => {
    setInsurerId(id);
    const i = insurers.find(x => x.id === id);
    if (i) setRate(String(i.defaultRate));
  };

  const r = parseAmount(rate);
  const validRate = Number.isFinite(r) && r >= 0 && r <= 100;
  const insurerShare = facture && validRate ? Math.min(round2(facture.montant * r / 100), factureReste(facture)) : 0;
  const patientShare = facture ? facture.montant - insurerShare : 0;

  const submit = async () => {
    if (!facture) return setError('Choisissez une facture.');
    if (!insurer) return setError('Choisissez un organisme.');
    if (!validRate) return setError('Le taux doit être compris entre 0 et 100 %.');
    try {
      await create.mutateAsync({ paymentId: facture.id, patientId: facture.patientId, insurerId: insurer.id, rate: r, saveForPatient: save });
      showToast(`Demande créée : ${dh(insurerShare)} à recevoir de ${insurer.name}.`);
      close();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open={open} onClose={close} title="Nouvelle demande de prise en charge" description="La part de l'organisme est suivie séparément de celle du patient" width="max-w-lg">
      {insurers.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800">Ajoutez d'abord un organisme payeur (bouton « Organismes »).</p>
      ) : eligible.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Aucune facture impayée sans demande.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Facture</label>
            <Select value={factureId} onChange={pickFacture} placeholder="Choisir une facture…"
              options={eligible.map(f => ({ value: f.id, label: `${f.patientNom} · ${f.numero} · ${dh(factureReste(f))}` }))} />
          </div>
          <div className="grid grid-cols-[1fr_130px] gap-3">
            <div>
              <label className={labelCls}>Organisme</label>
              <Select value={insurerId} onChange={pickInsurer} placeholder="Choisir…"
                options={insurers.map(i => ({ value: i.id, label: i.name }))} />
            </div>
            <div>
              <label className={labelCls}>Prise en charge %</label>
              <input className={inputCls} inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} />
            </div>
          </div>

          {facture && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
              <div><p className="text-[11px] font-semibold uppercase text-slate-400">Facture</p><p className="text-sm font-bold text-slate-900">{dh(facture.montant)}</p></div>
              <div><p className="text-[11px] font-semibold uppercase text-slate-400">Organisme</p><p className="text-sm font-bold text-blue-700">{dh(insurerShare)}</p></div>
              <div><p className="text-[11px] font-semibold uppercase text-slate-400">Patient</p><p className="text-sm font-bold text-slate-900">{dh(patientShare)}</p></div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-600">
            <input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Enregistrer cet organisme et ce taux sur la fiche du patient
          </label>
          <FormError message={error} />
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={close}>Annuler</Button>
        <Button variant="primary" size="sm" onClick={submit} disabled={create.isPending || !facture || !insurer}>Créer la demande</Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ claim action dialogs

type Action = { kind: 'submit' | 'reimburse' | 'reject' | 'cancel'; claim: Claim } | null;

function ClaimActionModal({ action, onClose }: { action: Action; onClose: () => void }) {
  const status = useClaimStatus();
  const reimburse = useReimbursement();
  const { showToast } = useFacturationStore();
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!action) return;
    setReference(action.claim.reference);
    setAmount(String(round2(action.claim.insurerShare - action.claim.reimbursed)));
    setNote(action.claim.note);
    setError('');
  }, [action]);

  if (!action) return null;
  const { kind, claim } = action;
  const open = round2(claim.insurerShare - claim.reimbursed);

  const titles = {
    submit: 'Marquer comme déposé', reimburse: 'Enregistrer un remboursement',
    reject: 'Marquer comme rejeté', cancel: 'Annuler la demande',
  };

  const run = async () => {
    try {
      if (kind === 'reimburse') {
        const v = parseAmount(amount);
        if (!Number.isFinite(v) || v <= 0) return setError('Montant invalide.');
        if (v > open) return setError(`Le montant dépasse ce que l'organisme doit encore (${dh(open, true)}).`);
        await reimburse.mutateAsync({ id: claim.id, amount: v, reference });
        showToast(v < open ? `Remboursement partiel de ${dh(v)} enregistré.` : `Remboursement de ${dh(v)} enregistré.`);
      } else {
        const next = { submit: 'depose', reject: 'rejete', cancel: 'annule' }[kind] as ClaimStatus;
        await status.mutateAsync({ id: claim.id, status: next, reference, note });
        showToast(kind === 'submit' ? 'Demande marquée comme déposée.' : kind === 'reject' ? 'Demande marquée comme rejetée.' : 'Demande annulée.');
      }
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open onClose={onClose} title={titles[kind]} description={`${claim.patientNom} · part de l'organisme ${dh(claim.insurerShare, true)}`} width="max-w-md">
      <div className="space-y-3">
        {kind === 'cancel' && <p className="text-sm text-slate-600">La facture reste due par le patient. Cette action ne peut pas être annulée.</p>}
        {kind === 'reimburse' && (
          <div>
            <label className={labelCls}>Montant reçu (DH) — reste dû : {dh(open, true)}</label>
            <input className={inputCls} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
        )}
        {(kind === 'submit' || kind === 'reimburse') && (
          <div>
            <label className={labelCls}>{kind === 'submit' ? 'N° de dossier / bordereau (optionnel)' : 'Référence du virement (optionnel)'}</label>
            <input className={inputCls} value={reference} onChange={e => setReference(e.target.value)} />
          </div>
        )}
        {(kind === 'reject' || kind === 'cancel') && (
          <div>
            <label className={labelCls}>{kind === 'reject' ? 'Motif du rejet' : 'Note (optionnel)'}</label>
            <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} />
          </div>
        )}
        <FormError message={error} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Retour</Button>
        <Button variant={kind === 'reimburse' ? 'success' : kind === 'submit' ? 'primary' : 'danger'} size="sm" onClick={run}
          disabled={status.isPending || reimburse.isPending}>
          {kind === 'reimburse' ? 'Enregistrer' : kind === 'submit' ? 'Confirmer le dépôt' : kind === 'reject' ? 'Marquer rejeté' : "Annuler la demande"}
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ export

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const money = (n: number) => n.toFixed(2).replace('.', ',');

function exportClaims(claims: Claim[], insurers: Insurer[]) {
  const name = (id: string) => insurers.find(i => i.id === id)?.name || '';
  const headers = ['Organisme', 'Date', 'Patient', 'CIN', 'N° CNSS / affilié', 'Total facture', 'Taux %', 'Part organisme', 'Part patient', 'Statut', 'Référence', 'Remboursé'];
  const rows = claims.map(c => [
    csvCell(name(c.insurerId)), c.createdAt.split('T')[0], csvCell(c.patientNom), csvCell(c.patientCin), csvCell(c.numeroCnss),
    money(c.total), String(c.rate).replace('.', ','), money(c.insurerShare), money(c.patientShare),
    CLAIM_STATUS[c.status].label, csvCell(c.reference), money(c.reimbursed),
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

const FILTERS: Array<{ id: 'all' | ClaimStatus; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'a_deposer', label: 'À déposer' },
  { id: 'depose', label: 'Déposées' },
  { id: 'rembourse', label: 'Remboursées' },
  { id: 'rejete', label: 'Rejetées' },
];

export function TiersPayantView() {
  const { can } = useAppContext();
  const { showToast } = useFacturationStore();
  const insurersQ = useInsurersQuery();
  const claimsQ = useClaimsQuery();
  const insurers = insurersQ.data || [];
  const claims = claimsQ.data || [];

  const [filter, setFilter] = useState<'all' | ClaimStatus>('all');
  const [insurerFilter, setInsurerFilter] = useState('');
  const [showInsurers, setShowInsurers] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [action, setAction] = useState<Action>(null);

  const canEdit = can('billing.collect');
  const claimedPaymentIds = useMemo(() => new Set(claims.filter(c => c.status !== 'annule').map(c => c.paymentId)), [claims]);
  const live = claims.filter(c => c.status !== 'annule');

  const totals = useMemo(() => {
    const sum = (list: Claim[], f: (c: Claim) => number) => list.reduce((a, c) => a + f(c), 0);
    const toFile = live.filter(c => c.status === 'a_deposer');
    const waiting = live.filter(c => c.status === 'depose');
    const rejected = live.filter(c => c.status === 'rejete');
    return {
      toFile: { n: toFile.length, amount: sum(toFile, c => c.insurerShare) },
      waiting: { n: waiting.length, amount: sum(waiting, claimOpenAmount) },
      reimbursed: sum(live, c => c.reimbursed),
      rejected: { n: rejected.length, amount: sum(rejected, c => c.insurerShare - c.reimbursed) },
    };
  }, [live]);

  const perInsurer = useMemo(() => insurers.map(i => {
    const mine = live.filter(c => c.insurerId === i.id);
    return {
      insurer: i,
      open: mine.filter(c => c.status === 'a_deposer' || c.status === 'depose').length,
      owed: mine.reduce((a, c) => a + claimOpenAmount(c), 0),
      reimbursed: mine.reduce((a, c) => a + c.reimbursed, 0),
    };
  }), [insurers, live]);

  const shown = claims.filter(c => (filter === 'all' ? c.status !== 'annule' : c.status === filter) && (!insurerFilter || c.insurerId === insurerFilter));
  const insurerName = (id: string) => insurers.find(i => i.id === id)?.name || '—';

  if (claimsQ.isLoading || insurersQ.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (claimsQ.isError) return <ErrorState error={claimsQ.error as Error} onRetry={claimsQ.refetch} />;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Suivez la part prise en charge par la CNSS, la CNOPS et les mutuelles. Les dossiers sont préparés ici et exportés pour dépôt auprès de l'organisme ; le remboursement est saisi à sa réception.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowInsurers(true)}><Building2 className="h-4 w-4" />Organismes</Button>
          {canEdit && <Button variant="accent" size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4" />Nouvelle demande</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">À déposer</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{dh(totals.toFile.amount)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{num(totals.toFile.n)} dossier{totals.toFile.n > 1 ? 's' : ''}</p>
        </Card>
        <Card className="border-blue-100 bg-blue-50/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">En attente de remboursement</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-blue-700">{dh(totals.waiting.amount)}</p>
          <p className="mt-0.5 text-xs text-blue-600/80">{num(totals.waiting.n)} dossier{totals.waiting.n > 1 ? 's' : ''} déposé{totals.waiting.n > 1 ? 's' : ''}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Remboursé</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-600">{dh(totals.reimbursed)}</p>
          <p className="mt-0.5 text-xs text-slate-500">Cumul reçu des organismes</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rejetés</p>
          <p className={cn('mt-1 text-2xl font-bold tracking-tight', totals.rejected.n ? 'text-red-600' : 'text-slate-900')}>{dh(totals.rejected.amount)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{num(totals.rejected.n)} dossier{totals.rejected.n > 1 ? 's' : ''}</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <SectionTitle title="Soldes par organisme" subtitle="Ce que chaque organisme doit encore au cabinet" className="border-b border-slate-100 p-6 pb-4" />
        {perInsurer.length === 0 ? (
          <div className="py-12 text-center">
            <Landmark className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 font-medium text-slate-900">Aucun organisme</p>
            <p className="text-sm text-slate-500">Ajoutez la CNSS, la CNOPS ou une mutuelle pour commencer.</p>
            <Button className="mt-4" variant="accent" size="sm" onClick={() => setShowInsurers(true)}>Ajouter un organisme</Button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-semibold">Organisme</th>
                <th className="px-3 py-3 font-semibold">Taux</th>
                <th className="px-3 py-3 font-semibold">Dossiers ouverts</th>
                <th className="px-3 py-3 text-right font-semibold">Reçu</th>
                <th className="px-6 py-3 text-right font-semibold">À recevoir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perInsurer.map(({ insurer, open, owed, reimbursed }) => (
                <tr key={insurer.id} onClick={() => setInsurerFilter(f => (f === insurer.id ? '' : insurer.id))}
                  className={cn('cursor-pointer transition-colors hover:bg-slate-50', insurerFilter === insurer.id && 'bg-blue-50/50')}>
                  <td className="px-6 py-3"><span className="font-semibold text-slate-900">{insurer.name}</span> <span className="ml-1 text-xs text-slate-400">{KIND_LABEL[insurer.kind]}</span></td>
                  <td className="px-3 py-3 text-slate-600">{insurer.defaultRate} %</td>
                  <td className="px-3 py-3 text-slate-600">{open}</td>
                  <td className="px-3 py-3 text-right text-emerald-600">{dh(reimbursed)}</td>
                  <td className="px-6 py-3 text-right font-bold text-slate-900">{dh(owed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Demandes de prise en charge</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {insurerFilter ? `Organisme : ${insurerName(insurerFilter)} · ` : ''}{shown.length} demande{shown.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => <Chip key={f.id} size="md" selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}
            <Button variant="secondary" size="sm" disabled={shown.length === 0}
              onClick={() => { exportClaims(shown, insurers); showToast(`Export de ${shown.length} demande${shown.length > 1 ? 's' : ''} réussi.`); }}>
              <Download className="h-4 w-4" />Exporter
            </Button>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="py-14 text-center">
            <FilePlus2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 font-medium text-slate-900">Aucune demande</p>
            <p className="text-sm text-slate-500">Créez une demande depuis une facture impayée d'un patient assuré.</p>
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
                  <th className="px-3 py-3 text-right font-semibold">Part patient</th>
                  <th className="px-3 py-3 font-semibold">Statut</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-slate-900">{c.patientNom}</p>
                      {c.reference && <p className="text-xs text-slate-400">Réf. {c.reference}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{insurerName(c.insurerId)} <span className="text-xs text-slate-400">· {c.rate} %</span></td>
                    <td className="px-3 py-3 text-slate-600">{fmtDate(c.createdAt)}</td>
                    <td className="px-3 py-3 text-right text-slate-600">{dh(c.total)}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">
                      {dh(c.insurerShare)}
                      {c.reimbursed > 0 && c.status !== 'rembourse' && <span className="block text-xs font-medium text-emerald-600">{dh(c.reimbursed)} reçu</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">{dh(c.patientShare)}</td>
                    <td className="px-3 py-3"><ClaimBadge status={c.status} /></td>
                    <td className="px-6 py-3">
                      {canEdit && (
                        <div className="flex justify-end gap-1.5">
                          {c.status === 'a_deposer' && <Button variant="accentOutline" size="xs" onClick={() => setAction({ kind: 'submit', claim: c })}>Déposer</Button>}
                          {c.status === 'depose' && <Button variant="success" size="xs" onClick={() => setAction({ kind: 'reimburse', claim: c })}>Remboursement</Button>}
                          {c.status === 'depose' && <Button variant="secondary" size="xs" onClick={() => setAction({ kind: 'reject', claim: c })}>Rejeter</Button>}
                          {c.status === 'rejete' && <Button variant="accentOutline" size="xs" onClick={() => setAction({ kind: 'submit', claim: c })}>Redéposer</Button>}
                          {(c.status === 'a_deposer' || c.status === 'rejete' || (c.status === 'depose' && c.reimbursed === 0)) && (
                            <Button variant="ghost" size="xs" onClick={() => setAction({ kind: 'cancel', claim: c })}>Annuler</Button>
                          )}
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

      <InsurersModal open={showInsurers} onClose={() => setShowInsurers(false)} insurers={insurers} />
      <NewClaimModal open={showNew} onClose={() => setShowNew(false)} insurers={insurers} claimedPaymentIds={claimedPaymentIds} />
      <ClaimActionModal action={action} onClose={() => setAction(null)} />
    </div>
  );
}
