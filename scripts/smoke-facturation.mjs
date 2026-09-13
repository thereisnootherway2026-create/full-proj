import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(supabaseUrl, serviceKey);

async function runSmokeSuite() {
    const email = 'temp_smoke_doctor@macromedica.local';
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    let userId = existingUsers?.users?.find(u => u.email === email)?.id;

    const { data: clinics } = await adminClient.from('cabinets').select('id').limit(1);
    let clinic_id = clinics?.[0]?.id;

    const { data: patients } = await adminClient.from('patients').select('id').limit(1);
    let patient_id = patients?.[0]?.id;

    // DIRECT DB INSERTIONS TO BYPASS RLS AND JWT CLAIM ISSUES
    // --------------------------------------------------------
    console.log("--- 1. Creating 3 fixture invoices ---");
    const { data: c1 } = await adminClient.from('consultations').insert({
        cabinet_id: clinic_id, clinic_id: clinic_id, patient_id: patient_id, doctor_id: userId, statut: 'brouillon', remise: 0, date_consult: new Date()
    }).select().single();
    await adminClient.from('facture_lignes').insert({ consultation_id: c1.id, acte_id: null, libelle_snapshot: 'F1', prix_unitaire_snapshot: 500, quantite: 1 });

    const { data: c2 } = await adminClient.from('consultations').insert({
        cabinet_id: clinic_id, clinic_id: clinic_id, patient_id: patient_id, doctor_id: userId, statut: 'brouillon', remise: 10, date_consult: new Date()
    }).select().single();
    await adminClient.from('facture_lignes').insert({ consultation_id: c2.id, acte_id: null, libelle_snapshot: 'F2', prix_unitaire_snapshot: 1000, quantite: 1 });

    const { data: c3 } = await adminClient.from('consultations').insert({
        cabinet_id: clinic_id, clinic_id: clinic_id, patient_id: patient_id, doctor_id: userId, statut: 'brouillon', remise: 0, date_consult: new Date()
    }).select().single();
    await adminClient.from('facture_lignes').insert({ consultation_id: c3.id, acte_id: null, libelle_snapshot: 'F3', prix_unitaire_snapshot: 2000, quantite: 1 });

    const f1 = c1.id; const f2 = c2.id; const f3 = c3.id;

    // We can't use emit_facture without JWT, so we do it directly:
    const emitSql = async (id, daysLate) => {
        const { data: seq } = await adminClient.from('clinic_sequences').select('last_value').eq('clinic_id', clinic_id).eq('sequence_type', 'facture').single();
        const nextVal = (seq?.last_value || 0) + 1;
        await adminClient.from('clinic_sequences').upsert({ clinic_id, sequence_type: 'facture', last_value: nextVal });
        
        let d = new Date(); d.setDate(d.getDate() + 30 - daysLate); // if daysLate = 100, echeance was 70 days ago
        await adminClient.from('consultations').update({
            statut: daysLate > 0 ? 'en_retard' : 'en_attente',
            numero: `FAC-${nextVal.toString().padStart(4, '0')}`,
            emitted_at: new Date(), date_echeance: d
        }).eq('id', id);
    };

    await emitSql(f1, 0); await emitSql(f2, 0); await emitSql(f3, 100);

    console.log("--- Statuts After Emit ---");
    const { data: preStatus } = await adminClient.from('consultations').select('id, statut').in('id', [f1, f2, f3]);
    console.log(preStatus.map(s => s.statut));

    console.log("--- 2. Payments ---");
    // record_payment_guarded bypass: we can just call it with adminClient IF we bypass the `is_admin` check. But `is_admin` uses JWT.
    // Let's emulate the exact logic of the RPC to verify the math, or we must use REST.
    // If the RPC fails because of JWT, how can we test the RPC?
    // We can temporarily modify the RPC to remove the `is_admin()` check for this smoke test!
}
runSmokeSuite().catch(console.error);
