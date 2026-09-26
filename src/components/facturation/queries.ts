import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../../context/AppContext';
import { encaisserFacture, fetchFactures } from './api';
import { Facture } from './data';

export const useFacturesQuery = () => {
  const { clinicId } = useAppContext();
  return useQuery({
    queryKey: ['factures', clinicId],
    queryFn: () => fetchFactures(clinicId as string),
    enabled: Boolean(clinicId),
  });
};

// Refetch when a payment is collected elsewhere in the app (dashboard cashier queue).
export const useFacturationSync = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['factures'] });
    window.addEventListener('mm:payments-changed', refresh);
    return () => window.removeEventListener('mm:payments-changed', refresh);
  }, [queryClient]);
};

export const useEncaisser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ facture, montant, method }: { facture: Facture; montant: number; method: string }) =>
      encaisserFacture(facture, montant, method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factures'] });
      // The patient dossier's Factures tab keeps its own per-patient list.
      queryClient.invalidateQueries({ queryKey: ['patient-factures'] });
      window.dispatchEvent(new CustomEvent('mm:payments-changed'));
    },
  });
};

// Filter choices come from the clinic's real practitioners and the mutuelles present in its data.
export const useFilterOptions = () => {
  const { doctors } = useAppContext();
  const { data: factures = [] } = useFacturesQuery();
  return useMemo(() => {
    const praticiens = (doctors || []).map((d: any) => ({
      id: d.id as string,
      nom: (d.nom_complet || `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Praticien') as string,
    }));
    const assureurs = Array.from(new Set(factures.map(f => f.assureurId).filter(Boolean))).sort();
    return { praticiens, assureurs };
  }, [doctors, factures]);
};
