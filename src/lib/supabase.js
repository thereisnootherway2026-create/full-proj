// Re-export from the single source of truth.
// Do NOT call createClient() here — that would create a second instance
// and cause auth lock contention errors.
export { supabase, isSupabaseConfigured, default } from './supabase.ts'
