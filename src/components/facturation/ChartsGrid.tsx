import React from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery, useFilterOptions } from './queries';
import { Skeleton, ErrorState } from './ui';
import { filterFactures, getMonthlySeries, getBreakdowns, getAgeingBuckets } from './selectors';
import { Card, SectionTitle } from './ui';
import { dh, num } from './format';
import { stripDoctorTitle } from '../../lib/professionalName';
import { CHART, STATUT_CHART_COLORS, Reveal, useChartMotion } from './chartTheme';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

const STATUT_LABELS: Record<string, string> = {
  payee: 'Payée', partielle: 'Partielle', en_attente: 'En attente', en_retard: 'En retard'
};

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

const axisTick = { fontSize: 12, fill: CHART.axis };
const kFormat = (val: number) => `${val / 1000}k`;
// Round the axis maximum up to a clean 1 / 2 / 5 x 10^n step. This only shapes the axis: an all-zero
// series keeps an honest, empty 0 .. 1k axis and no bar is ever drawn for it.
const niceMax = (max: number) => {
  if (max <= 0) return 1000;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};
const yDomain: [number, (max: number) => number] = [0, niceMax];

function ChartEmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm font-medium text-slate-400">
      {children}
    </div>
  );
}

export function ChartsGrid() {
  const { filters } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  const { praticiens } = useFilterOptions();
  const motion = useChartMotion();
  const filteredFactures = filterFactures(factures, filters);

  const monthlyData = getMonthlySeries(filteredFactures);
  const breakdowns = getBreakdowns(filteredFactures);
  const ageingData = getAgeingBuckets(filteredFactures);

  if (isLoading) return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Skeleton className="h-64 lg:col-span-2"/><Skeleton className="h-64"/><Skeleton className="h-64"/></div>;
  if (isError) return <ErrorState error={error as Error} onRetry={refetch} />;

  const statutData = Array.from(breakdowns.byStatut.entries()).map(([key, val]) => ({
    name: STATUT_LABELS[key] || key,
    statut: key,
    value: val.count
  })).sort((a, b) => b.value - a.value);

  const assureurData = Array.from(breakdowns.byAssureur.entries())
    .map(([label, amount]) => ({ name: label || 'Sans assurance', value: amount }))
    .sort((a, b) => b.value - a.value);

  const praticienData = Array.from(breakdowns.byPraticien.entries())
    .map(([id, amount]) => {
      const p = praticiens.find(x => x.id === id);
      return { name: p ? stripDoctorTitle(p.nom) : 'Non renseigné', value: amount };
    })
    .sort((a, b) => b.value - a.value);

  const ageingTotal = ageingData.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* 1. Évolution: CA vs encaissé over 8 months */}
      <Reveal className="lg:col-span-2" delay={0.05}>
        <Card>
          <SectionTitle title="Évolution du chiffre d'affaires et encaissements" subtitle="Sur les 8 derniers mois" />
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillCA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART.primary} stopOpacity={0.12}/>
                    <stop offset="95%" stopColor={CHART.primary} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="fillEnc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART.secondary} stopOpacity={0.18}/>
                    <stop offset="95%" stopColor={CHART.secondary} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="mois" axisLine={false} tickLine={false} tick={axisTick} dy={10} />
                <YAxis tickFormatter={kFormat} domain={yDomain} axisLine={false} tickLine={false} tick={axisTick} dx={-10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: CHART.axis, paddingBottom: 8 }} />
                <Area type="monotone" dataKey="ca" name="CA net" stroke={CHART.primary} strokeWidth={2.5} fillOpacity={1} fill="url(#fillCA)" {...motion.recharts} />
                <Area type="monotone" dataKey="encaisse" name="Encaissé" stroke={CHART.secondary} strokeWidth={2.5} fillOpacity={1} fill="url(#fillEnc)" {...motion.recharts} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Reveal>

      {/* 2. Répartition par statut */}
      <Reveal delay={0.1}>
        <Card className="h-full">
          <SectionTitle title="Répartition par statut" subtitle="En nombre de factures" />
          <div className="h-64 mt-2 relative flex items-center justify-center">
            {statutData.length === 0 ? (
              <ChartEmptyNote>Aucune facture sur cette période</ChartEmptyNote>
            ) : (
              <>
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
                      {...motion.recharts}
                    >
                      {statutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUT_CHART_COLORS[entry.statut] || CHART.secondary} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip isCurrency={false} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-bold text-slate-900">{filteredFactures.length}</span>
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Factures</span>
                </div>
              </>
            )}
          </div>
          {statutData.length > 0 && (
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
              {statutData.map(s => (
                <li key={s.statut} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUT_CHART_COLORS[s.statut] || CHART.secondary }} />
                  {s.name} · {s.value}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Reveal>

      {/* 3. Âge des créances: real zeros stay zeros */}
      <Reveal delay={0.15}>
        <Card className="h-full">
          <SectionTitle title="Âge des créances" subtitle="Reste à encaisser par délai de retard" />
          <div className="h-64 mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageingData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} dy={10} />
                <YAxis tickFormatter={kFormat} domain={yDomain} axisLine={false} tickLine={false} tick={axisTick} dx={-10} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: CHART.cursor }} />
                <Bar dataKey="amount" name="Montant" radius={[4, 4, 0, 0]} {...motion.recharts}>
                  {ageingData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART.ramp[index] || CHART.secondary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {ageingTotal === 0 && <ChartEmptyNote>Aucune créance à encaisser</ChartEmptyNote>}
          </div>
        </Card>
      </Reveal>

      {/* 4. CA par assureur */}
      <Reveal delay={0.2}>
        <Card className="h-full">
          <SectionTitle title="CA par assureur" subtitle="Répartition du chiffre d'affaires" />
          <div className="h-64 mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assureurData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} dy={10} />
                <YAxis tickFormatter={kFormat} domain={yDomain} axisLine={false} tickLine={false} tick={axisTick} dx={-10} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: CHART.cursor }} />
                <Bar dataKey="value" name="CA net" radius={[4, 4, 0, 0]} maxBarSize={56} {...motion.recharts}>
                  {assureurData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART.series[index % CHART.series.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {assureurData.length === 0 && <ChartEmptyNote>Aucune donnée sur cette période</ChartEmptyNote>}
          </div>
        </Card>
      </Reveal>

      {/* 5. CA par praticien */}
      <Reveal delay={0.25}>
        <Card className="h-full">
          <SectionTitle title="CA par praticien" subtitle="Performances individuelles" />
          <div className="h-64 mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={praticienData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} dy={10} />
                <YAxis tickFormatter={kFormat} domain={yDomain} axisLine={false} tickLine={false} tick={axisTick} dx={-10} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: CHART.cursor }} />
                <Bar dataKey="value" name="CA net" radius={[4, 4, 0, 0]} maxBarSize={56} {...motion.recharts}>
                  {praticienData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART.series[index % CHART.series.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {praticienData.length === 0 && <ChartEmptyNote>Aucune donnée sur cette période</ChartEmptyNote>}
          </div>
        </Card>
      </Reveal>

    </div>
  );
}
