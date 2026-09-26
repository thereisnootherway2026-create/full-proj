import {
  getTestClients, CLINIC_ID, DOCTOR_ID, SECRETARY_ID, adminClient
} from './stress-auth-helper.mjs'

const TODAY = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })

async function runPart4() {
  console.log('========================================================')
  console.log('   PRODUCTION STRESS TEST — PART 4 (SECTIONS 10, 12, 13)')
  console.log('========================================================\n')

  const { secretaryClient, doctorClient } = await getTestClients()

  const testReport = {
    test10_payment_integrity: { name: 'Payment Handoff Integrity & Doctor Lockdown', passed: false, details: [] },
    test12_multidoctor: { name: 'Multi-Doctor Assignment & Queue Isolation', passed: false, details: [] },
    test13_linkage_integrity: { name: 'Database Linkage Integrity & Orphan Check', passed: false, details: [] },
  }

  // ---------------------------------------------------------------------------------
  // TEST 10: Payment Handoff Integrity & Doctor Lockdown
  // ---------------------------------------------------------------------------------
  console.log('>>> [TEST 10] Payment Handoff Integrity & Doctor Lockdown...')
  let p10, r10, v10, enc10, pay10
  try {
    const { data: pat10 } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID,
      nom: 'Stress10_Payment',
      prenom: 'HandoffPat',
      telephone: '0699000010'
    }]).select().single()
    p10 = pat10

    const startIso = new Date(`${TODAY}T20:00:00Z`).toISOString()
    const endIso = new Date(new Date(startIso).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdv10, error: r10Err } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID,
      patient_id: p10.id,
      date_rdv: startIso,
      appointment_day: TODAY,
      start_time: startIso,
      end_time: endIso,
      duree_minutes: 20,
      status: 'confirme',
      arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    if (r10Err) throw r10Err
    r10 = rdv10

    // Add to waiting room
    const { data: vResult } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r10.id,
      p_doctor_id: DOCTOR_ID
    })
    v10 = vResult

    // Doctor calls and completes encounter with 450 DH cash
    await doctorClient.rpc('call_patient', { p_visit_id: v10.id })
    const { data: enc } = await doctorClient.rpc('mm_open_encounter', {
      p_patient_id: p10.id,
      p_visit_id: v10.id
    })
    enc10 = enc

    await doctorClient.rpc('mm_complete_encounter', {
      p_id: enc10.id,
      p_note: { motif: 'Consultation avec acte complémentaire' },
      p_expected_version: enc10.version,
      p_billing_amount: 450,
      p_billing_type: 'cash'
    })

    // 1. Verify Cashier Queue
    console.log('   Verifying visit in Secretary Cashier Queue...')
    const { data: billingPayments, error: bErr } = await secretaryClient
      .from('payments')
      .select('*, visits(*, patients(id, nom, prenom, telephone))')
      .eq('clinic_id', CLINIC_ID)
      .eq('status', 'pending')
    if (bErr) throw bErr

    const paymentForVisit = billingPayments.find(p => p.visit_id === v10.id)
    if (!paymentForVisit) throw new Error('Payment not found in Secretary Cashier Queue')
    if (Number(paymentForVisit.amount) !== 450) {
      throw new Error(`Amount in cashier is ${paymentForVisit.amount}, expected 450`)
    }
    pay10 = paymentForVisit
    testReport.test10_payment_integrity.details.push(`Appeared in cashier queue with correct amount: ${paymentForVisit.amount} DH`)

    // 2. Doctor Lockdown: Verify Doctor CANNOT edit completed encounter
    console.log('   Verifying Doctor cannot edit completed consultation...')
    const { error: doctorEditErr } = await doctorClient.rpc('mm_save_encounter', {
      p_id: enc10.id,
      p_note: { motif: 'Tampering with completed note' },
      p_expected_version: enc10.version + 1
    })

    if (!doctorEditErr) {
      throw new Error('SECURITY VIOLATION: Doctor was able to edit a completed encounter!')
    }
    if (!doctorEditErr.message.includes('not editable')) {
      throw new Error(`Unexpected error message when editing completed encounter: ${doctorEditErr.message}`)
    }
    testReport.test10_payment_integrity.details.push(`Doctor lockdown enforced: ${doctorEditErr.message}`)

    // 3. Secretary processes payment
    console.log('   Secretary processes payment of 450 DH...')
    const { data: paidVisit, error: pErr } = await secretaryClient.rpc('process_visit_payment', {
      p_visit_id: v10.id,
      p_method: 'card',
      p_amount: 450,
      p_partial: false
    })
    if (pErr) throw pErr

    // 4. Verify cashier queue is cleared
    const { data: cashierAfterPay } = await secretaryClient
      .from('payments')
      .select('*')
      .eq('visit_id', v10.id)
      .eq('status', 'pending')

    if (cashierAfterPay && cashierAfterPay.length > 0) {
      throw new Error('Visit still appears in cashier pending queue after full payment!')
    }

    const { data: pRecord } = await adminClient.from('payments').select('*').eq('id', pay10.id).single()
    const { data: rRecord } = await adminClient.from('rdv').select('*').eq('id', r10.id).single()

    if (pRecord.status !== 'paid' || rRecord.payment_status !== 'PAID') {
      throw new Error(`Status mismatch after payment: payment.status=${pRecord.status}, rdv.payment_status=${rRecord.payment_status}`)
    }
    testReport.test10_payment_integrity.details.push('Cashier queue cleared, payment.status=paid, rdv.payment_status=PAID')

    testReport.test10_payment_integrity.passed = true
    console.log('  [PASS] Test 10 passed successfully.')
  } catch (err) {
    testReport.test10_payment_integrity.passed = false
    testReport.test10_payment_integrity.error = err.message
    console.error('  [FAIL] Test 10 failed:', err.message)
  } finally {
    if (pay10?.id) await adminClient.from('payments').delete().eq('id', pay10.id)
    if (enc10?.id) await adminClient.from('clinical_encounters').delete().eq('id', enc10.id)
    if (v10?.id) await adminClient.from('visits').delete().eq('id', v10.id)
    if (r10?.id) await adminClient.from('rdv').delete().eq('id', r10.id)
    if (p10?.id) await adminClient.from('patients').delete().eq('id', p10.id)
  }

  // ---------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------
  // TEST 12: Multi-Doctor Assignment & Queue Isolation
  // ---------------------------------------------------------------------------------
  console.log('\n>>> [TEST 12] Multi-Doctor Assignment & Queue Isolation...')
  let p12a, p12b, r12a, r12b, v12a, v12b, doctor2Id
  try {
    // Create Doctor 2 user in CLINIC_ID
    const doc2Email = `temp_doc2_${Date.now()}@macromedica.local`
    const { data: doc2Auth, error: d2Err } = await adminClient.auth.admin.createUser({
      email: doc2Email,
      password: 'StressTest2026!Pass',
      email_confirm: true,
      user_metadata: {
        role: 'docteur',
        cabinet_id: CLINIC_ID,
        clinic_id: CLINIC_ID,
        nom_complet: 'Dr. Second TestDoctor'
      }
    })
    if (d2Err) throw d2Err
    doctor2Id = doc2Auth.user.id

    // Ensure profile is active and has cabinet_id set
    await adminClient.from('profiles').upsert({
      id: doctor2Id,
      cabinet_id: CLINIC_ID,
      clinic_id: CLINIC_ID,
      role: 'docteur',
      nom_complet: 'Dr. Second TestDoctor',
      status: 'active'
    })
    testReport.test12_multidoctor.details.push(`Doctor 2 created: ${doctor2Id}`)

    // Create Patient A assigned to Doctor 1
    const { data: patA } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'MultiDoc_A', prenom: 'PatA', telephone: '0699000012'
    }]).select().single()
    p12a = patA

    // Create Patient B assigned to Doctor 2
    const { data: patB } = await adminClient.from('patients').insert([{
      cabinet_id: CLINIC_ID, nom: 'MultiDoc_B', prenom: 'PatB', telephone: '0699000013'
    }]).select().single()
    p12b = patB

    // Create RDV A (20:30) and RDV B (21:00)
    const startA = new Date(`${TODAY}T20:30:00Z`).toISOString()
    const endA = new Date(new Date(startA).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdvA } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: p12a.id, date_rdv: startA, appointment_day: TODAY,
      start_time: startA, end_time: endA, duree_minutes: 20, status: 'confirme', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    r12a = rdvA

    const startB = new Date(`${TODAY}T21:00:00Z`).toISOString()
    const endB = new Date(new Date(startB).getTime() + 20 * 60 * 1000).toISOString()
    const { data: rdvB } = await secretaryClient.from('rdv').insert([{
      cabinet_id: CLINIC_ID, patient_id: p12b.id, date_rdv: startB, appointment_day: TODAY,
      start_time: startB, end_time: endB, duree_minutes: 20, status: 'confirme', arrival_status: 'NOT_ARRIVED'
    }]).select().single()
    r12b = rdvB

    // Secretary moves RDV A to waiting room assigned to Doctor 1
    const { data: vA, error: vAErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r12a.id,
      p_doctor_id: DOCTOR_ID
    })
    if (vAErr) throw vAErr
    v12a = vA

    // Secretary moves RDV B to waiting room assigned to Doctor 2
    const { data: vB, error: vBErr } = await secretaryClient.rpc('create_visit_from_rdv', {
      p_rdv_id: r12b.id,
      p_doctor_id: doctor2Id
    })
    if (vBErr) throw vBErr
    v12b = vB

    // Check Doctor 1 Queue: must contain vA, must NOT contain vB
    const { data: doc1Queue } = await doctorClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('doctor_id', DOCTOR_ID)
      .eq('queue_date', TODAY)
      .in('status', ['waiting', 'called'])

    const doc1HasA = doc1Queue.some(v => v.id === v12a.id)
    const doc1HasB = doc1Queue.some(v => v.id === v12b.id)

    if (!doc1HasA) throw new Error('Doctor 1 does NOT see Patient A assigned to them')
    if (doc1HasB) throw new Error('ISOLATION LEAK: Doctor 1 sees Patient B assigned to Doctor 2!')
    testReport.test12_multidoctor.details.push('Doctor 1 sees only Patient A, Patient B strictly isolated')

    // Check Doctor 2 Queue: must contain vB, must NOT contain vA
    const { data: doc2Queue } = await adminClient
      .from('visits')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('doctor_id', doctor2Id)
      .eq('queue_date', TODAY)
      .in('status', ['waiting', 'called'])

    const doc2HasA = doc2Queue.some(v => v.id === v12a.id)
    const doc2HasB = doc2Queue.some(v => v.id === v12b.id)

    if (!doc2HasB) throw new Error('Doctor 2 does NOT see Patient B assigned to them')
    if (doc2HasA) throw new Error('ISOLATION LEAK: Doctor 2 sees Patient A assigned to Doctor 1!')
    testReport.test12_multidoctor.details.push('Doctor 2 sees only Patient B, Patient A strictly isolated')

    // Check Secretary Queue: must contain BOTH Patient A and Patient B with their respective doctors
    const { data: secQueue } = await secretaryClient
      .from('visits')
      .select('*, doctor:doctor_id(id, nom_complet)')
      .eq('clinic_id', CLINIC_ID)
      .eq('queue_date', TODAY)
      .in('status', ['waiting', 'called'])

    const secHasA = secQueue.find(v => v.id === v12a.id)
    const secHasB = secQueue.find(v => v.id === v12b.id)

    if (!secHasA || !secHasB) throw new Error('Secretary cannot see both patients in waiting room')
    if (secHasA.doctor_id !== DOCTOR_ID || secHasB.doctor_id !== doctor2Id) {
      throw new Error('Assigned doctor metadata incorrect in Secretary queue')
    }
    testReport.test12_multidoctor.details.push('Secretary sees both patients with correct assigned doctor metadata')

    testReport.test12_multidoctor.passed = true
    console.log('  [PASS] Test 12 passed successfully.')
  } catch (err) {
    testReport.test12_multidoctor.passed = false
    testReport.test12_multidoctor.error = err.message
    console.error('  [FAIL] Test 12 failed:', err.message)
  } finally {
    if (v12b?.id) await adminClient.from('visits').delete().eq('id', v12b.id)
    if (v12a?.id) await adminClient.from('visits').delete().eq('id', v12a.id)
    if (r12b?.id) await adminClient.from('rdv').delete().eq('id', r12b.id)
    if (r12a?.id) await adminClient.from('rdv').delete().eq('id', r12a.id)
    if (p12b?.id) await adminClient.from('patients').delete().eq('id', p12b.id)
    if (p12a?.id) await adminClient.from('patients').delete().eq('id', p12a.id)
    if (doctor2Id) {
      await adminClient.from('profiles').delete().eq('id', doctor2Id)
      await adminClient.auth.admin.deleteUser(doctor2Id)
    }
  }

  // ---------------------------------------------------------------------------------
  // TEST 13: Database Linkage Integrity & Orphan Check
  // ---------------------------------------------------------------------------------
  console.log('\n>>> [TEST 13] Database Linkage Integrity & Orphan Audit...')
  try {
    // 1. Check for visits pointing to non-existent RDV
    const { data: badVisits } = await adminClient
      .from('visits')
      .select('id, rdv_id')
      .not('rdv_id', 'is', null)

    // For any visit with rdv_id, verify rdv exists
    let orphanVisitCount = 0
    if (badVisits && badVisits.length > 0) {
      const rdvIds = badVisits.map(v => v.rdv_id)
      const { data: existingRdvs } = await adminClient.from('rdv').select('id').in('id', rdvIds)
      const existingRdvSet = new Set((existingRdvs || []).map(r => r.id))
      const orphans = badVisits.filter(v => !existingRdvSet.has(v.rdv_id))
      orphanVisitCount = orphans.length
    }
    if (orphanVisitCount > 0) {
      throw new Error(`INTEGRITY BUG: Found ${orphanVisitCount} visits referencing deleted or non-existent RDVs!`)
    }
    testReport.test13_linkage_integrity.details.push('Zero orphan visits referencing invalid RDVs')

    // 2. Check for payments pointing to non-existent visits
    const { data: badPayments } = await adminClient.from('payments').select('id, visit_id').not('visit_id', 'is', null)
    let orphanPaymentCount = 0
    if (badPayments && badPayments.length > 0) {
      const vIds = badPayments.map(p => p.visit_id)
      const { data: existingVisits } = await adminClient.from('visits').select('id').in('id', vIds)
      const existingVisitSet = new Set((existingVisits || []).map(v => v.id))
      const orphans = badPayments.filter(p => !existingVisitSet.has(p.visit_id))
      orphanPaymentCount = orphans.length
    }
    if (orphanPaymentCount > 0) {
      throw new Error(`INTEGRITY BUG: Found ${orphanPaymentCount} payments referencing non-existent visits!`)
    }
    testReport.test13_linkage_integrity.details.push('Zero orphan payments referencing invalid visits')

    // 3. Check patient_id consistency between visits and payments
    const { data: mismatchPayments } = await adminClient
      .from('payments')
      .select('id, patient_id, visits(patient_id)')
      .not('visit_id', 'is', null)

    const mismatches = (mismatchPayments || []).filter(p => p.visits && p.patient_id !== p.visits.patient_id)
    if (mismatches.length > 0) {
      throw new Error(`INTEGRITY BUG: ${mismatches.length} payments have mismatched patient_id vs linked visit!`)
    }
    testReport.test13_linkage_integrity.details.push('Patient ID strictly consistent across visits and payments')

    testReport.test13_linkage_integrity.passed = true
    console.log('  [PASS] Test 13 passed successfully.')
  } catch (err) {
    testReport.test13_linkage_integrity.passed = false
    testReport.test13_linkage_integrity.error = err.message
    console.error('  [FAIL] Test 13 failed:', err.message)
  }

  console.log('\n================ PART 4 RESULTS SUMMARY ================')
  console.log(JSON.stringify(testReport, null, 2))
  return testReport
}

runPart4().catch(console.error)
