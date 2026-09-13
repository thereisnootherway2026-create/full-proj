import { supabase } from './supabase'

export async function getPreparationItems(visitId) {
  if (!visitId) return []
  
  const { data, error } = await supabase
    .from('consultation_preparations')
    .select('*')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching preparation items:', error)
    return []
  }

  return data || []
}

export async function addPreparationItem(clinicId, visitId, text) {
  if (!visitId || !text || !clinicId) return null

  const { data, error } = await supabase
    .from('consultation_preparations')
    .insert([{
      cabinet_id: clinicId,
      visit_id: visitId,
      text: text,
      status: 'pending'
    }])
    .select()
    .single()

  if (error) {
    console.error('Error adding preparation item:', error)
    throw error
  }

  return data
}

export async function updatePreparationItemStatus(itemId, status) {
  if (!itemId || !['pending', 'completed', 'dismissed'].includes(status)) return null

  const updates = { status }
  
  if (status === 'completed') {
    updates.completed_at = new Date().toISOString()
  } else {
    updates.completed_at = null
  }

  const { data, error } = await supabase
    .from('consultation_preparations')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single()

  if (error) {
    console.error('Error updating preparation item status:', error)
    throw error
  }

  return data
}
