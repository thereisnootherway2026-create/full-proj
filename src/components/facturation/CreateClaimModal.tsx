import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Select from '../common/Select';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { dh } from './format';
import { factureReste } from './data';
import type { Facture } from './data';
import {
  BENEFICIARY_LABEL, COVERAGE_TYPE_LABEL, isCoverageUsable, useClaimsQuery, useCreateClaim,
  useOrganizationsQuery, usePatientCoveragesQuery,
} from './tiersPayant';

const inputCls = 'h-[44px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500';
const parseAmount = (s: string) => Number(String(s).replace(/\s/g, '').replace(',', '.'));

// An invoice can go into tiers payant while it is open, linked to its visit, has something the
// patient has not paid yet, and carries no live dossier.
export const isClaimEligible = (f: Facture, liveClaimInvoiceIds: Set<string>) =>
  Boolean(f.visitId) && f.statut !== 'payee' && factureReste(f) > 0 && !liveClaimInvoiceIds.has(f.id);

// Opens a tiers-payant dossier FROM an invoice: the invoice switches to tiers payant, the organism's
// share becomes a receivable, the patient keeps only their share. A dossier always has a real
// invoice (and its visit), the patient's coverage and that coverage's organization. The organism's
// share is typed by the user from the applicable rules; nothing is computed from a percentage.
export function CreateClaimModal({ open, onClose, facture: fixedFacture }: { open: boolean; onClose: () => void; facture?: Facture | null }) {
  const { data: factures = [] } = useFacturesQuery();
  const { data: claims = [] } = useClaimsQuery();
  const { data: organizations = [] } = useOrganizationsQuery();
  const create = useCreateClaim();
  const { showToast } = useFacturationStore();

  const [factureId, setFactureId] = useState('');
  const [coverageId, setCoverageId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const liveInvoiceIds = useMemo(() => new Set(claims.filter(c => c.status !== 'CANCELLED').map(c => c.invoiceId)), [claims]);
  const eligible = useMemo(() => factures.filter(f => isClaimEligible(f, liveInvoiceIds)), [factures, liveInvoiceIds]);
  const facture = fixedFacture ?? eligible.find(f => f.id === factureId) ?? null;

  const coveragesQ = usePatientCoveragesQuery(facture?.patientId);
  const usable = (coveragesQ.data || []).filter(c => isCoverageUsable(c));
  const orgName = (id: string | null) => organizations.find(o => o.id === id)?.name || '—';
  const coverage = usable.find(c => c.id === coverageId) || null;

  useEffect(() => {
    if (!open) return;
    setFactureId(''); setCoverageId(''); setAmount(''); setNotes(''); setError('');
  }, [open]);
  // A single usable coverage is the obvious choice (prefer AMO when there are several).
  useEffect(() => {
    if (coverageId || usable.length === 0) return;
    setCoverageId((usable.find(c => c.type === 'AMO') || usable[0]).id);
  }, [usable, coverageId]);

  const reste = facture ? factureReste(facture) : 0;
  const value = parseAmount(amount);
  const validAmount = Number.isFinite(value) && value > 0 && value <= reste;

  const submit = async (status: 'DRAFT' | 'READY') => {
    if (!facture) return setError('Choisissez une facture.');
    if (!coverage) return setError('Choisissez la couverture du patient.');
    if (!validAmount) return setError(value > reste ? `La part organisme dépasse le reste à payer (${dh(reste, true)}).` : "Saisissez la part prise en charge par l'organisme.");
    try {
      await create.mutateAsync({ invoiceId: facture.id, coverageId: coverage.id, amount: value, status, notes });
      showToast(status === 'READY'
        ? `Dossier créé : ${dh(value)} attendus de ${orgName(coverage.organizationId)}.`
        : 'Dossier enregistré en brouillon.');
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  const noInvoice = !fixedFacture && eligible.length === 0;
  const fixedIneligible = fixedFacture && !isClaimEligible(fixedFacture, liveInvoiceIds);

  return (
    <Modal open={open} onClose={onClose} title="Créer un dossier en tiers payant"
      description="L'organisme règle sa part directement au cabinet ; le patient ne paie que le reste." width="max-w-lg">
      {noInvoice ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          Aucune facture ouverte à passer en tiers payant. Un dossier se crée à partir d'une facture liée à une consultation.
        </p>
      ) : fixedIneligible ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          Cette facture ne peut plus passer en tiers payant (déjà réglée par le patient ou dossier existant).
        </p>
      ) : (
        <div className="space-y-4">
          {fixedFacture ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm">
              <p className="font-semibold text-slate-900">{fixedFacture.patientNom}</p>
              <p className="text-slate-500">{fixedFacture.numero} · reste à payer {dh(reste, true)}</p>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Facture</label>
              <Select value={factureId} onChange={(v: string) => { setFactureId(v); setCoverageId(''); setAmount(''); setError(''); }}
                placeholder="Choisir une facture…"
                options={eligible.map(f => ({ value: f.id, label: `${f.patientNom} · ${f.numero} · reste ${dh(factureReste(f))}` }))} />
            </div>
          )}

          {facture && (
            coveragesQ.isLoading ? (
              <p className="text-sm text-slate-400">Chargement de la couverture…</p>
            ) : usable.length === 0 ? (
              <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <p className="font-medium">Ce patient n'a pas de couverture active.</p>
                <p className="mt-0.5">Renseignez sa couverture dans son dossier avant de créer un dossier en tiers payant.</p>
                <Link to={`/patients/${facture.patientId}`} className="mt-1.5 inline-block font-semibold text-amber-900 underline">Ouvrir le dossier patient</Link>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelCls}>Couverture</label>
                  <Select value={coverageId} onChange={setCoverageId}
                    options={usable.map(c => ({
                      value: c.id,
                      label: `${COVERAGE_TYPE_LABEL[c.type]} · ${orgName(c.organizationId)}${c.membershipNumber ? ` · N° ${c.membershipNumber}` : ''}`,
                    }))} />
                  {coverage && <p className="mt-1 text-xs text-slate-500">Bénéficiaire : {BENEFICIARY_LABEL[coverage.beneficiary]}</p>}
                </div>
                <div>
                  <label className={labelCls}>Part prise en charge par l'organisme (DH)</label>
                  <input className={inputCls} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={`0 – ${reste}`} />
                  <p className="mt-1 text-xs text-slate-500">Selon le tarif de référence et les règles de l'organisme pour ces actes.</p>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                  <div><p className="text-[11px] font-semibold uppercase text-slate-400">Facture</p><p className="text-sm font-bold text-slate-900">{dh(facture.montant)}</p></div>
                  <div><p className="text-[11px] font-semibold uppercase text-slate-400">Organisme</p><p className="text-sm font-bold text-blue-700">{dh(validAmount ? value : 0)}</p></div>
                  <div><p className="text-[11px] font-semibold uppercase text-slate-400">Patient</p><p className="text-sm font-bold text-slate-900">{dh(facture.montant - (validAmount ? value : 0))}</p></div>
                </div>
                <div>
                  <label className={labelCls}>Note (optionnel)</label>
                  <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </>
            )
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
        {!noInvoice && !fixedIneligible && (
          <>
            <Button variant="ghost" size="sm" onClick={() => submit('DRAFT')} disabled={create.isPending || !coverage}>Enregistrer en brouillon</Button>
            <Button variant="primary" size="sm" onClick={() => submit('READY')} disabled={create.isPending || !coverage}>Créer le dossier</Button>
          </>
        )}
      </div>
    </Modal>
  );
}
