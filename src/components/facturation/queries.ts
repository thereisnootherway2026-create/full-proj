import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { 
  fetchFactures, 
  createFacture, 
  cancelFacture, 
  addPaiementAPI, 
  removePaiementAPI, 
  markRelanceAPI, 
  fetchStatsAPI, 
  fetchDebiteursAPI 
} from './api';
import { useFacturationStore } from './store';

const IS_DEMO = import.meta.env.VITE_FACTURATION_DEMO !== 'false';

export const useFacturesQuery = () => {
  const filters = useFacturationStore(s => s.filters);
  const demoFactures = useFacturationStore(s => s.factures);
  
  const query = useQuery({
    queryKey: ['factures', filters],
    queryFn: () => fetchFactures(filters),
    enabled: !IS_DEMO,
  });

  if (IS_DEMO) {
    let result = [...demoFactures];
    if (filters.statut) result = result.filter(f => f.statut === filters.statut);
    if (filters.assureurId) result = result.filter(f => f.assureur === filters.assureurId);
    if (filters.praticienId) result = result.filter(f => f.praticienId === filters.praticienId);
    if (filters.recherche) {
      const term = filters.recherche.toLowerCase();
      result = result.filter(f => f.numero.toLowerCase().includes(term) || f.patientNom.toLowerCase().includes(term));
    }
    return { data: result, isLoading: false, error: null };
  }
  
  return query;
};

export const useFacturationMutations = () => {
  const queryClient = useQueryClient();
  const store = useFacturationStore();

  const createMut = useMutation({
    mutationFn: (draft: any) => createFacture(draft),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factures'] })
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string, reason: string }) => cancelFacture(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factures'] })
  });

  const addPayMut = useMutation({
    mutationFn: ({ id, p }: { id: string, p: any }) => addPaiementAPI(id, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factures'] })
  });

  const removePayMut = useMutation({
    mutationFn: (paymentId: string) => removePaiementAPI(paymentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factures'] })
  });

  const relanceMut = useMutation({
    mutationFn: ({ id, val }: { id: string, val: boolean }) => markRelanceAPI(id, val),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factures'] })
  });

  const emitMut = useMutation({
    mutationFn: (id: string) => supabase.rpc('emit_facture', { p_id: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factures'] })
  });

  if (IS_DEMO) {
    return {
      createFacture: async (draft: any) => store.createFacture(draft),
      cancelFacture: async ({ id, reason }: any) => store.setStatut(id, 'annulee'),
      addPaiement: async ({ id, p }: any) => store.addPaiement(id, p),
      removePaiement: async ({ fId, pId }: any) => store.removePaiement(fId, pId),
      markRelance: async ({ id, val }: any) => store.markRelance(id),
      emitFacture: async (id: string) => store.setStatut(id, 'en_attente')
    };
  }

  return {
    createFacture: (draft: any) => createMut.mutateAsync(draft),
    cancelFacture: (params: any) => cancelMut.mutateAsync(params),
    addPaiement: (params: any) => addPayMut.mutateAsync(params),
    removePaiement: (params: any) => removePayMut.mutateAsync(params.pId), // API just needs pId
    markRelance: (params: any) => relanceMut.mutateAsync(params),
    emitFacture: (id: string) => emitMut.mutateAsync(id)
  };
};

export const useFacturationStats = () => {
  const filters = useFacturationStore(s => s.filters);
  const query = useQuery({
    queryKey: ['factures-stats', filters],
    queryFn: () => fetchStatsAPI(filters),
    enabled: !IS_DEMO,
  });

  if (IS_DEMO) {
    // Generate dummy stats from Zustand for demo
    const factures = useFacturationStore.getState().factures;
    // ... complex math skipped for demo ...
    return { data: {
      kpis: { caNet: 10000, encaisse: 8000, reste: 2000, panier: 500, count: 20 },
      ageing: { '0_30': 1000, '31_60': 500, '61_90': 500, '90_plus': 0 },
      statutDistribution: { 'payee': 15, 'en_attente': 5 },
      dso: 12
    }, isLoading: false };
  }

  return query;
};

export const useDebiteursQuery = () => {
  const query = useQuery({
    queryKey: ['debiteurs'],
    queryFn: fetchDebiteursAPI,
    enabled: !IS_DEMO,
  });

  if (IS_DEMO) {
    return { data: [], isLoading: false }; // Simple fallback for demo
  }

  return query;
};
