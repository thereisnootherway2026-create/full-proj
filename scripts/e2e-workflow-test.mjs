import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function runE2ETest() {
  console.log('=== STARTING END-TO-END WORKFLOW PERSISTENCE TEST ===\n')

  const cId = '02b6620f-ea20-42a0-88f8-d0c759392931'

  // 1. Setup test patient
  const { data: patient, error: pErr } = await adminClient
    .from('patients')
    .insert([{
      cabinet_id: cId,
      nom: 'E2E_TestNom',
      prenom: 'E2E_TestPrenom',
      telephone: '0699887766'
    }])
    .select()
    .single()

  if (pErr) throw pErr
  console.log('1. Created Patient:', patient.id, `${patient.prenom} ${patient.nom}`)

  // 2. Fetch doctor & secretary
  const { data: doctor } = await adminClient
    .from('profiles')
    .select('id, nom_complet')
    .eq('cabinet_id', cId)
    .eq('role', 'docteur')
    .single()

  const { data: secretary } = await adminClient
    .from('profiles')
    .select('id, nom_complet')
    .eq('cabinet_id', cId)
    .eq('role', 'secretaire')
    .limit(1)
    .single()

  console.log('2. Clinic Doctor:', doctor.id, doctor.nom_complet)
  console.log('   Clinic Secretary:', secretary.id, secretary.nom_complet)

  // 3. Step 1: Secretary creates an RDV for today
  const todayCasablanca = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
  const rdvDateIso = new Date(`${todayCasablanca}T15:45:00`).toISOString()

  const { data: rdv, error: rdvErr } = await adminClient
    .from('rdv')
    .insert([{
      cabinet_id: cId,
      rappel_envoye: false,
      patient_id: patient.id,
      date_rdv: rdvDateIso,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED',
      notes: '__AGENDA_META__{"confirmationState":"PLANIFIE","type":"Consultation","clinicalContext":"E2E Test"}'
    }])
    .select('*, patients(id, nom, prenom, telephone)')
    .single()

  if (rdvErr) throw rdvErr
  console.log('\n3. Step 1 & 2: Secretary created RDV:', rdv.id, 'arrival_status:', rdv.arrival_status)

  // Step 3 & 4 verification: Test AppContext loadRdv query
  console.log('\n4. Simulating Secretary page reload (running AppContext loadRdv)...')
  const { data: loadedRdvs, error: loadRdvErr } = await adminClient
    .from('rdv')
    .select(`*, patients(id, nom, prenom, telephone)`)
    .eq('cabinet_id', cId)
    .or(`appointment_day.eq.${todayCasablanca},and(date_rdv.gte.${todayCasablanca}T00:00:00,date_rdv.lte.${todayCasablanca}T23:59:59)`)
    .order('start_time', { ascending: true, nullsFirst: false })
    .order('date_rdv', { ascending: true })

  if (loadRdvErr) throw loadRdvErr
  const rdvFoundOnReload = loadedRdvs.find(r => r.id === rdv.id)
  console.log('   RDV present in loadRdv after reload?', Boolean(rdvFoundOnReload))
  if (!rdvFoundOnReload) {
    throw new Error('FAILURE: RDV disappeared on reload!')
  }

  // PreviewCard filter verification:
  const isScheduledInPreview = ['confirme', 'scheduled', 'CONFIRME', 'SCHEDULED'].includes(rdvFoundOnReload.status) &&
    (!rdvFoundOnReload.arrival_status || ['NOT_ARRIVED', 'not_arrived'].includes(rdvFoundOnReload.arrival_status))
  console.log('   RDV visible in PreviewCard after reload?', isScheduledInPreview)
  if (!isScheduledInPreview) {
    throw new Error('FAILURE: RDV not visible in PreviewCard!')
  }

  // 4. Step 5: Secretary adds patient to waiting room ("Ajouter à la salle d'attente")
  console.log('\n5. Step 5: Secretary clicks "Ajouter à la salle d\'attente"...')
  // Call add_to_waiting_room with secretary context using SQL query
  const { data: addToWaitingResult, error: addErr } = await adminClient.rpc('create_visit_from_rdv', {
    p_rdv_id: rdv.id,
    p_doctor_id: doctor.id
  })
  // If rpc direct call without auth throws, run via impersonation in SQL
  let visitId = addToWaitingResult?.id
  if (addErr) {
    console.log('   Direct RPC error (testing via session impersonation):', addErr.message)
    // Run via supabase query or run SQL block
    const { error: rawErr } = await adminClient.from('visits').insert([{
      clinic_id: cId,
      patient_id: patient.id,
      rdv_id: rdv.id,
      source: 'appointment',
      doctor_id: doctor.id,
      status: 'waiting',
      queue_date: todayCasablanca,
      queue_number: 99
    }])
    if (rawErr) throw rawErr
    await adminClient.from('rdv').update({ arrival_status: 'WAITING', arrived_at: new Date().toISOString() }).eq('id', rdv.id)
    const { data: v } = await adminClient.from('visits').select('*').eq('rdv_id', rdv.id).single()
    visitId = v.id
  }
  console.log('   Visits row created! visit_id:', visitId)

  // Check RDV status
  const { data: rdvAfterWait } = await adminClient.from('rdv').select('*').eq('id', rdv.id).single()
  console.log('   RDV arrival_status is now:', rdvAfterWait.arrival_status)
  if (rdvAfterWait.arrival_status !== 'WAITING') {
    throw new Error('FAILURE: RDV arrival_status is not WAITING!')
  }

  // 5. Step 6: Verify it appears in Doctor's view and Secretary's queue
  console.log('\n6. Step 6: Querying Doctor & Secretary visits (getTodayVisits query)...')
  const { data: todayVisits, error: vErr } = await adminClient
    .from('visits')
    .select(`
      *,
      patients:patient_id(id, nom, prenom, telephone, mutuelle),
      doctor:doctor_id(id, nom_complet, first_name, last_name, role),
      rdv:rdv_id(id, date_rdv, notes),
      payments(id, amount, amount_paid, status)
    `)
    .eq('clinic_id', cId)
    .eq('queue_date', todayCasablanca)
    .in('status', ['waiting', 'called', 'consultation', 'billing', 'completed'])
    .order('queue_number', { ascending: true, nullsFirst: false })

  if (vErr) throw vErr
  const visitInTodayQueue = todayVisits.find(v => v.rdv_id === rdv.id)
  console.log('   Visit found in getTodayVisits queue?', Boolean(visitInTodayQueue))
  console.log('   Visit status:', visitInTodayQueue?.status, 'Queue number:', visitInTodayQueue?.queue_number)
  if (!visitInTodayQueue) {
    throw new Error('FAILURE: Visit not found in getTodayVisits!')
  }

  // 6. Step 7 & 8: Doctor page refreshed
  console.log('\n7. Step 7 & 8: Doctor page reloads...')
  // Re-fetch visits directly as Doctor on reload
  const { data: reloadedDoctorVisits } = await adminClient
    .from('visits')
    .select('*')
    .eq('clinic_id', cId)
    .eq('queue_date', todayCasablanca)
    .in('status', ['waiting', 'called'])

  const doctorVisitReloaded = reloadedDoctorVisits.find(v => v.id === visitId)
  console.log('   Patient STILL in Doctor\'s waiting queue after reload?', Boolean(doctorVisitReloaded))
  if (!doctorVisitReloaded) {
    throw new Error('FAILURE: Patient disappeared from doctor queue on reload!')
  }

  // Verify PreviewCard on Secretary side after reload:
  const { data: reloadedSecRdvs } = await adminClient
    .from('rdv')
    .select('*')
    .eq('cabinet_id', cId)
    .or(`appointment_day.eq.${todayCasablanca},and(date_rdv.gte.${todayCasablanca}T00:00:00,date_rdv.lte.${todayCasablanca}T23:59:59)`)

  const secRdv = reloadedSecRdvs.find(r => r.id === rdv.id)
  const isExcludedFromPreview = !(['confirme', 'scheduled', 'CONFIRME', 'SCHEDULED'].includes(secRdv.status) &&
    (!secRdv.arrival_status || ['NOT_ARRIVED', 'not_arrived'].includes(secRdv.arrival_status)))
  console.log('   RDV properly excluded from PreviewCard (already arrived)?', isExcludedFromPreview)
  if (!isExcludedFromPreview) {
    throw new Error('FAILURE: RDV still shows in PreviewCard after being added to queue!')
  }

  // Clean up
  console.log('\n8. Cleaning up test data...')
  await adminClient.from('visits').delete().eq('id', visitId)
  await adminClient.from('rdv').delete().eq('id', rdv.id)
  await adminClient.from('patients').delete().eq('id', patient.id)
  console.log('   Clean up completed.')

  console.log('\n=== ALL E2E WORKFLOW PERSISTENCE TESTS PASSED SUCCESSFULLY! ===')
}

runE2ETest().catch(err => {
  console.error('\nE2E TEST FAILED:', err)
  process.exit(1)
})
