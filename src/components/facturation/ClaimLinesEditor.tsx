import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import Button from '../common/Button';
import { dh } from './format';
import { cn } from '../../lib/utils';
import { CalculationExplanation } from './InsuranceCalculation';
import { useInsuranceActsSearch } from './tiersPayant';
import type { ClaimLineInput, InsuranceAct, LineCalculation } from './tiersPayant';

const inputCls = 'h-[40px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const parseAmount = (s: string) => (String(s).trim() === '' ? NaN : Number(String(s).replace(/\s/g, '').replace(',', '.')));

// A line being prepared. ACT: an act selected from the verified catalog. MANUAL: no act identified,
// everything typed by the user ("Montant saisi manuellement"). The act is never inferred from text.
export interface DraftLine {
  key: string;
  kind: 'ACT' | 'MANUAL';
  act: InsuranceAct | null;
  label: string;
  quantity: string;
  billed: string;
  organism: string;
  reason: string;
}

// The line as it will be submitted, given the engine's answer for it.
export function resolveLine(l: DraftLine, calc: LineCalculation | undefined) {
  const billed = parseAmount(l.billed);
  const quantity = Number(l.quantity);
  const calculated = l.kind === 'ACT' && calc?.status === 'CALCULATED' ? calc.organism : null;
  const typed = l.organism.trim() !== '';
  const organism = !typed && calculated !== null ? calculated : parseAmount(l.organism);
  const manual = calculated === null || (typed && organism !== calculated);
  const label = l.kind === 'ACT' ? l.label || l.act?.label || '' : l.label.trim();
  const error =
    !label ? 'Libellé requis.'
    : !Number.isInteger(quantity) || quantity < 1 || quantity > 999 ? 'Quantité entre 1 et 999.'
    : !(billed > 0) ? 'Honoraires requis.'
    : !Number.isFinite(organism) || organism < 0 ? (manual ? 'Montant saisi manuellement requis.' : 'Part organisme requise.')
    : organism > billed ? 'La part organisme dépasse les honoraires.'
    : manual && !l.reason.trim() ? 'Motif de la saisie manuelle requis.'
    : null;
  const input: ClaimLineInput = {
    actId: l.kind === 'ACT' ? l.act?.id ?? null : null, label, quantity, billed,
    manualAmount: manual ? organism : null, manualReason: manual ? l.reason.trim() : null,
  };
  return { input, billed, organism, manual, error };
}

export const newLine = (kind: DraftLine['kind'], billed: number, act: InsuranceAct | null = null): DraftLine => ({
  key: Math.random().toString(36).slice(2), kind, act, label: act?.label ?? '', quantity: '1',
  billed: billed > 0 ? String(billed) : '', organism: '', reason: '',
});

// "Actes" of an insurance dossier: each line is one medical act with its own calculation.
export function ClaimLinesEditor({ invoiceId, lines, calcs, onChange, onAdd, onRemove, showErrors }: {
  invoiceId: string;
  lines: DraftLine[];
  calcs: Record<string, LineCalculation | undefined>;
  onChange: (key: string, patch: Partial<DraftLine>) => void;
  onAdd: (kind: DraftLine['kind'], act?: InsuranceAct) => void;
  onRemove: (key: string) => void;
  showErrors: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const acts = useInsuranceActsSearch(invoiceId, query, picking);

  return (
    <section className="space-y-2.5">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Actes</p>
      {lines.length === 0 && !picking && (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">Ajoutez les actes présentés à l'organisme.</p>
      )}

      {lines.map((l, i) => {
        const calc = calcs[l.key];
        const r = resolveLine(l, calc);
        return (
          <div key={l.key} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                {l.kind === 'ACT' ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Acte identifié</p>
                    <p className="text-sm font-semibold text-slate-900">{l.act?.label}
                      <span className="ml-1.5 font-mono text-xs font-medium text-slate-500">{l.act?.nomenclature} {l.act?.code}</span></p>
                  </>
                ) : (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ligne manuelle · aucun acte identifié</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
                  r.manual ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700')}>{r.manual ? 'Manuel' : 'Automatique'}</span>
                <button type="button" onClick={() => onRemove(l.key)} aria-label={`Retirer la ligne ${i + 1}`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={15} /></button>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_90px_130px] gap-2">
              <div>
                <label className={labelCls}>Libellé</label>
                <input className={inputCls} value={l.kind === 'ACT' ? r.input.label : l.label} disabled={l.kind === 'ACT'}
                  onChange={e => onChange(l.key, { label: e.target.value })} placeholder="Ex. : consultation" />
              </div>
              <div>
                <label className={labelCls}>Quantité</label>
                <input className={inputCls} inputMode="numeric" value={l.quantity} onChange={e => onChange(l.key, { quantity: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Honoraires (DH)</label>
                <input className={inputCls} inputMode="decimal" value={l.billed} onChange={e => onChange(l.key, { billed: e.target.value })} />
              </div>
            </div>

            {l.kind === 'ACT' && calc && <CalculationExplanation calc={calc} className="mt-2" />}

            <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2">
              <div>
                <label className={labelCls}>{r.manual ? 'Montant saisi manuellement (DH)' : 'Part organisme (DH)'}</label>
                <input className={inputCls} inputMode="decimal" value={l.organism} onChange={e => onChange(l.key, { organism: e.target.value })}
                  placeholder={!r.manual && Number.isFinite(r.organism) ? String(r.organism) : 'Part organisme'} />
              </div>
              <div>
                <label className={labelCls}>Part patient</label>
                <p className="flex h-[40px] items-center rounded-[10px] bg-slate-50 px-3 text-[14px] font-semibold tabular-nums text-slate-700">
                  {r.billed > 0 && Number.isFinite(r.organism) ? dh(r.billed - r.organism, true) : '—'}
                </p>
              </div>
            </div>
            {r.manual && (
              <div className="mt-2">
                <label className={labelCls}>Motif de la saisie manuelle</label>
                <input className={inputCls} value={l.reason} onChange={e => onChange(l.key, { reason: e.target.value })}
                  placeholder="Ex. : montant indiqué par l'organisme" />
              </div>
            )}
            {showErrors && r.error && <p className="mt-1.5 text-[12.5px] font-medium text-red-700">{r.error}</p>}
          </div>
        );
      })}

      {picking && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3">
          <div className="flex items-center gap-2">
            <input className={inputCls} autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un acte (code ou libellé)…" />
            <Button variant="ghost" size="sm" onClick={() => { setPicking(false); setQuery(''); }}>Fermer</Button>
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto">
            {acts.isLoading ? (
              <p className="px-1 py-2 text-sm text-slate-400">Recherche…</p>
            ) : (acts.data || []).length === 0 ? (
              <p className="px-1 py-2 text-sm text-slate-600">
                {query.trim() ? 'Aucun acte ne correspond à cette recherche.' : "Aucun acte d'assurance n'est disponible."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(acts.data || []).map(a => (
                  <li key={a.id}>
                    <button type="button" onClick={() => { onAdd('ACT', a); setPicking(false); setQuery(''); }}
                      className="flex w-full items-baseline justify-between gap-3 px-1 py-2 text-left text-sm hover:bg-white">
                      <span className="text-slate-800">{a.label}</span>
                      <span className="shrink-0 font-mono text-xs text-slate-500">{a.nomenclature} {a.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!picking && <Button variant="secondary" size="sm" onClick={() => setPicking(true)}><Plus size={14} className="mr-1" />Ajouter un acte</Button>}
        <Button variant="ghost" size="sm" onClick={() => onAdd('MANUAL')}>Ajouter manuellement</Button>
      </div>
    </section>
  );
}
