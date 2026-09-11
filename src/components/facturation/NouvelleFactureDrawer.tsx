import React, { useState, useEffect } from 'react';
import { useFacturationStore } from './store';
import { praticiens, assureurs, patientsPool, actesCatalogue, Ligne } from './data';
import { X, Plus, Trash2 } from 'lucide-react';
import { dh } from './format';
import { cn } from '../../lib/utils';

export function NouvelleFactureDrawer() {
  const { ui, setNouvelleFactureOpen, createFacture, setFactureOuverteId, showToast } = useFacturationStore();
  
  const [patientRef, setPatientRef] = useState('');
  const [praticienId, setPraticienId] = useState(praticiens[0].id);
  const [assureurId, setAssureurId] = useState(assureurs[0].id);
  const [lignes, setLignes] = useState<{ id: string; acteCode: string; qte: number }[]>([]);
  const [remiseStr, setRemiseStr] = useState('0');
  const [error, setError] = useState('');

  // Reset form when opened
  useEffect(() => {
    if (ui.nouvelleFactureOpen) {
      setPatientRef('');
      setPraticienId(praticiens[0].id);
      setAssureurId(assureurs[0].id);
      setLignes([{ id: crypto.randomUUID(), acteCode: '', qte: 1 }]);
      setRemiseStr('0');
      setError('');
    }
  }, [ui.nouvelleFactureOpen]);

  if (!ui.nouvelleFactureOpen) return null;

  const handleClose = () => setNouvelleFactureOpen(false);

  const addLigne = () => {
    setLignes([...lignes, { id: crypto.randomUUID(), acteCode: '', qte: 1 }]);
  };

  const removeLigne = (id: string) => {
    setLignes(lignes.filter(l => l.id !== id));
  };

  const updateLigne = (id: string, field: 'acteCode' | 'qte', value: string | number) => {
    setLignes(lignes.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // Compute live preview
  let ht = 0;
  lignes.forEach(l => {
    if (l.acteCode) {
      const a = actesCatalogue.find(x => x.code === l.acteCode);
      if (a) ht += a.pu * l.qte;
    }
  });

  const remisePct = Math.max(0, Math.min(100, parseInt(remiseStr) || 0));
  const remiseAmount = ht * (remisePct / 100);
  const htRemise = ht - remiseAmount;
  const tva = htRemise * 0.20;
  const net = htRemise + tva;

  const handleSave = (brouillon: boolean) => {
    if (!patientRef) {
      setError('Veuillez sélectionner un patient.');
      return;
    }
    const validLignes = lignes.filter(l => l.acteCode !== '');
    if (validLignes.length === 0) {
      setError('Veuillez ajouter au moins une prestation valide.');
      return;
    }

    const patient = patientsPool.find(p => p.ref === patientRef)!;
    const finalLignes: Ligne[] = validLignes.map(l => {
      const a = actesCatalogue.find(x => x.code === l.acteCode)!;
      return {
        code: a.code,
        libelle: a.libelle,
        pu: a.pu,
        qte: Math.max(1, l.qte)
      };
    });

    const emissionDate = new Date();
    const echeanceDate = new Date(emissionDate.getTime() + 30 * 86400000);

    const newId = createFacture({
      dateEmission: emissionDate.toISOString(),
      dateEcheance: echeanceDate.toISOString(),
      praticienId,
      patientNom: patient.nom,
      patientRef: patient.ref,
      assureurId,
      lignes: finalLignes,
      remise: remisePct,
      brouillon
    });

    setNouvelleFactureOpen(false);
    showToast(brouillon ? 'Facture enregistrée en brouillon.' : 'Facture émise avec succès.');
    // Open the newly created facture in the drawer
    setFactureOuverteId(newId);
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
          <h2 className="text-lg font-bold text-slate-900">Nouvelle Facture</h2>
          <button 
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50">
          
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm font-medium border border-red-200">
              {error}
            </div>
          )}

          {/* Setup Block */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Informations générales</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Patient *</label>
                <select 
                  value={patientRef}
                  onChange={(e) => setPatientRef(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                >
                  <option value="">Sélectionner un patient...</option>
                  {patientsPool.map(p => (
                    <option key={p.ref} value={p.ref}>{p.nom} ({p.ref})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Praticien</label>
                <select 
                  value={praticienId}
                  onChange={(e) => setPraticienId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                >
                  {praticiens.map(p => (
                    <option key={p.id} value={p.id}>{p.nom}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Assureur</label>
                <select 
                  value={assureurId}
                  onChange={(e) => setAssureurId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                >
                  {assureurs.map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Lignes Block */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Prestations</h3>
              <button 
                onClick={addLigne}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter une ligne
              </button>
            </div>
            
            <div className="space-y-3">
              {lignes.map((l, index) => {
                const acte = actesCatalogue.find(a => a.code === l.acteCode);
                const lineTotal = acte ? acte.pu * l.qte : 0;
                
                return (
                  <div key={l.id} className="flex gap-3 items-end">
                    <div className="flex-1">
                      {index === 0 && <label className="block text-xs font-semibold text-slate-500 mb-1">Acte médical</label>}
                      <select 
                        value={l.acteCode}
                        onChange={(e) => updateLigne(l.id, 'acteCode', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                      >
                        <option value="">Sélectionner un acte...</option>
                        {actesCatalogue.map(a => (
                          <option key={a.code} value={a.code}>{a.code} - {a.libelle} ({a.pu} DH)</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20">
                      {index === 0 && <label className="block text-xs font-semibold text-slate-500 mb-1 text-center">Qté</label>}
                      <input 
                        type="number"
                        min="1"
                        value={l.qte}
                        onChange={(e) => updateLigne(l.id, 'qte', parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                      />
                    </div>
                    <div className="w-24 text-right pb-2">
                      <span className="font-semibold text-slate-900 text-sm">{dh(lineTotal)}</span>
                    </div>
                    <button 
                      onClick={() => removeLigne(l.id)}
                      className={cn(
                        "p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors",
                        index === 0 ? "mb-0.5" : ""
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {lignes.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-2 italic">Aucune prestation ajoutée.</p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4 mt-4 grid grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remise commerciale (%)</label>
                <input 
                  type="number"
                  min="0"
                  max="100"
                  value={remiseStr}
                  onChange={(e) => setRemiseStr(e.target.value)}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                />
              </div>
              
              {/* Totals Preview */}
              <div className="flex flex-col items-end gap-1.5 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex justify-between w-48 text-slate-600">
                  <span>Total HT</span>
                  <span>{dh(ht, true)}</span>
                </div>
                {remisePct > 0 && (
                  <div className="flex justify-between w-48 text-emerald-600">
                    <span>Remise ({remisePct}%)</span>
                    <span>-{dh(remiseAmount, true)}</span>
                  </div>
                )}
                <div className="flex justify-between w-48 text-slate-600 pb-1 border-b border-slate-200">
                  <span>TVA (20%)</span>
                  <span>{dh(tva, true)}</span>
                </div>
                <div className="flex justify-between w-48 font-bold text-base text-slate-900 pt-1">
                  <span>Net à payer</span>
                  <span>{dh(net, true)}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <button 
            onClick={() => handleSave(true)}
            className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors shadow-sm"
          >
            Enregistrer en brouillon
          </button>
          <button 
            onClick={() => handleSave(false)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors text-sm"
          >
            Émettre la facture
          </button>
        </div>
      </div>
    </>
  );
}
