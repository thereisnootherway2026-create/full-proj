import Button from '../common/Button';
import { dh } from './format';
import { factureReste } from './data';
import type { Facture } from './data';
import { cn } from '../../lib/utils';
import { ClaimBadge } from './ClaimDialogs';
import type { ClaimAction } from './ClaimDialogs';
import {
  COVERAGE_TYPE_LABEL, canReceiveSettlement, claimOutstanding, isCoverageUsable, unresolvedRejected,
  useClaimsQuery, useOrganizationsQuery, usePatientCoveragesQuery,
} from './tiersPayant';
import type { Claim } from './tiersPayant';

const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-slate-400';

// "Assurance" block of the invoice detail: who pays what on this invoice, where each organism
// dossier stands, and the next action. Compact on purpose: the full history is in the dossier.
export function InvoiceInsurance({ facture, canEdit, onOpenClaim, onAction, onCreateClaim }: {
  facture: Facture;
  canEdit: boolean;
  onOpenClaim: (claimId: string) => void;
  onAction: (claim: Claim, action: ClaimAction) => void;
  onCreateClaim: () => void;
}) {
  const { data: claims = [] } = useClaimsQuery();
  const { data: organizations = [] } = useOrganizationsQuery();
  const { data: coverages = [] } = usePatientCoveragesQuery(facture.patientId);

  const mine = claims.filter(c => c.invoiceId === facture.id && c.status !== 'CANCELLED')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const active = coverages.filter(c => isCoverageUsable(c));
  const orgName = (id: string | null) => organizations.find(o => o.id === id)?.name || '—';
  const partOrganisme = facture.partOrganisme || 0;
  const partPatient = facture.montant - partOrganisme;
  const canAddClaim = canEdit && Boolean(facture.visitId) && factureReste(facture) > 0 && active.length > 0;

  return (
    <section>
      <p className={cn(LABEL, 'mb-1.5')}>Assurance</p>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 px-3 py-2 text-center">
        <div><p className="text-[11px] text-slate-400">Total facture</p><p className="text-[13.5px] font-bold tabular-nums text-slate-900">{dh(facture.montant)}</p></div>
        <div><p className="text-[11px] text-slate-400">Part patient</p><p className="text-[13.5px] font-bold tabular-nums text-slate-900">{dh(partPatient)}</p></div>
        <div><p className="text-[11px] text-slate-400">Part organisme{mine.length > 1 ? 's' : ''}</p><p className="text-[13.5px] font-bold tabular-nums text-blue-700">{dh(partOrganisme)}</p></div>
      </div>

      {mine.length === 0 ? (
        <p className="mt-2 text-[13px] text-slate-500">
          {active.length === 0 ? 'Aucune couverture active.'
            : `Couverture : ${active.map(c => `${COVERAGE_TYPE_LABEL[c.type]} · ${orgName(c.organizationId)}`).join(' + ')}. Le patient paie la totalité.`}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {mine.map(c => {
            const refused = unresolvedRejected(c);
            const next = canEdit ? nextAction(c) : null;
            return (
              <li key={c.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => onOpenClaim(c.id)} className="min-w-0 text-left">
                    <span className="text-[13px] font-semibold text-slate-900">
                      {c.coverageType ? `${COVERAGE_TYPE_LABEL[c.coverageType]} · ` : ''}{c.organizationName}
                    </span>
                    {c.previousClaimId && <span className="ml-1 text-[11px] text-slate-400">(redépôt)</span>}
                  </button>
                  <ClaimBadge status={c.status} />
                </div>
                <p className="mt-0.5 text-[12.5px] tabular-nums text-slate-500">
                  Demandé {dh(c.claimed)} · Reçu <span className="text-emerald-600">{dh(c.received)}</span> · Reste <span className="font-semibold text-slate-800">{dh(claimOutstanding(c))}</span>
                </p>
                {(refused > 0 || next) && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    {refused > 0 ? <span className="text-[12.5px] font-semibold text-red-700">Rejet à traiter : {dh(refused)}</span> : <span />}
                    <div className="flex gap-1.5">
                      {refused > 0 && canEdit && c.rejections.filter(r => !r.resolution).length === 1 && (
                        <Button variant="accentOutline" size="xs"
                          onClick={() => onAction(c, { type: 'resolve', resolution: 'REFILED', rejection: c.rejections.find(r => !r.resolution)! })}>Redéposer</Button>
                      )}
                      {refused > 0 && canEdit && <Button variant="secondary" size="xs" onClick={() => onOpenClaim(c.id)}>Traiter le rejet</Button>}
                      {next && <Button variant={next.variant} size="xs" onClick={() => onAction(c, next.action)}>{next.label}</Button>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canAddClaim && (
        <div className="mt-2 flex justify-end">
          <Button variant="secondary" size="xs" onClick={onCreateClaim}>
            {facture.modePaiement === 'PATIENT' ? 'Passer en tiers payant' : 'Créer un dossier'}
          </Button>
        </div>
      )}
    </section>
  );
}

// The one obvious next step on a dossier, shown inline on the invoice.
function nextAction(c: Claim): { action: ClaimAction; label: string; variant: string } | null {
  if (canReceiveSettlement(c)) return { action: { type: 'settle' }, label: 'Enregistrer un règlement', variant: 'success' };
  if (c.status === 'READY') return { action: { type: 'status', kind: 'submit' }, label: 'Déposer', variant: 'accentOutline' };
  if (c.status === 'DRAFT') return { action: { type: 'status', kind: 'ready' }, label: 'Prêt à déposer', variant: 'accentOutline' };
  return null;
}
