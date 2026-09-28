import { useEffect, useState } from 'react';
import { useProviderContext, useSetProviderContext } from './tiersPayant';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 font-mono text-sm font-medium uppercase outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all';
const labelCls = 'text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block';

// Insurance provider context: the cabinet's sector and the signed-in practitioner's category, as
// configurable codes (no national list is assumed). Empty = not configured, and the insurance rules
// engine then keeps every calculation in manual mode. The specialty is never used to derive them.
export function InsuranceProviderSettings() {
  const { data, isLoading } = useProviderContext();
  const save = useSetProviderContext();
  const [sector, setSector] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setSector(data.sector);
    setCategory(data.category);
  }, [data]);

  const submit = async () => {
    setMessage(null);
    try {
      await save.mutateAsync({ sector: sector.trim().toUpperCase(), category: category.trim().toUpperCase() });
      setMessage({ ok: true, text: 'Contexte assurance enregistré.' });
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Contexte assurance</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Codes utilisés par le moteur de règles d'assurance. Laissez vide tant qu'ils ne sont pas confirmés : le calcul reste alors manuel.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ins-sector" className={labelCls}>Secteur du cabinet</label>
          <input id="ins-sector" className={inputCls} value={sector} disabled={isLoading}
            onChange={e => setSector(e.target.value.toUpperCase())} placeholder="Non renseigné" />
        </div>
        <div>
          <label htmlFor="ins-category" className={labelCls}>Catégorie du praticien</label>
          <input id="ins-category" className={inputCls} value={category} disabled={isLoading}
            onChange={e => setCategory(e.target.value.toUpperCase())} placeholder="Non renseignée" />
          {data?.specialty && <p className="mt-1 text-xs text-slate-400">Spécialité : {data.specialty} (n'est pas utilisée pour déduire la catégorie).</p>}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {message && <span className={message.ok ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-red-600'}>{message.text}</span>}
        <button type="button" onClick={submit} disabled={save.isPending || isLoading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50">
          Enregistrer le contexte assurance
        </button>
      </div>
    </div>
  );
}
