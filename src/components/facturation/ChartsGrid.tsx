import React from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { filterFactures, getMonthlySeries, getBreakdowns, getAgeingBuckets } from './selectors';
import { Card, SectionTitle } from './ui';
import { dh, num } from './format';
import { assureurs, praticiens } from './data';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

const STATUT_COLORS: Record<string, string> = {
  payee: '#10b981', // emerald-500
  partielle: '#f59e0b', // amber-500
  en_attente: '#94a3b8', // slate-400
  en_retard: '#ef4444', // red-500
  annulee: '#f43f5e', // rose-500
  brouillon: '#6366f1' // indigo-500
};
const STATUT_LABELS: Record<string, string> = {
  payee: 'Payée', partielle: 'Partielle', en_attente: 'En attente',
  en_retard: 'En retard', annulee: 'Annulée', brouillon: 'Brouillon'
};

const AGEING_COLORS = ['#34d399', '#fbbf24', '#fb923c', '#ef4444'];

const CustomTooltip = ({ active, payload, label, isCurrency = true }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 shadow-md rounded-lg p-3 text-sm">
        <p className="font-semibold text-slate-800 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 mt-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
            <span className="text-slate-600">{entry.name} :</span>
            <span className="font-medium text-slate-900">
              {isCurrency ? dh(entry.value) : num(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function ChartsGrid() {
  const { filters } = useFacturationStore();
  const { data: factures = [] } = useFacturesQuery();
  const filteredFactures = filterFactures(factures, filters);
  
  const monthlyData = getMonthlySeries(filteredFactures);
  const breakdowns = getBreakdowns(filteredFactures);
  const ageingData = getAgeingBuckets(filteredFactures);

  // Formatting Data for Charts
  const statutData = Array.from(breakdowns.byStatut.entries()).map(([key, val]) => ({
    name: STATUT_LABELS[key] || key,
    statut: key,
    value: val.count
  })).sort((a, b) => b.value - a.value);

  const assureurData = Array.from(breakdowns.byAssureur.entries()).map(([id, amount]) => {
    const a = assureurs.find(x => x.id === id);
    return { name: a ? a.label : 'Autre', value: amount, color: a ? a.couleur : '#94a3b8' };
  }).sort((a, b) => b.value - a.value);

  const praticienData = Array.from(breakdowns.byPraticien.entries()).map(([id, amount]) => {
    const p = praticiens.find(x => x.id === id);
    return { name: p ? p.nom.replace('Dr. ', '') : 'Autre', value: amount, color: p ? p.couleur : '#94a3b8' };
  }).sort((a, b) => b.value - a.value);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      
      {/* 1. Area Chart: Monthly CA vs Encaisse */}
      <Card className="lg:col-span-2">
        <SectionTitle title="Évolution du chiffre d'affaires et encaissements" subtitle="Sur les 8 derniers mois" />
        <div className="h-72 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorEnc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="mois" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
              <YAxis tickFormatter={(val) => `${val / 1000}k`} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ca" name="CA Net" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorCA)" />
              <Area type="monotone" dataKey="encaisse" name="Encaissé" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorEnc)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 2. Donut: Statuts */}
      <Card>
        <SectionTitle title="Répartition par statut" subtitle="En nombre de factures" />
        <div className="h-64 mt-2 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statutData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {statutData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STATUT_COLORS[entry.statut] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip isCurrency={false} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-bold text-slate-900">{filteredFactures.length}</span>
            <span className="text-xs text-slate-500 uppercase tracking-wide">Factures</span>
          </div>
        </div>
      </Card>

      {/* 3. Bar: Âge des créances */}
      <Card>
        <SectionTitle title="Âge des créances" subtitle="Reste à encaisser par délai de retard" />
        <div className="h-64 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ageingData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
              <YAxis tickFormatter={(val) => `${val / 1000}k`} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="amount" name="Montant" radius={[4, 4, 0, 0]}>
                {ageingData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={AGEING_COLORS[index] || '#cbd5e1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 4. Bar: Assureur */}
      <Card>
        <SectionTitle title="CA par assureur" subtitle="Répartition du chiffre d'affaires" />
        <div className="h-64 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={assureurData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
              <YAxis tickFormatter={(val) => `${val / 1000}k`} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" name="CA Net" radius={[4, 4, 0, 0]}>
                {assureurData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 5. Bar: Praticien */}
      <Card>
        <SectionTitle title="CA par praticien" subtitle="Performances individuelles" />
        <div className="h-64 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={praticienData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
              <YAxis tickFormatter={(val) => `${val / 1000}k`} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" name="CA Net" radius={[4, 4, 0, 0]}>
                {praticienData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

    </div>
  );
}
