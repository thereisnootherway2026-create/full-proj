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
