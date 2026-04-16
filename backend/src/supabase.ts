import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL;
// Accept either SUPABASE_KEY (anon/publishable, works when RLS is disabled on
// BaseCraft tables) or SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
const key = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('[supabase] Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
