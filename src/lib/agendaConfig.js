import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

// Agenda configuration for a cabinet: consultation types (with their duration) and agenda
// settings (hours, grid interval, default duration, break, working days).
// Source: public.types_consultation + public.cabinet_agenda_settings
// (migration 20260923040000_agenda_durations_and_overlap.sql).
//
// Until that migration is applied the tables don't exist. The app must keep working in the
// meantime (dev and production share one database), so a missing table is not an error: the
// config falls back to the values the app has always used, and `schemaReady` is false —
// callers then keep writing appointments exactly as before (no duree_minutes /
// type_consultation_id, which would not exist yet either).

export const DEFAULT_AGENDA_SETTINGS = {
  heureDebut: '08:00',
  heureFin: '18:00',
  pasMinutes: 15,
  dureeDefautMinutes: 30,
  pauseDebut: null,
  pauseFin: null,
  joursOuvres: [1, 2, 3, 4, 5, 6],
}

export const FALLBACK_CONSULTATION_TYPES = [
  { id: null, libelle: 'Consultation', description: 'Consultation standard ou bilan', dureeMinutes: 30, couleur: '#3b82f6' },
  { id: null, libelle: 'Suivi', description: 'Contrôle d’évolution & renouvellement', dureeMinutes: 20, couleur: '#8b5cf6' },
  { id: null, libelle: 'Urgence', description: 'Symptômes aigus, prise en charge immédiate', dureeMinutes: 15, couleur: '#ef4444' },
  { id: null, libelle: 'Examen / Analyse', description: 'Examen clinique ciblé ou prélèvements', dureeMinutes: 30, couleur: '#0ea5e9' },
]

export const DURATION_CHOICES = [10, 15, 20, 30, 45, 60, 90, 120]

const hhmm = (t) => (t ? String(t).slice(0, 5) : null)

// PostgREST: 42P01 = undefined table, PGRST205 = table not in the schema cache.
const isMissingTable = (error) => error && (error.code === '42P01' || error.code === 'PGRST205')

export async function fetchAgendaConfig(cabinetId) {
  const [typesRes, settingsRes] = await Promise.all([
    supabase
      .from('types_consultation')
      .select('id, libelle, description, duree_minutes, couleur, ordre, actif')
      .eq('cabinet_id', cabinetId)
      .order('ordre', { ascending: true }),
    supabase
      .from('cabinet_agenda_settings')
      .select('*')
      .eq('cabinet_id', cabinetId)
      .maybeSingle(),
  ])

  if (isMissingTable(typesRes.error) || isMissingTable(settingsRes.error)) {
    return { schemaReady: false, settings: DEFAULT_AGENDA_SETTINGS, types: FALLBACK_CONSULTATION_TYPES }
  }
  if (typesRes.error) throw typesRes.error
  if (settingsRes.error) throw settingsRes.error

  const s = settingsRes.data
  const settings = s
    ? {
        heureDebut: hhmm(s.heure_debut) || DEFAULT_AGENDA_SETTINGS.heureDebut,
        heureFin: hhmm(s.heure_fin) || DEFAULT_AGENDA_SETTINGS.heureFin,
        pasMinutes: s.pas_minutes || DEFAULT_AGENDA_SETTINGS.pasMinutes,
        dureeDefautMinutes: s.duree_defaut_minutes || DEFAULT_AGENDA_SETTINGS.dureeDefautMinutes,
        pauseDebut: hhmm(s.pause_debut),
        pauseFin: hhmm(s.pause_fin),
        joursOuvres: s.jours_ouvres || DEFAULT_AGENDA_SETTINGS.joursOuvres,
      }
    : DEFAULT_AGENDA_SETTINGS

  const types = (typesRes.data || []).map((t) => ({
    id: t.id,
    libelle: t.libelle,
    description: t.description || '',
    dureeMinutes: t.duree_minutes,
    couleur: t.couleur,
    actif: t.actif,
  }))

  return { schemaReady: true, settings, types: types.length ? types : FALLBACK_CONSULTATION_TYPES }
}

export function useAgendaConfig(cabinetId) {
  const query = useQuery({
    queryKey: ['agenda-config', cabinetId],
    queryFn: () => fetchAgendaConfig(cabinetId),
    enabled: Boolean(cabinetId),
    staleTime: 5 * 60 * 1000,
  })
  return {
    schemaReady: query.data?.schemaReady ?? false,
    settings: query.data?.settings ?? DEFAULT_AGENDA_SETTINGS,
    types: query.data?.types ?? FALLBACK_CONSULTATION_TYPES,
    isLoading: query.isLoading,
  }
}

export const toMinutes = (hm) => {
  const [h, m] = String(hm || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}
export const fromMinutes = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

// Start times offered by the booking form: every grid step from opening to closing, minus the
// break. The last start is the one that still begins before closing time.
export function bookableTimes(settings) {
  const start = toMinutes(settings.heureDebut)
  const end = toMinutes(settings.heureFin)
  const step = settings.pasMinutes
  const pauseStart = toMinutes(settings.pauseDebut)
  const pauseEnd = toMinutes(settings.pauseFin)
  const out = []
  if (start == null || end == null || !step) return out
  for (let m = start; m < end; m += step) {
    if (pauseStart != null && pauseEnd != null && m >= pauseStart && m < pauseEnd) continue
    out.push(fromMinutes(m))
  }
  return out
}

// SQLSTATE 23P01 = exclusion_violation (rdv_no_overlap_per_cabinet): the slot overlaps another
// appointment. Distinct from 23505 on rdv_one_active_per_patient_per_day (same patient, same day).
export const isOverlapError = (error) =>
  error?.code === '23P01' || /rdv_no_overlap_per_cabinet/.test(`${error?.message || ''} ${error?.details || ''}`)

// Friendly pre-check before saving: the first active appointment of the cabinet overlapping
// [start, start + duree). The database constraint stays the authority (and catches races);
// this only lets the form say which appointment is in the way. Returns null when the schema
// isn't migrated yet (no reliable end_time to compare against).
export async function findOverlappingAppointment({ cabinetId, startIso, dureeMinutes, excludeId, schemaReady }) {
  if (!schemaReady || !cabinetId || !startIso || !dureeMinutes) return null
  const endIso = new Date(new Date(startIso).getTime() + dureeMinutes * 60000).toISOString()
  let q = supabase
    .from('rdv')
    .select('id, date_rdv, end_time, patients(nom, prenom)')
    .eq('cabinet_id', cabinetId)
    .in('status', ['scheduled', 'confirme'])
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .order('start_time', { ascending: true })
    .limit(1)
  if (excludeId) q = q.neq('id', excludeId)
  const { data, error } = await q
  if (error) return null // the insert itself will still be checked by the database
  return data?.[0] || null
}
