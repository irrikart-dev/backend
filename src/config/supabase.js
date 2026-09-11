import { createClient } from '@supabase/supabase-js';
import env from './env.js';

// secret key, server-side only — full storage access, never sent to any client
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
