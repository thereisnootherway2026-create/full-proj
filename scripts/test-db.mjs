import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminClient = createClient(supabaseUrl, serviceKey)

async function test() {
  const { data, error } = await adminClient.rpc('mm_get_my_permissions')
  console.log('mm_get_my_permissions:', { data, error })
}

test().catch(console.error)
