import { dh, fmtDate } from './format';
import { cn } from '../../lib/utils';
import { AMOUNT_ORIGIN_LABEL, useClaimLinesQuery } from './tiersPayant';
import type { AmountOrigin, Claim, LineCalculation } from './tiersPayant';

// What the rules engine answered for a line. Without a verified rule it says so ("Calcul
// automatique indisponible" + the reason) and shows no figure; with one, every step and its source.
// Either way it is an explanation of the recorded rules, not a guarantee of reimbursement.
export function CalculationExplanation({ calc, className }: { calc: LineCalculation; className?: string }) {
  if (calc.status !== 'CALCULATED') {
    return (
      <div className={cn('rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px]', className)}>
        <p className="font-semibold text-slate-800">
          Calcul automatique indisponible{calc.status === 'CONFLICT' ? ' (règles en conflit)' : ''}
        </p>
        {calc.reason && <p className="mt-0.5 text-slate-600">{calc.reason}</p>}
      </div>
    );
  }
  const source = calc.sources[calc.sources.length - 1];
  const rows: Array<[string, string]> = [
    ['Acte', calc.actLabel || '—'],
    ['Honoraires', dh(calc.billed, true)],
    ['TNR', calc.tnr === null ? '—' : dh(calc.tnr, true)],
    ['Base de remboursement', calc.basis === null ? '—' : dh(calc.basis, true)],
    ['Part organisme', dh(calc.organism ?? 0, true)],
    ['Part patient', dh(calc.patient ?? 0, true)],
    ['Règle', calc.ruleKey ? `${calc.ruleKey} · version ${calc.ruleVersion}` : '—'],
    ['Source', source ? `${source.title} (${source.issuingBody}${source.version ? `, ${source.version}` : ''})` : '—'],
    ["Date d'effet", calc.ruleEffectiveFrom ? fmtDate(calc.ruleEffectiveFrom) : '—'],
  ];
  return (
    <div className={cn('rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]', className)}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11.5px] text-slate-500">
        Calcul selon les règles enregistrées{calc.dateOfCare ? ` à la date des soins (${fmtDate(calc.dateOfCare)})` : ''}. Ce n'est pas une garantie de remboursement.
      </p>
    </div>
  );
}

export function AmountOriginTag({ origin }: { origin: AmountOrigin }) {
  const manual = origin !== 'CALCULATED';
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
      manual ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700')}>
      {origin === 'CALCULATED' ? 'Calculé' : origin === 'REFILE' ? 'Redépôt' : 'Manuel'}
    </span>
  );
}

// "Origine du montant" in the claim detail: each line, how its amount was obtained, and what the
// engine said at the time (read from the immutable snapshot, not from today's rules).
export function ClaimAmountOrigin({ claim }: { claim: Claim }) {
  const { data: lines = [], isLoading } = useClaimLinesQuery(claim.id);
  return (
    <section>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Origine du montant</p>
      {isLoading ? (
        <p className="py-2 text-sm text-slate-400">Chargement…</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-slate-600">
          {claim.amountOrigin === 'REFILE'
            ? AMOUNT_ORIGIN_LABEL.REFILE + ' redéposé.'
            : `${AMOUNT_ORIGIN_LABEL.LEGACY}, sans détail par acte.`}
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map(l => (
            <li key={l.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-800">{l.label}<span className="text-slate-400"> · facturé {dh(l.billed, true)}</span></span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{dh(l.organism, true)}</span>
              </div>
              {l.amountSource === 'MANUAL' ? (
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Montant saisi manuellement</span> le {fmtDate(l.enteredAt)} · {l.manualReason}
                </p>
              ) : (
                <p className="mt-0.5 text-xs font-semibold text-blue-700">Montant calculé</p>
              )}
              {l.calculation && <CalculationExplanation calc={l.calculation} className="mt-2" />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
