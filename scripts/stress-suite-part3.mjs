import {
  getTestClients, CLINIC_ID, DOCTOR_ID, SECRETARY_ID
} from './stress-auth-helper.mjs'

const TODAY = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })

async function runPart3() {
  console.log('========================================================')
  console.log('   PRODUCTION STRESS TEST — PART 3 (SECTIONS 8 TO 11)')
  console.log('========================================================\n')

  const { adminClient, secretaryClient, doctorClient } = await getTestClients()

  const testReport = {
    test8_patient1: { name: 'Patient 1: Standard Cash Lifecycle & Refresh at Every State', passed: false, details: [] },
    test8_patient2: { name: 'Patient 2: Free / Waived Consultation Workflow', passed: false, details: [] },
    test8_patient3: { name: 'Patient 3: Partial Payment & Debt Collection Workflow', passed: false, details: [] },
    test10_payment: { name: 'Payment Handoff Integrity & Cashier Queue Verification', passed: false, details: [] },
    test11_multitab: { name: 'Multi-Tab Consultation Optimistic Locking & Conflict Detection', passed: false, details: [] },
  }

  // ---------------------------------------------------------------------------------
  // TEST 8 - PATIENT 1: SCHEDULED -> WAITING -> CALLED -> IN_CONSULTATION -> BILLING -> DONE
  // ---------------------------------------------------------------------------------
  console.log('>>> [TEST 8 - PATIENT 1] Standard Cash Lifecycle (with reload at EVERY state)...')
  let p1, r1, v1, enc1, pay1
  try {
    // State 1: RDV Creation
    const { data: pat1 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Lifecycle1_Nom',
      prenom: 'CashPatient',
      telephone: '0688000001'
    }]).select().single()
    p1 = pat1

    const startIso1 = new Date(`${TODAY}T18:30:00Z`).toISOString()
    const endIso1 = new Date(new Date(startIso1).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdv1, error: r1Err } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID,
      patient_id: p1.id,
      date_rdv: startIso1,
      appointment_day: TODAY,
      start_time: startIso1,
      end_time: endIso1,
      duree_minutes: 20,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    if (r1Err) throw r1Err
    r1 = rdv1

    // Reload check at State 1
    const { data: rReload1 } = await secretaryClient.from('rdv').select('*').eq('id', r1.id).single()
    if (rReload1.status !== 'confirme' || rReload1.arrival_status !== 'NOT_ARRIVED') {
      throw new Error(`State 1 mismatch on reload: ${rReload1.status} / ${rReload1.arrival_status}`)
    }
    testReport.test8_patient1.details.push('State 1 (SCHEDULED): Verified & survives reload')

    // State 2: WAITING
    const { data: visit1, error: v1Err } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r1.id,
      p_doctor_id: DOCTOR_ID
    })
    if (v1Err) throw v1Err
    v1 = visit1

    // Reload check at State 2
    const { data: vReload2 } = await doctorClient.from('visits').select('*').eq('id', v1.id).single()
    const { data: rReload2 } = await secretaryClient.from('rdv').select('*').eq('id', r1.id).single()
    if (vReload2.status !== 'waiting' || rReload2.arrival_status !== 'WAITING') {
      throw new Error(`State 2 mismatch on reload: visit=${vReload2.status}, rdv=${rReload2.arrival_status}`)
    }
    testReport.test8_patient1.details.push('State 2 (WAITING): Verified & survives reload')

    // State 3: CALLED
    const { data: calledVisit, error: cErr } = await doctorClient.rpc('call_patient', {
      p_visit_id: v1.id
    })
    if (cErr) throw cErr

    // Reload check at State 3
    const { data: vReload3 } = await doctorClient.from('visits').select('*').eq('id', v1.id).single()
    if (vReload3.status !== 'called' || !vReload3.called_at) {
      throw new Error(`State 3 mismatch on reload: visit=${vReload3.status}`)
    }
    testReport.test8_patient1.details.push('State 3 (CALLED): Verified & survives reload')

    // State 4: IN_CONSULTATION
    const { data: openEnc, error: encErr } = await doctorClient.rpc('mm_open_encounter', {
      p_patient_id: p1.id,
      p_visit_id: v1.id
    })
    if (encErr) throw encErr
    enc1 = openEnc

    // Reload check at State 4
    const { data: encReload4 } = await doctorClient.from('clinical_encounters').select('*').eq('id', enc1.id).single()
    if (encReload4.status !== 'draft') {
      throw new Error(`State 4 encounter draft status mismatch: ${encReload4.status}`)
    }
    testReport.test8_patient1.details.push('State 4 (IN_CONSULTATION): Verified & survives reload')

    // State 5: TO_BE_PAID (Doctor completes consultation with 300 DH cash)
    const notePayload = {
      motif: 'Consultation générale - Bilan de routine',
      histoire: 'Patient sans antécédents particuliers',
      examen: 'Examen cardio-vasculaire et pulmonaire normal',
      diagnostics: ['Bilan de santé'],
      conduite: 'Règles hygiéno-diététiques',
      vitals: {
        bloodPressureSystolic: '120',
        bloodPressureDiastolic: '80',
        heartRate: '72',
        temperature: '37.0'
      }
    }

    const { data: completeRes, error: compErr } = await doctorClient.rpc('mm_complete_encounter', {
      p_id: enc1.id,
      p_note: notePayload,
      p_expected_version: enc1.version,
      p_billing_amount: 300,
      p_billing_type: 'cash'
    })
    if (compErr) throw compErr

    // Reload check at State 5
    const { data: vReload5 } = await secretaryClient.from('visits').select('*').eq('id', v1.id).single()
    const { data: rReload5 } = await secretaryClient.from('rdv').select('*').eq('id', r1.id).single()
    const { data: pReload5 } = await secretaryClient.from('payments').select('*').eq('visit_id', v1.id).single()
    pay1 = pReload5

    if (vReload5.status !== 'billing') throw new Error(`Visit status is ${vReload5.status}, expected 'billing'`)
    if (rReload5.arrival_status !== 'LEFT') throw new Error(`RDV arrival_status is ${rReload5.arrival_status}, expected 'LEFT'`)
    if (rReload5.payment_status !== 'UNPAID') throw new Error(`RDV payment_status is ${rReload5.payment_status}, expected 'UNPAID'`)
    if (Number(pReload5.amount) !== 300 || pReload5.status !== 'pending') {
      throw new Error(`Payment mismatch: amount=${pReload5.amount}, status=${pReload5.status}`)
    }
    testReport.test8_patient1.details.push('State 5 (TO_BE_PAID): visits.status=billing, payments.status=pending (300 DH), rdv.payment_status=UNPAID')

    // State 6: DONE (Secretary collects 300 DH payment)
    const { data: paidVisit, error: payErr } = await secretaryClient.rpc('process_visit_payment', {
      p_visit_id: v1.id,
      p_method: 'cash',
      p_amount: 300,
      p_partial: false
    })
    if (payErr) throw payErr

    // Reload check at State 6 (DONE)
    const { data: vReload6 } = await secretaryClient.from('visits').select('*').eq('id', v1.id).single()
    const { data: rReload6 } = await secretaryClient.from('rdv').select('*').eq('id', r1.id).single()
    const { data: pReload6 } = await secretaryClient.from('payments').select('*').eq('visit_id', v1.id).single()

    if (vReload6.status !== 'completed' || !vReload6.completed_at) {
      throw new Error(`Visit status after payment is ${vReload6.status}, expected 'completed'`)
    }
    if (rReload6.payment_status !== 'PAID') {
      throw new Error(`RDV payment_status is ${rReload6.payment_status}, expected 'PAID'`)
    }
    if (pReload6.status !== 'paid' || Number(pReload6.amount_paid) !== 300) {
      throw new Error(`Payment row not marked paid: status=${pReload6.status}, paid=${pReload6.amount_paid}`)
    }
    testReport.test8_patient1.details.push('State 6 (DONE): visits.status=completed, payments.status=paid, rdv.payment_status=PAID')

    testReport.test8_patient1.passed = true
    console.log('  [PASS] Patient 1 complete cash lifecycle passed.')
  } catch (err) {
    testReport.test8_patient1.passed = false
    testReport.test8_patient1.error = err.message
    console.error('  [FAIL] Patient 1 lifecycle failed:', err.message)
  } finally {
    if (pay1?.id) await adminClient.from('payments').delete().eq('id', pay1.id)
    if (enc1?.id) await adminClient.from('clinical_encounters').delete().eq('id', enc1.id)
    if (v1?.id) await adminClient.from('visits').delete().eq('id', v1.id)
    if (r1?.id) await adminClient.from('rdv').delete().eq('id', r1.id)
    if (p1?.id) await adminClient.from('patients').delete().eq('id', p1.id)
  }

  // ---------------------------------------------------------------------------------
  // TEST 8 - PATIENT 2: SCHEDULED -> WAITING -> CALLED -> IN_CONSULTATION -> DONE (FREE)
  // ---------------------------------------------------------------------------------
  console.log('\n>>> [TEST 8 - PATIENT 2] Free / Waived Consultation Workflow...')
  let p2, r2, v2, enc2, pay2
  try {
    const { data: pat2 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Lifecycle2_Nom',
      prenom: 'FreePatient',
      telephone: '0688000002'
    }]).select().single()
    p2 = pat2

    const startIso2 = new Date(`${TODAY}T19:00:00Z`).toISOString()
    const endIso2 = new Date(new Date(startIso2).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdv2, error: r2Err } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID,
      patient_id: p2.id,
      date_rdv: startIso2,
      appointment_day: TODAY,
      start_time: startIso2,
      end_time: endIso2,
      duree_minutes: 20,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    if (r2Err) throw r2Err
    r2 = rdv2

    // Move to waiting
    const { data: visit2, error: v2Err } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r2.id,
      p_doctor_id: DOCTOR_ID
    })
    if (v2Err) throw v2Err
    v2 = visit2

    // Call patient
    await doctorClient.rpc('call_patient', { p_visit_id: v2.id })

    // Open encounter
    const { data: openEnc2, error: enc2Err } = await doctorClient.rpc('mm_open_encounter', {
      p_patient_id: p2.id,
      p_visit_id: v2.id
    })
    if (enc2Err) throw enc2Err
    enc2 = openEnc2

    // Complete with 0 DH free
    const { data: comp2Res, error: comp2Err } = await doctorClient.rpc('mm_complete_encounter', {
      p_id: enc2.id,
      p_note: { motif: 'Contrôle gratuit post-opératoire' },
      p_expected_version: enc2.version,
      p_billing_amount: 0,
      p_billing_type: 'free'
    })
    if (comp2Err) throw comp2Err

    // Verify DB state: visit moves directly to 'completed', payment status 'waived', rdv payment_status 'NOT_REQUIRED'
    const { data: vReload } = await adminClient.from('visits').select('*').eq('id', v2.id).single()
    const { data: rReload } = await adminClient.from('rdv').select('*').eq('id', r2.id).single()
    const { data: pReload } = await adminClient.from('payments').select('*').eq('visit_id', v2.id).single()
    pay2 = pReload

    if (vReload.status !== 'completed') {
      throw new Error(`Free visit status is ${vReload.status}, expected 'completed' directly`)
    }
    if (pReload.status !== 'waived' || Number(pReload.amount) !== 0) {
      throw new Error(`Payment row expected waived: status=${pReload.status}, amount=${pReload.amount}`)
    }
    if (rReload.payment_status !== 'NOT_REQUIRED') {
      throw new Error(`RDV payment_status expected NOT_REQUIRED: ${rReload.payment_status}`)
    }
    testReport.test8_patient2.details.push('Free consultation: completed immediately, payment waived, rdv NOT_REQUIRED')

    testReport.test8_patient2.passed = true
    console.log('  [PASS] Patient 2 free consultation passed.')
  } catch (err) {
    testReport.test8_patient2.passed = false
    testReport.test8_patient2.error = err.message
    console.error('  [FAIL] Patient 2 lifecycle failed:', err.message)
  } finally {
    if (pay2?.id) await adminClient.from('payments').delete().eq('id', pay2.id)
    if (enc2?.id) await adminClient.from('clinical_encounters').delete().eq('id', enc2.id)
    if (v2?.id) await adminClient.from('visits').delete().eq('id', v2.id)
    if (r2?.id) await adminClient.from('rdv').delete().eq('id', r2.id)
    if (p2?.id) await adminClient.from('patients').delete().eq('id', p2.id)
  }

  // ---------------------------------------------------------------------------------
  // TEST 8 - PATIENT 3: PARTIAL PAYMENT & DEBT COLLECTION
  // ---------------------------------------------------------------------------------
  console.log('\n>>> [TEST 8 - PATIENT 3] Partial Payment & Debt Collection Workflow...')
  let p3, r3, v3, enc3, pay3
  try {
    const { data: pat3 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Lifecycle3_Nom',
      prenom: 'PartialPatient',
      telephone: '0688000003'
    }]).select().single()
    p3 = pat3

    const startIso3 = new Date(`${TODAY}T19:30:00Z`).toISOString()
    const endIso3 = new Date(new Date(startIso3).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdv3, error: r3Err } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID,
      patient_id: p3.id,
      date_rdv: startIso3,
      appointment_day: TODAY,
      start_time: startIso3,
      end_time: endIso3,
      duree_minutes: 20,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    if (r3Err) throw r3Err
    r3 = rdv3

    // Move to waiting
    const { data: visit3 } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r3.id,
      p_doctor_id: DOCTOR_ID
    })
    v3 = visit3

    // Call and open
    await doctorClient.rpc('call_patient', { p_visit_id: v3.id })
    const { data: openEnc3 } = await doctorClient.rpc('mm_open_encounter', {
      p_patient_id: p3.id,
      p_visit_id: v3.id
    })
    enc3 = openEnc3

    // Complete consultation: 500 DH billed
    await doctorClient.rpc('mm_complete_encounter', {
      p_id: enc3.id,
      p_note: { motif: 'Intervention complexe' },
      p_expected_version: enc3.version,
      p_billing_amount: 500,
      p_billing_type: 'cash'
    })

    // Secretary collects partial payment: 200 DH out of 500 DH
    console.log('   Collecting partial payment (200 DH / 500 DH)...')
    const { data: partPayRes, error: partErr } = await secretaryClient.rpc('process_visit_payment', {
      p_visit_id: v3.id,
      p_method: 'cash',
      p_amount: 200,
      p_partial: true
    })
    if (partErr) throw partErr

    // Reload and check DB:
    // Under migration 20260923060000:
    // visits.status = 'completed', payments.status = 'pending', payments.amount = 500, payments.amount_paid = 200, rdv.payment_status = 'UNPAID'
    const { data: vReloadPart } = await adminClient.from('visits').select('*').eq('id', v3.id).single()
    const { data: pReloadPart } = await adminClient.from('payments').select('*').eq('visit_id', v3.id).single()
    const { data: rReloadPart } = await adminClient.from('rdv').select('*').eq('id', r3.id).single()
    pay3 = pReloadPart

    if (vReloadPart.status !== 'completed') {
      throw new Error(`Visit status after partial payment is ${vReloadPart.status}, expected 'completed'`)
    }
    if (pReloadPart.status !== 'pending' || Number(pReloadPart.amount_paid) !== 200 || Number(pReloadPart.amount) !== 500) {
      throw new Error(`Payment row invalid: status=${pReloadPart.status}, paid=${pReloadPart.amount_paid}, amount=${pReloadPart.amount}`)
    }
    if (rReloadPart.payment_status !== 'UNPAID') {
      throw new Error(`RDV payment_status expected UNPAID while debt remains: ${rReloadPart.payment_status}`)
    }
    testReport.test8_patient3.details.push('Partial payment (200/500): visit completed, payment remains pending, rdv UNPAID')

    // Second collection: debt settlement for remaining 300 DH
    console.log('   Settling remaining debt (300 DH)...')
    const { data: settleRes, error: settleErr } = await secretaryClient.rpc('process_visit_payment', {
      p_visit_id: v3.id,
      p_method: 'cash',
      p_amount: 300,
      p_partial: false
    })
    if (settleErr) throw settleErr

    // Verify full settlement
    const { data: pReloadFull } = await adminClient.from('payments').select('*').eq('id', pay3.id).single()
    const { data: rReloadFull } = await adminClient.from('rdv').select('*').eq('id', r3.id).single()
    if (pReloadFull.status !== 'paid' || Number(pReloadFull.amount_paid) !== 500) {
      throw new Error(`Payment row not marked paid after settlement: status=${pReloadFull.status}, paid=${pReloadFull.amount_paid}`)
    }
    if (rReloadFull.payment_status !== 'PAID') {
      throw new Error(`RDV payment_status expected PAID after full debt settlement: ${rReloadFull.payment_status}`)
    }
    testReport.test8_patient3.details.push('Remaining debt settled: payments.status=paid (500/500), rdv.payment_status=PAID')

    testReport.test8_patient3.passed = true
    console.log('  [PASS] Patient 3 partial payment & debt collection passed.')
  } catch (err) {
    testReport.test8_patient3.passed = false
    testReport.test8_patient3.error = err.message
    console.error('  [FAIL] Patient 3 lifecycle failed:', err.message)
  } finally {
    if (pay3?.id) await adminClient.from('payments').delete().eq('id', pay3.id)
    if (enc3?.id) await adminClient.from('clinical_encounters').delete().eq('id', enc3.id)
    if (v3?.id) await adminClient.from('visits').delete().eq('id', v3.id)
    if (r3?.id) await adminClient.from('rdv').delete().eq('id', r3.id)
    if (p3?.id) await adminClient.from('patients').delete().eq('id', p3.id)
  }

  // ---------------------------------------------------------------------------------
  // TEST 11: Multi-Tab Consultation Optimistic Locking & Conflict Detection
  // ---------------------------------------------------------------------------------
  console.log('\n>>> [TEST 11] Multi-Tab Consultation Optimistic Locking...')
  let p11, enc11
  try {
    const { data: pat11 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Stress11_Lock',
      prenom: 'Patient11',
      telephone: '0688000011'
    }]).select().single()
    p11 = pat11

    // Open encounter
    const { data: enc, error: oErr } = await doctorClient.rpc('mm_open_encounter', {
      p_patient_id: p11.id
    })
    if (oErr) throw oErr
    enc11 = enc
    const initialVersion = enc11.version

    // Tab 1 saves draft with initialVersion
    console.log(`   Tab 1 saves encounter with version ${initialVersion}...`)
    const { data: savedTab1, error: saveErr1 } = await doctorClient.rpc('mm_save_encounter', {
      p_id: enc11.id,
      p_note: { motif: 'Tab 1 update', diagnostic: 'Rhinite' },
      p_expected_version: initialVersion
    })
    if (saveErr1) throw saveErr1
    const newVersion = savedTab1.version
    testReport.test11_multitab.details.push(`Tab 1 save succeeded, version incremented from ${initialVersion} to ${newVersion}`)

    // Tab 2 attempts to save using the STALE initialVersion
    console.log(`   Tab 2 attempts to save with stale version ${initialVersion}...`)
    const { data: savedTab2, error: saveErr2 } = await doctorClient.rpc('mm_save_encounter', {
      p_id: enc11.id,
      p_note: { motif: 'Tab 2 stale overwrite attempt' },
      p_expected_version: initialVersion
    })

    if (!saveErr2) {
      throw new Error('STALE OVERWRITE BUG: Tab 2 overwrote draft despite version conflict!')
    }
    if (!saveErr2.message.includes('version conflict')) {
      throw new Error(`Unexpected error message: ${saveErr2.message}`)
    }
    testReport.test11_multitab.details.push(`Tab 2 stale overwrite properly BLOCKED with error: '${saveErr2.message}'`)

    testReport.test11_multitab.passed = true
    console.log('  [PASS] Multi-tab optimistic locking passed.')
  } catch (err) {
    testReport.test11_multitab.passed = false
    testReport.test11_multitab.error = err.message
    console.error('  [FAIL] Multi-tab locking failed:', err.message)
  } finally {
    if (enc11?.id) await adminClient.from('clinical_encounters').delete().eq('id', enc11.id)
    if (p11?.id) await adminClient.from('patients').delete().eq('id', p11.id)
  }

  console.log('\n================ PART 3 RESULTS SUMMARY ================')
  console.log(JSON.stringify(testReport, null, 2))
  return testReport
}

runPart3().catch(console.error)
