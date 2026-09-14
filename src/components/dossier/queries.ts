import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getPatientById, getPatientClinicalFields } from '@/lib/api';
import { DossierEvent, DossierEventRow } from './types';

/**
 * Patient identity + clinical fields (allergies/antecedents/groupe_sanguin),
 * merged the same way PatientWorkspace.jsx already does: getPatientById only
 * returns administrative columns (see migration 20260912070000), clinical
 * fields come from the separate mm_get_patient_clinical RPC.
 */
export function usePatient(patientId: string | undefined) {
  return useQuery({
    queryKey: ['dossier-patient', patientId],
    queryFn: async () => {
      const data = await getPatientById(patientId!);
      if (!data) return null;
      const clinical = await getPatientClinicalFields(patientId!);
      return clinical ? { ...data, ...clinical } : data;
    },
    enabled: !!patientId,
  });
}

function mapRow(row: DossierEventRow): DossierEvent {
  return {
    id: row.id,
    kind: row.kind,
    date: row.event_date,
    titre: row.titre,
    sousTitre: row.sous_titre,
    // Not joined in the view (see migration 20260918000000 comments):
    // profiles RLS only allows auth.uid() = id, so a doctor_id -> profiles
    // join would silently return null for any doctor but the viewer.
    // This page is doctor-only and consultations RLS already restricts
    // every visible consultation to the viewing doctor, so "acteur" is
    // always the current user — resolved by the caller from the logged-in
    // profile, not from this hook.
    acteur: null,
    ref: row.ref,
    statutFacturation: row.statut_facturation,
    payload: row.payload || {},
  };
}

/**
 * THE single source of truth for the "Parcours de soins" timeline. The event
 * list, the live "N événements" count, and the "dernière conclusion" strip
 * all read from this one array — never from separate queries that could
 * drift apart.
 */
export function useDossierEvents(patientId: string | undefined) {
  return useQuery({
    queryKey: ['dossier-events', patientId],
    queryFn: async (): Promise<DossierEvent[]> => {
      const { data, error } = await supabase
        .from('patient_dossier_events')
        .select('*')
        .eq('patient_id', patientId)
        .order('event_date', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRow);
    },
    enabled: !!patientId,
  });
}

export interface DossierRdvStatus {
  /** Real status derived from today's rdv rows — never hardcoded, absent when there is none. */
  activeStatus: 'en_consultation' | 'rdv' | null;
  prochainRdv: { id: string; date: string } | null;
}

/**
 * Single rdv query serving both the header status badge and the "Prochain
 * RDV" info line, so the two can never disagree with each other.
 */
export function useDossierRdvStatus(patientId: string | undefined) {
  return useQuery({
    queryKey: ['dossier-rdv-status', patientId],
    queryFn: async (): Promise<DossierRdvStatus> => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('rdv')
        .select('id, date_rdv, status, arrival_status')
        .eq('patient_id', patientId)
        .neq('status', 'cancelled')
        .gte('date_rdv', todayStart.toISOString())
        .order('date_rdv', { ascending: true });
      if (error) throw error;

      const rows = data || [];
      const todayRows = rows.filter((r) => new Date(r.date_rdv) <= todayEnd);
      const inConsultation = todayRows.find((r) => r.arrival_status === 'IN_CONSULTATION');
      const activeStatus: DossierRdvStatus['activeStatus'] = inConsultation
        ? 'en_consultation'
        : todayRows.length > 0
          ? 'rdv'
          : null;

      const upcoming = rows.find((r) => new Date(r.date_rdv) > now);
      return {
        activeStatus,
        prochainRdv: upcoming ? { id: upcoming.id, date: upcoming.date_rdv } : null,
      };
    },
    enabled: !!patientId,
  });
}

export interface PatientFacturationSummary {
  resteDu: number;
}

/**
 * Read-only reuse of the facturation module's own get_debiteurs() RPC — it
 * already computes reste-du per patient via get_facture_net() + a payments
 * sum, running SECURITY DEFINER so it isn't blocked by the payments table's
 * admin/secretary-only RLS (a doctor is explicitly allowed to call this RPC,
 * confirmed in its body: is_admin() OR current_role() IN ('doctor','secretary')).
 * No payment-calculation logic is duplicated here. A patient absent from the
 * result owes nothing (get_debiteurs only returns rows where net - paye > 0).
 */
export function usePatientFacturation(patientId: string | undefined) {
  return useQuery({
    queryKey: ['dossier-facturation', patientId],
    queryFn: async (): Promise<PatientFacturationSummary> => {
      const { data, error } = await supabase.rpc('get_debiteurs');
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data : [];
      const entry = rows.find((r) => r.patient_id === patientId);
      return { resteDu: entry ? Number(entry.reste_du) : 0 };
    },
    enabled: !!patientId,
  });
}
