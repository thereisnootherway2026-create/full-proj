import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Single shared Supabase client instance — do NOT import from supabase.js
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Use PKCE flow (replaces deprecated 'implicit')
    flowType: 'pkce',
  },
})

/** Returns true if Supabase is properly configured */
export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey)
}

export default supabase
