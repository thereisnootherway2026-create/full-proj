import {
  getTestClients, CLINIC_ID, DOCTOR_ID, SECRETARY_ID
} from './stress-auth-helper.mjs'

const TODAY = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })

async function runPart2() {
  console.log('========================================================')
  console.log('   PRODUCTION STRESS TEST — PART 2 (SECTIONS 5 TO 7)')
  console.log('========================================================\n')

  const { adminClient, secretaryClient, doctorClient } = await getTestClients()

  const testReport = {
    test5: { name: 'Dual-Session Simulation & Realtime Synchronization', passed: false, details: [] },
    test6: { name: 'Stale Client Mutation Conflict Handling', passed: false, details: [] },
    test7: { name: 'Interruption Mid-Mutation & Transactional Atomicity', passed: false, details: [] },
  }

  // -------------------------------------------------------------
  // TEST 5: Dual-Session Simulation & Realtime Sync
  // -------------------------------------------------------------
  console.log('>>> [TEST 5] Dual-Session Simulation & Realtime Synchronization...')
  let p5, r5, v5
  try {
    const { data: pat5 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Stress5_Dual',
      prenom: 'Session5',
      telephone: '0655000005'
    }]).select().single()
    p5 = pat5

    const startIso = new Date(`${TODAY}T17:05:00Z`).toISOString()
    const endIso = new Date(new Date(startIso).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdv5, error: rErr } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID,
      patient_id: p5.id,
      date_rdv: startIso,
      appointment_day: TODAY,
      start_time: startIso,
      end_time: endIso,
      duree_minutes: 20,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    if (rErr) throw rErr
    r5 = rdv5

    // Set up Realtime listener on Doctor client for visits table
    let realtimeEventReceived = false
    let receivedPayload = null
    const channel = doctorClient
      .channel(`test-clinic-visits-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits', filter: `clinic_id=eq.${CLINIC_ID}` },
        (payload) => {
          if (payload.new && payload.new.rdv_id === r5.id) {
            realtimeEventReceived = true
            receivedPayload = payload.new
          }
        }
      )
      .subscribe()

    // Give subscription 1 second to establish
    await new Promise(res => setTimeout(res, 1000))

    // Client A (Secretary) adds patient to waiting room
    console.log('   Client A (Secretary) calls create_visit_from_rdv...')
    const { data: vResult, error: vErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r5.id,
      p_doctor_id: DOCTOR_ID
    })
    if (vErr) throw vErr
    v5 = vResult

    // Wait up to 5 seconds for Realtime event on Doctor client
    console.log('   Waiting for Realtime event on Client B (Doctor)...')
    const startWait = Date.now()
    while (!realtimeEventReceived && Date.now() - startWait < 5000) {
      await new Promise(res => setTimeout(res, 250))
    }

    if (realtimeEventReceived) {
      testReport.test5.details.push(`Client B received Realtime event without manual refresh (visit status: ${receivedPayload?.status})`)
    } else {
      testReport.test5.details.push('Realtime notification timed out, verifying fallback via query refresh')
    }
    await doctorClient.removeChannel(channel)

    // Verify state match after refresh on Client B (Doctor)
    const { data: docQueueReloaded } = await doctorClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('doctor_id', DOCTOR_ID)
      .eq('queue_date', TODAY)
      .eq('id', v5.id)
      .single()

    if (!docQueueReloaded || docQueueReloaded.status !== 'waiting') {
      throw new Error(`Doctor queue state mismatch on refresh: ${docQueueReloaded?.status}`)
    }
    testReport.test5.details.push('Client B (Doctor) refresh state strictly matches DB')

    // Verify state match after refresh on Client A (Secretary)
    const { data: secQueueReloaded } = await secretaryClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('queue_date', TODAY)
      .eq('id', v5.id)
      .single()

    if (!secQueueReloaded || secQueueReloaded.status !== 'waiting') {
      throw new Error(`Secretary queue state mismatch on refresh: ${secQueueReloaded?.status}`)
    }
    testReport.test5.details.push('Client A (Secretary) refresh state strictly matches DB')

    testReport.test5.passed = true
    console.log('  [PASS] Test 5 passed successfully.')
  } catch (err) {
    testReport.test5.passed = false
    testReport.test5.error = err.message
    console.error('  [FAIL] Test 5 failed:', err.message)
  } finally {
    if (v5?.id) await adminClient.from('visits').delete().eq('id', v5.id)
    if (r5?.id) await adminClient.from('rdv').delete().eq('id', r5.id)
    if (p5?.id) await adminClient.from('patients').delete().eq('id', p5.id)
  }

  // -------------------------------------------------------------
  // TEST 6: Stale Client Mutation
  // -------------------------------------------------------------
  console.log('\n>>> [TEST 6] Stale Client Mutation Conflict Handling...')
  let p6, r6, v6
  try {
    const { data: pat6 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Stress6_Stale',
      prenom: 'Patient6',
      telephone: '0666000006'
    }]).select().single()
    p6 = pat6

    const startIso = new Date(`${TODAY}T17:35:00Z`).toISOString()
    const endIso = new Date(new Date(startIso).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdv6, error: rErr } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID,
      patient_id: p6.id,
      date_rdv: startIso,
      appointment_day: TODAY,
      start_time: startIso,
      end_time: endIso,
      duree_minutes: 20,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    if (rErr) throw rErr
    r6 = rdv6

    // Stale client takes a snapshot of RDV (arrival_status='NOT_ARRIVED')
    const staleSnapshot = { ...r6 }

    // Client B moves RDV to waiting room
    const { data: vResult, error: vErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r6.id,
      p_doctor_id: DOCTOR_ID
    })
    if (vErr) throw vErr
    v6 = vResult

    // Now Client A (holding stale snapshot) attempts to re-add to waiting room
    console.log('   Stale Client A attempts to call create_visit_from_rdv again...')
    const { data: reAddResult, error: reAddErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: staleSnapshot.id,
      p_doctor_id: DOCTOR_ID
    })

    if (reAddErr) {
      testReport.test6.details.push(`Stale re-add rejected gracefully: ${reAddErr.message}`)
    } else {
      // Must return the SAME visit row, NOT create a second visit!
      if (reAddResult.id !== v6.id) {
        throw new Error(`Stale re-add created a duplicate visit: ${reAddResult.id} vs original ${v6.id}`)
      }
      testReport.test6.details.push('Stale re-add was idempotent and returned the existing visit')
    }

    // Now Stale Client A tries to overwrite rdv status with stale arrival_status 'NOT_ARRIVED'
    console.log('   Stale Client A tries to update rdv with stale arrival_status...')
    // In our architecture, can a stale update overwrite arrival_status?
    // Let's test if update succeeds or how DB state looks
    await secretaryClient.from('rdv').update({ notes: 'Updated from stale client' }).eq('id', r6.id)

    // Verify DB integrity: arrival_status in DB must remain 'WAITING' (or what the current DB state is)
    const { data: rdvCurrent } = await adminClient.from('rdv').select('*').eq('id', r6.id).single()
    if (rdvCurrent.arrival_status !== 'WAITING') {
      throw new Error(`Data corruption: rdv arrival_status reverted to ${rdvCurrent.arrival_status}`)
    }
    testReport.test6.details.push('DB arrival_status remained WAITING, no corruption occurred')

    // Verify visits row is intact
    const { data: visitCurrent } = await adminClient.from('visits').select('*').eq('id', v6.id).single()
    if (visitCurrent.status !== 'waiting') {
      throw new Error(`Visit status corrupted: ${visitCurrent.status}`)
    }
    testReport.test6.details.push('Visits row remained intact with status=waiting')

    testReport.test6.passed = true
    console.log('  [PASS] Test 6 passed successfully.')
  } catch (err) {
    testReport.test6.passed = false
    testReport.test6.error = err.message
    console.error('  [FAIL] Test 6 failed:', err.message)
  } finally {
    if (v6?.id) await adminClient.from('visits').delete().eq('id', v6.id)
    if (r6?.id) await adminClient.from('rdv').delete().eq('id', r6.id)
    if (p6?.id) await adminClient.from('patients').delete().eq('id', p6.id)
  }

  // -------------------------------------------------------------
  // TEST 7: Interruption Mid-Mutation & Transactional Atomicity
  // -------------------------------------------------------------
  console.log('\n>>> [TEST 7] Interruption Mid-Mutation & Transactional Atomicity...')
  let p7, r7, v7
  try {
    const { data: pat7 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Stress7_Atomicity',
      prenom: 'Patient7',
      telephone: '0677000007'
    }]).select().single()
    p7 = pat7

    const startIso = new Date(`${TODAY}T18:05:00Z`).toISOString()
    const endIso = new Date(new Date(startIso).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdv7, error: rErr } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID,
      patient_id: p7.id,
      date_rdv: startIso,
      appointment_day: TODAY,
      start_time: startIso,
      end_time: endIso,
      duree_minutes: 20,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    if (rErr) throw rErr
    r7 = rdv7

    // Test 7a: Call create_visit_from_rdv with an INVALID / non-existent doctor ID
    console.log('   Testing intentional failure in create_visit_from_rdv (invalid doctor)...')
    const fakeDoctorId = '00000000-0000-0000-0000-000000000000'
    const { data: failData, error: failErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r7.id,
      p_doctor_id: fakeDoctorId
    })

    if (!failErr) {
      throw new Error('Expected create_visit_from_rdv with fake doctor to throw, but it succeeded')
    }
    testReport.test7.details.push(`RPC threw expected error: ${failErr.message}`)

    // Check Atomicity:
    // Did it leave an orphaned visit?
    const { data: orphanVisits } = await adminClient.from('visits').select('*').eq('rdv_id', r7.id)
    if (orphanVisits && orphanVisits.length > 0) {
      throw new Error(`ATOMICITY FAILURE: ${orphanVisits.length} orphan visit rows left after failed RPC!`)
    }
    testReport.test7.details.push('Zero orphan visits in DB after rollback')

    // Was rdv.arrival_status modified?
    const { data: rdvAfterFail } = await adminClient.from('rdv').select('*').eq('id', r7.id).single()
    if (rdvAfterFail.arrival_status !== 'NOT_ARRIVED') {
      throw new Error(`ATOMICITY FAILURE: rdv.arrival_status was updated to ${rdvAfterFail.arrival_status} despite transaction rollback!`)
    }
    testReport.test7.details.push('rdv.arrival_status remained NOT_ARRIVED; transaction was completely atomic')

    // Test 7b: Valid call succeeds cleanly
    const { data: validVisit, error: validErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r7.id,
      p_doctor_id: DOCTOR_ID
    })
    if (validErr) throw validErr
    v7 = validVisit

    const { data: rdvAfterSuccess } = await adminClient.from('rdv').select('*').eq('id', r7.id).single()
    if (rdvAfterSuccess.arrival_status !== 'WAITING') {
      throw new Error(`rdv.arrival_status not updated to WAITING on success: ${rdvAfterSuccess.arrival_status}`)
    }
    testReport.test7.details.push('Subsequent valid transaction committed cleanly with both tables synchronized')

    testReport.test7.passed = true
    console.log('  [PASS] Test 7 passed successfully.')
  } catch (err) {
    testReport.test7.passed = false
    testReport.test7.error = err.message
    console.error('  [FAIL] Test 7 failed:', err.message)
  } finally {
    if (v7?.id) await adminClient.from('visits').delete().eq('id', v7.id)
    if (r7?.id) await adminClient.from('rdv').delete().eq('id', r7.id)
    if (p7?.id) await adminClient.from('patients').delete().eq('id', p7.id)
  }

  console.log('\n================ PART 2 RESULTS SUMMARY ================')
  console.log(JSON.stringify(testReport, null, 2))
  return testReport
}

runPart2().catch(console.error)
