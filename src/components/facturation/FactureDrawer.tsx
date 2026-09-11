import React, { useState, useEffect } from 'react';
import { useFacturationStore } from './store';
import { factureNet, facturePaye, factureReste, factureHT, factureTVA, ligneTotal, Mode } from './data';
import { dh, fmtDate, fmtDateLong, joursRetard } from './format';
import { StatutBadge } from './ui';
import { praticiens, assureurs } from './data';
import { X, Trash2, Printer, CheckCircle, Ban, CreditCard, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export function FactureDrawer() {
  const { factures, ui, setFactureOuverteId, setStatut, addPaiement, removePaiement, showToast } = useFacturationStore();
  const [isEncaisserOpen, setIsEncaisserOpen] = useState(false);
  const [encaisserMontant, setEncaisserMontant] = useState('');
  const [encaisserMode, setEncaisserMode] = useState<Mode>('Carte');
  const [encaisserDate, setEncaisserDate] = useState(new Date().toISOString().split('T')[0]);
  const [encaisserError, setEncaisserError] = useState('');
  
  const factureId = ui.factureOuverteId;
  const facture = factures.find(f => f.id === factureId);

  // Keyboard escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEncaisserOpen) setIsEncaisserOpen(false);
        else setFactureOuverteId(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isEncaisserOpen, setFactureOuverteId]);

  if (!facture) return null;

  const handleClose = () => setFactureOuverteId(null);
  
  const praticien = praticiens.find(p => p.id === facture.praticienId);
  const assureur = assureurs.find(a => a.id === facture.assureurId);

  const net = factureNet(facture);
  const paye = facturePaye(facture);
  const reste = factureReste(facture);
  const retard = joursRetard(facture.dateEcheance);
  const isLate = facture.statut === 'en_retard';

  const handleEncaisserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(encaisserMontant);
    if (isNaN(val) || val <= 0) {
      setEncaisserError('Montant invalide.');
      return;
    }
    if (val > reste + 0.01) {
      setEncaisserError(`Le montant ne peut excéder le reste à payer (${dh(reste)}).`);
      return;
    }
    
    addPaiement(facture.id, {
      date: new Date(encaisserDate).toISOString(),
      montant: val,
      mode: encaisserMode
    });
    
    showToast(`Paiement de ${dh(val)} ajouté avec succès.`);
    setIsEncaisserOpen(false);
    setEncaisserMontant('');
    setEncaisserError('');
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={handleClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{facture.numero}</h2>
            <StatutBadge statut={facture.statut} />
          </div>
          <button 
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Infos */}
          <div className="grid grid-cols-2 gap-6 bg-slate-50 rounded-xl p-5 border border-slate-100">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Patient</p>
              <p className="text-sm font-bold text-slate-900 mt-1">{facture.patientNom}</p>
              <p className="text-xs text-slate-500">{facture.patientRef}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Émission</p>
              <p className="text-sm font-medium text-slate-900 mt-1">{fmtDateLong(facture.dateEmission)}</p>
              {isLate ? (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1 mt-0.5">
                  <AlertCircle className="w-3 h-3" />
                  En retard de {retard} jours
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">Échéance : {fmtDateLong(facture.dateEcheance)}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Praticien</p>
              <p className="text-sm font-medium text-slate-900 mt-1">{praticien?.nom || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Assureur</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {assureur?.label || 'Sans assurance'} 
                {assureur && assureur.taux > 0 && <span className="text-xs text-slate-500 ml-1">({assureur.taux * 100}%)</span>}
              </p>
            </div>
          </div>

          {/* Lignes */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">Prestations</h3>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Libellé</th>
                  <th className="pb-2 font-medium text-center">Qté</th>
                  <th className="pb-2 font-medium text-right">PU (DH)</th>
                  <th className="pb-2 font-medium text-right">Total (DH)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {facture.lignes.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-slate-900">{l.code} - {l.libelle}</td>
                    <td className="py-2.5 text-slate-600 text-center">{l.qte}</td>
                    <td className="py-2.5 text-slate-600 text-right">{dh(l.pu, true).replace(' DH', '')}</td>
                    <td className="py-2.5 font-medium text-slate-900 text-right">{dh(ligneTotal(l), true).replace(' DH', '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals Block */}
            <div className="mt-4 flex flex-col items-end gap-2 text-sm">
              <div className="flex justify-between w-64 text-slate-600">
                <span>Total HT</span>
                <span>{dh(factureHT(facture) / (1 - facture.remise / 100), true)}</span>
              </div>
              {facture.remise > 0 && (
                <div className="flex justify-between w-64 text-emerald-600">
                  <span>Remise ({facture.remise}%)</span>
                  <span>-{dh((factureHT(facture) / (1 - facture.remise / 100)) * (facture.remise / 100), true)}</span>
                </div>
              )}
              <div className="flex justify-between w-64 text-slate-600 pb-2 border-b border-slate-200">
                <span>TVA (20%)</span>
                <span>{dh(factureTVA(facture), true)}</span>
              </div>
              <div className="flex justify-between w-64 font-bold text-base text-slate-900 pt-1">
                <span>Net à payer</span>
                <span>{dh(net, true)}</span>
              </div>
            </div>
          </div>

          {/* Paiements */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">Historique des paiements</h3>
            {facture.paiements.length === 0 ? (
              <p className="text-sm text-slate-500 italic bg-slate-50 p-4 rounded-lg text-center">Aucun paiement enregistré.</p>
            ) : (
              <div className="space-y-2">
                {facture.paiements.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-white shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded">
                        {p.mode}
                      </div>
                      <span className="text-sm text-slate-600">{fmtDateLong(p.date)}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-slate-900">{dh(p.montant)}</span>
                      <button 
                        onClick={() => {
                          if(confirm('Supprimer ce paiement ?')) removePaiement(facture.id, p.id);
                        }}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Reste */}
            {facture.paiements.length > 0 && reste > 0 && (
              <div className="mt-4 flex justify-end">
                <div className="bg-amber-50 text-amber-800 px-4 py-2 rounded-lg font-bold text-sm border border-amber-200">
                  Reste à encaisser : {dh(reste)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors shadow-sm">
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            {facture.statut === 'brouillon' && (
              <button 
                onClick={() => setStatut(facture.id, 'en_attente')}
                className="inline-flex items-center gap-2 px-4 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium text-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Marquer émise
              </button>
            )}
            {facture.statut !== 'annulee' && (
              <button 
                onClick={() => {
                  if(confirm('Voulez-vous vraiment annuler cette facture ?')) setStatut(facture.id, 'annulee');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium text-sm transition-colors"
              >
                <Ban className="w-4 h-4" />
                Annuler
              </button>
            )}
          </div>
          
          {reste > 0 && facture.statut !== 'annulee' && facture.statut !== 'brouillon' && (
            <button 
              onClick={() => {
                setEncaisserMontant(reste.toString());
                setEncaisserError('');
                setIsEncaisserOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors text-sm"
            >
              <CreditCard className="w-4 h-4" />
              Encaisser
            </button>
          )}
        </div>
      </div>

      {/* Modal Encaisser */}
      {isEncaisserOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsEncaisserOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Enregistrer un paiement</h3>
              <button onClick={() => setIsEncaisserOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEncaisserSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant (DH)</label>
                <input 
                  type="number"
                  step="0.01"
                  max={reste}
                  value={encaisserMontant}
                  onChange={(e) => {
                    setEncaisserMontant(e.target.value);
                    setEncaisserError('');
                  }}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg outline-none focus:ring-2",
                    encaisserError ? "border-red-300 focus:ring-red-100" : "border-slate-300 focus:ring-emerald-100 focus:border-emerald-500"
                  )}
                  required
                />
                {encaisserError && <p className="text-xs text-red-600 mt-1">{encaisserError}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mode de paiement</label>
                <select 
                  value={encaisserMode}
                  onChange={(e) => setEncaisserMode(e.target.value as Mode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500"
                >
                  <option value="Especes">Espèces</option>
                  <option value="Carte">Carte bancaire</option>
                  <option value="Cheque">Chèque</option>
                  <option value="Virement">Virement</option>
                  <option value="Tiers payant">Tiers payant</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input 
                  type="date"
                  value={encaisserDate}
                  onChange={(e) => setEncaisserDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500"
                  required
                />
              </div>
              
              <div className="pt-2">
                <button type="submit" className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors">
                  Valider le paiement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
