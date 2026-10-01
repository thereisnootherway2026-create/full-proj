import { supabase } from './supabase'

export async function confirmAppointment(rdvId) {
  const { data, error } = await supabase.rpc('confirm_appointment', {
    p_rdv_id: rdvId,
  })
  if (error) throw error
  return data
}

export async function cancelAppointment(rdvId, reason = null) {
  const { data, error } = await supabase.rpc('cancel_appointment', {
    p_rdv_id: rdvId,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function rescheduleAppointment(rdvId, scheduledAt) {
  const { data, error } = await supabase.rpc('reschedule_appointment', {
    p_rdv_id: rdvId,
    p_scheduled_at: scheduledAt,
  })
  if (error) throw error
  return data
}

export async function markAppointmentArrived(rdvId) {
  const { data, error } = await supabase.rpc('mm_mark_appointment_arrived', {
    p_rdv_id: rdvId,
  })
  if (error) throw error
  return data
}

export async function fetchAgendaRange(cabinetId, rangeStartKey, rangeEndKey) {
  if (!cabinetId) return []

  const { data, error } = await supabase
    .from('rdv')
    .select(`
      id,
      patient_id,
      date_rdv,
      status,
      notes,
      created_at,
      duree_minutes,
      type_consultation_id,
      patients (nom, prenom, telephone)
    `)
    .eq('cabinet_id', cabinetId)
    .or(`and(date_rdv.gte.${rangeStartKey}T00:00:00,date_rdv.lte.${rangeEndKey}T23:59:59),and(appointment_day.gte.${rangeStartKey},appointment_day.lte.${rangeEndKey})`)
    .order('date_rdv', { ascending: true })

  if (error) {
    const fallback = await supabase
      .from('rdv')
      .select(`
        id,
        patient_id,
        date_rdv,
        status,
        notes,
        created_at,
        patients (nom, prenom, telephone)
      `)
      .eq('cabinet_id', cabinetId)
      .or(`and(date_rdv.gte.${rangeStartKey}T00:00:00,date_rdv.lte.${rangeEndKey}T23:59:59),and(appointment_day.gte.${rangeStartKey},appointment_day.lte.${rangeEndKey})`)
      .order('date_rdv', { ascending: true })

    if (fallback.error) {
      console.error('fetchAgendaRange error:', fallback.error)
      return []
    }
    return fallback.data || []
  }

  return data || []
}
