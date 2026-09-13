import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log("Signing up...");
    const { data, error } = await supabase.auth.signUp({
        email: 'test_doctor2@macromedica.local',
        password: 'password123',
    });
    if (error) {
        console.error("SignUp error:", error);
        return;
    }
    console.log("User created:", data.user?.id);
    
    // Check if profile was created
    const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
    
    console.log("Profile:", profile, profErr);
}
run();
