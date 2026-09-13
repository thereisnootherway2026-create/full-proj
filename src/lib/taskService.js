import { supabase } from './supabase'

/**
 * Fetch tasks for the given cabinet
 */
export async function fetchTasks(cabinetId) {
  if (!cabinetId) throw new Error('Cabinet ID is required')
  
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      patients (nom, prenom)
    `)
    .eq('cabinet_id', cabinetId)
    .order('due_date', { ascending: true })

  if (error) {
    console.error('Error fetching tasks:', JSON.stringify(error))
    throw new Error(error.message || 'Erreur lors de la récupération des tâches')
  }

  // Map to the frontend shape
  return data.map(task => ({
    ...task,
    patientName: task.patients ? `${task.patients.prenom} ${task.patients.nom}`.trim() : null
  }))
}

/**
 * Create a new task
 */
export async function createTask(cabinetId, userId, taskData) {
  if (!cabinetId || !userId) throw new Error('Missing auth context')

  const payload = {
    cabinet_id: cabinetId,
    created_by: userId,
    patient_id: taskData.patientId || null,
    title: taskData.title?.trim() || 'Nouvelle tâche',
    description: taskData.description?.trim() || null,
    type: taskData.type || 'other',
    priority: taskData.priority || 'normal',
    status: 'pending',
    due_date: taskData.dueDate || new Date().toISOString(),
    due_time: taskData.dueTime || null,
    assigned_to: taskData.assignedTo || userId
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert([payload])
    .select(`
      *,
      patients (nom, prenom)
    `)
    .single()

  if (error) {
    console.error('Error creating task:', JSON.stringify(error))
    throw new Error(error.message || 'Erreur lors de la création de la tâche')
  }

  return {
    ...data,
    patientName: data.patients ? `${data.patients.prenom} ${data.patients.nom}`.trim() : null
  }
}

/**
 * Toggle task completion status
 */
export async function toggleTaskStatus(taskId, currentStatus, userId) {
  const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
  const payload = {
    status: newStatus,
    completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    completed_by: newStatus === 'completed' ? userId : null
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', taskId)
    .select(`
      *,
      patients (nom, prenom)
    `)
    .single()

  if (error) {
    console.error('Error updating task status:', JSON.stringify(error))
    throw new Error(error.message || 'Erreur lors de la mise à jour de la tâche')
  }

  return {
    ...data,
    patientName: data.patients ? `${data.patients.prenom} ${data.patients.nom}`.trim() : null
  }
}

/**
 * Update a task
 */
export async function updateTask(taskId, taskData) {
  const payload = {
    patient_id: taskData.patientId || null,
    title: taskData.title?.trim(),
    description: taskData.description?.trim() || null,
    type: taskData.type,
    priority: taskData.priority,
    due_date: taskData.dueDate,
    due_time: taskData.dueTime,
    assigned_to: taskData.assignedTo
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', taskId)
    .select(`
      *,
      patients (nom, prenom)
    `)
    .single()

  if (error) {
    console.error('Error updating task:', JSON.stringify(error))
    throw new Error(error.message || 'Erreur lors de la modification de la tâche')
  }

  return {
    ...data,
    patientName: data.patients ? `${data.patients.prenom} ${data.patients.nom}`.trim() : null
  }
}
