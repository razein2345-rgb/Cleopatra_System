import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars are not set. Auth and data calls will fail until configured.');
}

const REMEMBER_ME_KEY = 'cp_remember_me';

/** Call before signInWithPassword() to control where the resulting session is persisted. */
export function setRememberMe(remember: boolean) {
  localStorage.setItem(REMEMBER_ME_KEY, String(remember));
}

function activeStorage(): Storage {
  // Default to "remembered" (localStorage) until the user explicitly opts out at login.
  return localStorage.getItem(REMEMBER_ME_KEY) === 'false' ? sessionStorage : localStorage;
}

// A storage adapter that resolves to localStorage or sessionStorage per call,
// so "remember me" can switch persistence at sign-in time without needing a
// second Supabase client instance.
const rememberAwareStorage = {
  getItem: (key: string) => activeStorage().getItem(key),
  setItem: (key: string, value: string) => activeStorage().setItem(key, value),
  removeItem: (key: string) => activeStorage().removeItem(key),
};

// `createClient` validates the URL's shape synchronously and throws if it
// isn't well-formed — an empty string (unconfigured env) would crash the
// whole app at import time. Fall back to a placeholder so the app still
// renders; any real Supabase call still fails until real credentials are set.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  { auth: { storage: rememberAwareStorage } },
);
