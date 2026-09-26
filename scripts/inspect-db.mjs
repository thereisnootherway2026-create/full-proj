import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminClient = createClient(supabaseUrl, serviceKey)

async function inspect() {
  console.log('--- Inspecting RDV columns ---')
  const { data: rdvSample, error: rdvErr } = await adminClient.from('rdv').select('*').limit(3)
  if (rdvSample && rdvSample.length > 0) {
    console.log('RDV columns:', Object.keys(rdvSample[0]))
    console.log('RDV sample:', rdvSample[0])
  } else {
    console.log('RDV empty or error:', rdvErr)
  }

  console.log('\n--- Inspecting VISITS columns ---')
  const { data: visitsSample, error: vErr } = await adminClient.from('visits').select('*').limit(3)
  if (visitsSample && visitsSample.length > 0) {
    console.log('VISITS columns:', Object.keys(visitsSample[0]))
    console.log('VISITS sample:', visitsSample[0])
  } else {
    console.log('VISITS empty or error:', vErr)
  }

  console.log('\n--- Inspecting PROFILES ---')
  const { data: profiles, error: pErr } = await adminClient.from('profiles').select('id, nom_complet, role, cabinet_id, clinic_id, status').limit(5)
  console.log('Profiles:', profiles, pErr)
}

inspect().catch(console.error)
