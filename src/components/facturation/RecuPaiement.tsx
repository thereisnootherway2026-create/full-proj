import React, { useEffect } from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { useAppContext } from '../../context/AppContext';
import { X, Printer } from 'lucide-react';
import { dh, fmtDateLong, amountInWords } from './format';
import { factureReste } from './data';

export function RecuPaiement() {
  const { ui, setRecuPaiementId } = useFacturationStore();
  const { data: factures = [] } = useFacturesQuery();
  const { cabinet } = useAppContext();

  const recuId = ui.recuPaiementId;
  const foundFacture = recuId ? factures.find(f => f.paiements.some(x => x.id === recuId)) : undefined;
  const foundPaiement = foundFacture?.paiements.find(x => x.id === recuId);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      // Only when a receipt is open: an unconditional store update re-rendered the page mid-keydown
      // and kept every other modal on the page from seeing Escape.
      if (e.key === 'Escape' && useFacturationStore.getState().ui.recuPaiementId) setRecuPaiementId(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [setRecuPaiementId]);

  if (!foundPaiement || !foundFacture) return null;

  const handleClose = () => setRecuPaiementId(null);

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 transition-opacity print:hidden"
        onClick={handleClose}
      />

      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-slate-100 shadow-2xl z-[60] flex flex-col animate-in slide-in-from-right duration-300 print:fixed print:inset-0 print:w-full print:max-w-none print:shadow-none print:z-[9999] print:bg-white print:animate-none">

        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 print:hidden">
          <h2 className="text-lg font-bold text-slate-900">Reçu de paiement</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex justify-center print:overflow-visible print:p-0 print:block">
          <div className="bg-white w-full max-w-md rounded shadow-sm border border-slate-200 p-8 print:border-none print:shadow-none print:max-w-none print:w-full">

            <div className="border-b-2 border-slate-900 pb-4 mb-6">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">{cabinet?.name || 'Cabinet médical'}</h1>
              <p className="text-sm text-slate-600 mt-1">Reçu de paiement - Copie patient</p>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-slate-500 uppercase">Facture</span>
                <span className="text-sm font-bold text-slate-900">{foundFacture.numero}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-slate-500 uppercase">Patient</span>
                <span className="text-sm font-bold text-slate-900 text-right">{foundFacture.patientNom}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-slate-500 uppercase">Date</span>
                <span className="text-sm font-bold text-slate-900">{fmtDateLong(foundPaiement.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-slate-500 uppercase">Mode</span>
                <span className="text-sm font-bold text-slate-900">{foundPaiement.mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-slate-500 uppercase">Facturé</span>
                <span className="text-sm font-bold text-slate-900">{dh(foundFacture.montant)}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-lg text-center mb-8 border border-slate-100">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Montant encaissé</p>
              <p className="text-4xl font-black text-slate-900">{dh(foundPaiement.montant)}</p>
              {factureReste(foundFacture) > 0 && (
                <p className="text-sm font-semibold text-amber-700 mt-2">
                  Reste à payer : {dh(factureReste(foundFacture))}
                </p>
              )}
            </div>

            <div className="mb-12">
              <p className="text-sm text-slate-700 italic text-center">
                Arrêté le présent reçu à la somme de :<br/>
                <span className="font-bold block mt-1">{amountInWords(foundPaiement.montant)}</span>
              </p>
            </div>

            <div className="flex justify-end pt-8">
              <div className="text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-16">Signature & Cachet</p>
                <div className="w-32 border-b border-slate-300"></div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
