import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    'Supabase env vars are not set. Server-side Supabase calls will fail until configured.',
  );
}

// `createClient` validates the URL's shape synchronously and throws if it
// isn't a well-formed URL — a genuinely empty string (unconfigured env, e.g.
// local dev before Supabase credentials are added) would crash the whole
// process at import time rather than failing per-request. Fall back to a
// syntactically valid placeholder so the app still boots; any real call
// still fails (network error), which is the intended behavior when
// Supabase isn't configured yet.
const supabaseUrl = env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

// Service-role client for trusted server-side operations (bypasses Row Level Security).
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
