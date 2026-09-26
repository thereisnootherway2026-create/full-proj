import React, { useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useFacturationStore } from './store';
import { useFacturesQuery, useFacturationSync, useFilterOptions } from './queries';
import { filterFactures } from './selectors';
import { FilterBar } from './FilterBar';
import { Overview } from './Overview';
import { FacturesView } from './FacturesView';
import { PaiementsView } from './PaiementsView';
import { DebiteursView } from './DebiteursView';
import { DetailAvance } from './DetailAvance';
import { TiersPayantView } from './TiersPayantView';
import { FactureDrawer } from './FactureDrawer';
import { RecuPaiement } from './RecuPaiement';
import { Download, User, X, CreditCard, FileCheck2, ExternalLink, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { factureNet, facturePaye, factureReste } from './data';
import { dh } from './format';

const formatPatientName = (name?: string) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

const initialsOf = (label?: string) =>
  String(label || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

export default function FacturationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { filters, ui, setTab, setFilter, setFactureOuverteId, showToast } = useFacturationStore();
  const { data: factures = [] } = useFacturesQuery();
  const { praticiens } = useFilterOptions();
  useFacturationSync();
  const reduceMotion = useReducedMotion();

  const patientIdParam = searchParams.get('patientId');
  const factureIdParam = searchParams.get('factureId');
  const patientNomParam = searchParams.get('patientNom');

  useEffect(() => {
    if (patientIdParam) {
      setFilter('patientId', patientIdParam);
      setFilter('periode', 'all');
      if (patientNomParam) {
        setFilter('patientNom', patientNomParam);
      }
      setTab('factures');
    }
    if (factureIdParam) {
      setFactureOuverteId(factureIdParam);
    }
  }, [patientIdParam, factureIdParam, patientNomParam, setFilter, setTab, setFactureOuverteId]);

  const activePatientNom = filters.patientNom || factures.find(f => f.patientId === filters.patientId)?.patientNom;

  const handleClearPatientFilter = () => {
    setFilter('patientId', '');
    setFilter('patientNom', '');
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      n.delete('patientId');
      n.delete('patientNom');
      n.delete('factureId');
      return n;
    });
    showToast('Filtre patient désactivé. Affichage global du cabinet.');
  };

  const filteredFactures = filterFactures(factures, filters);

  const { patientTotalFacture, patientTotalPaye, patientResteDu } = useMemo(() => {
    let facture = 0;
    let paye = 0;
    let reste = 0;
    if (filters.patientId) {
      filteredFactures.forEach(f => {
        facture += factureNet(f);
        paye += facturePaye(f);
        reste += factureReste(f);
      });
    }
    return { patientTotalFacture: facture, patientTotalPaye: paye, patientResteDu: reste };
  }, [filters.patientId, filteredFactures]);

  const handleExportCSV = () => {
    const headers = ['Numéro', 'Date', 'Échéance', 'Patient', 'Praticien', 'Mutuelle', 'Facturé', 'Payé', 'Reste', 'Statut'];
    const money = (n: number) => n.toFixed(2).replace('.', ',');

    const rows = filteredFactures.map(f => [
      f.numero,
      f.dateEmission.split('T')[0],
      f.dateEcheance.split('T')[0],
      `"${f.patientNom.replace(/"/g, '""')}"`,
      praticiens.find(p => p.id === f.praticienId)?.nom || '',
      f.assureurId,
      money(factureNet(f)),
      money(facturePaye(f)),
      money(factureReste(f)),
      f.statut
    ].join(';'));

    const csvContent = '﻿' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `facturation_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Export de ${filteredFactures.length} factures réussi.`);
  };

  const renderView = () => {
    switch (ui.tab) {
      case 'apercu': return <Overview />;
      case 'factures': return <FacturesView />;
      case 'paiements': return <PaiementsView />;
      case 'debiteurs': return <DebiteursView />;
      case 'tiers': return <TiersPayantView />;
      case 'avance': return <DetailAvance />;
      default: return <Overview />;
    }
  };

  const tabs = [
    { id: 'apercu', label: 'Aperçu' },
    { id: 'factures', label: 'Factures' },
    { id: 'paiements', label: 'Paiements' },
    { id: 'debiteurs', label: 'Débiteurs' },
    { id: 'tiers', label: 'Tiers payant' },
    { id: 'avance', label: 'Détail avancé' }
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-[1800px] mx-auto space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black text-slate-900 leading-tight">Facturation & Encaissements</h1>
            <p className="mt-0.5 text-[15px] font-medium text-slate-500">
              Suivi complet des recettes du cabinet • {filteredFactures.length} facture{filteredFactures.length > 1 ? 's' : ''} affichée{filteredFactures.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-2 rounded-[10px] bg-white border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-all hover:bg-slate-50 hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
            >
              <Download className="w-4 h-4" strokeWidth={2.5} />
              <span>Exporter CSV</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6 border-b border-slate-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={cn(
                "pb-3 text-sm font-medium transition-colors relative",
                ui.tab === tab.id ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {tab.label}
              {ui.tab === tab.id && (
                // One shared underline that glides between tabs
                <motion.span
                  layoutId="facturation-tab-underline"
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"
                />
              )}
            </button>
          ))}
        </div>

        {filters.patientId && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white p-5 sm:p-6 shadow-[0_4px_24px_rgba(15,23,42,0.05)]"
          >
            {/* Ambient decorative soft glow */}
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gradient-to-br from-blue-100/50 via-indigo-100/40 to-transparent blur-2xl" />

            <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-5">
              
              {/* Left: Patient Identity & Breadcrumb */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-700 text-white font-black text-lg shadow-[0_6px_16px_rgba(37,99,235,0.28)]">
                  {initialsOf(activePatientNom)}
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-blue-600 shadow-xs ring-2 ring-white">
                    <CreditCard className="h-3 w-3" />
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-[19px] font-black text-slate-900 tracking-tight truncate">
                      {formatPatientName(activePatientNom) || 'Patient sélectionné'}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/70">
                      <FileCheck2 className="w-3.5 h-3.5" />
                      {filteredFactures.length} facture{filteredFactures.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-slate-500 font-medium">
                    <span className="text-slate-400">Dossier financier patient</span>
                    <span className="text-slate-300">•</span>
                    <Link
                      to={`/patients/${filters.patientId}`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold transition hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Consulter le dossier médical
                    </Link>
                  </div>
                </div>
              </div>

              {/* Center: Live 3 Mini Financial KPI Cards */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Total Facturé */}
                <div className="flex flex-col justify-center rounded-xl bg-slate-50/90 border border-slate-200/80 px-4 py-2.5 min-w-[125px]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Facturé</span>
                  <span className="text-[17px] font-extrabold text-slate-900 mt-0.5">{dh(patientTotalFacture)}</span>
                </div>

                {/* Total Encaissé */}
                <div className="flex flex-col justify-center rounded-xl bg-emerald-50/80 border border-emerald-200/70 px-4 py-2.5 min-w-[125px]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Encaissé
                  </span>
                  <span className="text-[17px] font-extrabold text-emerald-700 mt-0.5">{dh(patientTotalPaye)}</span>
                </div>

                {/* Reste à régler */}
                <div className={cn(
                  "flex flex-col justify-center rounded-xl border px-4 py-2.5 min-w-[135px] transition-all",
                  patientResteDu > 0
                    ? "bg-amber-50/90 border-amber-300 text-amber-900 shadow-xs"
                    : "bg-slate-50/80 border-slate-200/80 text-slate-700"
                )}>
                  <span className={cn(
                    "text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                    patientResteDu > 0 ? "text-amber-700" : "text-slate-400"
                  )}>
                    {patientResteDu > 0 && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
                    Reste à régler
                  </span>
                  <span className={cn(
                    "text-[17px] font-extrabold mt-0.5",
                    patientResteDu > 0 ? "text-amber-800" : "text-slate-600"
                  )}>
                    {dh(patientResteDu)}
                  </span>
                </div>
              </div>

              {/* Right: Reset Action */}
              <div className="flex items-center gap-2 self-start xl:self-center">
                <button
                  type="button"
                  onClick={handleClearPatientFilter}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all cursor-pointer"
                  title="Réinitialiser le filtre pour voir toutes les factures du cabinet"
                >
                  <X className="h-4 w-4 text-slate-400" />
                  <span>Voir tout le cabinet</span>
                </button>
              </div>

            </div>
          </motion.div>
        )}

        <FilterBar />

        {/* Tab content fades and lifts in (the outgoing tab fades out first). Off with reduced motion. */}
        <div className="mt-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={ui.tab}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      <FactureDrawer />
      <RecuPaiement />

      {ui.toast && (
        <div className={cn(
          "fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-5 z-50 transition-all",
          ui.toast.type === 'error' ? "bg-red-600 text-white" : "bg-slate-800 text-white"
        )}>
          {ui.toast.message}
        </div>
      )}
    </div>
  );
}
