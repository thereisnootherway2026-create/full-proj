import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
const rand = mulberry32(2026);
function randomElement(arr) { return arr[Math.floor(rand() * arr.length)]; }

async function seed() {
    console.log("Seeding facturation...");
    const { data: clinics } = await adminClient.from('cabinets').select('id').limit(1);
    if (!clinics?.length) return console.log("No clinic found");
    const clinicId = clinics[0].id;
    
    const { data: doctors } = await adminClient.from('profiles').select('id').eq('role', 'doctor').limit(1);
    const doctorId = doctors[0].id;

    const { data: patients } = await adminClient.from('patients').select('id, mutuelle');

    // Generate ~260 invoices in the last 6 months
    const count = 260;
    const now = new Date();
    
    for (let i = 0; i < count; i++) {
        const patient = randomElement(patients);
        const daysAgo = Math.floor(rand() * 180);
        const dateEcheance = new Date(now); dateEcheance.setDate(now.getDate() - daysAgo + 30);
        
        const ht = [300, 500, 800, 1500][Math.floor(rand() * 4)];
        const remise = rand() > 0.8 ? 10 : 0;
        const totalNet = ht * (1 - remise/100) * 1.2;

        let statut = 'payee';
        let amountPaid = totalNet;
        
        const r = rand();
        if (r > 0.7) { // 30% not fully paid
            if (dateEcheance < now) {
                statut = 'en_retard'; amountPaid = 0;
            } else {
                statut = rand() > 0.5 ? 'en_attente' : 'partielle';
                amountPaid = statut === 'partielle' ? totalNet / 2 : 0;
            }
        }
        if (r > 0.95) { statut = 'annulee'; amountPaid = 0; }
        
        // Insert directly
        const { data: cons } = await adminClient.from('consultations').insert({
            cabinet_id: clinicId, clinic_id: clinicId,
            patient_id: patient.id, doctor_id: doctorId,
            statut, remise, date_consult: new Date(now.getTime() - daysAgo * 86400000),
            date_echeance: dateEcheance, emitted_at: new Date(now.getTime() - daysAgo * 86400000),
            numero: `FAC-${2000 + i}`
        }).select('id').single();
        
        await adminClient.from('facture_lignes').insert({
            consultation_id: cons.id, libelle_snapshot: 'Consultation standard', prix_unitaire_snapshot: ht, quantite: 1
        });
        
        if (amountPaid > 0) {
            await adminClient.from('payments').insert({
                clinic_id: clinicId, consultation_id: cons.id, patient_id: patient.id,
                amount: amountPaid, method: randomElement(['cash', 'card', 'transfer']), status: 'paid',
                paid_at: new Date(now.getTime() - (daysAgo - 5) * 86400000)
            });
        }
    }
    console.log("Seeding complete. ~260 invoices inserted.");
}
seed().catch(console.error);
