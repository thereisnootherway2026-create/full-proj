import { supabase } from './supabase'

// Examens complémentaires (public.exam_orders, migration 20260926020000). Reads go to the table
// (RLS: the caller's clinic); every change goes through an mm_exam_* RPC.

export const EXAM_BUCKET = 'exam-results'
export const EXAM_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const EXAM_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp'
export const EXAM_FILE_MAX = 10 * 1024 * 1024

export const EXAM_STATUS = {
  demande: { label: 'En attente du résultat', short: 'En attente', tone: 'slate' },
  resultat: { label: 'Résultat à revoir', short: 'À revoir', tone: 'amber' },
  revu: { label: 'Résultat revu', short: 'Revu', tone: 'emerald' },
  annule: { label: 'Annulé', short: 'Annulé', tone: 'muted' },
}
export const EXAM_CATEGORY = { biologie: 'Biologie', imagerie: 'Imagerie', autre: 'Explorations' }

const ERRORS = [
  ['exam not found', "Cet examen est introuvable."],
  ['exam cancelled', 'Cet examen a été annulé.'],
  ['empty result', 'Ajoutez un fichier ou un commentaire.'],
  ['invalid file', 'Fichier non accepté (PDF, JPG, PNG ou WEBP, 10 Mo max).'],
  ['no result to review', "Aucun résultat à revoir pour cet examen."],
  ['exam not pending', 'Seul un examen en attente peut être annulé.'],
  ['not authorized', "Vous n'avez pas l'autorisation d'effectuer cette action."],
  ['payload too large', 'Fichier trop volumineux (10 Mo max).'],
  ['mime type', 'Type de fichier non accepté (PDF, JPG, PNG ou WEBP).'],
]
export function examErrorMessage(error) {
  const raw = String(error?.message || error || '').toLowerCase()
  const hit = ERRORS.find(([needle]) => raw.includes(needle))
  return hit ? hit[1] : 'Une erreur est survenue. Réessayez dans un instant.'
}

// True when the table does not exist yet (migration not applied): callers fall back to the
// exams read from the consultation notes.
export const isMissingTable = (error) => ['42P01', 'PGRST205'].includes(error?.code)
  || (/exam_orders/.test(error?.message || '') && /does not exist|schema cache/.test(error?.message || ''))

export async function listPatientExams(patientId) {
  const { data, error } = await supabase
    .from('exam_orders')
    .select('*')
    .eq('patient_id', patientId)
    .order('requested_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

// Results waiting for the doctor, clinic-wide, oldest first (dashboard banner).
export async function listExamsToReview(limit = 50) {
  const { data, error, count } = await supabase
    .from('exam_orders')
    .select('id, label, patient_id, result_at, patients(nom, prenom)', { count: 'exact' })
    .eq('status', 'resultat')
    .order('result_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return { rows: data || [], total: count ?? (data || []).length }
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(examErrorMessage(error))
  return data
}

export const createExams = (patientId, labels) => rpc('mm_exam_create', { p_patient_id: patientId, p_labels: labels })
export const reviewExam = (id, note = null) => rpc('mm_exam_review', { p_id: id, p_note: note })
export const cancelExam = (id) => rpc('mm_exam_cancel', { p_id: id })

export function validateExamFile(file) {
  if (!file) return null
  if (!EXAM_FILE_TYPES.includes(file.type)) return 'Type de fichier non accepté (PDF, JPG, PNG ou WEBP).'
  if (file.size > EXAM_FILE_MAX) return 'Fichier trop volumineux (10 Mo max).'
  return null
}

const safeName = (name) => String(name || 'resultat').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)

// Uploads the file (if any) under <cabinet>/<patient>/<exam>/ then records the result.
// If recording fails, the just-uploaded file is removed so no orphan stays in storage.
export async function attachExamResult(exam, { file = null, comment = '' }) {
  let path = null
  if (file) {
    const problem = validateExamFile(file)
    if (problem) throw new Error(problem)
    path = `${exam.cabinet_id}/${exam.patient_id}/${exam.id}/${crypto.randomUUID()}-${safeName(file.name)}`
    const { error } = await supabase.storage.from(EXAM_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(examErrorMessage(error))
  }
  try {
    return await rpc('mm_exam_attach_result', {
      p_id: exam.id,
      p_file_path: path,
      p_file_name: file ? String(file.name).slice(0, 200) : null,
      p_file_mime: file ? file.type : null,
      p_comment: comment.trim() || null,
    })
  } catch (err) {
    if (path) await supabase.storage.from(EXAM_BUCKET).remove([path]).catch(() => {})
    throw err
  }
}

// Short-lived link to view the result file; never a public URL.
export async function openExamResult(exam) {
  const { data, error } = await supabase.storage.from(EXAM_BUCKET).createSignedUrl(exam.result_file_path, 120)
  if (error || !data?.signedUrl) throw new Error("Impossible d'ouvrir le fichier du résultat.")
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

// Groups one patient's exams by prescription (same consultation, or same day when added by hand).
export function groupExams(exams) {
  const groups = new Map()
  for (const e of exams) {
    const key = e.encounter_id || `manual-${String(e.requested_at).slice(0, 10)}`
    if (!groups.has(key)) groups.set(key, { key, encounterId: e.encounter_id, date: e.requested_at, exams: [] })
    groups.get(key).exams.push(e)
  }
  return [...groups.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)))
}
