import { supabase } from './supabase'

const VISIT_SELECT = `
  *,
  patients:patient_id(id, nom, prenom, telephone, allergies, mutuelle),
  doctor:doctor_id(id, nom_complet, first_name, last_name, role),
  rdv:rdv_id(id, date_rdv, notes)
`

export async function getDoctors(clinicId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nom_complet, first_name, last_name, role, status')
    .eq('cabinet_id', clinicId)
    .in('role', ['doctor', 'docteur', 'medecin', 'médecin'])
    .order('nom_complet', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getTodayVisits(clinicId) {
  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_SELECT)
    .eq('clinic_id', clinicId)
    .eq('queue_date', today)
    .in('status', ['waiting', 'called', 'consultation', 'billing', 'completed'])
    .order('queue_number', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data || []
}

export async function getDoctorQueue(clinicId, doctorId) {
  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_SELECT)
    .eq('clinic_id', clinicId)
    .eq('doctor_id', doctorId)
    .eq('queue_date', today)
    .in('status', ['waiting', 'called'])
    .order('queue_number', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data || []
}

export async function addAppointmentToWaitingRoom(rdvId, doctorId) {
  const { data, error } = await supabase.rpc('create_visit_from_rdv', {
    p_rdv_id: rdvId,
    p_doctor_id: doctorId,
  })

  if (error) throw error
  return data
}

export async function callPatient(visitId) {
  const { data, error } = await supabase.rpc('call_patient', {
    p_visit_id: visitId,
  })

  if (error) throw error
  return data
}

export async function openConsultation(visitId) {
  const { data, error } = await supabase.rpc('open_consultation', {
    p_visit_id: visitId,
  })

  if (error) throw error
  return data
}

export async function refreshConsultationLock(consultationId) {
  const { data, error } = await supabase.rpc('refresh_consultation_lock', {
    p_consultation_id: consultationId,
  })

  if (error) throw error
  return data
}

export async function releaseConsultationLock(consultationId) {
  const { error } = await supabase.rpc('release_consultation_lock', {
    p_consultation_id: consultationId,
  })

  if (error) throw error
}

export async function completeConsultation(consultationId, payload) {
  const { data, error } = await supabase.rpc('complete_consultation', {
    p_consultation_id: consultationId,
    p_chief_complaint: payload.chiefComplaint || '',
    p_diagnosis: payload.diagnosis || '',
    p_treatment: payload.treatment || '',
    p_notes: payload.notes || '',
    p_billing_amount: Number(payload.billingAmount || 0),
    p_billing_type: payload.billingType || 'cash',
  })

  if (error) throw error
  return data
}

export async function autosaveConsultation(consultationId, draft) {
  const { error } = await supabase
    .from('consultations')
    .update({
      chief_complaint: draft.chiefComplaint || '',
      notes: draft.history || '',
      diagnosis: draft.primaryDiagnosis || '',
      treatment: draft.treatmentPlan || '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultationId)

  if (error) throw error
}


export async function getConsultationByVisit(visitId) {
  const { data, error } = await supabase
    .from('consultations')
    .select(`
      *,
      visits:visit_id(*, patients:patient_id(id, nom, prenom, telephone, allergies, mutuelle))
    `)
    .eq('visit_id', visitId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getBillingQueue(clinicId) {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      visits:visit_id(*, patients:patient_id(id, nom, prenom, telephone, mutuelle)),
      consultations:consultation_id(id, billing_type, billing_amount, created_at)
    `)
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).filter((payment) => payment.visits?.status === 'billing')
}

export async function processVisitPayment(visitId, method, amount) {
  const { data, error } = await supabase.rpc('process_visit_payment', {
    p_visit_id: visitId,
    p_method: method,
    p_amount: Number(amount || 0),
  })

  if (error) throw error
  return data
}

export async function createWalkInVisit(patientId, doctorId) {
  const { data, error } = await supabase.rpc('create_walk_in_visit', {
    p_patient_id: patientId,
    p_doctor_id: doctorId,
  })

  if (error) throw error
  return data
}

export async function reassignVisitDoctor(visitId, doctorId) {
  const { data, error } = await supabase.rpc('reassign_visit_doctor', {
    p_visit_id: visitId,
    p_doctor_id: doctorId,
  })

  if (error) throw error
  return data
}

export async function cancelVisit(visitId, reason = null) {
  const { data, error } = await supabase.rpc('cancel_visit', {
    p_visit_id: visitId,
    p_reason: reason,
  })

  if (error) throw error
  return data
}

export async function adminOverrideConsultationLock(consultationId) {
  const { data, error } = await supabase.rpc('admin_override_consultation_lock', {
    p_consultation_id: consultationId,
  })

  if (error) throw error
  return data
}

export async function getTodayVisitForPatient(clinicId, patientId) {
  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_SELECT)
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .eq('queue_date', today)
    .in('status', ['scheduled', 'arrived', 'waiting', 'called', 'consultation', 'billing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export function subscribeClinicVisits(clinicId, onChange) {
  return supabase
    .channel(`clinic:${clinicId}:visits`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'visits', filter: `clinic_id=eq.${clinicId}` },
      onChange
    )
    .subscribe()
}

export function subscribeClinicPayments(clinicId, onChange) {
  return supabase
    .channel(`clinic:${clinicId}:payments`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'payments', filter: `clinic_id=eq.${clinicId}` },
      onChange
    )
    .subscribe()
}

const TZ = 'Africa/Casablanca'

const PAYMENT_BILLING_SELECT = `
  *,
  visits:visit_id(*, patients:patient_id(id, nom, prenom, telephone, cin, mutuelle, assurance)),
  consultations:consultation_id(id, billing_type, billing_amount, notes, created_at),
  patients:patient_id(id, nom, prenom, telephone, cin, mutuelle, assurance)
`

const CONSULTATION_BILLING_SELECT = `
  *,
  patients:patient_id(id, nom, prenom, telephone, cin, mutuelle, assurance)
`

function todayInTz() {
  return new Date().toLocaleDateString('fr-CA', { timeZone: TZ })
}

function dateKeyInTz(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-CA', { timeZone: TZ })
}

function mapPaymentToRecord(payment) {
  const patient = payment.patients || payment.visits?.patients
  return {
    id: payment.id,
    visit_id: payment.visit_id,
    consultation_id: payment.consultation_id,
    patients: patient,
    montant: Number(payment.amount || payment.consultations?.billing_amount || 0),
    status: payment.status === 'paid' ? 'paid' : 'pending',
    paymentMethod: payment.method,
    created_at: payment.paid_at || payment.created_at,
    notes: payment.consultations?.notes || '',
    source: 'payment',
  }
}

function mapConsultationToRecord(consultation) {
  return {
    id: `consult_${consultation.id}`,
    visit_id: consultation.visit_id || null,
    consultation_id: consultation.id,
    patients: consultation.patients,
    montant: Number(consultation.billing_amount || consultation.montant || 0),
    status: consultation.statut === 'paye' ? 'paid' : 'pending',
    paymentMethod: consultation.billing_type || null,
    created_at: consultation.completed_at || consultation.created_at || consultation.date_consult,
    notes: consultation.notes || '',
    source: 'consultation',
  }
}

export async function getBillingRecords(clinicId) {
  const [paymentsRes, consultationsRes] = await Promise.all([
    supabase
      .from('payments')
      .select(PAYMENT_BILLING_SELECT)
      .eq('clinic_id', clinicId)
      .in('status', ['pending', 'paid'])
      .order('created_at', { ascending: false }),
    supabase
      .from('consultations')
      .select(CONSULTATION_BILLING_SELECT)
      .or(`cabinet_id.eq.${clinicId},clinic_id.eq.${clinicId}`)
      .is('visit_id', null)
      .neq('statut', 'annule')
      .order('created_at', { ascending: false }),
  ])

  if (paymentsRes.error) throw paymentsRes.error
  if (consultationsRes.error) throw consultationsRes.error

  const paymentConsultIds = new Set(
    (paymentsRes.data || []).map((p) => p.consultation_id).filter(Boolean)
  )

  const paymentRecords = (paymentsRes.data || []).map(mapPaymentToRecord)
  const standaloneRecords = (consultationsRes.data || [])
    .filter((c) => !paymentConsultIds.has(c.id))
    .map(mapConsultationToRecord)

  return [...paymentRecords, ...standaloneRecords].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )
}

export async function getRecentTransactions(clinicId, limit = 5) {
  const records = await getBillingRecords(clinicId)
  return records.slice(0, limit).map((r) => ({
    id: r.id,
    name: r.patients ? `${r.patients.prenom || ''} ${r.patients.nom || ''}`.trim() : 'Patient Inconnu',
    amount: r.montant,
    status: r.status === 'paid' ? 'success' : 'pending',
    date: r.created_at,
    method: r.paymentMethod,
    record: r,
  }))
}

export async function getBillingStats(clinicId) {
  const records = await getBillingRecords(clinicId)
  const today = todayInTz()

  const paidRecords = records.filter((r) => r.status === 'paid')
  const pendingRecords = records.filter((r) => r.status === 'pending')
  const todayRecords = records.filter((r) => dateKeyInTz(r.created_at) === today)

  const totalRevenue = paidRecords.reduce((sum, r) => sum + r.montant, 0)
  const pendingAmount = pendingRecords.reduce((sum, r) => sum + r.montant, 0)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()

  const monthPaid = paidRecords
    .filter((r) => new Date(r.created_at) >= monthStart)
    .reduce((sum, r) => sum + r.montant, 0)

  const lastMonthPaid = paidRecords
    .filter((r) => {
      const d = new Date(r.created_at)
      return d >= lastMonthStart && d <= lastMonthEnd
    })
    .reduce((sum, r) => sum + r.montant, 0)

  let growthPercentage = 0
  if (lastMonthPaid > 0) {
    growthPercentage = Math.round(((monthPaid - lastMonthPaid) / lastMonthPaid) * 100)
  } else if (monthPaid > 0) {
    growthPercentage = 100
  }

  const monthPending = pendingRecords
    .filter((r) => new Date(r.created_at) >= monthStart)
    .reduce((sum, r) => sum + r.montant, 0)

  const dailyAvg = dayOfMonth > 0 ? monthPaid / dayOfMonth : 0
  const projectedMonthly = Math.round(dailyAvg * daysInMonth + monthPending)

  return {
    totalRevenue,
    growthPercentage,
    todayConsultations: todayRecords.length,
    pendingCount: pendingRecords.length,
    pendingAmount,
    projectedMonthly,
  }
}

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function buildDayBuckets(days) {
  const buckets = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('fr-CA', { timeZone: TZ })
    const dayIndex = new Date(d.toLocaleString('en-US', { timeZone: TZ })).getDay()
    buckets.push({ key, jour: DAY_LABELS[dayIndex], value: 0, count: 0 })
  }
  return buckets
}

export async function getDailyRevenue(clinicId, days = 7) {
  const records = await getBillingRecords(clinicId)
  const paidRecords = records.filter(r => r.status === 'paid')

  const buckets = buildDayBuckets(days)
  const bucketMap = Object.fromEntries(buckets.map((b) => [b.key, b]))

  paidRecords.forEach((r) => {
    const key = dateKeyInTz(r.created_at)
    if (bucketMap[key]) {
      bucketMap[key].value += Number(r.montant || 0)
      bucketMap[key].count += 1
    }
  })

  return buckets
}

export async function getDailyForecast(clinicId, days = 7) {
  const records = await getBillingRecords(clinicId)
  const pendingRecords = records.filter(r => r.status === 'pending')

  const buckets = buildDayBuckets(days)
  const bucketMap = Object.fromEntries(buckets.map((b) => [b.key, b]))

  pendingRecords.forEach((r) => {
    const key = dateKeyInTz(r.created_at)
    if (bucketMap[key]) {
      bucketMap[key].value += Number(r.montant || 0)
      bucketMap[key].count += 1
    }
  })

  return buckets
}

const PAYMENT_MODE_COLORS = {
  Espèces: '#2563eb',
  Assurance: '#f97316',
  TPE: '#3B82F6',
  Chèque: '#6b7280',
}

const METHOD_LABELS = {
  cash: 'Espèces',
  especes: 'Espèces',
  card: 'TPE',
  tpe: 'TPE',
  insurance: 'Assurance',
  assurance: 'Assurance',
  cheque: 'Chèque',
  transfer: 'Espèces',
  virement: 'Espèces',
}

export async function getPaymentMethodBreakdown(clinicId) {
  const records = await getBillingRecords(clinicId)
  const paidRecords = records.filter(r => r.status === 'paid')

  const totals = { Espèces: 0, Assurance: 0, TPE: 0, Chèque: 0 }
  paidRecords.forEach((r) => {
    const label = METHOD_LABELS[r.paymentMethod] || 'Espèces'
    if (totals[label] !== undefined) {
      totals[label] += Number(r.montant || 0)
    }
  })

  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0)

  if (grandTotal === 0) {
    return [
      { name: 'Espèces', value: 0, amount: 0, color: PAYMENT_MODE_COLORS['Espèces'] },
      { name: 'Assurance', value: 0, amount: 0, color: PAYMENT_MODE_COLORS['Assurance'] },
      { name: 'TPE', value: 0, amount: 0, color: PAYMENT_MODE_COLORS['TPE'] },
      { name: 'Chèque', value: 0, amount: 0, color: PAYMENT_MODE_COLORS['Chèque'] },
    ]
  }

  const result = Object.entries(totals).map(([name, amount]) => ({
    name,
    value: Math.round((amount / grandTotal) * 100),
    amount,
    color: PAYMENT_MODE_COLORS[name],
  }))

  // Ensure sum equals 100% by adjusting highest value if rounding leads to 99% or 101%
  const sumValues = result.reduce((s, r) => s + r.value, 0)
  if (sumValues > 0 && sumValues !== 100) {
    const maxItem = result.reduce((max, item) => item.value > max.value ? item : max, result[0])
    maxItem.value += (100 - sumValues)
  }

  return result
}

const HEATMAP_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const HEATMAP_HOURS = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19']

export async function getActivityHeatmap(clinicId) {
  const [paymentsRes, consultationsRes] = await Promise.all([
    supabase
      .from('payments')
      .select('paid_at, created_at, status')
      .eq('clinic_id', clinicId)
      .in('status', ['paid', 'pending']),
    supabase
      .from('consultations')
      .select('created_at, completed_at')
      .or(`cabinet_id.eq.${clinicId},clinic_id.eq.${clinicId}`),
  ])

  if (paymentsRes.error) throw paymentsRes.error
  if (consultationsRes.error) throw consultationsRes.error

  const grid = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0))

  const addTimestamp = (iso) => {
    if (!iso) return
    const d = new Date(iso)
    if (isNaN(d.getTime())) return
    const local = new Date(d.toLocaleString('en-US', { timeZone: TZ }))
    const jsDay = local.getDay()
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1
    const hour = local.getHours()
    const hourIdx = hour - 8
    if (dayIdx >= 0 && dayIdx < 7 && hourIdx >= 0 && hourIdx < 12) {
      grid[dayIdx][hourIdx] += 1
    }
  }

  ;(paymentsRes.data || []).forEach((p) => {
    addTimestamp(p.status === 'paid' ? p.paid_at || p.created_at : p.created_at)
  })
  ;(consultationsRes.data || []).forEach((c) => {
    addTimestamp(c.completed_at || c.created_at)
  })

  const maxCount = Math.max(1, ...grid.flat())

  return {
    days: HEATMAP_DAYS,
    hours: HEATMAP_HOURS,
    grid: grid.map((row) => row.map((count) => {
      if (count === 0) return 0
      if (count <= maxCount * 0.25) return 1
      if (count <= maxCount * 0.5) return 2
      return 3
    })),
    rawCounts: grid,
  }
}

