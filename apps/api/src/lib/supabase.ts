import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    'Supabase env vars are not set. Server-side Supabase calls will fail until configured.',
  );
}

// Service-role client for trusted server-side operations (bypasses Row Level Security).
export const supabaseAdmin = createClient(
  env.SUPABASE_URL ?? '',
  env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } },
);
