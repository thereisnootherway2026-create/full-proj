import {
  getTestClients, CLINIC_ID, DOCTOR_ID, SECRETARY_ID, adminClient
} from './stress-auth-helper.mjs'

const TODAY = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })

async function runRegressionSuite() {
  console.log('=================================================================')
  console.log('   REGRESSION TEST SUITE (TESTS A TO H) — PRODUCTION VERIFICATION')
  console.log('=================================================================\n')

  const { secretaryClient, doctorClient } = await getTestClients()

  const results = {
    testA: { name: 'TEST A: Cancel BEFORE arrival', passed: false, details: [] },
    testB: { name: 'TEST B: Cancel AFTER arrival', passed: false, details: [] },
    testC: { name: 'TEST C: Cancel AFTER refresh', passed: false, details: [] },
    testD: { name: 'TEST D: Cancel + concurrent stale action', passed: false, details: [] },
    testE: { name: 'TEST E: Repeated cancellation', passed: false, details: [] },
    testF_cash: { name: 'TEST F (Cash): Full Lifecycle SCHEDULED -> COMPLETED/PAID', passed: false, details: [] },
    testF_partial: { name: 'TEST F (Partial): Full Lifecycle Partial Payment & Settle', passed: false, details: [] },
    testG: { name: 'TEST G: Multi-Doctor Queue Isolation on Cancellation', passed: false, details: [] },
    testH: { name: 'TEST H: Cross-Cabinet Cancellation & Resurrection Security', passed: false, details: [] },
  }

  // -------------------------------------------------------------
  // TEST A: Cancel BEFORE arrival
  // -------------------------------------------------------------
  console.log('>>> [TEST A] Cancel BEFORE arrival...')
  let pA, rA, vA
  try {
    const { data: patA } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegA_Nom', prenom: 'CancelBefore', telephone: '0601000001'
    }]).select().single()
    pA = patA

    const startIsoA = new Date(`${TODAY}T02:00:00Z`).toISOString()
    const endIsoA = new Date(new Date(startIsoA).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvA, error: rAErr } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pA.id, date_rdv: startIsoA, appointment_day: TODAY,
      start_time: startIsoA, end_time: endIsoA, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    if (rAErr) throw rAErr
    rA = rdvA

    // 1. Cancel RDV before arrival
    console.log('   1. Cancelling RDV via cancel_appointment...')
    const { data: cancelRes, error: cErr } = await secretaryClient.rpc('cancel_appointment', {
      p_rdv_id: rA.id,
      p_reason: 'Patient cancelled before arriving'
    })
    if (cErr) throw cErr

    // 2. Verify RDV status is 'cancelled'
    const { data: rdvAfterCancel } = await adminClient.from('rdv').select('*').eq('id', rA.id).single()
    if (rdvAfterCancel.status !== 'cancelled') {
      throw new Error(`RDV status expected 'cancelled', got '${rdvAfterCancel.status}'`)
    }
    results.testA.details.push("RDV status successfully set to 'cancelled'")

    // 3. Attempt create_visit_from_rdv on cancelled RDV
    console.log('   2. Attempting create_visit_from_rdv on cancelled RDV...')
    const { data: badVisit, error: queueErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: rA.id,
      p_doctor_id: DOCTOR_ID
    })

    if (!queueErr) {
      throw new Error('BUG NOT FIXED: create_visit_from_rdv allowed a cancelled RDV into the waiting room!')
    }
    if (!queueErr.message.includes('cannot add cancelled appointment to waiting room')) {
      throw new Error(`Unexpected error message: ${queueErr.message}`)
    }
    results.testA.details.push(`create_visit_from_rdv properly rejected: '${queueErr.message}'`)

    // 4. Verify no visit was created and RDV remains clean
    const { data: orphanVisits } = await adminClient.from('visits').select('*').eq('rdv_id', rA.id)
    if (orphanVisits && orphanVisits.length > 0) {
      throw new Error(`Orphan visit created for cancelled RDV: ${orphanVisits.length} visits found!`)
    }

    const { data: rdvFinal } = await adminClient.from('rdv').select('*').eq('id', rA.id).single()
    if (rdvFinal.status !== 'cancelled' || rdvFinal.arrival_status !== 'NOT_ARRIVED') {
      throw new Error(`RDV state corrupted: status=${rdvFinal.status}, arrival_status=${rdvFinal.arrival_status}`)
    }
    results.testA.details.push("Zero visits in DB, arrival_status remains 'NOT_ARRIVED', status remains 'cancelled'")

    results.testA.passed = true
    console.log('  [PASS] TEST A passed successfully.')
  } catch (err) {
    results.testA.passed = false
    results.testA.error = err.message
    console.error('  [FAIL] TEST A failed:', err.message)
  } finally {
    if (rA?.id) {
      await adminClient.from('visits').delete().eq('rdv_id', rA.id)
      await adminClient.from('rdv').delete().eq('id', rA.id)
    }
    if (pA?.id) await adminClient.from('patients').delete().eq('id', pA.id)
  }

  // -------------------------------------------------------------
  // TEST B: Cancel AFTER arrival
  // -------------------------------------------------------------
  console.log('\n>>> [TEST B] Cancel AFTER arrival...')
  let pB, rB, vB
  try {
    const { data: patB } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegB_Nom', prenom: 'CancelAfter', telephone: '0602000002'
    }]).select().single()
    pB = patB

    const startIsoB = new Date(`${TODAY}T02:20:00Z`).toISOString()
    const endIsoB = new Date(new Date(startIsoB).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvB } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pB.id, date_rdv: startIsoB, appointment_day: TODAY,
      start_time: startIsoB, end_time: endIsoB, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    rB = rdvB

    // 1. Move to waiting room
    const { data: visitB, error: vBErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: rB.id,
      p_doctor_id: DOCTOR_ID
    })
    if (vBErr) throw vBErr
    vB = visitB
    results.testB.details.push(`RDV moved to waiting room, visit id=${vB.id}`)

    // 2. Call cancel_visit
    console.log('   Calling cancel_visit...')
    const { data: cancelRes, error: cErr } = await secretaryClient.rpc('cancel_visit', {
      p_visit_id: vB.id,
      p_reason: 'Patient felt better and left'
    })
    if (cErr) throw new Error(`cancel_visit failed: ${cErr.message}`)

    // 3. Verify DB states: visit.status = 'cancelled', rdv.status = 'cancelled'
    const { data: vAfter } = await adminClient.from('visits').select('*').eq('id', vB.id).single()
    const { data: rAfter } = await adminClient.from('rdv').select('*').eq('id', rB.id).single()

    if (vAfter.status !== 'cancelled') throw new Error(`Visit status is '${vAfter.status}', expected 'cancelled'`)
    if (rAfter.status !== 'cancelled') throw new Error(`RDV status is '${rAfter.status}', expected 'cancelled'`)
    if (rAfter.cancellation_reason !== 'Patient felt better and left') {
      throw new Error(`RDV cancellation reason not preserved: '${rAfter.cancellation_reason}'`)
    }
    results.testB.details.push("DB verified: visit.status='cancelled', rdv.status='cancelled', reason preserved")

    // 4. Refresh Secretary active waiting queue
    const { data: secQueue } = await secretaryClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('queue_date', TODAY)
      .in('status', ['waiting', 'called'])
    const secHasCancelled = secQueue.some(v => v.id === vB.id)
    if (secHasCancelled) throw new Error('Cancelled patient still visible in Secretary active waiting queue!')
    results.testB.details.push('Secretary queue refreshed: patient is completely absent from waiting queue')

    // 5. Refresh Doctor active waiting queue
    const { data: docQueue } = await doctorClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('doctor_id', DOCTOR_ID)
      .eq('queue_date', TODAY)
      .in('status', ['waiting', 'called'])
    const docHasCancelled = docQueue.some(v => v.id === vB.id)
    if (docHasCancelled) throw new Error('Cancelled patient still visible in Doctor active queue!')
    results.testB.details.push('Doctor queue refreshed: patient is completely absent from waiting queue')

    results.testB.passed = true
    console.log('  [PASS] TEST B passed successfully.')
  } catch (err) {
    results.testB.passed = false
    results.testB.error = err.message
    console.error('  [FAIL] TEST B failed:', err.message)
  } finally {
    if (vB?.id) await adminClient.from('visits').delete().eq('id', vB.id)
    if (rB?.id) await adminClient.from('rdv').delete().eq('id', rB.id)
    if (pB?.id) await adminClient.from('patients').delete().eq('id', pB.id)
  }

  // -------------------------------------------------------------
  // TEST C: Cancel AFTER refresh
  // -------------------------------------------------------------
  console.log('\n>>> [TEST C] Cancel AFTER refresh...')
  let pC, rC, vC
  try {
    const { data: patC } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegC_Nom', prenom: 'ReloadCancel', telephone: '0603000003'
    }]).select().single()
    pC = patC

    const startIsoC = new Date(`${TODAY}T02:40:00Z`).toISOString()
    const endIsoC = new Date(new Date(startIsoC).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvC } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pC.id, date_rdv: startIsoC, appointment_day: TODAY,
      start_time: startIsoC, end_time: endIsoC, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    rC = rdvC

    // 1. Move to WAITING
    const { data: visitC } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: rC.id,
      p_doctor_id: DOCTOR_ID
    })
    vC = visitC

    // 2. Browser refresh simulation
    const { data: secReload1 } = await secretaryClient.from('visits').select('*').eq('id', vC.id).single()
    if (secReload1.status !== 'waiting') throw new Error(`Visit status not waiting on reload: ${secReload1.status}`)
    results.testC.details.push('Reload 1: Waiting visit state restored')

    // 3. Cancel visit
    const { error: cancelCErr } = await secretaryClient.rpc('cancel_visit', {
      p_visit_id: vC.id,
      p_reason: 'Cancelled after reload'
    })
    if (cancelCErr) throw cancelCErr

    // 4. Second browser refresh simulation
    const { data: secReload2 } = await secretaryClient.from('visits').select('*').eq('id', vC.id).single()
    const { data: rdvReload2 } = await secretaryClient.from('rdv').select('*').eq('id', rC.id).single()

    if (secReload2.status !== 'cancelled') throw new Error(`Visit status not cancelled on second reload: ${secReload2.status}`)
    if (rdvReload2.status !== 'cancelled') throw new Error(`RDV status not cancelled on second reload: ${rdvReload2.status}`)
    results.testC.details.push('Reload 2: Cancelled state perfectly preserved across reload')

    results.testC.passed = true
    console.log('  [PASS] TEST C passed successfully.')
  } catch (err) {
    results.testC.passed = false
    results.testC.error = err.message
    console.error('  [FAIL] TEST C failed:', err.message)
  } finally {
    if (vC?.id) await adminClient.from('visits').delete().eq('id', vC.id)
    if (rC?.id) await adminClient.from('rdv').delete().eq('id', rC.id)
    if (pC?.id) await adminClient.from('patients').delete().eq('id', pC.id)
  }

  // -------------------------------------------------------------
  // TEST D: Cancel + concurrent stale action
  // -------------------------------------------------------------
  console.log('\n>>> [TEST D] Cancel + concurrent stale action...')
  let pD, rD, vD
  try {
    const { data: patD } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegD_Nom', prenom: 'StaleResurrect', telephone: '0604000004'
    }]).select().single()
    pD = patD

    const startIsoD = new Date(`${TODAY}T03:00:00Z`).toISOString()
    const endIsoD = new Date(new Date(startIsoD).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvD } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pD.id, date_rdv: startIsoD, appointment_day: TODAY,
      start_time: startIsoD, end_time: endIsoD, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    rD = rdvD

    // Session A moves patient to WAITING
    const { data: visitD } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: rD.id,
      p_doctor_id: DOCTOR_ID
    })
    vD = visitD

    // Session B takes a stale snapshot before cancellation
    const staleRdvId = rD.id

    // Session A cancels patient
    console.log('   Session A cancels visit...')
    const { error: cancelDErr } = await secretaryClient.rpc('cancel_visit', {
      p_visit_id: vD.id,
      p_reason: 'Session A cancelled'
    })
    if (cancelDErr) throw cancelDErr

    // Session B (with older/stale view) attempts to add the same RDV to waiting
    console.log('   Session B attempts to re-add stale RDV to waiting room...')
    const { data: resurrectAttempt, error: resurrectErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: staleRdvId,
      p_doctor_id: DOCTOR_ID
    })

    if (!resurrectErr) {
      throw new Error('CRITICAL BUG: Stale Session B was able to resurrect a cancelled appointment!')
    }
    if (!resurrectErr.message.includes('cannot add cancelled appointment to waiting room')) {
      throw new Error(`Unexpected error message: ${resurrectErr.message}`)
    }
    results.testD.details.push(`Resurrection blocked by DB: '${resurrectErr.message}'`)

    // Verify appointment was NOT resurrected
    const { data: rdvCheck } = await adminClient.from('rdv').select('*').eq('id', rD.id).single()
    const { data: visitCheck } = await adminClient.from('visits').select('*').eq('id', vD.id).single()

    if (rdvCheck.status !== 'cancelled' || visitCheck.status !== 'cancelled') {
      throw new Error(`State was corrupted by stale attempt: rdv=${rdvCheck.status}, visit=${visitCheck.status}`)
    }
    results.testD.details.push('Both RDV and visit remain strictly cancelled. No resurrection occurred.')

    results.testD.passed = true
    console.log('  [PASS] TEST D passed successfully.')
  } catch (err) {
    results.testD.passed = false
    results.testD.error = err.message
    console.error('  [FAIL] TEST D failed:', err.message)
  } finally {
    if (vD?.id) await adminClient.from('visits').delete().eq('id', vD.id)
    if (rD?.id) await adminClient.from('rdv').delete().eq('id', rD.id)
    if (pD?.id) await adminClient.from('patients').delete().eq('id', pD.id)
  }

  // -------------------------------------------------------------
  // TEST E: Repeated cancellation
  // -------------------------------------------------------------
  console.log('\n>>> [TEST E] Repeated cancellation...')
  let pE, rE, vE
  try {
    const { data: patE } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegE_Nom', prenom: 'RepeatedCancel', telephone: '0605000005'
    }]).select().single()
    pE = patE

    const startIsoE = new Date(`${TODAY}T03:20:00Z`).toISOString()
    const endIsoE = new Date(new Date(startIsoE).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvE } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pE.id, date_rdv: startIsoE, appointment_day: TODAY,
      start_time: startIsoE, end_time: endIsoE, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    rE = rdvE

    // Move to waiting
    const { data: visitE } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: rE.id,
      p_doctor_id: DOCTOR_ID
    })
    vE = visitE

    // First cancellation
    console.log('   Calling cancellation 1st time...')
    const { error: cancel1Err } = await secretaryClient.rpc('cancel_visit', {
      p_visit_id: vE.id,
      p_reason: 'First cancel'
    })
    if (cancel1Err) throw cancel1Err
    results.testE.details.push('First cancellation succeeded')

    // Second cancellation
    console.log('   Calling cancellation 2nd time on already-cancelled visit...')
    const { data: cancel2Data, error: cancel2Err } = await secretaryClient.rpc('cancel_visit', {
      p_visit_id: vE.id,
      p_reason: 'Second cancel attempt'
    })

    if (!cancel2Err) {
      throw new Error('Expected repeated cancellation to return a controlled error, but it succeeded')
    }
    if (!cancel2Err.message.includes('visit is already cancelled')) {
      throw new Error(`Unexpected error message: ${cancel2Err.message}`)
    }
    results.testE.details.push(`Second cancellation safely returned controlled error: '${cancel2Err.message}'`)

    // Verify DB integrity
    const { data: visitECheck } = await adminClient.from('visits').select('*').eq('id', vE.id).single()
    const { data: rdvECheck } = await adminClient.from('rdv').select('*').eq('id', rE.id).single()
    if (visitECheck.status !== 'cancelled' || rdvECheck.status !== 'cancelled') {
      throw new Error('Database state corrupted after repeated cancellation')
    }
    results.testE.details.push('Zero corruption, state remains validly cancelled')

    results.testE.passed = true
    console.log('  [PASS] TEST E passed successfully.')
  } catch (err) {
    results.testE.passed = false
    results.testE.error = err.message
    console.error('  [FAIL] TEST E failed:', err.message)
  } finally {
    if (vE?.id) await adminClient.from('visits').delete().eq('id', vE.id)
    if (rE?.id) await adminClient.from('rdv').delete().eq('id', rE.id)
    if (pE?.id) await adminClient.from('patients').delete().eq('id', pE.id)
  }

  // -------------------------------------------------------------
  // TEST F (Cash): Full Lifecycle SCHEDULED -> COMPLETED/PAID
  // -------------------------------------------------------------
  console.log('\n>>> [TEST F - Cash] Full Lifecycle Cash Payment...')
  let pFc, rFc, vFc, encFc, payFc
  try {
    const { data: patFc } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegFc_Nom', prenom: 'CashFull', telephone: '0606000006'
    }]).select().single()
    pFc = patFc

    const startIsoFc = new Date(`${TODAY}T03:40:00Z`).toISOString()
    const endIsoFc = new Date(new Date(startIsoFc).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvFc } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pFc.id, date_rdv: startIsoFc, appointment_day: TODAY,
      start_time: startIsoFc, end_time: endIsoFc, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    rFc = rdvFc

    // WAITING
    const { data: vResult } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: rFc.id, p_doctor_id: DOCTOR_ID
    })
    vFc = vResult

    // CALLED
    await doctorClient.rpc('call_patient', { p_visit_id: vFc.id })

    // IN_CONSULTATION
    const { data: enc } = await doctorClient.rpc('mm_open_encounter', {
      p_patient_id: pFc.id, p_visit_id: vFc.id
    })
    encFc = enc

    // BILLING (350 DH cash)
    await doctorClient.rpc('mm_complete_encounter', {
      p_id: encFc.id, p_note: { motif: 'Consultation complète regression' }, p_expected_version: encFc.version,
      p_billing_amount: 350, p_billing_type: 'cash'
    })

    // PAID & COMPLETED
    await secretaryClient.rpc('process_visit_payment', {
      p_visit_id: vFc.id, p_method: 'cash', p_amount: 350, p_partial: false
    })

    // Verify DB states
    const { data: vFinal } = await adminClient.from('visits').select('*').eq('id', vFc.id).single()
    const { data: rFinal } = await adminClient.from('rdv').select('*').eq('id', rFc.id).single()
    const { data: pFinal } = await adminClient.from('payments').select('*').eq('visit_id', vFc.id).single()
    payFc = pFinal

    if (vFinal.status !== 'completed') throw new Error(`Visit status is ${vFinal.status}, expected 'completed'`)
    if (rFinal.payment_status !== 'PAID') throw new Error(`RDV payment_status is ${rFinal.payment_status}, expected 'PAID'`)
    if (pFinal.status !== 'paid' || Number(pFinal.amount_paid) !== 350) {
      throw new Error(`Payment mismatch: status=${pFinal.status}, amount_paid=${pFinal.amount_paid}`)
    }
    results.testF_cash.details.push("Full cash lifecycle verified: visits.status='completed', rdv.payment_status='PAID', payments.status='paid'")

    results.testF_cash.passed = true
    console.log('  [PASS] TEST F (Cash) passed successfully.')
  } catch (err) {
    results.testF_cash.passed = false
    results.testF_cash.error = err.message
    console.error('  [FAIL] TEST F (Cash) failed:', err.message)
  } finally {
    if (payFc?.id) await adminClient.from('payments').delete().eq('id', payFc.id)
    if (encFc?.id) await adminClient.from('clinical_encounters').delete().eq('id', encFc.id)
    if (vFc?.id) await adminClient.from('visits').delete().eq('id', vFc.id)
    if (rFc?.id) await adminClient.from('rdv').delete().eq('id', rFc.id)
    if (pFc?.id) await adminClient.from('patients').delete().eq('id', pFc.id)
  }

  // -------------------------------------------------------------
  // TEST F (Partial): Full Lifecycle Partial Payment & Settle
  // -------------------------------------------------------------
  console.log('\n>>> [TEST F - Partial] Full Lifecycle Partial Payment & Debt Settle...')
  let pFp, rFp, vFp, encFp, payFp
  try {
    const { data: patFp } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegFp_Nom', prenom: 'PartialFull', telephone: '0607000007'
    }]).select().single()
    pFp = patFp

    const startIsoFp = new Date(`${TODAY}T04:00:00Z`).toISOString()
    const endIsoFp = new Date(new Date(startIsoFp).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvFp } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pFp.id, date_rdv: startIsoFp, appointment_day: TODAY,
      start_time: startIsoFp, end_time: endIsoFp, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    rFp = rdvFp

    // WAITING
    const { data: vResult } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: rFp.id, p_doctor_id: DOCTOR_ID
    })
    vFp = vResult

    // CALLED
    await doctorClient.rpc('call_patient', { p_visit_id: vFp.id })

    // IN_CONSULTATION & COMPLETE with 600 DH
    const { data: enc } = await doctorClient.rpc('mm_open_encounter', {
      p_patient_id: pFp.id, p_visit_id: vFp.id
    })
    encFp = enc

    await doctorClient.rpc('mm_complete_encounter', {
      p_id: encFp.id, p_note: { motif: 'Acte chirurgical mineur' }, p_expected_version: encFp.version,
      p_billing_amount: 600, p_billing_type: 'cash'
    })

    // Part 1: Collect 250 DH out of 600 DH
    console.log('   Collecting partial 250 DH...')
    await secretaryClient.rpc('process_visit_payment', {
      p_visit_id: vFp.id, p_method: 'cash', p_amount: 250, p_partial: true
    })

    const { data: pPartial } = await adminClient.from('payments').select('*').eq('visit_id', vFp.id).single()
    payFp = pPartial
    if (pPartial.status !== 'pending' || Number(pPartial.amount_paid) !== 250) {
      throw new Error(`Partial payment state invalid: status=${pPartial.status}, paid=${pPartial.amount_paid}`)
    }
    results.testF_partial.details.push('Partial payment collected: 250/600 DH, status remains pending')

    // Part 2: Settle remaining 350 DH
    console.log('   Settling debt 350 DH...')
    await secretaryClient.rpc('process_visit_payment', {
      p_visit_id: vFp.id, p_method: 'cash', p_amount: 350, p_partial: false
    })

    const { data: pSettled } = await adminClient.from('payments').select('*').eq('id', payFp.id).single()
    const { data: rSettled } = await adminClient.from('rdv').select('*').eq('id', rFp.id).single()

    if (pSettled.status !== 'paid' || Number(pSettled.amount_paid) !== 600) {
      throw new Error(`Settled payment invalid: status=${pSettled.status}, paid=${pSettled.amount_paid}`)
    }
    if (rSettled.payment_status !== 'PAID') {
      throw new Error(`RDV payment_status expected PAID: ${rSettled.payment_status}`)
    }
    results.testF_partial.details.push('Debt settled: 600/600 DH, payments.status=paid, rdv.payment_status=PAID')

    results.testF_partial.passed = true
    console.log('  [PASS] TEST F (Partial) passed successfully.')
  } catch (err) {
    results.testF_partial.passed = false
    results.testF_partial.error = err.message
    console.error('  [FAIL] TEST F (Partial) failed:', err.message)
  } finally {
    if (payFp?.id) await adminClient.from('payments').delete().eq('id', payFp.id)
    if (encFp?.id) await adminClient.from('clinical_encounters').delete().eq('id', encFp.id)
    if (vFp?.id) await adminClient.from('visits').delete().eq('id', vFp.id)
    if (rFp?.id) await adminClient.from('rdv').delete().eq('id', rFp.id)
    if (pFp?.id) await adminClient.from('patients').delete().eq('id', pFp.id)
  }

  // -------------------------------------------------------------
  // TEST G: Multi-Doctor Queue Isolation on Cancellation
  // -------------------------------------------------------------
  console.log('\n>>> [TEST G] Multi-Doctor Queue Isolation on Cancellation...')
  let pGa, pGb, rGa, rGb, vGa, vGb, doc2IdG
  try {
    // Create Doctor 2 in clinic
    const doc2Email = `temp_doc2_g_${Date.now()}@macromedica.local`
    const { data: doc2Auth } = await adminClient.auth.admin.createUser({
      email: doc2Email, password: 'StressTest2026!Pass', email_confirm: true,
      user_metadata: { role: 'docteur', cabinet_id: CLINIC_ID, clinic_id: CLINIC_ID, nom_complet: 'Dr. Isolation Doc2' }
    })
    doc2IdG = doc2Auth.user.id
    await adminClient.from('profiles').upsert({
      id: doc2IdG, cabinet_id: CLINIC_ID, clinic_id: CLINIC_ID, role: 'docteur',
      nom_complet: 'Dr. Isolation Doc2', status: 'active'
    })

    // Patient A assigned to Doctor 1
    const { data: patGa } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegGa_Nom', prenom: 'Doc1Pat', telephone: '0608000008'
    }]).select().single()
    pGa = patGa

    const startIsoGa = new Date(`${TODAY}T04:20:00Z`).toISOString()
    const endIsoGa = new Date(new Date(startIsoGa).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvGa } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pGa.id, date_rdv: startIsoGa, appointment_day: TODAY,
      start_time: startIsoGa, end_time: endIsoGa, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    rGa = rdvGa

    // Patient B assigned to Doctor 2
    const { data: patGb } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'RegGb_Nom', prenom: 'Doc2Pat', telephone: '0609000009'
    }]).select().single()
    pGb = patGb

    const startIsoGb = new Date(`${TODAY}T04:40:00Z`).toISOString()
    const endIsoGb = new Date(new Date(startIsoGb).getTime() + 15 * 60 * 1000).toISOString()
    const { data: rdvGb } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: pGb.id, date_rdv: startIsoGb, appointment_day: TODAY,
      start_time: startIsoGb, end_time: endIsoGb, duree_minutes: 15, status: 'scheduled', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    rGb = rdvGb

    // Move both to waiting room
    const { data: vA } = await secretaryClient.rpc('create_visit_from_rdv', { p_rdv_id: rGa.id, p_doctor_id: DOCTOR_ID })
    vGa = vA
    const { data: vB } = await secretaryClient.rpc('create_visit_from_rdv', { p_rdv_id: rGb.id, p_doctor_id: doc2IdG })
    vGb = vB

    // Secretary cancels Doctor 1's patient (Patient A)
    console.log("   Cancelling Doctor 1's patient...")
    await secretaryClient.rpc('cancel_visit', { p_visit_id: vGa.id, p_reason: 'Doc 1 patient cancelled' })

    // Verify Doctor 1 queue: Patient A is gone
    const { data: doc1Queue } = await doctorClient
      .from('visits').select('*').eq('clinic_id', CLINIC_ID).eq('doctor_id', DOCTOR_ID)
      .eq('queue_date', TODAY).in('status', ['waiting', 'called'])

    if (doc1Queue.some(v => v.id === vGa.id)) {
      throw new Error('Cancelled patient still in Doctor 1 queue!')
    }
    results.testG.details.push("Patient A successfully removed from Doctor 1's queue")

    // Verify Doctor 2 queue: Patient B is STILL THERE, completely unaffected!
    const { data: doc2Queue } = await adminClient
      .from('visits').select('*').eq('clinic_id', CLINIC_ID).eq('doctor_id', doc2IdG)
      .eq('queue_date', TODAY).in('status', ['waiting', 'called'])

    if (!doc2Queue.some(v => v.id === vGb.id)) {
      throw new Error("Doctor 2's patient was unexpectedly affected or dropped!")
    }
    results.testG.details.push("Doctor 2's queue remains intact with Patient B present and untouched")

    results.testG.passed = true
    console.log('  [PASS] TEST G passed successfully.')
  } catch (err) {
    results.testG.passed = false
    results.testG.error = err.message
    console.error('  [FAIL] TEST G failed:', err.message)
  } finally {
    if (vGb?.id) await adminClient.from('visits').delete().eq('id', vGb.id)
    if (vGa?.id) await adminClient.from('visits').delete().eq('id', vGa.id)
    if (rGb?.id) await adminClient.from('rdv').delete().eq('id', rGb.id)
    if (rGa?.id) await adminClient.from('rdv').delete().eq('id', rGa.id)
    if (pGb?.id) await adminClient.from('patients').delete().eq('id', pGb.id)
    if (pGa?.id) await adminClient.from('patients').delete().eq('id', pGa.id)
    if (doc2IdG) {
      await adminClient.from('profiles').delete().eq('id', doc2IdG)
      await adminClient.auth.admin.deleteUser(doc2IdG)
    }
  }

  // -------------------------------------------------------------
  // TEST H: Cross-Cabinet Cancellation & Resurrection Security
  // -------------------------------------------------------------
  console.log('\n>>> [TEST H] Cross-Cabinet Cancellation & Resurrection Security...')
  let pHForeign, rHForeign, vHForeign
  const FOREIGN_CLINIC_ID = '57b1ac8d-85b2-4fb8-8747-5617564397b1'
  const FOREIGN_DOCTOR_ID = '30ef5dd3-a913-40bd-8d43-a49e56865829'
  try {
    // Create Patient, RDV, and Visit for Clinic B
    const { data: fPat } = await adminClient.from('patients').insert([{
      cabinet_id: FOREIGN_CLINIC_ID, nom: 'RegH_Foreign', prenom: 'TenantB', telephone: '0610000010'
    }]).select().single()
    pHForeign = fPat

    const startIsoH = new Date(`${TODAY}T05:00:00Z`).toISOString()
    const endIsoH = new Date(new Date(startIsoH).getTime() + 15 * 60 * 1000).toISOString()
    const { data: fRdv } = await adminClient.from('rdv').insert([{
      cabinet_id: FOREIGN_CLINIC_ID, patient_id: pHForeign.id, date_rdv: startIsoH, appointment_day: TODAY,
      start_time: startIsoH, end_time: endIsoH, duree_minutes: 15, status: 'scheduled', arrival_status: 'WAITING'
    }]).select().single()
    rHForeign = fRdv

    const { data: fVisit } = await adminClient.from('visits').insert([{
      clinic_id: FOREIGN_CLINIC_ID, patient_id: pHForeign.id, rdv_id: rHForeign.id, source: 'appointment',
      doctor_id: FOREIGN_DOCTOR_ID, status: 'waiting', queue_date: TODAY, queue_number: 1, waiting_at: new Date().toISOString()
    }]).select().single()
    vHForeign = fVisit

    // 1. Secretary of Clinic A attempts to cancel Clinic B's visit
    console.log("   Secretary of Clinic A attempts to cancel Clinic B's visit...")
    const { error: cancelForeignErr } = await secretaryClient.rpc('cancel_visit', {
      p_visit_id: vHForeign.id,
      p_reason: 'Malicious cancellation attempt from Clinic A'
    })

    if (!cancelForeignErr) {
      throw new Error("SECURITY VIOLATION: Secretary of Clinic A was able to cancel Clinic B's visit!")
    }
    results.testH.details.push(`Cross-clinic cancel_visit BLOCKED: '${cancelForeignErr.message}'`)

    // 2. Secretary of Clinic A attempts to cancel Clinic B's RDV
    console.log("   Secretary of Clinic A attempts to cancel Clinic B's RDV...")
    const { error: cancelForeignRdvErr } = await secretaryClient.rpc('cancel_appointment', {
      p_rdv_id: rHForeign.id,
      p_reason: 'Malicious cancel appointment attempt'
    })

    if (!cancelForeignRdvErr) {
      throw new Error("SECURITY VIOLATION: Secretary of Clinic A was able to cancel Clinic B's RDV!")
    }
    results.testH.details.push(`Cross-clinic cancel_appointment BLOCKED: '${cancelForeignRdvErr.message}'`)

    // 3. Secretary of Clinic A attempts to add/resurrect Clinic B's appointment into Clinic A's queue
    console.log("   Secretary of Clinic A attempts to add Clinic B's appointment to Clinic A...")
    const { error: resurrectForeignErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: rHForeign.id,
      p_doctor_id: DOCTOR_ID
    })

    if (!resurrectForeignErr) {
      throw new Error("SECURITY VIOLATION: Secretary of Clinic A was able to queue Clinic B's appointment!")
    }
    results.testH.details.push(`Cross-clinic queueing BLOCKED: '${resurrectForeignErr.message}'`)

    // Verify Clinic B state is completely uncompromised
    const { data: vCheck } = await adminClient.from('visits').select('*').eq('id', vHForeign.id).single()
    if (vCheck.status !== 'waiting') throw new Error(`Clinic B visit was corrupted: ${vCheck.status}`)
    results.testH.details.push("Clinic B's visit remains strictly in waiting status with zero tampering")

    results.testH.passed = true
    console.log('  [PASS] TEST H passed successfully.')
  } catch (err) {
    results.testH.passed = false
    results.testH.error = err.message
    console.error('  [FAIL] TEST H failed:', err.message)
  } finally {
    if (vHForeign?.id) await adminClient.from('visits').delete().eq('id', vHForeign.id)
    if (rHForeign?.id) await adminClient.from('rdv').delete().eq('id', rHForeign.id)
    if (pHForeign?.id) await adminClient.from('patients').delete().eq('id', pHForeign.id)
  }

  console.log('\n=================================================================')
  console.log('                 REGRESSION RESULTS SUMMARY')
  console.log('=================================================================')
  console.log(JSON.stringify(results, null, 2))
  return results
}

runRegressionSuite().catch(console.error)
