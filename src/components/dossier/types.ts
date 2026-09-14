import { Statut } from '../facturation/data';

export type DossierEventKind = 'consultation' | 'analyse' | 'urgence' | 'ordonnance' | 'document';

export type DossierEventFilter = DossierEventKind | 'tout';

/**
 * A single row of the "Parcours de soins" timeline. Sourced entirely from the
 * `patient_dossier_events` view (one query -> feeds the list, the live count,
 * and the "dernière conclusion" strip). `statutFacturation` reuses the
 * facturation module's own `Statut` type (imported, not copied) since
 * `consultations.statut` already uses the identical enum values.
 */
export interface DossierEvent {
  id: string;
  kind: DossierEventKind;
  date: string;
  titre: string;
  sousTitre?: string | null;
  acteur?: string | null;
  ref?: string | null;
  statutFacturation?: Statut | null;
  payload: Record<string, any>;
}

/** Raw shape returned by the `patient_dossier_events` view (snake_case, as Postgres returns it). */
export interface DossierEventRow {
  id: string;
  kind: DossierEventKind;
  patient_id: string;
  cabinet_id: string;
  event_date: string;
  titre: string;
  sous_titre: string | null;
  ref: string | null;
  statut_facturation: Statut | null;
  payload: Record<string, any>;
}
