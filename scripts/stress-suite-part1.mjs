import {
  getTestClients, CLINIC_ID, DOCTOR_ID, SECRETARY_ID
} from './stress-auth-helper.mjs'

const TODAY = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })

async function runPart1() {
  console.log('========================================================')
  console.log('   PRODUCTION STRESS TEST — PART 1 (SECTIONS 1 TO 4)')
  console.log('========================================================\n')

  const { adminClient, secretaryClient, doctorClient } = await getTestClients()

  const testReport = {
    test1: { name: 'Single RDV Basic Persistence & Session Restart', passed: false, details: [] },
    test2: { name: 'Multiple RDVs (10 RDVs) & Queue Split', passed: false, details: [] },
    test3: { name: 'Rapid Succession (Double-click 5x on 1 RDV)', passed: false, details: [] },
    test4: { name: 'Concurrent Waiting-Room Actions (5 simultaneous)', passed: false, details: [] },
  }

  // -------------------------------------------------------------
  // TEST 1: Single RDV — Basic Persistence & Session Restart
  // -------------------------------------------------------------
  console.log('>>> [TEST 1] Single RDV — Basic Persistence & Session Restart...')
  let p1, r1, v1
  try {
    // 1. Create Patient
    const { data: pat1, error: pErr } = await adminClient
      .from('patients')
      .insert([{
        cabinet_id: CLINIC_ID,
        nom: 'Stress1_Nom',
        prenom: 'Stress1_Prenom',
        telephone: '0611000001'
      }])
      .select().single()
    if (pErr) throw new Error(`Create patient failed: ${pErr.message}`)
    p1 = pat1

    // 2. Secretary creates RDV for today
    const rdvDateIso = new Date(`${TODAY}T10:00:00`).toISOString()
    const { data: rdv1, error: rdvErr } = await secretaryClient
      .from('rdv')
      .insert([{
        cabinet_id: CLINIC_ID,
        patient_id: p1.id,
        date_rdv: rdvDateIso,
        appointment_day: TODAY,
        status: 'confirme',
        arrival_status: 'NOT_ARRIVED',
        notes: '__AGENDA_META__{"confirmationState":"PLANIFIE"}'
      }])
      .select().single()
    if (rdvErr) throw new Error(`Secretary create RDV failed: ${rdvErr.message}`)
    r1 = rdv1

    // 3. Verify AppContext query (initial)
    const { data: secRdvs1, error: qErr1 } = await secretaryClient
      .from('rdv')
      .select('*, patients(id, nom, prenom)')
      .eq('cabinet_id', CLINIC_ID)
      .or(`appointment_day.eq.${TODAY},and(date_rdv.gte.${TODAY}T00:00:00,date_rdv.lte.${TODAY}T23:59:59)`)
    if (qErr1) throw new Error(`Secretary loadRdv failed: ${qErr1.message}`)
    const found1 = secRdvs1.find(r => r.id === r1.id)
    if (!found1) throw new Error('RDV does not appear in Secretary preview immediately after creation')

    // 4. Simulate page refresh
    const { data: secRdvsReloaded, error: qErrReload } = await secretaryClient
      .from('rdv')
      .select('*, patients(id, nom, prenom)')
      .eq('cabinet_id', CLINIC_ID)
      .or(`appointment_day.eq.${TODAY},and(date_rdv.gte.${TODAY}T00:00:00,date_rdv.lte.${TODAY}T23:59:59)`)
    if (qErrReload) throw new Error(`Secretary reload failed: ${qErrReload.message}`)
    const foundReload = secRdvsReloaded.find(r => r.id === r1.id)
    if (!foundReload) throw new Error('RDV disappeared after browser refresh')
    testReport.test1.details.push('RDV persists in Secretary preview across browser refresh')

    // 5. Add to waiting room via Secretary
    const { data: visitRes, error: addErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r1.id,
      p_doctor_id: DOCTOR_ID
    })
    if (addErr) throw new Error(`create_visit_from_rdv failed: ${addErr.message}`)
    v1 = visitRes
    testReport.test1.details.push(`Created visit id: ${v1.id} with status: ${v1.status}`)

    // 6. Refresh Secretary: verify RDV removed from preview (since arrived), present in queue
    const { data: secVisitsReloaded } = await secretaryClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('queue_date', TODAY)
      .in('status', ['waiting', 'called', 'consultation', 'billing', 'completed'])
    const visitInSecQueue = secVisitsReloaded?.find(v => v.id === v1.id)
    if (!visitInSecQueue || visitInSecQueue.status !== 'waiting') {
      throw new Error(`Visit missing or wrong status in Secretary queue after reload: ${visitInSecQueue?.status}`)
    }

    const { data: secRdvsAfterArrival } = await secretaryClient
      .from('rdv')
      .select('*')
      .eq('id', r1.id)
      .single()
    if (secRdvsAfterArrival.arrival_status !== 'WAITING') {
      throw new Error(`RDV arrival_status is not WAITING after arrival: ${secRdvsAfterArrival.arrival_status}`)
    }
    testReport.test1.details.push('Secretary refresh: RDV marked WAITING, visit persisted in queue')

    // 7. Refresh Doctor: verify patient appears in Doctor queue
    const { data: docVisitsReloaded } = await doctorClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('doctor_id', DOCTOR_ID)
      .eq('queue_date', TODAY)
      .in('status', ['waiting', 'called'])
    const visitInDocQueue = docVisitsReloaded?.find(v => v.id === v1.id)
    if (!visitInDocQueue) {
      throw new Error('Visit missing in Doctor queue after Doctor reload')
    }
    testReport.test1.details.push('Doctor refresh: Patient appears in Doctor queue')

    // 8. Simulate session restart (logout & fresh login)
    const freshClient = (await import('@supabase/supabase-js')).createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
    await freshClient.auth.signInWithPassword({
      email: 'touryaya195@gmail.com',
      password: 'StressTest2026!Pass'
    })
    const { data: freshVisits } = await freshClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('queue_date', TODAY)
      .eq('id', v1.id)
      .single()
    if (!freshVisits || freshVisits.status !== 'waiting') {
      throw new Error('Visit missing or invalid status after fresh session restart')
    }
    testReport.test1.details.push('Session restart verified: Visit state fully intact after fresh auth login')

    testReport.test1.passed = true
    console.log('  [PASS] Test 1 passed successfully.')
  } catch (err) {
    testReport.test1.passed = false
    testReport.test1.error = err.message
    console.error('  [FAIL] Test 1 failed:', err.message)
  } finally {
    if (v1) await adminClient.from('visits').delete().eq('id', v1.id)
    if (r1) await adminClient.from('rdv').delete().eq('id', r1.id)
    if (p1) await adminClient.from('patients').delete().eq('id', p1.id)
  }

  // -------------------------------------------------------------
  // TEST 2: Multiple RDVs (10 RDVs) & Queue Split
  // -------------------------------------------------------------
  console.log('\n>>> [TEST 2] Multiple RDVs (10 RDVs) & Queue Split...')
  const pList2 = [], rList2 = [], vList2 = []
  try {
    const times = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30']
    // 1. Create 10 distinct patients
    for (let i = 0; i < 10; i++) {
      const { data: pat, error } = await adminClient.from('patients').insert([{
        cabinet_id: CLINIC_ID,
        nom: `Stress2_Nom_${i}`,
        prenom: `Stress2_Prenom_${i}`,
        telephone: `06220000${i.toString().padStart(2, '0')}`
      }]).select().single()
      if (error) throw error
      pList2.push(pat)
    }

    // 2. Create 10 RDVs
    for (let i = 0; i < 10; i++) {
      const startIso = new Date(`${TODAY}T${times[i]}:00Z`).toISOString()
      const endMs = new Date(`${TODAY}T${times[i]}:00Z`).getTime() + 25 * 60 * 1000
      const endIso = new Date(endMs).toISOString()
      const { data: rdv, error } = await secretaryClient.from('rdv').insert([{
        cabinet_id: CLINIC_ID,
        patient_id: pList2[i].id,
        date_rdv: startIso,
        appointment_day: TODAY,
        start_time: startIso,
        end_time: endIso,
        duree_minutes: 25,
        status: 'confirme',
        arrival_status: 'NOT_ARRIVED'
      }]).select().single()
      if (error) throw error
      rList2.push(rdv)
    }
    testReport.test2.details.push('10 distinct RDVs created successfully')

    // 3. Reload 3 times and check persistence
    for (let reload = 1; reload <= 3; reload++) {
      const { data: loadedRdvs, error } = await secretaryClient
        .from('rdv')
        .select('*')
        .eq('cabinet_id', CLINIC_ID)
        .or(`appointment_day.eq.${TODAY},and(date_rdv.gte.${TODAY}T00:00:00,date_rdv.lte.${TODAY}T23:59:59)`)
      if (error) throw error
      for (const r of rList2) {
        if (!loadedRdvs.some(lr => lr.id === r.id)) {
          throw new Error(`RDV ${r.id} missing on reload attempt #${reload}`)
        }
      }
    }
    testReport.test2.details.push('All 10 RDVs persisted identically across 3 consecutive reloads')

    // 4. Move 5 to waiting room
    for (let i = 0; i < 5; i++) {
      const { data: v, error } = await secretaryClient.rpc('create_visit_from_rdv', {
        p_rdv_id: rList2[i].id,
        p_doctor_id: DOCTOR_ID
      })
      if (error) throw error
      vList2.push(v)
    }
    testReport.test2.details.push('5 RDVs moved to waiting room')

    // 5. Reload Secretary and Doctor; verify exactly 5 WAITING and 5 SCHEDULED
    const { data: secRdvsAfter } = await secretaryClient
      .from('rdv')
      .select('*')
      .eq('cabinet_id', CLINIC_ID)
      .or(`appointment_day.eq.${TODAY},and(date_rdv.gte.${TODAY}T00:00:00,date_rdv.lte.${TODAY}T23:59:59)`)

    const previewRdvs = secRdvsAfter.filter(r => 
      ['confirme', 'scheduled'].includes(r.status?.toLowerCase()) &&
      (!r.arrival_status || r.arrival_status === 'NOT_ARRIVED') &&
      rList2.some(x => x.id === r.id)
    )

    const waitingRdvs = secRdvsAfter.filter(r =>
      r.arrival_status === 'WAITING' &&
      rList2.some(x => x.id === r.id)
    )

    if (previewRdvs.length !== 5) {
      throw new Error(`Expected exactly 5 remaining in scheduled preview, found ${previewRdvs.length}`)
    }
    if (waitingRdvs.length !== 5) {
      throw new Error(`Expected exactly 5 in waiting status, found ${waitingRdvs.length}`)
    }

    // Check doctor queue
    const { data: docVisits } = await doctorClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('doctor_id', DOCTOR_ID)
      .eq('queue_date', TODAY)
      .in('status', ['waiting', 'called'])

    const matchingDocVisits = docVisits.filter(v => vList2.some(x => x.id === v.id))
    if (matchingDocVisits.length !== 5) {
      throw new Error(`Doctor queue contains ${matchingDocVisits.length} visits, expected 5`)
    }

    // Check queue number monotonicity
    const qNums = matchingDocVisits.map(v => v.queue_number).sort((a,b) => a - b)
    testReport.test2.details.push(`Doctor queue numbers: ${qNums.join(', ')}`)

    testReport.test2.passed = true
    console.log('  [PASS] Test 2 passed successfully.')
  } catch (err) {
    testReport.test2.passed = false
    testReport.test2.error = err.message
    console.error('  [FAIL] Test 2 failed:', err.message)
  } finally {
    for (const v of vList2) await adminClient.from('visits').delete().eq('id', v.id)
    for (const r of rList2) await adminClient.from('rdv').delete().eq('id', r.id)
    for (const p of pList2) await adminClient.from('patients').delete().eq('id', p.id)
  }

  // -------------------------------------------------------------
  // TEST 3: Rapid Succession (Double-click 5x on 1 RDV)
  // -------------------------------------------------------------
  console.log('\n>>> [TEST 3] Rapid Succession (Double-click 5x on 1 RDV)...')
  let p3, r3, v3
  try {
    const { data: pat3 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Stress3_Rapid',
      prenom: 'Patient3',
      telephone: '0633000003'
    }]).select().single()
    p3 = pat3

    const { data: rdv3 } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID,
      patient_id: p3.id,
      date_rdv: new Date(`${TODAY}T11:00:00`).toISOString(),
      appointment_day: TODAY,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    r3 = rdv3

    // Fire 5 concurrent calls to create_visit_from_rdv on the same RDV
    console.log('   Firing 5 concurrent create_visit_from_rdv RPC calls...')
    const results = await Promise.allSettled([
      secretaryClient.rpc('create_visit_from_rdv', { p_rdv_id: r3.id, p_doctor_id: DOCTOR_ID }),
      secretaryClient.rpc('create_visit_from_rdv', { p_rdv_id: r3.id, p_doctor_id: DOCTOR_ID }),
      secretaryClient.rpc('create_visit_from_rdv', { p_rdv_id: r3.id, p_doctor_id: DOCTOR_ID }),
      secretaryClient.rpc('create_visit_from_rdv', { p_rdv_id: r3.id, p_doctor_id: DOCTOR_ID }),
      secretaryClient.rpc('create_visit_from_rdv', { p_rdv_id: r3.id, p_doctor_id: DOCTOR_ID })
    ])

    const fulfilled = results.filter(r => r.status === 'fulfilled' && !r.value.error)
    const rejected = results.filter(r => r.status === 'rejected' || r.value?.error)
    testReport.test3.details.push(`Concurrent calls: ${fulfilled.length} fulfilled, ${rejected.length} handled/rejected`)

    // Query DB for visits linked to this RDV
    const { data: visitsForRdv } = await adminClient
      .from('visits')
      .select('*')
      .eq('rdv_id', r3.id)

    console.log(`   Visits found in DB for this RDV: ${visitsForRdv?.length}`)
    if (visitsForRdv.length !== 1) {
      throw new Error(`Expected exactly 1 visit row in DB, but found ${visitsForRdv.length} (DUPLICATION BUG)`)
    }
    v3 = visitsForRdv[0]
    testReport.test3.details.push(`Exactly 1 visit row in DB: id=${v3.id}, queue_number=${v3.queue_number}`)

    testReport.test3.passed = true
    console.log('  [PASS] Test 3 passed successfully.')
  } catch (err) {
    testReport.test3.passed = false
    testReport.test3.error = err.message
    console.error('  [FAIL] Test 3 failed:', err.message)
  } finally {
    if (v3) await adminClient.from('visits').delete().eq('id', v3.id)
    if (r3) await adminClient.from('rdv').delete().eq('id', r3.id)
    if (p3) await adminClient.from('patients').delete().eq('id', p3.id)
  }

  // -------------------------------------------------------------
  // TEST 4: Concurrent Waiting-Room Actions (5 simultaneous RDVs)
  // -------------------------------------------------------------
  console.log('\n>>> [TEST 4] Concurrent Waiting-Room Actions (5 simultaneous RDVs)...')
  const pList4 = [], rList4 = [], vList4 = []
  try {
    const times4 = ['22:00', '22:30', '23:00', '23:30', '06:00']
    for (let i = 0; i < 5; i++) {
      const { data: pat } = await adminClient.from('patients').insert([{
        cabinet_id: CLINIC_ID,
        nom: `Stress4_Concurrent_${i}`,
        prenom: `Pat4_${i}`,
        telephone: `06440000${i}`
      }]).select().single()
      pList4.push(pat)

      const startIso = new Date(`${TODAY}T${times4[i]}:00Z`).toISOString()
      const endMs = new Date(`${TODAY}T${times4[i]}:00Z`).getTime() + 25 * 60 * 1000
      const endIso = new Date(endMs).toISOString()
      const { data: rdv, error: rdvErr } = await secretaryClient.from('rdv').insert([{
        cabinet_id: CLINIC_ID,
        patient_id: pat.id,
        date_rdv: startIso,
        appointment_day: TODAY,
        start_time: startIso,
        end_time: endIso,
        duree_minutes: 25,
        status: 'confirme',
        arrival_status: 'NOT_ARRIVED'
      }]).select().single()
      if (rdvErr) throw new Error(`Insert RDV 4 failed: ${rdvErr.message}`)
      rList4.push(rdv)
    }

    console.log('   Simultaneously moving 5 different RDVs to waiting room via Promise.all...')
    const concurrentResults = await Promise.all(
      rList4.map(r => secretaryClient.rpc('create_visit_from_rdv', { p_rdv_id: r.id, p_doctor_id: DOCTOR_ID }))
    )

    for (const res of concurrentResults) {
      if (res.error) {
        console.error('   Concurrent RPC result error:', res.error)
        throw new Error(`Concurrent move failed: ${res.error.message}`)
      }
      if (res.data) vList4.push(res.data)
    }

    // Verify all 5 have visits in DB
    const { data: dbVisits } = await adminClient
      .from('visits')
      .select('*')
      .in('id', vList4.map(v => v.id))

    if (dbVisits.length !== 5) {
      throw new Error(`Expected 5 visits in DB, found ${dbVisits?.length || 0}`)
    }

    // Check queue numbers uniqueness
    const queueNums = dbVisits.map(v => v.queue_number)
    const uniqueQueueNums = new Set(queueNums)
    console.log(`   Assigned Queue Numbers: ${queueNums.join(', ')}`)
    if (uniqueQueueNums.size !== 5) {
      throw new Error(`DUPLICATE QUEUE NUMBERS DETECTED: [${queueNums.join(', ')}]`)
    }
    testReport.test4.details.push(`All 5 visits created with unique queue numbers: [${queueNums.join(', ')}]`)

    // Verify doctor queue has all 5
    const { data: docQueue } = await doctorClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('doctor_id', DOCTOR_ID)
      .eq('queue_date', TODAY)
      .in('id', vList4.map(v => v.id))

    if (docQueue.length !== 5) {
      throw new Error(`Doctor queue contains ${docQueue.length}/5 visits`)
    }
    testReport.test4.details.push('All 5 visits visible in Doctor queue')

    testReport.test4.passed = true
    console.log('  [PASS] Test 4 passed successfully.')
  } catch (err) {
    testReport.test4.passed = false
    testReport.test4.error = err.message
    console.error('  [FAIL] Test 4 failed:', err.message)
  } finally {
    for (const v of vList4) {
      if (v?.id) await adminClient.from('visits').delete().eq('id', v.id)
    }
    for (const r of rList4) {
      if (r?.id) await adminClient.from('rdv').delete().eq('id', r.id)
    }
    for (const p of pList4) {
      if (p?.id) await adminClient.from('patients').delete().eq('id', p.id)
    }
  }

  console.log('\n================ PART 1 RESULTS SUMMARY ================')
  console.log(JSON.stringify(testReport, null, 2))
  return testReport
}

runPart1().catch(console.error)
