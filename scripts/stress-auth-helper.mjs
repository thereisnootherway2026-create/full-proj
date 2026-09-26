import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL
export const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const CLINIC_ID = '02b6620f-ea20-42a0-88f8-d0c759392931'
export const DOCTOR_ID = '72698d06-ce57-4a68-a6cd-38b46a3f5cea'
export const SECRETARY_ID = '0ab76e15-2c6c-447a-8cf1-90b9dfcf41a7'

export const DOCTOR_EMAIL = 'nclspicolo@gmail.com'
export const SECRETARY_EMAIL = 'touryaya195@gmail.com'
export const TEST_PASSWORD = 'StressTest2026!Pass'

export const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

let cachedClients = null

export async function getTestClients() {
  if (cachedClients) return cachedClients

  // 1. Ensure passwords are set
  await adminClient.auth.admin.updateUserById(DOCTOR_ID, { password: TEST_PASSWORD })
  await adminClient.auth.admin.updateUserById(SECRETARY_ID, { password: TEST_PASSWORD })

  // 2. Create signed-in client for Secretary
  const secretaryClient = createClient(SUPABASE_URL, ANON_KEY)
  const { error: secErr } = await secretaryClient.auth.signInWithPassword({
    email: SECRETARY_EMAIL,
    password: TEST_PASSWORD,
  })
  if (secErr) throw new Error(`Secretary sign-in failed: ${secErr.message}`)

  // 3. Create signed-in client for Doctor
  const doctorClient = createClient(SUPABASE_URL, ANON_KEY)
  const { error: docErr } = await doctorClient.auth.signInWithPassword({
    email: DOCTOR_EMAIL,
    password: TEST_PASSWORD,
  })
  if (docErr) throw new Error(`Doctor sign-in failed: ${docErr.message}`)

  cachedClients = { adminClient, secretaryClient, doctorClient }
  return cachedClients
}
