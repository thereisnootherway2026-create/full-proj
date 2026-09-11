import { create } from 'zustand';
import { Facture, generateSeedData, Paiement, Statut, factureReste, factureNet } from './data';

export interface FilterState {
  recherche: string;
  periode: '3m' | '6m' | '12m';
  praticienId: string;
  assureurId: string;
  statut: string;
}

export interface UIState {
  tab: 'apercu' | 'factures' | 'paiements' | 'debiteurs';
  factureOuverteId: string | null;
  nouvelleFactureOpen: boolean;
  recuPaiementId: string | null; // references a paiement.id
  toast: { message: string; type: 'success' | 'error' } | null;
}

interface FacturationStore {
  factures: Facture[];
  filters: FilterState;
  ui: UIState;
  toastTimeout: ReturnType<typeof setTimeout> | null;

  createFacture: (draft: Omit<Facture, 'id' | 'numero' | 'statut' | 'paiements'> & { brouillon?: boolean }) => void;
  updateFacture: (id: string, updates: Partial<Facture>) => void;
  deleteFacture: (id: string) => void;
  setStatut: (id: string, statut: Statut) => void;
  addPaiement: (factureId: string, paiement: Omit<Paiement, 'id'>) => void;
  removePaiement: (factureId: string, paiementId: string) => void;
  markRelance: (id: string) => void;

  setFilter: (key: keyof FilterState, value: string) => void;
  setTab: (tab: UIState['tab']) => void;
  setFactureOuverteId: (id: string | null) => void;
  setNouvelleFactureOpen: (open: boolean) => void;
  setRecuPaiementId: (id: string | null) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  hideToast: () => void;
}

const initialFactures = generateSeedData();

export const useFacturationStore = create<FacturationStore>((set, get) => ({
  factures: initialFactures,
  filters: {
    recherche: '',
    periode: '6m',
    praticienId: '',
    assureurId: '',
    statut: '',
  },
  ui: {
    tab: 'apercu',
    factureOuverteId: null,
    nouvelleFactureOpen: false,
    recuPaiementId: null,
    toast: null,
  },
  toastTimeout: null,

  createFacture: (draft) => set((state) => {
    // Generate sequential FAC-0001
    const nextNum = state.factures.length + 1;
    const numero = `FAC-${String(nextNum).padStart(4, '0')}`;
    
    const newFacture: Facture = {
      ...draft,
      id: crypto.randomUUID(),
      numero,
      statut: draft.brouillon ? 'brouillon' : 'en_attente',
      paiements: [],
    };
    
    return { factures: [newFacture, ...state.factures] };
  }),

  updateFacture: (id, updates) => set((state) => ({
    factures: state.factures.map(f => f.id === id ? { ...f, ...updates } : f)
  })),

  deleteFacture: (id) => set((state) => ({
    factures: state.factures.filter(f => f.id !== id)
  })),

  setStatut: (id, statut) => set((state) => ({
    factures: state.factures.map(f => f.id === id ? { ...f, statut } : f)
  })),

  addPaiement: (factureId, p) => set((state) => {
    const factures = state.factures.map(f => {
      if (f.id !== factureId) return f;
      
      const newPaiement: Paiement = { ...p, id: crypto.randomUUID() };
      const paiements = [...f.paiements, newPaiement];
      
      const net = factureNet(f);
      const totalPaye = paiements.reduce((acc, current) => acc + current.montant, 0);
      const reste = Math.max(0, net - totalPaye);
      
      let statut = f.statut;
      if (reste <= 0.01) {
        statut = 'payee';
      } else if (totalPaye > 0) {
        statut = 'partielle';
      }
      
      return { ...f, paiements, statut };
    });
    return { factures };
  }),

  removePaiement: (factureId, paiementId) => set((state) => {
    const factures = state.factures.map(f => {
      if (f.id !== factureId) return f;
      
      const paiements = f.paiements.filter(p => p.id !== paiementId);
      const net = factureNet(f);
      const totalPaye = paiements.reduce((acc, current) => acc + current.montant, 0);
      const reste = Math.max(0, net - totalPaye);
      
      let statut = f.statut;
      if (reste <= 0.01) {
        statut = 'payee';
      } else if (totalPaye > 0) {
        statut = 'partielle';
      } else if (f.statut !== 'brouillon' && f.statut !== 'annulee') {
        const isLate = new Date().getTime() > new Date(f.dateEcheance).getTime();
        statut = isLate ? 'en_retard' : 'en_attente';
      }
      
      return { ...f, paiements, statut };
    });
    return { factures };
  }),

  markRelance: (id) => set((state) => ({
    factures: state.factures.map(f => f.id === id ? { ...f, relance: !f.relance } : f)
  })),

  setFilter: (key, value) => set((state) => ({
    filters: { ...state.filters, [key]: value }
  })),

  setTab: (tab) => set((state) => ({ ui: { ...state.ui, tab } })),
  setFactureOuverteId: (id) => set((state) => ({ ui: { ...state.ui, factureOuverteId: id } })),
  setNouvelleFactureOpen: (open) => set((state) => ({ ui: { ...state.ui, nouvelleFactureOpen: open } })),
  setRecuPaiementId: (id) => set((state) => ({ ui: { ...state.ui, recuPaiementId: id } })),
  
  showToast: (message, type = 'success') => {
    const currentTimeout = get().toastTimeout;
    if (currentTimeout) clearTimeout(currentTimeout);
    
    const timeout = setTimeout(() => {
      set((state) => ({ ui: { ...state.ui, toast: null }, toastTimeout: null }));
    }, 3000);
    
    set((state) => ({
      ui: { ...state.ui, toast: { message, type } },
      toastTimeout: timeout
    }));
  },
  
  hideToast: () => {
    const currentTimeout = get().toastTimeout;
    if (currentTimeout) clearTimeout(currentTimeout);
    set((state) => ({ ui: { ...state.ui, toast: null }, toastTimeout: null }));
  }
}));
