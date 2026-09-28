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
  BENEFICIARY_LABEL, COVERAGE_TYPE_LABEL, MISSING_CONTEXT_LABEL, isCoverageUsable, useClaimsQuery, useCreateClaim,
  useInsuranceContext, useLinesCalculation, useOrganizationsQuery, usePatientCoveragesQuery,
} from './tiersPayant';
import type { InsuranceAct, LineCalculation } from './tiersPayant';
import { fmtDate } from './format';
import { ClaimLinesEditor, newLine, resolveLine } from './ClaimLinesEditor';
import type { DraftLine } from './ClaimLinesEditor';

const inputCls = 'h-[44px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500';
const round2 = (n: number) => Math.round(n * 100) / 100;

// An invoice can take a (further) organism claim while it is open, linked to its visit and the
// patient still owes something on it. Several organisms can share one invoice (AMO + complementary);
// the database refuses a total above the invoice.
export const isClaimEligible = (f: Facture) =>
  Boolean(f.visitId) && f.statut !== 'payee' && factureReste(f) > 0;

// Opens a tiers-payant dossier FROM an invoice: the invoice switches to tiers payant, the organism's
// share becomes a receivable, the patient keeps only their share. A dossier always has a real
// invoice (and its visit), the patient's coverage and that coverage's organization, and one line
// per medical act presented. Each line is sent to the rules engine: it only answers with an amount
// from a verified rule (none exist yet), so the organism's share of a line is normally typed by the
// user, with a reason, and recorded as "Montant saisi manuellement".
export function CreateClaimModal({ open, onClose, facture: fixedFacture }: { open: boolean; onClose: () => void; facture?: Facture | null }) {
  const { data: factures = [] } = useFacturesQuery();
  const { data: claims = [] } = useClaimsQuery();
  const { data: organizations = [] } = useOrganizationsQuery();
  const create = useCreateClaim();
  const { showToast } = useFacturationStore();

  const [factureId, setFactureId] = useState('');
  const [coverageId, setCoverageId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const eligible = useMemo(() => factures.filter(isClaimEligible), [factures]);
  const facture = fixedFacture ?? eligible.find(f => f.id === factureId) ?? null;
  // claims already on this invoice: one original dossier per organism
  const existing = useMemo(() => claims.filter(c => c.invoiceId === facture?.id && c.status !== 'CANCELLED'), [claims, facture?.id]);
  const claimedOrgs = new Set(existing.filter(c => !c.previousClaimId).map(c => c.organizationId));

  const coveragesQ = usePatientCoveragesQuery(facture?.patientId);
  const active = (coveragesQ.data || []).filter(c => isCoverageUsable(c));
  const usable = active.filter(c => !claimedOrgs.has(c.organizationId as string));
  const orgName = (id: string | null) => organizations.find(o => o.id === id)?.name || '—';
  const coverage = usable.find(c => c.id === coverageId) || null;

  useEffect(() => {
    if (!open) return;
    setFactureId(''); setCoverageId(''); setLines([]); setShowErrors(false); setNotes(''); setError('');
  }, [open]);
  // A single usable coverage is the obvious choice (prefer AMO when there are several).
  useEffect(() => {
    if (coverageId || usable.length === 0) return;
    setCoverageId((usable.find(c => c.type === 'AMO') || usable[0]).id);
  }, [usable, coverageId]);

  const reste = facture ? factureReste(facture) : 0;
  const contextQ = useInsuranceContext(facture?.id, coverage?.id);

  // every line with usable figures goes to the engine (server-side, date of care = the visit's day)
  const calcable = lines.filter(l => Number(String(l.billed).replace(',', '.')) > 0 && Number.isInteger(Number(l.quantity)) && Number(l.quantity) >= 1);
  const calcQ = useLinesCalculation(facture?.id, coverage?.id, calcable.map(l => {
    const r = resolveLine(l, undefined).input;
    return { actId: r.actId, label: r.label || 'Acte', quantity: r.quantity, billed: r.billed };
  }));
  const calcs: Record<string, LineCalculation | undefined> = {};
  calcable.forEach((l, i) => { calcs[l.key] = calcQ.data?.[i]; });
  const resolved = lines.map(l => resolveLine(l, calcs[l.key]));
  const billedTotal = round2(resolved.reduce((s, r) => s + (r.billed > 0 ? r.billed : 0), 0));
  const organismTotal = round2(resolved.reduce((s, r) => s + (Number.isFinite(r.organism) ? r.organism : 0), 0));

  const addLine = (kind: DraftLine['kind'], act?: InsuranceAct) => {
    if (!facture) return;
    // default fee: what the invoice still has not attributed to a line
    setLines(ls => [...ls, newLine(kind, round2(Math.max(0, facture.montant - ls.reduce((s, l) => s + (Number(String(l.billed).replace(',', '.')) || 0), 0))), act ?? null)]);
  };
  const changeLine = (key: string, patch: Partial<DraftLine>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines(ls => ls.filter(l => l.key !== key));

  const submit = async (status: 'DRAFT' | 'READY') => {
    if (!facture) return setError('Choisissez une facture.');
    if (!coverage) return setError('Choisissez la couverture du patient.');
    if (lines.length === 0) return setError('Ajoutez au moins un acte.');
    setShowErrors(true);
    if (resolved.some(r => r.error)) return setError('Complétez les lignes signalées.');
    if (billedTotal > facture.montant) return setError(`Les honoraires des lignes dépassent le total de la facture (${dh(facture.montant, true)}).`);
    if (!(organismTotal > 0)) return setError("La part prise en charge par l'organisme doit être positive.");
    if (organismTotal > reste) return setError(`La part organisme dépasse le reste à payer (${dh(reste, true)}).`);
    try {
      await create.mutateAsync({ invoiceId: facture.id, coverageId: coverage.id, lines: resolved.map(r => r.input), status, notes });
      showToast(status === 'READY'
        ? `Dossier créé : ${dh(organismTotal)} attendus de ${orgName(coverage.organizationId)}.`
        : 'Dossier enregistré en brouillon.');
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  const noInvoice = !fixedFacture && eligible.length === 0;
  const fixedIneligible = fixedFacture && !isClaimEligible(fixedFacture);

  return (
    <Modal open={open} onClose={onClose} title="Créer un dossier en tiers payant"
      description="L'organisme règle sa part directement au cabinet ; le patient ne paie que le reste." width="max-w-2xl">
      {noInvoice ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          Aucune facture ouverte à passer en tiers payant. Un dossier se crée à partir d'une facture liée à une consultation.
        </p>
      ) : fixedIneligible ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          Plus rien à répartir sur cette facture : elle est déjà réglée ou entièrement couverte.
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
              <Select value={factureId} onChange={(v: string) => { setFactureId(v); setCoverageId(''); setLines([]); setShowErrors(false); setError(''); }}
                placeholder="Choisir une facture…"
                options={eligible.map(f => ({ value: f.id, label: `${f.patientNom} · ${f.numero} · reste ${dh(factureReste(f))}` }))} />
            </div>
          )}

          {facture && existing.length > 0 && (
            <p className="text-xs text-slate-500">
              Déjà en tiers payant : {existing.map(c => `${c.organizationName} ${dh(c.claimed)}`).join(' · ')}
            </p>
          )}

          {facture && (
            coveragesQ.isLoading ? (
              <p className="text-sm text-slate-400">Chargement de la couverture…</p>
            ) : usable.length === 0 && active.length > 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">Chaque couverture active du patient a déjà un dossier sur cette facture.</p>
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
                {coverage && contextQ.data && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
                    <p>Date des soins : <span className="font-semibold text-slate-800">{fmtDate(contextQ.data.dateOfCare)}</span>
                      {contextQ.data.schemeCode ? <> · Régime <span className="font-mono font-semibold text-slate-800">{contextQ.data.schemeCode}</span></> : null}</p>
                    {contextQ.data.missing.length > 0 && (
                      <p className="mt-0.5">Contexte d'assurance incomplet : {contextQ.data.missing.map(m => MISSING_CONTEXT_LABEL[m] || m).join(' · ')}.
                        Le calcul automatique reste indisponible.</p>
                    )}
                  </div>
                )}
                {coverage && (
                  <ClaimLinesEditor invoiceId={facture.id} lines={lines} calcs={calcs} showErrors={showErrors}
                    onAdd={addLine} onChange={changeLine} onRemove={removeLine} />
                )}
                {calcQ.isError && (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">Calcul automatique indisponible : {(calcQ.error as Error).message}</p>
                )}
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                  <div><p className="text-[11px] font-semibold uppercase text-slate-400">Facture</p><p className="text-sm font-bold text-slate-900">{dh(facture.montant)}</p></div>
                  <div><p className="text-[11px] font-semibold uppercase text-slate-400">Ce dossier</p><p className="text-sm font-bold text-blue-700">{dh(organismTotal, true)}</p>
                    <p className="text-[11px] text-slate-500">{lines.length} ligne{lines.length > 1 ? 's' : ''} · honoraires {dh(billedTotal, true)}</p></div>
                  <div><p className="text-[11px] font-semibold uppercase text-slate-400">Part patient</p><p className="text-sm font-bold text-slate-900">{dh(round2(facture.montant - (facture.partOrganisme || 0) - organismTotal), true)}</p></div>
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
