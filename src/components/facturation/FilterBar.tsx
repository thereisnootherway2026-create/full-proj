import React from 'react';
import { useFacturationStore } from './store';
import { praticiens, assureurs } from './data';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';

export function FilterBar({ className }: { className?: string }) {
  const { filters, setFilter } = useFacturationStore();

  return (
    <div className={cn("flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm", className)}>
      <div className="relative flex-grow min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Patient, numéro, acte..."
          value={filters.recherche}
          onChange={(e) => setFilter('recherche', e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-shadow"
        />
      </div>

      <select
        value={filters.periode}
        onChange={(e) => setFilter('periode', e.target.value)}
        className="py-2 px-3 bg-slate-50 border-none rounded-lg text-sm text-slate-700 font-medium cursor-pointer outline-none focus:ring-2 focus:ring-blue-100"
      >
        <option value="3m">3 derniers mois</option>
        <option value="6m">6 derniers mois</option>
        <option value="12m">12 derniers mois</option>
      </select>

      <select
        value={filters.praticienId}
        onChange={(e) => setFilter('praticienId', e.target.value)}
        className="py-2 px-3 bg-slate-50 border-none rounded-lg text-sm text-slate-700 font-medium cursor-pointer outline-none focus:ring-2 focus:ring-blue-100"
      >
        <option value="">Tous les praticiens</option>
        {praticiens.map(p => (
          <option key={p.id} value={p.id}>{p.nom}</option>
        ))}
      </select>

      <select
        value={filters.assureurId}
        onChange={(e) => setFilter('assureurId', e.target.value)}
        className="py-2 px-3 bg-slate-50 border-none rounded-lg text-sm text-slate-700 font-medium cursor-pointer outline-none focus:ring-2 focus:ring-blue-100"
      >
        <option value="">Tous les assureurs</option>
        {assureurs.map(a => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
      </select>

      <select
        value={filters.statut}
        onChange={(e) => setFilter('statut', e.target.value)}
        className="py-2 px-3 bg-slate-50 border-none rounded-lg text-sm text-slate-700 font-medium cursor-pointer outline-none focus:ring-2 focus:ring-blue-100"
      >
        <option value="">Tous les statuts</option>
        <option value="payee">Payée</option>
        <option value="partielle">Partielle</option>
        <option value="en_attente">En attente</option>
        <option value="en_retard">En retard</option>
        <option value="brouillon">Brouillon</option>
        <option value="annulee">Annulée</option>
      </select>
    </div>
  );
}
