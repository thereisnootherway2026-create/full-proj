import { useState } from 'react';
import { Shield } from 'lucide-react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Select from '../common/Select';
import { cn } from '../../lib/utils';
import { OrganizationsModal } from '../facturation/OrganizationsModal';
import {
  BENEFICIARY_LABEL, COVERAGE_TYPES, COVERAGE_TYPE_LABEL, useOrganizationsQuery, usePatientCoveragesQuery, useSaveCoverage,
} from '../facturation/tiersPayant';
import type { BeneficiaryType, Coverage, CoverageType } from '../facturation/tiersPayant';

const inputCls = 'h-[44px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500';
const fmtDay = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR') : '');

const EMPTY = {
  type: 'AMO' as CoverageType, organizationId: '', membershipNumber: '', beneficiary: 'ASSURE' as BeneficiaryType,
  validFrom: '', validUntil: '', isActive: true, notes: '',
};

function CoverageModal({ open, onClose, patientId, coverages, readOnly = false }: {
  open: boolean; onClose: () => void; patientId: string; coverages: Coverage[]; readOnly?: boolean;
}) {
  const { data: organizations = [] } = useOrganizationsQuery();
  const save = useSaveCoverage();
  const [editing, setEditing] = useState<Coverage | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [showOrganizations, setShowOrganizations] = useState(false);
  const set = (k: keyof typeof EMPTY, v: any) => setForm(f => ({ ...f, [k]: v }));
  const orgName = (id: string | null) => organizations.find(o => o.id === id)?.name || '—';

  const reset = () => { setEditing(null); setForm(EMPTY); setError(''); };
  const edit = (c: Coverage) => {
    setEditing(c);
    setForm({
      type: c.type, organizationId: c.organizationId || '', membershipNumber: c.membershipNumber, beneficiary: c.beneficiary,
      validFrom: c.validFrom || '', validUntil: c.validUntil || '', isActive: c.isActive, notes: c.notes,
    });
    setError('');
  };

  const submit = async () => {
    if (form.type !== 'NONE' && !form.organizationId) return setError('Choisissez un organisme.');
    if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) return setError('La date de fin doit être postérieure à la date de début.');
    try {
      await save.mutateAsync({
        id: editing?.id, patientId, type: form.type, organizationId: form.type === 'NONE' ? null : form.organizationId,
        membershipNumber: form.membershipNumber, beneficiary: form.type === 'NONE' ? 'UNKNOWN' : form.beneficiary,
        validFrom: form.validFrom || null, validUntil: form.validUntil || null, isActive: form.isActive, notes: form.notes,
      });
      reset();
    } catch (e: any) { setError(e.message); }
  };

  const activeOrganizations = organizations.filter(o => o.isActive || o.id === form.organizationId);

  return (
    <>
      <Modal open={open} onClose={() => { reset(); onClose(); }} title="Couverture du patient"
        description="AMO, complémentaire ou assurance privée" width="max-w-lg">
        <div className="space-y-2">
          {coverages.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Aucune couverture renseignée.</p>}
          {coverages.map(c => (
            <button key={c.id} type="button" onClick={() => !readOnly && edit(c)} disabled={readOnly}
              className={cn('flex w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
                editing?.id === c.id ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200', !c.isActive && 'opacity-60')}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">
                  {COVERAGE_TYPE_LABEL[c.type]}{c.type !== 'NONE' && ` · ${orgName(c.organizationId)}`}
                </span>
                {c.type !== 'NONE' && (
                  <span className="text-xs text-slate-500">
                    {c.membershipNumber ? `N° ${c.membershipNumber} · ` : ''}{BENEFICIARY_LABEL[c.beneficiary]}
                  </span>
                )}
              </span>
              <span className={cn('shrink-0 text-xs font-semibold', c.isActive ? 'text-emerald-600' : 'text-slate-400')}>{c.isActive ? 'Active' : 'Inactive'}</span>
            </button>
          ))}
        </div>

        {!readOnly && (
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-800">{editing ? 'Modifier la couverture' : 'Ajouter une couverture'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <Select value={form.type} onChange={(v: string) => set('type', v)}
                options={COVERAGE_TYPES.map(t => ({ value: t, label: COVERAGE_TYPE_LABEL[t] }))} />
            </div>
            {form.type !== 'NONE' && (
              <div>
                <label className={labelCls}>Organisme</label>
                <Select value={form.organizationId} onChange={(v: string) => set('organizationId', v)} placeholder="Choisir…"
                  emptyText="Aucun organisme enregistré"
                  options={activeOrganizations.map(o => ({ value: o.id, label: o.name }))} />
                <button type="button" onClick={() => setShowOrganizations(true)} className="mt-1 text-xs font-semibold text-blue-600 hover:underline">
                  Gérer les organismes
                </button>
              </div>
            )}
          </div>
          {form.type !== 'NONE' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>N° adhérent / immatriculation</label>
                  <input className={inputCls} value={form.membershipNumber} onChange={e => set('membershipNumber', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Bénéficiaire</label>
                  <Select value={form.beneficiary} onChange={(v: string) => set('beneficiary', v)}
                    options={(Object.keys(BENEFICIARY_LABEL) as BeneficiaryType[]).map(b => ({ value: b, label: BENEFICIARY_LABEL[b] }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Valide du (optionnel)</label>
                  <input type="date" className={inputCls} value={form.validFrom} onChange={e => set('validFrom', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Au (optionnel)</label>
                  <input type="date" className={inputCls} value={form.validUntil} onChange={e => set('validUntil', e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div>
            <label className={labelCls}>Note (optionnel)</label>
            <input className={inputCls} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-600">
            <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Couverture active
          </label>
          {editing && (
            <p className="text-xs text-slate-400">Les dossiers en tiers payant déjà créés conservent la couverture utilisée à leur création.</p>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            {editing && <Button variant="secondary" size="sm" onClick={reset}>Nouvelle</Button>}
            <Button variant="primary" size="sm" onClick={submit} disabled={save.isPending}>{editing ? 'Enregistrer' : 'Ajouter'}</Button>
          </div>
        </div>
        )}
      </Modal>
      <OrganizationsModal open={showOrganizations} onClose={() => setShowOrganizations(false)}
        onSaved={(o) => { if (form.type !== 'NONE') set('organizationId', o.id); }} />
    </>
  );
}

// Patient coverage in the dossier sidebar.
//   full     secretary / admin: every active coverage with its details, and "Modifier la couverture"
//   compact  doctor: a one-line indicator only
export function PatientCoverage({ patientId, mode, canEdit }: { patientId: string; mode: 'full' | 'compact'; canEdit: boolean }) {
  const { data: coverages = [], isLoading } = usePatientCoveragesQuery(patientId);
  const { data: organizations = [] } = useOrganizationsQuery();
  const [open, setOpen] = useState(false);
  const orgName = (id: string | null) => organizations.find(o => o.id === id)?.name || '—';
  const active = coverages.filter(c => c.isActive);
  const covered = active.filter(c => c.type !== 'NONE');
  const declaredNone = active.some(c => c.type === 'NONE');

  const summary = isLoading ? '…'
    : covered.length ? covered.map(c => `${COVERAGE_TYPE_LABEL[c.type]} · ${orgName(c.organizationId)}`).join(' + ')
    : declaredNone ? 'Aucune couverture' : 'Non renseignée';

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
        <Shield size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-slate-500">Couverture</p>
        {mode === 'compact' || covered.length === 0 ? (
          <p className="mt-0.5 text-[14px] font-semibold text-slate-800">{summary}</p>
        ) : (
          <div className="mt-1 space-y-2">
            {covered.map(c => (
              <div key={c.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-slate-800">{COVERAGE_TYPE_LABEL[c.type]}</p>
                  <span className="text-[11px] font-semibold text-emerald-600">Active</span>
                </div>
                <p className="text-[13px] text-slate-700">{orgName(c.organizationId)}</p>
                <p className="text-[12px] text-slate-500">
                  {c.membershipNumber ? `N° ${c.membershipNumber}` : 'N° non renseigné'} · {BENEFICIARY_LABEL[c.beneficiary]}
                </p>
                {(c.validFrom || c.validUntil) && (
                  <p className="text-[12px] text-slate-400">
                    {c.validFrom ? `Du ${fmtDay(c.validFrom)}` : ''}{c.validUntil ? ` au ${fmtDay(c.validUntil)}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {mode === 'full' && canEdit && (
          <button type="button" onClick={() => setOpen(true)} className="mt-1.5 text-[12.5px] font-semibold text-blue-600 hover:underline">
            Modifier la couverture
          </button>
        )}
      </div>
      {mode === 'full' && canEdit && (
        <CoverageModal open={open} onClose={() => setOpen(false)} patientId={patientId} coverages={coverages} />
      )}
    </div>
  );
}

// Coverage chip for the patient identification bar. Doctors get the indicator only; administrative
// users (secretary / admin) open the full coverage details and can edit them from it. Until a
// structured coverage exists, the legacy free-text mutuelle label is still shown.
export function PatientCoverageChip({ patientId, mode, canEdit, legacyLabel }: {
  patientId: string; mode: 'full' | 'compact'; canEdit: boolean; legacyLabel?: string;
}) {
  const { data: coverages = [], isLoading } = usePatientCoveragesQuery(patientId);
  const { data: organizations = [] } = useOrganizationsQuery();
  const [open, setOpen] = useState(false);
  const orgName = (id: string | null) => organizations.find(o => o.id === id)?.name || '—';
  const active = coverages.filter(c => c.isActive);
  const covered = active.filter(c => c.type !== 'NONE');
  const declaredNone = active.some(c => c.type === 'NONE');

  if (isLoading) return null;
  const label = covered.length
    ? covered.map(c => `${c.type === 'AMO' ? 'AMO' : COVERAGE_TYPE_LABEL[c.type]} · ${orgName(c.organizationId)}`).join(' + ')
    : declaredNone ? 'Sans couverture'
    : legacyLabel || (mode === 'full' ? 'Couverture à renseigner' : '');
  if (!label) return null;

  const title = covered.map(c => [
    `${COVERAGE_TYPE_LABEL[c.type]} : ${orgName(c.organizationId)}`,
    c.membershipNumber && `N° ${c.membershipNumber}`,
    BENEFICIARY_LABEL[c.beneficiary],
  ].filter(Boolean).join(' · ')).join('\n') || label;
  const cls = cn(
    'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12.5px] font-semibold',
    covered.length ? 'border-sky-100 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-500',
  );
  const content = (
    <>
      <Shield className={cn('h-3.5 w-3.5', covered.length ? 'text-sky-500' : 'text-slate-400')} />
      <span className="max-w-[220px] truncate">{label}</span>
    </>
  );

  if (mode === 'compact') return <span className={cls} title={title}>{content}</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(cls, 'transition-colors hover:border-sky-300')} title={title}
        aria-label="Voir la couverture du patient">
        {content}
      </button>
      <CoverageModal open={open} onClose={() => setOpen(false)} patientId={patientId} coverages={coverages} readOnly={!canEdit} />
    </>
  );
}
