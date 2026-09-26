import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { readActeUsage } from './acteUsage'

// Suggestions for "Nom de l'acte" in the Ajouter un acte modal. Four inputs,
// merged in this order of trust:
//
//  1. Usage counts (source 'usage'):
//     - public.facture_lignes: itemised invoice lines. No clinic column of its
//       own; its SELECT policy scopes rows through the parent consultation to
//       public.current_clinic_id(), so this plain query only ever sees the
//       caller's clinic.
//     - this device's own counter (acteUsage.js), bumped whenever an acte is
//       added in this modal, because actes typed into a consultation are not
//       persisted server-side yet (PatientWorkspace "Branchement futur").
//  2. public.actes_catalogue (source 'catalogue'): the clinic's catalogue, managed in
//     Paramètres > Actes (cabinet_id = current_clinic_id() by RLS). Once the clinic has
//     at least one active acte, the suggestions ARE the catalogue: same names, standard
//     price for the Montant, ordered by how often each is used (usage only ranks, it never
//     adds names). Free typing in the field still works for one-off acts.
//  3. Only while the catalogue is empty: usage-derived names, then a short built-in list
//     of common acts (source 'default') so the field is never a blank box. Labelled
//     "Actes courants", never "les plus utilisés".
//
// Verified with rolled-back simulated-JWT tests: a doctor of the owning clinic
// sees its rows; a doctor of another clinic and anon see none. Frequency is
// computed client-side over the most recent lines (RECENT_LINES): deliberately
// lightweight, clinic-wide for the server part, not a full analytics feature.
export const RECENT_LINES = 500
export const TOP_N = 12
const POOL = 40

export const DEFAULT_ACTES = [
  { label: 'Consultation', price: 300 },
  { label: 'Consultation de suivi', price: 200 },
  { label: 'ECG', price: 150 },
  { label: 'Injection', price: 50 },
  { label: 'Pansement', price: 80 },
  { label: 'Suture', price: 200 },
  { label: 'Certificat médical', price: 100 },
  { label: 'Échographie', price: 400 },
  { label: 'Lavage d\'oreille', price: 150 },
  { label: 'Nébulisation', price: 100 },
]

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ')
export const foldKey = (s) => norm(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// rows: [{ libelle_snapshot, prix_unitaire_snapshot }] newest first.
// Groups by label (case/accents/spacing-insensitive), most frequent first, ties
// broken by recency. Label and price come from the most recent line.
export function rankActes(rows, limit = TOP_N) {
  const groups = new Map()
  rows.forEach((r, i) => {
    const label = norm(r.libelle_snapshot)
    if (!label) return
    const k = foldKey(label)
    const g = groups.get(k)
    if (g) g.count += 1
    else groups.set(k, { label, price: Number(r.prix_unitaire_snapshot) || 0, count: 1, firstSeen: i })
  })
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen)
    .slice(0, limit)
}

// Shape consumed by SuggestionChips / AddItemModal: picking a chip applies `values`.
export const toActeSuggestion = (a) => ({
  key: foldKey(a.label),
  label: a.label,
  source: a.source || 'usage',
  hint: a.price > 0 ? `${a.price.toLocaleString('fr-FR')} MAD` : '',
  values: { name: a.label, ...(a.price > 0 ? { montant: String(a.price) } : {}) },
})

// Catalogue mode: the clinic's active actes, most used first (server + device counts), then alphabetical.
function catalogueSuggestions(usage, catalogue, local) {
  const counts = new Map()
  ;[...usage, ...local].forEach((u) => { const k = foldKey(u.label); counts.set(k, (counts.get(k) || 0) + (u.count || 1)) })
  return catalogue
    .filter((c) => norm(c.libelle))
    .map((c) => ({ label: norm(c.libelle), price: Number(c.prix) || 0, source: 'catalogue', count: counts.get(foldKey(c.libelle)) || 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
    .map(toActeSuggestion)
}

// usage: [{ label, price, count }] from the server; catalogue: [{ libelle, prix }];
// local: [{ label, price, count }] from this device; defaults: [label].
// Order: counted acts (server + device counts added together, most used first),
// then catalogue acts never counted (alphabetical), then the built-in common acts
// not already present. The catalogue's standard price wins over invoiced/typed prices.
export function mergeActeSources(usage, catalogue = [], local = [], defaults = DEFAULT_ACTES) {
  if (catalogue.some((c) => norm(c.libelle))) return catalogueSuggestions(usage, catalogue, local)
  const standard = new Map(catalogue.map((c) => [foldKey(c.libelle), Number(c.prix) || 0]))
  const counted = new Map()
  const add = (list) => list.forEach((u, i) => {
    const label = norm(u.label)
    if (!label) return
    const k = foldKey(label)
    const g = counted.get(k)
    if (g) { g.count += u.count || 1; if (!g.price && u.price > 0) g.price = u.price } else counted.set(k, { label, price: Number(u.price) || 0, count: u.count || 1, order: counted.size + i / 1000 })
  })
  add(usage)
  add(local)
  const out = [...counted.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map((u) => ({ ...u, price: standard.get(foldKey(u.label)) > 0 ? standard.get(foldKey(u.label)) : u.price, source: 'usage' }))
  const seen = new Set(out.map((u) => foldKey(u.label)))
  const cat = catalogue
    .filter((c) => norm(c.libelle) && !seen.has(foldKey(c.libelle)))
    .map((c) => ({ label: norm(c.libelle), price: Number(c.prix) || 0, source: 'catalogue' }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  cat.forEach((c) => seen.add(foldKey(c.label)))
  const def = defaults
    .map((d) => (typeof d === 'string' ? { label: d, price: 0 } : d))
    .filter((d) => !seen.has(foldKey(d.label)))
    .map((d) => ({ label: d.label, price: Number(d.price) || 0, source: 'default' }))
  return [...out, ...cat, ...def].map(toActeSuggestion)
}

// No input: the first N as ranked. With input: the same ranked list narrowed to
// labels containing the text (case/accent-insensitive), still capped at N.
export function filterSuggestions(items, query, limit = TOP_N) {
  const q = foldKey(query)
  const list = q ? items.filter((it) => foldKey(it.label).includes(q)) : items
  return list.slice(0, limit)
}

// Split a (filtered) list into labelled groups for display; empty groups are dropped.
const GROUPS = [
  { source: 'usage', label: 'Les plus fréquents' },
  { source: 'catalogue', label: 'Catalogue du cabinet' },
  { source: 'default', label: 'Actes courants' },
]
export function groupSuggestions(items, typed = false) {
  const groups = GROUPS.map((g) => ({ key: g.source, label: typed ? 'Résultats correspondants' : g.label, items: items.filter((i) => i.source === g.source) })).filter((g) => g.items.length)
  return typed && groups.length ? [{ key: 'typed', label: 'Résultats correspondants', items: groups.flatMap((g) => g.items) }] : groups
}

export async function fetchActeSuggestions(scope) {
  const [lines, cat] = await Promise.all([
    supabase.from('facture_lignes').select('libelle_snapshot, prix_unitaire_snapshot').order('created_at', { ascending: false }).limit(RECENT_LINES),
    supabase.from('actes_catalogue').select('libelle, prix').eq('active', true).order('libelle').limit(200),
  ])
  // Either source failing just means fewer suggestions; the modal works without them.
  const usage = lines.error ? [] : rankActes(lines.data || [], POOL)
  const catalogue = cat.error ? [] : (cat.data || [])
  return mergeActeSources(usage, catalogue, readActeUsage(scope))
}

// `scope` (clinic + user) keys the device counter; changing it refetches.
export function useActeSuggestions(enabled, scope) {
  return useQuery({ queryKey: ['acte-suggestions', scope], queryFn: () => fetchActeSuggestions(scope), enabled, staleTime: 60 * 1000, retry: false })
}
