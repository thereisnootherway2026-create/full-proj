import React, { useState, useEffect } from 'react';
import { useFacturationStore } from './store';
import { useFacturationMutations } from './queries';
import { Mode, factureReste } from './data';
import { X } from 'lucide-react';
import { dh } from './format';
import { cn } from '../../lib/utils';

interface EncaisserModalProps {
  facture: any;
  isOpen: boolean;
  onClose: () => void;
}

export function EncaisserModal({ facture, isOpen, onClose }: EncaisserModalProps) {
  const { showToast } = useFacturationStore();
  const { addPaiement } = useFacturationMutations();
  
  const reste = factureReste(facture);
  
  const [montant, setMontant] = useState(reste.toString());
  const [mode, setMode] = useState<Mode>('Carte');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMontant(reste.toString());
      setMode('Carte');
      setDate(new Date().toISOString().split('T')[0]);
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, reste]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(montant);
    
    if (isNaN(val) || val <= 0) {
      setError('Montant invalide.');
      return;
    }
    // We remove the hard client-side reste check so the server can throw its 422 for overpayment
    
    setIsSubmitting(true);
    setError('');
    try {
      await addPaiement({
        id: facture.id,
        p: {
          date: new Date(date).toISOString(),
          montant: val,
          mode
        }
      });
      showToast(`Paiement de ${dh(val)} ajouté avec succès.`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'ajout du paiement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Enregistrer un paiement</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Montant (DH)</label>
            <input 
              type="number"
              step="0.01"
              max={reste}
              value={montant}
              onChange={(e) => {
                setMontant(e.target.value);
                setError('');
              }}
              className={cn(
                "w-full px-3 py-2 border rounded-lg outline-none focus:ring-2",
                error ? "border-red-300 focus:ring-red-100" : "border-slate-300 focus:ring-emerald-100 focus:border-emerald-500"
              )}
              required
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mode de paiement</label>
            <select 
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
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
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500"
              required
            />
          </div>
          
          <div className="pt-2">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Enregistrement...' : 'Valider le paiement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
