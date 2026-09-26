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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanUuid(val, fallback = null) {
  if (!val || typeof val !== 'string') return fallback
  const trimmed = val.trim()
  if (trimmed === 'me' || trimmed === 'currentUser') return fallback
  if (UUID_REGEX.test(trimmed)) return trimmed
  return fallback
}

function resolveAssignee(assignedTo, fallbackUserId) {
  if (!assignedTo || assignedTo === 'me' || assignedTo === 'currentUser') {
    return cleanUuid(fallbackUserId, null)
  }
  if (assignedTo === 'secretary' || assignedTo === 'secretaire') {
    return null
  }
  return cleanUuid(assignedTo, null)
}

/**
 * Create a new task
 */
export async function createTask(cabinetId, userId, taskData) {
  if (!cabinetId || !userId) throw new Error('Missing auth context')

  const validUserId = cleanUuid(userId, null)
  const validPatientId = cleanUuid(taskData.patientId || taskData.patient_id, null)
  const assignedTo = resolveAssignee(taskData.assignedTo || taskData.assigned_to, validUserId)

  const payload = {
    cabinet_id: cabinetId,
    created_by: validUserId,
    patient_id: validPatientId,
    title: taskData.title?.trim() || 'Nouvelle tâche',
    description: taskData.description?.trim() || null,
    type: taskData.type || 'other',
    priority: taskData.priority || 'normal',
    status: 'pending',
    due_date: taskData.dueDate || new Date().toISOString(),
    due_time: taskData.dueTime || null,
    assigned_to: assignedTo
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
    completed_by: newStatus === 'completed' ? cleanUuid(userId, null) : null
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
  const payload = {}

  if ('patientId' in taskData || 'patient_id' in taskData) {
    const rawPid = taskData.patientId !== undefined ? taskData.patientId : taskData.patient_id
    payload.patient_id = cleanUuid(rawPid, null)
  }
  if ('title' in taskData) {
    payload.title = taskData.title?.trim()
  }
  if ('description' in taskData) {
    payload.description = taskData.description !== undefined ? (taskData.description?.trim() || null) : null
  }
  if ('type' in taskData) {
    payload.type = taskData.type
  }
  if ('priority' in taskData) {
    payload.priority = taskData.priority
  }
  if ('status' in taskData) {
    payload.status = taskData.status
  }
  if ('dueDate' in taskData || 'due_date' in taskData) {
    payload.due_date = taskData.dueDate !== undefined ? taskData.dueDate : taskData.due_date
  }
  if ('dueTime' in taskData || 'due_time' in taskData) {
    payload.due_time = taskData.dueTime !== undefined ? taskData.dueTime : taskData.due_time
  }
  if ('assignedTo' in taskData || 'assigned_to' in taskData) {
    const raw = taskData.assignedTo !== undefined ? taskData.assignedTo : taskData.assigned_to
    payload.assigned_to = resolveAssignee(raw, null)
  }
  if ('completed_at' in taskData) {
    payload.completed_at = taskData.completed_at
  }
  if ('completed_by' in taskData) {
    payload.completed_by = cleanUuid(taskData.completed_by, null)
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

/**
 * Execute a secure task action with server-side role enforcement (RPC: mm_execute_task_action)
 */
export async function executeTaskAction({
  taskId,
  actionKey,
  actionRole,
  note = null,
  assignTo = null,
  priority = null,
  status = null
}) {
  if (!taskId || !actionKey || !actionRole) {
    throw new Error('Paramètres d\'action manquants')
  }

  const { data, error } = await supabase.rpc('mm_execute_task_action', {
    p_task_id: taskId,
    p_action_key: actionKey,
    p_action_role: actionRole,
    p_note: note,
    p_assign_to: assignTo,
    p_priority: priority,
    p_status: status
  })

  if (error) {
    console.error('Error executing task action via RPC:', error)
    if (error.message?.includes('not authorized') || error.code === 'P0001') {
      throw new Error('Action non autorisée : votre rôle ne vous permet pas d\'exécuter cette action clinique.')
    }
    throw new Error(error.message || 'Erreur lors de l\'exécution de l\'action')
  }

  return data
}
