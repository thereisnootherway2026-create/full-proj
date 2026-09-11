import React from 'react';
import { useFacturationStore } from './store';
import { filterFactures } from './selectors';
import { FilterBar } from './FilterBar';
import { Overview } from './Overview';
import { FacturesView } from './FacturesView';
import { PaiementsView } from './PaiementsView';
import { DebiteursView } from './DebiteursView';
import { FactureDrawer } from './FactureDrawer';
import { NouvelleFactureDrawer } from './NouvelleFactureDrawer';
import { RecuPaiement } from './RecuPaiement';
import { Download, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function FacturationPage() {
  const { factures, filters, ui, setTab, setNouvelleFactureOpen } = useFacturationStore();
  const filteredFactures = filterFactures(factures, filters);

  const renderView = () => {
    switch (ui.tab) {
      case 'apercu': return <Overview />;
      case 'factures': return <FacturesView />;
      case 'paiements': return <PaiementsView />;
      case 'debiteurs': return <DebiteursView />;
      default: return <Overview />;
    }
  };

  const tabs = [
    { id: 'apercu', label: 'Aperçu' },
    { id: 'factures', label: 'Factures' },
    { id: 'paiements', label: 'Paiements' },
    { id: 'debiteurs', label: 'Débiteurs' }
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-[1800px] mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Facturation & Encaissements</h1>
            <p className="text-sm text-slate-500 mt-1">
              Suivi complet des recettes du cabinet · {filteredFactures.length} factures affichées
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors shadow-sm">
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
            <button 
              onClick={() => setNouvelleFactureOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Nouvelle facture
            </button>
          </div>
        </div>

        {/* Tab Bar */}
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
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        <FilterBar />

        <div className="mt-6">
          {renderView()}
        </div>

      </div>

      {/* Drawers / Modals Mounted at Shell Level */}
      <FactureDrawer />
      <NouvelleFactureDrawer />
      <RecuPaiement />
      
      {/* Toast Notification */}
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
