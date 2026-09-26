const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log('--- 1. Setting known passwords for test doctor & secretary ---');
  const docId = '6b5443a9-dc9e-4a1c-bd60-9db88b84ac7d';
  const secId = '9291e912-57c0-496d-b49d-0c4eeb79fbe8';
  const cabinetId = 'a0000000-0000-0000-0000-000000000001';

  await supabaseAdmin.auth.admin.updateUserById(docId, { password: 'TestDoctor123!' });
  await supabaseAdmin.auth.admin.updateUserById(secId, { password: 'TestSecretary123!' });

  console.log('--- 2. Signing in as Doctor ---');
  const docClient = createClient(supabaseUrl, anonKey);
  const { data: docAuth, error: docAuthErr } = await docClient.auth.signInWithPassword({
    email: 'test.medecin@macromedica.ma',
    password: 'TestDoctor123!'
  });
  if (docAuthErr) throw new Error('Doc login failed: ' + docAuthErr.message);
  console.log('Doctor signed in successfully. User ID:', docAuth.user.id);

  console.log('--- 3. Signing in as Secretary ---');
  const secClient = createClient(supabaseUrl, anonKey);
  const { data: secAuth, error: secAuthErr } = await secClient.auth.signInWithPassword({
    email: 'othmanetouggani0@gmail.com',
    password: 'TestSecretary123!'
  });
  if (secAuthErr) throw new Error('Sec login failed: ' + secAuthErr.message);
  console.log('Secretary signed in successfully. User ID:', secAuth.user.id);

  console.log('--- 4. Finding or creating a Patient in cabinet ---');
  let { data: patient } = await supabaseAdmin
    .from('patients')
    .select('id, nom, prenom')
    .eq('cabinet_id', cabinetId)
    .limit(1)
    .maybeSingle();

  if (!patient) {
    const { data: newP } = await supabaseAdmin
      .from('patients')
      .insert([{
        cabinet_id: cabinetId,
        nom: 'Benali',
        prenom: 'Karim',
        telephone: '0661234567'
      }])
      .select()
      .single();
    patient = newP;
  }
  console.log('Using patient:', patient);

  console.log('--- 5. Creating a test Prescription task ---');
  const { data: task, error: taskErr } = await supabaseAdmin
    .from('tasks')
    .insert([{
      cabinet_id: cabinetId,
      patient_id: patient.id,
      title: 'Renouvellement traitement HTA (Amlor 5mg)',
      description: 'Patient demande renouvellement pour 3 mois.',
      type: 'prescription',
      priority: 'normal',
      status: 'pending',
      created_by: docId
    }])
    .select()
    .single();

  if (taskErr) throw new Error('Task creation failed: ' + taskErr.message);
  console.log('Task created:', task.id);

  console.log('\n======================================================');
  console.log('TEST 1: SECRETARY CALLS DOCTOR-SCOPED ACTION');
  console.log('Expectation: Server REJECTS with "not authorized"');
  console.log('======================================================');
  const { data: secResult, error: secRpcErr } = await secClient.rpc('mm_execute_task_action', {
    p_task_id: task.id,
    p_action_key: 'doctor_validate_prescription',
    p_action_role: 'doctor',
    p_note: 'Tentative de validation par secrétaire'
  });

  console.log('Secretary call result:');
  console.log('Data:', secResult);
  console.log('Error message:', secRpcErr?.message);
  console.log('Error code:', secRpcErr?.code);

  if (!secRpcErr || !secRpcErr.message.includes('not authorized')) {
    console.error('FAILED! Expected server rejection with "not authorized", but got:', secRpcErr);
    process.exit(1);
  }
  console.log('>>> VERIFICATION PASSED: Server rejected secretary doctor-action with "not authorized"!\n');

  console.log('======================================================');
  console.log('TEST 2: DOCTOR CALLS DOCTOR-SCOPED ACTION (OPTION A)');
  console.log('Expectation: Server SUCCEEDS, creates ordonnance document, updates task');
  console.log('======================================================');
  const { data: docResult, error: docRpcErr } = await docClient.rpc('mm_execute_task_action', {
    p_task_id: task.id,
    p_action_key: 'doctor_validate_prescription',
    p_action_role: 'doctor',
    p_note: 'Ordonnance de renouvellement validée au dossier patient.'
  });

  if (docRpcErr) {
    console.error('Doctor call failed:', docRpcErr);
    process.exit(1);
  }
  console.log('Doctor call success! Returned data:');
  console.log('- Task ID:', docResult.id);
  console.log('- Status:', docResult.status);
  console.log('- Document ID:', docResult.document_id);
  console.log('- Description:\n' + docResult.description);

  if (!docResult.document_id) {
    console.error('FAILED! Option A expected document_id to be populated, but it is null!');
    process.exit(1);
  }
  console.log('>>> VERIFICATION PASSED: Task document_id populated:', docResult.document_id);

  console.log('\n======================================================');
  console.log('TEST 3: VERIFY DOCUMENT RECORD IN public.documents');
  console.log('======================================================');
  const { data: docRecord, error: docFetchErr } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', docResult.document_id)
    .single();

  if (docFetchErr || !docRecord) {
    console.error('Could not find created document:', docFetchErr);
    process.exit(1);
  }

  console.log('Found created document:');
  console.log('- ID:', docRecord.id);
  console.log('- Type Document:', docRecord.type_document);
  console.log('- Nom fichier:', docRecord.nom_fichier);
  console.log('- Patient ID:', docRecord.patient_id);
  console.log('- Cabinet ID:', docRecord.cabinet_id);
  console.log('- Created At:', docRecord.created_at);

  if (docRecord.type_document !== 'ordonnance') {
    console.error('FAILED! Document type is not ordonnance');
    process.exit(1);
  }
  console.log('>>> VERIFICATION PASSED: Document record is authentic ordonnance in public.documents!');

  console.log('\n======================================================');
  console.log('TEST 4: SECRETARY CALLS SECRETARY ACTION (e.g. remise ordonnance)');
  console.log('Expectation: Server SUCCEEDS for secretary role');
  console.log('======================================================');
  const { data: secActionRes, error: secActionErr } = await secClient.rpc('mm_execute_task_action', {
    p_task_id: task.id,
    p_action_key: 'secretary_prescription_delivered',
    p_action_role: 'secretary',
    p_note: 'Remise effectuée au patient au comptoir.',
    p_status: 'completed'
  });

  if (secActionErr) {
    console.error('Secretary valid action failed:', secActionErr);
    process.exit(1);
  }
  console.log('Secretary action succeeded as expected. New description snippet:\n' + secActionRes.description);
  console.log('>>> VERIFICATION PASSED: Secretary allowed to execute secretary-scoped action!');

  console.log('\n======================================================');
  console.log('ALL SERVER-SIDE ENFORCEMENT & PERSISTENCE TESTS PASSED 100%');
  console.log('======================================================');
}

main().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
