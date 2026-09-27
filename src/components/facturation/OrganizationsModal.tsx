import { useState } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Select from '../common/Select';
import { cn } from '../../lib/utils';
import { ORGANIZATION_TYPES, ORGANIZATION_TYPE_LABEL, useOrganizationsQuery, useSaveOrganization } from './tiersPayant';
import type { Organization, OrganizationType } from './tiersPayant';

const inputCls = 'h-[44px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500';

const EMPTY = { name: '', type: 'AMO_MANAGER' as OrganizationType, code: '', contactName: '', phone: '', email: '', address: '', isActive: true };

// The clinic's directory of organisms (AMO managing organization, mutuelles, private insurers).
// Configured by the clinic: nothing is pre-filled.
export function OrganizationsModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (o: Organization) => void }) {
  const { data: organizations = [] } = useOrganizationsQuery();
  const save = useSaveOrganization();
  const [editing, setEditing] = useState<Organization | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const set = (k: keyof typeof EMPTY, v: any) => setForm(f => ({ ...f, [k]: v }));

  const reset = () => { setEditing(null); setForm(EMPTY); setError(''); };
  const edit = (o: Organization) => {
    setEditing(o);
    setForm({ name: o.name, type: o.type, code: o.code, contactName: o.contactName, phone: o.phone, email: o.email, address: o.address, isActive: o.isActive });
    setError('');
  };

  const submit = async () => {
    if (!form.name.trim()) return setError("Saisissez le nom de l'organisme.");
    try {
      const saved = await save.mutateAsync({ id: editing?.id, ...form });
      onSaved?.(saved);
      reset();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Organismes" description="Organismes avec lesquels le cabinet travaille" width="max-w-lg">
      <div className="space-y-2">
        {organizations.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Aucun organisme enregistré.</p>}
        {organizations.map(o => (
          <button key={o.id} type="button" onClick={() => edit(o)}
            className={cn('flex w-full items-center justify-between rounded-[10px] border px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
              editing?.id === o.id ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200')}>
            <span>
              <span className={cn('block text-sm font-semibold', o.isActive ? 'text-slate-900' : 'text-slate-400 line-through')}>{o.name}</span>
              <span className="text-xs text-slate-500">{ORGANIZATION_TYPE_LABEL[o.type]}{o.code ? ` · ${o.code}` : ''}</span>
            </span>
            {!o.isActive && <span className="text-xs font-medium text-slate-400">Désactivé</span>}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-800">{editing ? `Modifier « ${editing.name} »` : 'Ajouter un organisme'}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Nom</label>
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <Select value={form.type} onChange={(v: string) => set('type', v)}
              options={ORGANIZATION_TYPES.map(t => ({ value: t, label: ORGANIZATION_TYPE_LABEL[t] }))} />
          </div>
          <div>
            <label className={labelCls}>Code (optionnel)</label>
            <input className={inputCls} value={form.code} onChange={e => set('code', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Contact (optionnel)</label>
            <input className={inputCls} value={form.contactName} onChange={e => set('contactName', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Téléphone (optionnel)</label>
            <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>E-mail (optionnel)</label>
            <input className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adresse (optionnel)</label>
            <input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
        </div>
        {editing && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-600">
            <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Organisme actif
          </label>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          {editing && <Button variant="secondary" size="sm" onClick={reset}>Nouveau</Button>}
          <Button variant="primary" size="sm" onClick={submit} disabled={save.isPending}>{editing ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      </div>
    </Modal>
  );
}
