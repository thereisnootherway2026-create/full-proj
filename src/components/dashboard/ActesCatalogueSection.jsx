import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Pencil, Plus, Search, Stethoscope } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import Button from '../common/Button'
import Chip from '../common/Chip'
import Modal from '../common/Modal'

// Paramètres > Actes: the clinic's acte catalogue (name, standard price in MAD, optional category).
// Reads are plain selects scoped by RLS; writes go through the upsert_acte / set_acte_active RPCs
// (admin or doctor only, enforced server-side). An acte is archived, never deleted: past invoices keep
// their own label/price snapshots, and archived actes stop being suggested in "Ajouter un acte".
// The same rows feed those suggestions and the Montant auto-fill (lib/acteSuggestions.js).

const inputCls = 'h-[44px] w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'
const labelCls = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500'

const mad = (n) => `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`

const ERRORS = [
  [/duplicate key|actes_catalogue_cabinet_libelle_uniq/i, 'Un acte porte déjà ce nom.'],
  [/not authorized/i, "Vous n'avez pas l'autorisation de modifier le catalogue."],
  [/invalid acte name/i, "Le nom de l'acte est obligatoire (120 caractères maximum)."],
  [/invalid acte price/i, 'Le prix doit être un montant positif.'],
  [/invalid acte category/i, 'La catégorie est trop longue (60 caractères maximum).'],
]
const friendly = (error) => {
  const msg = String(error?.message || '')
  const hit = ERRORS.find(([re]) => re.test(msg))
  return new Error(hit ? hit[1] : msg || 'Une erreur est survenue.')
}
const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw friendly(error)
  return data
}

function useCatalogue(clinicId) {
  return useQuery({
    queryKey: ['actes-catalogue', clinicId],
    enabled: Boolean(clinicId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('actes_catalogue')
        .select('id, libelle, prix, categorie, active, created_at')
        .eq('cabinet_id', clinicId)
        .order('libelle')
        .limit(1000)
      if (error) throw error
      return (data || []).map((r) => ({ id: r.id, name: r.libelle, price: Number(r.prix), category: r.categorie || '', active: r.active }))
    },
  })
}

function ActeModal({ acte, categories, onClose, onSaved }) {
  const [name, setName] = useState(acte?.name || '')
  const [price, setPrice] = useState(acte ? String(acte.price) : '')
  const [category, setCategory] = useState(acte?.category || '')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (v) => rpc('upsert_acte', { p_id: acte?.id ?? null, p_libelle: v.name, p_prix: v.price, p_categorie: v.category || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actes-catalogue'] })
      queryClient.invalidateQueries({ queryKey: ['acte-suggestions'] })
      onSaved(acte ? 'Acte mis à jour.' : 'Acte ajouté au catalogue.')
    },
    onError: (e) => setError(e.message),
  })

  const submit = () => {
    const value = Number(String(price).replace(/\s/g, '').replace(',', '.'))
    if (!name.trim()) return setError("Saisissez le nom de l'acte.")
    if (!Number.isFinite(value) || value < 0) return setError('Le prix doit être un montant positif.')
    setError('')
    save.mutate({ name: name.trim(), price: value, category: category.trim() })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={acte ? "Modifier l'acte" : 'Nouvel acte'}
      description={acte ? 'Les factures déjà émises ne changent pas.' : 'Il sera proposé dans « Ajouter un acte » avec son prix.'}
      width="max-w-md"
    >
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="acte-name">Nom de l'acte</label>
          <input id="acte-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder="Ex. Échographie abdominale" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="acte-price">Prix standard (MAD)</label>
            <input id="acte-price" className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelCls} htmlFor="acte-cat">Catégorie (optionnel)</label>
            <input id="acte-cat" className={inputCls} list="acte-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} placeholder="Ex. Imagerie" />
            <datalist id="acte-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" size="sm" disabled={save.isPending}>{acte ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function ActesCatalogueSection({ clinicId, canEdit, notify }) {
  const queryClient = useQueryClient()
  const { data: actes = [], isLoading, isError, error, refetch } = useCatalogue(clinicId)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | acte

  const archive = useMutation({
    mutationFn: ({ id, active }) => rpc('set_acte_active', { p_id: id, p_active: active }),
    onSuccess: (_row, { active }) => {
      queryClient.invalidateQueries({ queryKey: ['actes-catalogue'] })
      queryClient.invalidateQueries({ queryKey: ['acte-suggestions'] })
      notify?.({ title: 'Succès', description: active ? 'Acte restauré.' : 'Acte archivé : il n\'est plus proposé.', variant: 'success' })
    },
    onError: (e) => notify?.({ title: 'Erreur', description: e.message, variant: 'error' }),
  })

  const categories = useMemo(() => [...new Set(actes.map((a) => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [actes])
  const archivedCount = actes.filter((a) => !a.active).length
  const q = search.trim().toLowerCase()
  const shown = actes.filter((a) => (showArchived || a.active) && (!q || a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)))

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Catalogue des actes</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Les actes et tarifs standards du cabinet, proposés dans « Ajouter un acte » pendant la consultation.
            </p>
          </div>
          {canEdit && (
            <Button variant="accent" size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" />Ajouter un acte
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={cn(inputCls, 'h-[40px] pl-9')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un acte ou une catégorie…" />
          </div>
          {archivedCount > 0 && (
            <Chip size="md" selected={showArchived} onClick={() => setShowArchived((v) => !v)}>
              Archivés ({archivedCount})
            </Chip>
          )}
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : isError ? (
            <div className="rounded-xl bg-red-50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-red-700">Impossible de charger le catalogue.</p>
              <p className="mt-1 text-xs text-red-600">{error?.message}</p>
              <Button className="mt-3" variant="secondary" size="sm" onClick={() => refetch()}>Réessayer</Button>
            </div>
          ) : shown.length === 0 ? (
            <div className="py-12 text-center">
              <Stethoscope className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-900">{actes.length === 0 ? 'Aucun acte dans le catalogue' : 'Aucun résultat'}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                {actes.length === 0
                  ? 'Ajoutez vos actes courants avec leur prix : ils seront proposés automatiquement, prix compris, lors des consultations.'
                  : 'Aucun acte ne correspond à cette recherche.'}
              </p>
              {actes.length === 0 && canEdit && <Button className="mt-4" variant="accent" size="sm" onClick={() => setEditing('new')}>Ajouter un acte</Button>}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-semibold">Acte</th>
                    <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Catégorie</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Prix standard</th>
                    {canEdit && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((a) => (
                    <tr key={a.id} className={cn('transition-colors hover:bg-slate-50/60', !a.active && 'bg-slate-50/50')}>
                      <td className="px-4 py-3">
                        <span className={cn('font-semibold', a.active ? 'text-slate-900' : 'text-slate-400')}>{a.name}</span>
                        {!a.active && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Archivé</span>}
                      </td>
                      <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">{a.category || <span className="text-slate-300">—</span>}</td>
                      <td className={cn('px-3 py-3 text-right font-bold tabular-nums', a.active ? 'text-slate-900' : 'text-slate-400')}>{mad(a.price)}</td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="ghost" size="xs" onClick={() => setEditing(a)} aria-label={`Modifier ${a.name}`}><Pencil className="h-3.5 w-3.5" />Modifier</Button>
                            <Button variant="ghost" size="xs" disabled={archive.isPending} onClick={() => archive.mutate({ id: a.id, active: !a.active })}
                              aria-label={`${a.active ? 'Archiver' : 'Restaurer'} ${a.name}`}>
                              {a.active ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                              {a.active ? 'Archiver' : 'Restaurer'}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ActeModal
          acte={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(description) => { setEditing(null); notify?.({ title: 'Succès', description, variant: 'success' }) }}
        />
      )}
    </div>
  )
}
