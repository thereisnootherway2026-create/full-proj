import { useEffect, useMemo, useState } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Select from '../common/Select';
import { useFacturationStore } from './store';
import { numeroFacture } from './data';
import { dh, fmtDate } from './format';
import { cn } from '../../lib/utils';
import {
  CLAIM_STATUS, COVERAGE_TYPE_LABEL, RESOLUTION_LABEL, SETTLEMENT_METHODS, SETTLEMENT_METHOD_LABEL,
  canReceiveSettlement, claimOutstanding, isCoverageUsable, unresolvedRejected, useClaimStatus,
  useOrganizationsQuery, usePatientCoveragesQuery, useRecordSettlement, useRejectClaim, useResolveRejection,
} from './tiersPayant';
import type { Claim, ClaimStatus, RejectionResolution, Settlement, SettlementMethod } from './tiersPayant';

const inputCls = 'h-[44px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500';

const parseAmount = (s: string) => (String(s).trim() === '' ? NaN : Number(String(s).replace(/\s/g, '').replace(',', '.')));
const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

export function ClaimBadge({ status }: { status: ClaimStatus }) {
  const meta = CLAIM_STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', meta.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

function FormError({ message }: { message: string }) {
  return message ? <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{message}</p> : null;
}

// Montant demandé / Déjà reçu / Reste à recevoir, the three figures every dossier is read by.
export function ClaimFigures({ claim }: { claim: Claim }) {
  const reste = claimOutstanding(claim);
  return (
    <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
      <div><p className="text-[11px] font-semibold uppercase text-slate-400">Montant demandé</p><p className="text-sm font-bold text-slate-900">{dh(claim.claimed, true)}</p></div>
      <div><p className="text-[11px] font-semibold uppercase text-slate-400">Déjà reçu</p><p className="text-sm font-bold text-emerald-600">{dh(claim.received, true)}</p></div>
      <div><p className="text-[11px] font-semibold uppercase text-slate-400">Reste à recevoir</p><p className="text-sm font-bold text-blue-700">{dh(reste, true)}</p></div>
    </div>
  );
}

function ClaimHeader({ claim }: { claim: Claim }) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm">
      <div><dt className="text-[11px] font-semibold uppercase text-slate-400">Organisme</dt><dd className="font-semibold text-slate-900">{claim.organizationName}</dd></div>
      <div><dt className="text-[11px] font-semibold uppercase text-slate-400">Patient</dt><dd className="font-semibold text-slate-900">{claim.patientNom}</dd></div>
      <div><dt className="text-[11px] font-semibold uppercase text-slate-400">Dossier</dt><dd className="font-mono font-semibold text-slate-900">{numeroFacture(claim.invoiceId)}</dd></div>
    </dl>
  );
}

// ------------------------------------------------------------------ Enregistrer un règlement
export function SettlementModal({ claim, onClose }: { claim: Claim | null; onClose: () => void }) {
  const record = useRecordSettlement();
  const { showToast } = useFacturationStore();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<SettlementMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  // one key per opened form: a double submit records a single settlement
  const [key, setKey] = useState(newKey);

  useEffect(() => {
    if (!claim) return;
    setAmount(String(claimOutstanding(claim))); setDate(today()); setMethod('BANK_TRANSFER');
    setReference(''); setNotes(''); setError(''); setKey(newKey());
  }, [claim?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!claim) return null;
  const reste = claimOutstanding(claim);
  const value = parseAmount(amount);

  const submit = async () => {
    if (!Number.isFinite(value) || value <= 0) return setError('Montant invalide.');
    if (round2(value) > reste) return setError(`Le montant dépasse le reste à recevoir (${dh(reste, true)}).`);
    if (!date || date > today()) return setError('Choisissez une date de réception valide.');
    try {
      await record.mutateAsync({ id: claim.id, amount: round2(value), method, receivedAt: date, reference, notes, key });
      showToast(round2(value) < reste
        ? `Règlement de ${dh(value)} enregistré. Reste à recevoir : ${dh(reste - value)}.`
        : `Règlement de ${dh(value)} enregistré. Dossier réglé.`);
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open onClose={onClose} title="Enregistrer un règlement" description="Montant reçu de l'organisme pour ce dossier" width="max-w-lg">
      <div className="space-y-4">
        <ClaimHeader claim={claim} />
        <ClaimFigures claim={claim} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Montant reçu (DH)</label>
            <input className={inputCls} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={inputCls} value={date} max={today()} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Mode</label>
            <Select value={method} onChange={(v: string) => setMethod(v as SettlementMethod)}
              options={SETTLEMENT_METHODS.map(m => ({ value: m, label: SETTLEMENT_METHOD_LABEL[m] }))} />
          </div>
          <div>
            <label className={labelCls}>Référence (optionnel)</label>
            <input className={inputCls} value={reference} onChange={e => setReference(e.target.value)} placeholder="N° de virement, de chèque…" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Note (optionnel)</label>
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <FormError message={error} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
        <Button variant="success" size="sm" onClick={submit} disabled={record.isPending || reste <= 0}>Enregistrer le règlement</Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ rejet de l'organisme
export function RejectModal({ claim, onClose }: { claim: Claim | null; onClose: () => void }) {
  const reject = useRejectClaim();
  const { showToast } = useFacturationStore();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (claim) { setAmount(String(claimOutstanding(claim))); setReason(''); setError(''); } }, [claim?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!claim) return null;
  const reste = claimOutstanding(claim);

  const submit = async () => {
    const v = parseAmount(amount);
    if (!Number.isFinite(v) || v <= 0 || round2(v) > reste) return setError(`Le montant refusé doit être compris entre 0 et ${dh(reste, true)}.`);
    if (!reason.trim()) return setError('Indiquez le motif du rejet.');
    try {
      await reject.mutateAsync({ id: claim.id, reason, amount: round2(v) });
      showToast("Rejet enregistré. Choisissez maintenant comment traiter le montant rejeté.");
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open onClose={onClose} title="Enregistrer un rejet" description="Montant refusé par l'organisme. Aucun paiement n'est enregistré." width="max-w-md">
      <div className="space-y-3">
        <ClaimHeader claim={claim} />
        <div>
          <label className={labelCls}>Montant refusé (DH) — reste à recevoir : {dh(reste, true)}</label>
          <input className={inputCls} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Motif du rejet</label>
          <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <FormError message={error} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Retour</Button>
        <Button variant="danger" size="sm" onClick={submit} disabled={reject.isPending}>Enregistrer le rejet</Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ traitement d'un montant rejeté
const RESOLUTION_COPY: Record<RejectionResolution, { title: string; text: (amount: string) => string; button: string; variant: string }> = {
  REFILED: {
    title: 'Redéposer le dossier',
    text: (a) => `Un nouveau dossier « À déposer » de ${a} est créé sur la même facture. Le dossier rejeté est conservé dans l'historique.`,
    button: 'Créer le nouveau dossier', variant: 'primary',
  },
  TRANSFERRED_TO_PATIENT: {
    title: 'Mettre à la charge du patient',
    text: (a) => `${a} deviennent dus par le patient sur la même facture (Débiteurs). Aucun paiement n'est créé.`,
    button: 'Mettre à la charge du patient', variant: 'danger',
  },
  WAIVED: {
    title: 'Abandonner / exonérer',
    text: (a) => `${a} ne seront réclamés ni à l'organisme ni au patient. Ce montant ne sera jamais compté comme encaissé.`,
    button: "Confirmer l'abandon", variant: 'danger',
  },
};

export function ResolveModal({ action, onClose }: { action: { claim: Claim; resolution: RejectionResolution } | null; onClose: () => void }) {
  const resolve = useResolveRejection();
  const { showToast } = useFacturationStore();
  const { data: organizations = [] } = useOrganizationsQuery();
  const coveragesQ = usePatientCoveragesQuery(action?.resolution === 'REFILED' ? action.claim.patientId : null);
  const [note, setNote] = useState('');
  const [coverageId, setCoverageId] = useState('');
  const [error, setError] = useState('');
  const usable = useMemo(() => (coveragesQ.data || []).filter(c => isCoverageUsable(c)), [coveragesQ.data]);

  useEffect(() => { setNote(''); setError(''); setCoverageId(''); }, [action?.claim.id, action?.resolution]);
  useEffect(() => {
    if (!action || coverageId || usable.length === 0) return;
    setCoverageId((usable.find(c => c.id === action.claim.coverageId) || usable[0]).id);
  }, [usable, coverageId, action]);

  if (!action) return null;
  const { claim, resolution } = action;
  const copy = RESOLUTION_COPY[resolution];
  const orgName = (id: string | null) => organizations.find(o => o.id === id)?.name || '—';

  const submit = async () => {
    if (resolution === 'WAIVED' && !note.trim()) return setError("Indiquez le motif de l'abandon.");
    if (resolution === 'REFILED' && !coverageId) return setError('Choisissez la couverture du patient.');
    try {
      await resolve.mutateAsync({ id: claim.id, resolution, note, coverageId });
      showToast({ REFILED: 'Nouveau dossier créé, à déposer.', TRANSFERRED_TO_PATIENT: 'Montant mis à la charge du patient.', WAIVED: 'Montant abandonné.' }[resolution]);
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open onClose={onClose} title={copy.title} description={`${claim.patientNom} · ${claim.organizationName} · rejeté ${dh(claim.rejected, true)}`} width="max-w-md">
      <div className="space-y-3">
        {claim.rejectionReason && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Motif du rejet : {claim.rejectionReason}</p>}
        <p className="text-sm text-slate-600">{copy.text(dh(claim.rejected, true))}</p>
        {resolution === 'REFILED' && (
          usable.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Ce patient n'a plus de couverture active : renseignez-la dans son dossier.</p>
          ) : (
            <div>
              <label className={labelCls}>Couverture</label>
              <Select value={coverageId} onChange={setCoverageId}
                options={usable.map(c => ({ value: c.id, label: `${COVERAGE_TYPE_LABEL[c.type]} · ${orgName(c.organizationId)}${c.membershipNumber ? ` · N° ${c.membershipNumber}` : ''}` }))} />
            </div>
          )
        )}
        <div>
          <label className={labelCls}>{resolution === 'WAIVED' ? "Motif de l'abandon" : 'Note (optionnel)'}</label>
          <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <FormError message={error} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Retour</Button>
        <Button variant={copy.variant} size="sm" onClick={submit} disabled={resolve.isPending}>{copy.button}</Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ lifecycle moves without money
const STATUS_ACTION: Record<string, { title: string; to: ClaimStatus; withReference?: boolean; confirm: string; toast: string; variant: string; text?: string }> = {
  ready: { title: 'Marquer prêt à déposer', to: 'READY', confirm: 'Confirmer', toast: 'Dossier prêt à déposer.', variant: 'primary' },
  draft: { title: 'Repasser en brouillon', to: 'DRAFT', confirm: 'Confirmer', toast: 'Dossier repassé en brouillon.', variant: 'primary' },
  submit: { title: 'Marquer comme déposé', to: 'SUBMITTED', withReference: true, confirm: 'Confirmer le dépôt', toast: 'Dossier marqué comme déposé.', variant: 'primary' },
  processing: { title: 'Marquer en cours de traitement', to: 'PROCESSING', confirm: 'Confirmer', toast: 'Dossier marqué en cours.', variant: 'primary' },
  cancel: {
    title: 'Annuler le dossier', to: 'CANCELLED', confirm: 'Annuler le dossier', toast: 'Dossier annulé.', variant: 'danger',
    text: "La part de l'organisme redevient due par le patient sur la facture. Cette action ne peut pas être annulée.",
  },
};
export type StatusActionKind = keyof typeof STATUS_ACTION;

export function StatusModal({ action, onClose }: { action: { kind: StatusActionKind; claim: Claim } | null; onClose: () => void }) {
  const status = useClaimStatus();
  const { showToast } = useFacturationStore();
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (action) { setReference(action.claim.externalReference); setError(''); } }, [action?.claim.id, action?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!action) return null;
  const meta = STATUS_ACTION[action.kind];

  const submit = async () => {
    try {
      await status.mutateAsync({ id: action.claim.id, status: meta.to, reference });
      showToast(meta.toast);
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open onClose={onClose} title={meta.title} description={`${action.claim.patientNom} · ${action.claim.organizationName} · ${dh(action.claim.claimed, true)}`} width="max-w-md">
      <div className="space-y-3">
        {meta.text && <p className="text-sm text-slate-600">{meta.text}</p>}
        {meta.withReference && (
          <div>
            <label className={labelCls}>N° de dossier / bordereau (optionnel)</label>
            <input className={inputCls} value={reference} onChange={e => setReference(e.target.value)} />
          </div>
        )}
        <FormError message={error} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Retour</Button>
        <Button variant={meta.variant} size="sm" onClick={submit} disabled={status.isPending}>{meta.confirm}</Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ dossier detail
export type ClaimAction =
  | { type: 'status'; kind: StatusActionKind }
  | { type: 'settle' }
  | { type: 'reject' }
  | { type: 'resolve'; resolution: RejectionResolution };

// What can be done on a claim, in display order (the server enforces the same rules).
export function claimActions(c: Claim): Array<{ action: ClaimAction; label: string; variant: string }> {
  const out: Array<{ action: ClaimAction; label: string; variant: string }> = [];
  if (canReceiveSettlement(c)) out.push({ action: { type: 'settle' }, label: 'Enregistrer un règlement', variant: 'success' });
  if (c.status === 'DRAFT') out.push({ action: { type: 'status', kind: 'ready' }, label: 'Prêt à déposer', variant: 'accentOutline' });
  if (c.status === 'READY') out.push({ action: { type: 'status', kind: 'submit' }, label: 'Déposer', variant: 'accentOutline' });
  if (c.status === 'SUBMITTED') out.push({ action: { type: 'status', kind: 'processing' }, label: 'En cours', variant: 'secondary' });
  if (canReceiveSettlement(c)) out.push({ action: { type: 'reject' }, label: 'Rejet', variant: 'secondary' });
  if (unresolvedRejected(c) > 0) {
    out.push({ action: { type: 'resolve', resolution: 'REFILED' }, label: 'Redéposer le dossier', variant: 'accentOutline' });
    out.push({ action: { type: 'resolve', resolution: 'TRANSFERRED_TO_PATIENT' }, label: 'Mettre à la charge du patient', variant: 'secondary' });
    out.push({ action: { type: 'resolve', resolution: 'WAIVED' }, label: 'Abandonner / exonérer', variant: 'secondary' });
  }
  if (c.status === 'READY') out.push({ action: { type: 'status', kind: 'draft' }, label: 'Brouillon', variant: 'ghost' });
  if (['DRAFT', 'READY', 'SUBMITTED', 'PROCESSING'].includes(c.status) && c.received === 0 && c.rejected === 0) {
    out.push({ action: { type: 'status', kind: 'cancel' }, label: 'Annuler', variant: 'ghost' });
  }
  return out;
}

export function ResolutionBadge({ claim }: { claim: Claim }) {
  if (claim.resolution) {
    return <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{RESOLUTION_LABEL[claim.resolution]}</span>;
  }
  if (unresolvedRejected(claim) > 0) {
    return <span className="inline-flex whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Rejet à traiter</span>;
  }
  return null;
}

export function ClaimDetailModal({ claim, claims, settlements, canEdit, onAction, onOpenClaim, onClose }: {
  claim: Claim | null; claims: Claim[]; settlements: Settlement[]; canEdit: boolean;
  onAction: (claim: Claim, action: ClaimAction) => void; onOpenClaim: (id: string) => void; onClose: () => void;
}) {
  if (!claim) return null;
  const history = settlements.filter(s => s.claimId === claim.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const previous = claim.previousClaimId ? claims.find(c => c.id === claim.previousClaimId) : null;
  const next = claims.find(c => c.previousClaimId === claim.id);
  const actions = canEdit ? claimActions(claim) : [];

  return (
    <Modal open onClose={onClose} title={`Dossier ${numeroFacture(claim.invoiceId)}`}
      description={`${claim.patientNom} · ${claim.organizationName}${claim.membershipNumber ? ` · N° ${claim.membershipNumber}` : ''}`} width="max-w-xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <ClaimBadge status={claim.status} />
          <ResolutionBadge claim={claim} />
          {claim.externalReference && <span className="text-xs text-slate-500">Réf. dépôt {claim.externalReference}</span>}
        </div>
        <ClaimFigures claim={claim} />

        {claim.rejected > 0 && (
          <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-sm">
            <p className="font-semibold text-red-700">Rejeté : {dh(claim.rejected, true)}</p>
            {claim.rejectionReason && <p className="text-red-700">Motif : {claim.rejectionReason}</p>}
            {claim.resolution && (
              <p className="mt-1 text-slate-600">
                {RESOLUTION_LABEL[claim.resolution]}{claim.resolvedAt ? ` le ${fmtDate(claim.resolvedAt)}` : ''}{claim.resolution !== 'REFILED' && claim.resolutionNote ? ` · ${claim.resolutionNote}` : ''}
              </p>
            )}
          </div>
        )}

        {(previous || next) && (
          <div className="space-y-1 text-sm">
            {previous && (
              <p className="text-slate-600">Redépôt du dossier rejeté du {fmtDate(previous.createdAt)}{previous.rejectionReason ? ` (motif : ${previous.rejectionReason})` : ''}.{' '}
                <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => onOpenClaim(previous.id)}>Voir</button></p>
            )}
            {next && (
              <p className="text-slate-600">Redéposé le {fmtDate(next.createdAt)} : <ClaimBadge status={next.status} />{' '}
                <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => onOpenClaim(next.id)}>Voir</button></p>
            )}
          </div>
        )}

        <section>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Règlements reçus</p>
          {history.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">Aucun règlement reçu pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-slate-700">
                    {fmtDate(s.receivedAt)} <span className="text-slate-400">· {SETTLEMENT_METHOD_LABEL[s.method]}{s.reference ? ` · ${s.reference}` : ''}</span>
                    {s.notes && <span className="block text-xs text-slate-400">{s.notes}</span>}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{dh(s.amount, true)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {actions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            {actions.map(a => (
              <Button key={a.label} variant={a.variant} size="sm" onClick={() => onAction(claim, a.action)}>{a.label}</Button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Renders whichever dialog an action opened.
export function ClaimActionDialogs({ current, onClose }: { current: { claim: Claim; action: ClaimAction } | null; onClose: () => void }) {
  const a = current?.action;
  return (
    <>
      <SettlementModal claim={a?.type === 'settle' ? current!.claim : null} onClose={onClose} />
      <RejectModal claim={a?.type === 'reject' ? current!.claim : null} onClose={onClose} />
      <ResolveModal action={a?.type === 'resolve' ? { claim: current!.claim, resolution: a.resolution } : null} onClose={onClose} />
      <StatusModal action={a?.type === 'status' ? { kind: a.kind, claim: current!.claim } : null} onClose={onClose} />
    </>
  );
}
