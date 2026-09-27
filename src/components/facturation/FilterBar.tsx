import React, { useState, useRef, useEffect } from 'react';
import { useFacturationStore } from './store';
import { useFilterOptions } from './queries';
import { CLAIM_STATUS, CLAIM_STATUSES, useOrganizationsQuery } from './tiersPayant';
import { Search, Calendar, ChevronDown, Check, User, Shield, Tag } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  icon?: React.ElementType;
}

function CustomSelect({ value, onChange, options, placeholder = "Sélectionner", icon: Icon }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex min-w-[210px] items-center gap-2 py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-sm rounded-lg text-sm text-slate-700 font-medium transition-all outline-none focus:ring-2 focus:ring-blue-500/20 whitespace-nowrap"
      >
        {Icon && <Icon className="w-4 h-4 flex-shrink-0 text-blue-600" />}
        <span className="flex-1 text-left">{selected ? selected.label : placeholder}</span>
        <ChevronDown className={cn("w-4 h-4 flex-shrink-0 text-slate-400 transition-transform", open ? "rotate-180" : "")} />
      </button>

      {open && (
        // Same left edge and at least the same width as the trigger, so the two line up.
        <div className="absolute top-full left-0 mt-2 w-max min-w-full bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden transform origin-top transition-all">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-6 hover:bg-slate-50 transition-colors whitespace-nowrap",
                value === opt.value ? "text-blue-600 font-medium bg-blue-50/50" : "text-slate-700"
              )}
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PERIODE_OPTIONS: Option[] = [
  { value: '1d', label: "Aujourd'hui" },
  { value: '7d', label: "7 derniers jours" },
  { value: '1m', label: "30 derniers jours" },
  { value: '3m', label: "3 derniers mois" },
  { value: '6m', label: "6 derniers mois" },
  { value: '12m', label: "12 derniers mois" },
  { value: 'all', label: "Depuis toujours" }
];

export function FilterBar({ className }: { className?: string }) {
  const { filters, setFilter, ui } = useFacturationStore();
  const { praticiens, assureurs } = useFilterOptions();
  const { data: organisations = [] } = useOrganizationsQuery();
  // On the Tiers payant tab the list shows claims: filter by the clinic's organisms and claim status.
  const tiers = ui.tab === 'tiers';

  return (
    <div className={cn("flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm", className)}>
      <div className="relative flex-grow min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Patient ou numéro..."
          value={filters.recherche}
          onChange={(e) => setFilter('recherche', e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-shadow"
        />
      </div>

      <CustomSelect
        value={filters.periode}
        onChange={(v) => setFilter('periode', v)}
        options={PERIODE_OPTIONS}
        icon={Calendar}
      />

      <CustomSelect
        value={filters.praticienId}
        onChange={(v) => setFilter('praticienId', v)}
        options={[
          { value: '', label: 'Tous les praticiens' },
          ...praticiens.map(p => ({ value: p.id, label: p.nom }))
        ]}
        placeholder="Tous les praticiens"
        icon={User}
      />

      {tiers ? (
        <>
          <CustomSelect
            value={filters.organisationId}
            onChange={(v) => setFilter('organisationId', v)}
            options={[
              { value: '', label: 'Tous les organismes' },
              ...organisations.map(o => ({ value: o.id, label: o.name }))
            ]}
            placeholder="Tous les organismes"
            icon={Shield}
          />

          <CustomSelect
            value={filters.claimStatut}
            onChange={(v) => setFilter('claimStatut', v)}
            options={[
              { value: '', label: 'Tous les statuts' },
              ...CLAIM_STATUSES.map(s => ({ value: s, label: CLAIM_STATUS[s].label }))
            ]}
            placeholder="Tous les statuts"
            icon={Tag}
          />
        </>
      ) : (
        <>
          <CustomSelect
            value={filters.assureurId}
            onChange={(v) => setFilter('assureurId', v)}
            options={[
              { value: '', label: 'Toutes les mutuelles' },
              ...assureurs.map(a => ({ value: a, label: a }))
            ]}
            placeholder="Toutes les mutuelles"
            icon={Shield}
          />

          <CustomSelect
            value={filters.statut}
            onChange={(v) => setFilter('statut', v)}
            options={[
              { value: '', label: 'Tous les statuts' },
              { value: 'payee', label: 'Payée' },
              { value: 'partielle', label: 'Partielle' },
              { value: 'en_attente', label: 'En attente' },
              { value: 'en_retard', label: 'En retard' }
            ]}
            placeholder="Tous les statuts"
            icon={Tag}
          />
        </>
      )}
    </div>
  );
}
